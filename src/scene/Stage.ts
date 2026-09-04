import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Matrix4,
  Object3D,
  PlaneGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import type { CircuitDefinition } from "../core/Circuit";
import { loadSilverstoneAssets } from "./SilverstoneAssets";
import { createSilverstoneMaterials, type SilverstoneMaterials } from "./SilverstoneMaterials";

const SILVERSTONE_TRACK_POINTS = [
  // The GP layout, ordered clockwise from the start/finish line. The former
  // control points doubled back through the lap and made the minimap cross
  // itself; these follow Silverstone's distinctive 18-corner silhouette.
  [0, 0, 0], [42, 0, 24], [92, 0, 60], [150, 0, 102], [214, 0, 150],
  [278, 0, 198], [326, 0, 238], [346, 0, 278], [345, 0, 326], [365, 0, 370],
  [405, 0, 420], [424, 0, 453], [415, 0, 478], [380, 0, 495], [330, 0, 510],
  [352, 0, 536], [404, 0, 552], [466, 0, 552], [535, 0, 478], [610, 0, 392],
  [684, 0, 302], [744, 0, 224], [730, 0, 174], [756, 0, 134], [812, 0, 126],
  [875, 0, 152], [940, 0, 194], [980, 0, 252], [1000, 0, 330], [1008, 0, 430],
  [1014, 0, 530], [1002, 0, 574], [952, 0, 606], [875, 0, 626], [785, 0, 642],
  [700, 0, 653], [638, 0, 662], [600, 0, 680], [566, 0, 701], [522, 0, 688],
  [480, 0, 672], [445, 0, 690], [410, 0, 728], [370, 0, 746], [336, 0, 724],
  [304, 0, 672], [246, 0, 636], [166, 0, 596], [75, 0, 550], [-15, 0, 500],
  [-92, 0, 452], [-142, 0, 400], [-154, 0, 346], [-132, 0, 302], [-88, 0, 270],
  [-32, 0, 240], [4, 0, 218], [-24, 0, 198], [-52, 0, 178], [-48, 0, 154],
  [-28, 0, 124], [-50, 0, 82], [-72, 0, 50], [-68, 0, 18], [-42, 0, -24],
  [-18, 0, -12],
] as const;

const SUZUKA_TRACK_POINTS = [
  // Simplified from the modern 5.807 km GP layout. These GPS-shaped points
  // preserve the real corner sequence: First/Second Curve, the Esses,
  // Dunlop, both Degners, Hairpin, Spoon, 130R, Casio Triangle, and the last
  // corner. The west-straight return is elevated where it crosses Degner.
  [287, 0, 28],
  [400, 0, 289], [405, 0, 330], [397, 0, 379], [389, 0, 398],
  [378, 0, 405], [365, 0, 400], [358, 0.5, 390], [310, 1.5, 262],
  [278, 2.5, 255], [263, 3.5, 242], [239, 4.5, 136], [225, 5.5, 121],
  [187, 6.5, 114], [173, 7.5, 98], [164, 8.5, 45], [177, 9.5, -42],
  [170, 10, -76], [153, 9.5, -96], [114, 8.5, -121], [86, 7.5, -116],
  [49, 6, -76], [0, 4, 34], [-65, 2, 45], [-80, 0, -40],
  [-94, 0, -196], [-77, 1, -289], [-79, 1.5, -300], [-85, 1.5, -305],
  [-92, 1, -300], [-126, 0.5, -199], [-145, 0, -166], [-163, 0, -152],
  [-206, 0, -148], [-263, 0, -182], [-290, 0, -220], [-312, 0, -276],
  [-342, 0, -396], [-366, 0, -405], [-384, 0, -399], [-399, 0, -382],
  [-405, 0, -357], [-400, 0, -319], [-363, 1.4, -256],
  [-315, 3.2, -194], [-262, 5, -149], [-61, 7.4, -17], [-38, 6.2, -24],
  [0, 3.2, -59], [83, 0.8, -193], [103, 0, -171], [134, 0, -206],
  [165, 0, -203], [196, 0, -173], [216, 0, -134],
] as const;

export interface NearestTrackResult {
  index: number;
  distance: number;
  side: number;
}

interface MinimapCache {
  readonly context: CanvasRenderingContext2D;
  readonly staticCanvas: HTMLCanvasElement;
  readonly staticContext: CanvasRenderingContext2D;
  drawn: boolean;
}

export class Stage {
  readonly id: CircuitDefinition["id"];
  readonly definition: CircuitDefinition;
  readonly root = new Group();
  readonly curve: CatmullRomCurve3;
  readonly samples: Vector3[];
  readonly roadWidth: number;
  readonly checkpoints: Vector3[] = [];
  readonly checkpointIndices = [140, 280, 420, 560, 700] as const;
  /** Optional scenery is part of stage readiness, including decode/upload. */
  readonly ready: Promise<void>;
  private readonly tangents: Vector3[] = [];
  private readonly normals: Vector3[] = [];
  private readonly silverstoneMaterials?: SilverstoneMaterials;
  private readonly minimapCaches = new WeakMap<HTMLCanvasElement, MinimapCache>();
  private readonly mapCenterX: number;
  private readonly mapCenterZ: number;
  private readonly mapScale: number;
  private disposed = false;
  private readonly generation = Symbol("stage-generation");

  constructor(circuit: CircuitDefinition) {
    this.id = circuit.id;
    this.definition = circuit;
    this.curve = new CatmullRomCurve3(
      (circuit.id === "silverstone" ? SILVERSTONE_TRACK_POINTS : SUZUKA_TRACK_POINTS).map(([x, y, z]) => new Vector3(x, y, z)),
      true,
      "catmullrom",
      0.35,
    );
    this.samples = this.curve.getPoints(700);
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const point of this.samples) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    this.mapCenterX = (minX + maxX) / 2;
    this.mapCenterZ = (minZ + maxZ) / 2;
    this.mapScale = Math.min(146 / (maxX - minX), 146 / (maxZ - minZ));
    this.roadWidth = 14;
    this.silverstoneMaterials = createSilverstoneMaterials();
    this.samples.forEach((_, index) => {
      const tangent = this.curve.getTangent(index / (this.samples.length - 1)).normalize();
      this.tangents.push(tangent);
      this.normals.push(new Vector3(-tangent.z, 0, tangent.x).normalize());
    });
    this.buildGround();
    this.buildRoad();
    if (this.id === "suzuka") this.buildSuzukaCrossover();
    this.buildFormulaDetails();
    if (this.id === "suzuka") this.buildSuzukaLandmarks();
    // Silverstone's authored scenery is optional; Suzuka uses the shared
    // procedural GP dressing so it remains self-contained.
    this.ready = this.id === "silverstone" ? this.loadSilverstoneAssets() : Promise.resolve();
    this.buildCheckpoints();
    if (this.checkpoints.length !== this.checkpointIndices.length) {
      throw new Error("Stage checkpoint positions must include the finish gate.");
    }
  }

  startPose(): { position: Vector3; heading: number } {
    const direction = this.tangents[0];
    return {
      position: this.samples[0].clone().add(new Vector3(0, 0.42, 0)),
      heading: Math.atan2(-direction.x, -direction.z),
    };
  }

  nearestInto(point: Vector3, hint: number, result: NearestTrackResult): NearestTrackResult {
    let bestIndex = Math.max(0, Math.min(this.samples.length - 1, hint));
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    const from = Math.max(0, bestIndex - 60);
    const to = Math.min(this.samples.length - 1, bestIndex + 60);
    for (let index = from; index <= to; index += 1) {
      const distanceSq = point.distanceToSquared(this.samples[index]);
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestIndex = index;
      }
    }
    const sample = this.samples[bestIndex];
    result.index = bestIndex;
    result.distance = Math.sqrt(bestDistanceSq);
    result.side = (point.x - sample.x) * this.normals[bestIndex].x
      + (point.z - sample.z) * this.normals[bestIndex].z;
    return result;
  }

  /** Compatibility wrapper for non-hot-path callers. */
  nearest(point: Vector3, hint: number): NearestTrackResult {
    return this.nearestInto(point, hint, { index: 0, distance: 0, side: 0 });
  }

  roadHeight(index: number): number {
    return this.samples[Math.max(0, Math.min(this.samples.length - 1, index))].y + 0.42;
  }

  tangent(index: number): Vector3 {
    return this.tangents[Math.max(0, Math.min(this.tangents.length - 1, index))];
  }

  normal(index: number): Vector3 {
    return this.normals[Math.max(0, Math.min(this.normals.length - 1, index))];
  }

  private trackClearance(position: Vector3, sourceIndex: number, localWindow = 45): number {
    const finalIndex = this.samples.length - 1;
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    // The last sample duplicates the first on this closed curve.
    for (let index = 0; index < finalIndex; index += 1) {
      const directDelta = Math.abs(index - sourceIndex);
      const circularDelta = Math.min(directDelta, finalIndex - directDelta);
      if (circularDelta <= localWindow) continue;
      const sample = this.samples[index];
      const dx = position.x - sample.x;
      const dz = position.z - sample.z;
      bestDistanceSq = Math.min(bestDistanceSq, dx * dx + dz * dz);
    }
    return Math.sqrt(bestDistanceSq);
  }

  surfaceGrip(_index: number, side: number): number {
    return Math.abs(side) > this.roadWidth - 0.7 ? 0.42 : 1;
  }

  drawMinimapStatic(canvas: HTMLCanvasElement): void {
    const cache = this.getMinimapCache(canvas);
    if (cache.drawn) return;
    const context = cache.staticContext;
    context.clearRect(0, 0, 190, 190);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "rgba(255,255,255,.22)";
    context.lineWidth = 7;
    context.beginPath();
    for (let index = 0; index < this.samples.length; index += 1) {
      const point = this.samples[index];
      const x = 95 + (point.x - this.mapCenterX) * this.mapScale;
      const y = 95 + (point.z - this.mapCenterZ) * this.mapScale;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
    context.strokeStyle = "#f8f4df";
    context.lineWidth = 3;
    context.stroke();
    const finish = this.samples[this.samples.length - 1];
    const finishX = 95 + (finish.x - this.mapCenterX) * this.mapScale;
    const finishY = 95 + (finish.z - this.mapCenterZ) * this.mapScale;
    context.fillStyle = "#ffffff";
    context.fillRect(finishX - 4, finishY - 4, 8, 8);
    cache.drawn = true;
    cache.context.drawImage(cache.staticCanvas, 0, 0);
  }

  drawMinimapMarker(canvas: HTMLCanvasElement, progress: number): void {
    const cache = this.getMinimapCache(canvas);
    this.drawMinimapStatic(canvas);
    cache.context.drawImage(cache.staticCanvas, 0, 0);
    const index = Math.min(this.samples.length - 1, Math.max(0, Math.floor(progress * (this.samples.length - 1))));
    const current = this.samples[index];
    const x = 95 + (current.x - this.mapCenterX) * this.mapScale;
    const y = 95 + (current.z - this.mapCenterZ) * this.mapScale;
    cache.context.fillStyle = "#ffcc30";
    cache.context.beginPath();
    cache.context.arc(x, y, 6, 0, Math.PI * 2);
    cache.context.fill();
  }

  drawMinimap(canvas: HTMLCanvasElement, progress: number): void {
    this.drawMinimapMarker(canvas, progress);
  }

  private getMinimapCache(canvas: HTMLCanvasElement): MinimapCache {
    const existing = this.minimapCaches.get(canvas);
    if (existing) return existing;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Stage minimap requires a 2D canvas context");
    const staticCanvas = document.createElement("canvas");
    staticCanvas.width = 190;
    staticCanvas.height = 190;
    const staticContext = staticCanvas.getContext("2d");
    if (!staticContext) throw new Error("Stage minimap requires a 2D canvas context");
    const cache: MinimapCache = { context, staticCanvas, staticContext, drawn: false };
    this.minimapCaches.set(canvas, cache);
    return cache;
  }

  private buildGround(): void {
    const xs = this.samples.map((point) => point.x);
    const zs = this.samples.map((point) => point.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const width = Math.max(2400, maxX - minX + 900);
    const depth = Math.max(1800, maxZ - minZ + 900);
    const ground = new Mesh(
      new PlaneGeometry(width, depth),
      this.silverstoneMaterials?.grass ?? new MeshStandardMaterial({ color: 0x456b38, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((minX + maxX) / 2, -0.1, (minZ + maxZ) / 2);
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  private buildRoad(): void {
    const makeStrip = (innerOffset: number, outerOffset: number, yOffset: number, colorA: number, colorB: number, surface?: MeshStandardMaterial): Mesh => {
      const positions: number[] = [];
      const colors: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const a = new Color(colorA);
      const b = new Color(colorB);
      const uvScale = Math.max(1, Math.abs(outerOffset - innerOffset));
      let distanceAlongTrack = 0;
      for (let index = 0; index < this.samples.length; index += 1) {
        const point = this.samples[index];
        const normal = this.normals[index];
        if (index > 0) distanceAlongTrack += point.distanceTo(this.samples[index - 1]);
        [innerOffset, outerOffset].forEach((offset, lateralIndex) => {
          positions.push(point.x + normal.x * offset, point.y + yOffset, point.z + normal.z * offset);
          const shade = index % 9 < 4 ? a : b;
          colors.push(shade.r, shade.g, shade.b);
          // Use physical ribbon width to keep the texels roughly square.
          // Normalized lap progress stretched a single asphalt tile hundreds
          // of metres and turned its fine aggregate into speed-line streaks.
          uvs.push(distanceAlongTrack / uvScale, lateralIndex);
        });
        if (index < this.samples.length - 1) {
          const base = index * 2;
          indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
      geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, surface ?? new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: DoubleSide }));
      mesh.receiveShadow = true;
      return mesh;
    };
    this.root.add(makeStrip(-this.roadWidth - 3, this.roadWidth + 3, 0.035, 0x697176, 0x697176, this.silverstoneMaterials?.shoulder));
    this.root.add(makeStrip(-this.roadWidth, this.roadWidth, 0.075, 0x30363a, 0x30363a, this.silverstoneMaterials?.asphalt));
    this.root.add(makeStrip(this.roadWidth - 0.34, this.roadWidth, 0.092, 0xf0eee6, 0xf0eee6));
    this.root.add(makeStrip(-this.roadWidth, -this.roadWidth + 0.34, 0.092, 0xf0eee6, 0xf0eee6));
  }

  private buildSuzukaCrossover(): void {
    const railMaterial = new MeshStandardMaterial({ color: 0xc2cbd0, roughness: 0.55, metalness: 0.32, side: DoubleSide });
    const undersideMaterial = new MeshStandardMaterial({ color: 0x303b43, roughness: 0.8, metalness: 0.1, side: DoubleSide });
    const bridgeStart = 560;
    const bridgeEnd = 610;
    const undersidePositions: number[] = [];
    const undersideIndices: number[] = [];

    // The road ribbon already provides the bridge deck. Add one continuous
    // underside below it instead of overlapping boxes, which protruded through
    // the sloped asphalt. This range isolates the west-straight crossover and
    // deliberately excludes the naturally elevated Esses.
    for (let index = bridgeStart; index <= bridgeEnd; index += 1) {
      const point = this.samples[index];
      const normal = this.normals[index];
      for (const side of [-1, 1]) {
        undersidePositions.push(
          point.x + normal.x * side * (this.roadWidth + 3),
          point.y - 0.42,
          point.z + normal.z * side * (this.roadWidth + 3),
        );
      }
      for (const side of [-1, 1]) {
        undersidePositions.push(
          point.x + normal.x * side * (this.roadWidth + 3),
          point.y + 0.02,
          point.z + normal.z * side * (this.roadWidth + 3),
        );
      }
      if (index < bridgeEnd) {
        const base = (index - bridgeStart) * 4;
        const next = base + 4;
        // Bottom face, then left and right fascia walls.
        undersideIndices.push(
          base, next, base + 1, next, next + 1, base + 1,
          base, base + 2, next, next, base + 2, next + 2,
          base + 1, next + 1, base + 3, next + 1, next + 3, base + 3,
        );
      }
    }
    const finalBase = (bridgeEnd - bridgeStart) * 4;
    undersideIndices.push(
      0, 1, 2, 1, 3, 2,
      finalBase, finalBase + 2, finalBase + 1, finalBase + 1, finalBase + 2, finalBase + 3,
    );
    const undersideGeometry = new BufferGeometry();
    undersideGeometry.setAttribute("position", new BufferAttribute(new Float32Array(undersidePositions), 3));
    undersideGeometry.setIndex(undersideIndices);
    undersideGeometry.computeVertexNormals();
    const underside = new Mesh(undersideGeometry, undersideMaterial);
    underside.castShadow = true;
    underside.receiveShadow = true;
    this.root.add(underside);

    for (const side of [-1, 1]) {
      const railPositions: number[] = [];
      const railIndices: number[] = [];
      for (let index = bridgeStart; index <= bridgeEnd; index += 1) {
        const point = this.samples[index];
        const normal = this.normals[index];
        const x = point.x + normal.x * side * (this.roadWidth + 1.6);
        const z = point.z + normal.z * side * (this.roadWidth + 1.6);
        railPositions.push(x, point.y + 0.12, z, x, point.y + 1.35, z);
        if (index < bridgeEnd) {
          const base = (index - bridgeStart) * 2;
          railIndices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
        }
      }
      const railGeometry = new BufferGeometry();
      railGeometry.setAttribute("position", new BufferAttribute(new Float32Array(railPositions), 3));
      railGeometry.setIndex(railIndices);
      railGeometry.computeVertexNormals();
      const rail = new Mesh(railGeometry, railMaterial);
      rail.castShadow = true;
      this.root.add(rail);
    }
  }

  private buildFormulaDetails(): void {
    const buildDetailStrip = (
      start: number,
      end: number,
      innerOffset: number,
      outerOffset: number,
      yOffset: number,
      colors: readonly number[],
      stripeLength: number,
      surface?: MeshStandardMaterial,
    ): Mesh => {
      const positions: number[] = [];
      const vertexColors: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      const palette = colors.map((color) => new Color(color));
      const uvScale = Math.max(1, Math.abs(outerOffset - innerOffset));
      let distanceAlongStrip = 0;
      for (let index = start; index <= end; index += 1) {
        const point = this.samples[index];
        const normal = this.normals[index];
        if (index > start) distanceAlongStrip += point.distanceTo(this.samples[index - 1]);
        const shade = palette[Math.floor((index - start) / stripeLength) % palette.length];
        [innerOffset, outerOffset].forEach((offset, lateralIndex) => {
          positions.push(point.x + normal.x * offset, point.y + yOffset, point.z + normal.z * offset);
          vertexColors.push(shade.r, shade.g, shade.b);
          uvs.push(distanceAlongStrip / uvScale, lateralIndex);
        });
        if (index < end) {
          const base = (index - start) * 2;
          indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute("color", new BufferAttribute(new Float32Array(vertexColors), 3));
      geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const mesh = new Mesh(geometry, surface ?? new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: DoubleSide }));
      mesh.receiveShadow = true;
      return mesh;
    };

    // Kerbs are limited to braking zones and apexes, like the real circuit.
    // Smooth ribbons remove the overlaps and gaps caused by individual boxes.
    const kerbRuns: ReadonlyArray<readonly [number, number, -1 | 1]> = this.id === "suzuka"
      ? [
          [35, 66, -1], [67, 92, -1], [102, 124, 1], [125, 147, -1],
          [148, 171, 1], [173, 196, -1], [199, 222, 1], [235, 261, -1],
          [268, 292, 1], [309, 336, -1], [350, 379, 1], [396, 432, -1],
          [433, 470, -1], [480, 510, 1], [575, 611, -1], [625, 650, 1],
          [651, 670, -1], [671, 690, 1],
        ]
      : [
          [42, 74, -1], [82, 112, 1], [126, 157, -1], [165, 194, 1],
          [218, 252, -1], [273, 306, 1], [326, 360, -1], [374, 411, 1],
          [430, 466, -1], [485, 520, 1], [538, 576, -1], [590, 625, 1],
          [642, 680, -1],
        ];
    kerbRuns.forEach(([start, end, side]) => {
      const inside = this.roadWidth * side;
      const outside = (this.roadWidth + 2.15) * side;
      const runoffInside = (this.roadWidth + 2.1) * side;
      const runoffOutside = (this.roadWidth + (this.id === "suzuka" ? 5.2 : 7.5)) * side;
      const runoffColors = this.id === "suzuka" ? [0x737a77, 0x68726c] : [0x59736a, 0x607a70];
      const runoffSurface = this.id === "suzuka" ? this.silverstoneMaterials?.shoulder : this.silverstoneMaterials?.runoff;
      this.root.add(buildDetailStrip(start, end, runoffInside, runoffOutside, 0.068, runoffColors, 10, runoffSurface));
      this.root.add(buildDetailStrip(start, end, inside, outside, 0.12, [0xe9e8de, 0xc9342f], 5));
    });

    const lineMaterial = new MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.82 });
    const startPoint = this.samples[0];
    const startNormal = this.normals[0];
    const finishColumns = 16;
    const finishRows = 2;
    const finishCellWidth = (this.roadWidth * 2) / finishColumns;
    const finishCellDepth = 0.42;
    const finishCellGeometry = new PlaneGeometry(finishCellWidth, finishCellDepth);
    finishCellGeometry.rotateX(-Math.PI / 2);
    const finishPaint = new InstancedMesh(finishCellGeometry, lineMaterial, (finishColumns * finishRows) / 2);
    finishPaint.name = "formula-checkered-finish-line";
    const finishFrame = new Object3D();
    const finishMatrix = new Matrix4();
    finishFrame.position.copy(startPoint);
    finishFrame.position.y += 0.105;
    finishFrame.rotation.y = Math.atan2(-startNormal.z, startNormal.x);
    finishFrame.updateMatrix();
    let finishCell = 0;
    for (let row = 0; row < finishRows; row += 1) {
      for (let column = 0; column < finishColumns; column += 1) {
        if ((row + column) % 2 !== 0) continue;
        finishMatrix.copy(finishFrame.matrix).multiply(new Matrix4().makeTranslation(
          -this.roadWidth + finishCellWidth * (column + 0.5),
          0,
          (row - 0.5) * finishCellDepth,
        ));
        finishPaint.setMatrixAt(finishCell++, finishMatrix);
      }
    }
    finishPaint.instanceMatrix.needsUpdate = true;
    finishPaint.receiveShadow = true;
    this.root.add(finishPaint);

    // These are painted grid boxes, not kerbs. Keeping them as zero-thickness
    // planes prevents their side faces from reading as concrete blocks from
    // the low chase camera.
    const gridGeometry = new PlaneGeometry(4.3, 1.25);
    gridGeometry.rotateX(-Math.PI / 2);
    const gridMarkers = new InstancedMesh(gridGeometry, lineMaterial, 10);
    gridMarkers.name = "formula-start-grid-markers";
    const markerObject = new Object3D();
    let markerInstance = 0;
    [684, 672, 660, 648, 636].forEach((sampleIndex, row) => {
      const point = this.samples[sampleIndex];
      const normal = this.normals[sampleIndex];
      for (const side of [-1, 1]) {
        markerObject.position.copy(point).addScaledVector(normal, side * (4.3 + (row % 2) * 1.25));
        markerObject.position.y += 0.105;
        markerObject.rotation.y = Math.atan2(-normal.z, normal.x);
        markerObject.updateMatrix();
        gridMarkers.setMatrixAt(markerInstance++, markerObject.matrix);
      }
    });
    gridMarkers.instanceMatrix.needsUpdate = true;
    gridMarkers.receiveShadow = true;
    this.root.add(gridMarkers);

    const barrierMaterial = new MeshStandardMaterial({ color: 0xbfc5c5, roughness: 0.62, metalness: 0.25 });
    const darkBarrierMaterial = new MeshStandardMaterial({ color: 0x313b42, roughness: 0.78, metalness: 0.12 });
    const barrierGeometry = new BoxGeometry(0.45, 1.15, 7.5);
    const barrierRanges: ReadonlyArray<readonly [number, number, -1 | 1]> = [
      [8, 96, 1], [180, 258, -1], [300, 382, 1], [455, 528, -1], [612, 694, 1],
    ];
    const barrierObject = new Object3D();
    const barrierMatrices: Matrix4[][] = [[], []];
    barrierRanges.forEach(([start, end, side], rangeIndex) => {
      for (let sampleIndex = start; sampleIndex <= end; sampleIndex += 7) {
        const point = this.samples[sampleIndex];
        const normal = this.normals[sampleIndex];
        const tangent = this.tangents[sampleIndex];
        barrierObject.position.copy(point).addScaledVector(normal, side * (this.roadWidth + 10));
        barrierObject.position.y += 0.58;
        // Suzuka's figure-eight brings unrelated track sections close together.
        // Reject furniture whose centre lands inside another road/shoulder;
        // these were the loose-looking white blocks seen across the racing line.
        if (this.id === "suzuka" && this.trackClearance(barrierObject.position, sampleIndex) < this.roadWidth + 8) {
          continue;
        }
        barrierObject.rotation.y = Math.atan2(tangent.x, tangent.z);
        barrierObject.updateMatrix();
        const materialIndex = rangeIndex % 2;
        barrierMatrices[materialIndex].push(barrierObject.matrix.clone());
      }
    });
    barrierMatrices.forEach((matrices, materialIndex) => {
      if (matrices.length === 0) return;
      const mesh = new InstancedMesh(
        barrierGeometry,
        materialIndex === 0 ? barrierMaterial : darkBarrierMaterial,
        matrices.length,
      );
      mesh.name = materialIndex === 0 ? "formula-barriers-light" : "formula-barriers-dark";
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      this.root.add(mesh);
    });

    const standMaterial = new MeshStandardMaterial({ color: 0x4f5d64, roughness: 0.9 });
    const seatMaterial = new MeshStandardMaterial({ color: 0x1e343f, roughness: 0.92 });
    const proceduralGrandstands = new Group();
    proceduralGrandstands.name = "formula-procedural-grandstands";
    const standBaseGeometry = new BoxGeometry(11, 2.4, 38);
    const seatGeometry = new BoxGeometry(2.2, 0.7, 36);
    const roofGeometry = new BoxGeometry(13, 0.42, 41);
    const standBases = new InstancedMesh(standBaseGeometry, standMaterial, 5);
    const standSeats = new InstancedMesh(seatGeometry, seatMaterial, 20);
    const standRoofs = new InstancedMesh(roofGeometry, barrierMaterial, 5);
    standBases.castShadow = true;
    standSeats.castShadow = true;
    standRoofs.castShadow = true;
    const standObject = new Object3D();
    const standMatrix = new Matrix4();
    let seatInstance = 0;
    [24, 206, 346, 506, 650].forEach((sampleIndex, index) => {
      const point = this.samples[sampleIndex];
      const normal = this.normals[sampleIndex];
      const tangent = this.tangents[sampleIndex];
      let side = index % 2 === 0 ? 1 : -1;
      if (this.id === "suzuka") {
        const leftPosition = point.clone().addScaledVector(normal, -40);
        const rightPosition = point.clone().addScaledVector(normal, 40);
        side = this.trackClearance(leftPosition, sampleIndex) > this.trackClearance(rightPosition, sampleIndex) ? -1 : 1;
      }
      standObject.position.copy(point).addScaledVector(normal, 40 * side);
      standObject.rotation.y = Math.atan2(tangent.x, tangent.z);
      standObject.updateMatrix();
      standMatrix.copy(standObject.matrix).multiply(new Matrix4().makeTranslation(0, 1.2, 0));
      standBases.setMatrixAt(index, standMatrix);
      for (let tier = 0; tier < 4; tier += 1) {
        standMatrix.copy(standObject.matrix).multiply(new Matrix4().makeTranslation(side * (-2.6 + tier * 1.55), 2.3 + tier * 0.62, 0));
        standSeats.setMatrixAt(seatInstance++, standMatrix);
      }
      standMatrix.copy(standObject.matrix).multiply(new Matrix4().makeTranslation(side * 1.5, 5.65, 0));
      standRoofs.setMatrixAt(index, standMatrix);
    });
    standBases.instanceMatrix.needsUpdate = true;
    standSeats.instanceMatrix.needsUpdate = true;
    standRoofs.instanceMatrix.needsUpdate = true;
    proceduralGrandstands.add(standBases, standSeats, standRoofs);
    this.root.add(proceduralGrandstands);
  }

  private buildSuzukaLandmarks(): void {
    const concrete = new MeshStandardMaterial({ color: 0xd5d6d0, roughness: 0.84 });
    const dark = new MeshStandardMaterial({ color: 0x26333a, roughness: 0.74 });
    const red = new MeshStandardMaterial({ color: 0xc92f32, roughness: 0.72 });

    // A compact pit building and control tower establish the main straight.
    const pitPoint = this.samples[12];
    const pitNormal = this.normals[12];
    const pitTangent = this.tangents[12];
    const pitComplex = new Group();
    pitComplex.position.copy(pitPoint).addScaledVector(pitNormal, -48);
    pitComplex.rotation.y = Math.atan2(pitTangent.x, pitTangent.z);
    const pitBase = new Mesh(new BoxGeometry(17, 7, 96), concrete);
    pitBase.position.y = 3.5;
    pitBase.castShadow = true;
    const pitGlass = new Mesh(new BoxGeometry(17.3, 2.2, 78), dark);
    pitGlass.position.set(0, 7.2, 2);
    const pitRoof = new Mesh(new BoxGeometry(20, 0.7, 102), red);
    pitRoof.position.y = 9;
    const towerBase = new Mesh(new BoxGeometry(13, 9.5, 13), concrete);
    towerBase.position.set(0, 4.75, -47);
    towerBase.castShadow = true;
    const towerCabin = new Mesh(new BoxGeometry(16.5, 4.2, 16.5), dark);
    towerCabin.position.set(0, 11.25, -47);
    towerCabin.castShadow = true;
    const towerCap = new Mesh(new BoxGeometry(18.5, 0.65, 18.5), red);
    towerCap.position.set(0, 13.65, -47);
    towerCap.castShadow = true;
    pitComplex.add(pitBase, pitGlass, pitRoof, towerBase, towerCabin, towerCap);
    this.root.add(pitComplex);

    // Suzuka's observation wheel is a useful distant landmark near the final
    // sector, even in this intentionally low-detail version of the venue.
    const wheelPoint = this.samples[654];
    const wheelNormal = this.normals[654];
    const wheelTangent = this.tangents[654];
    const wheel = new Group();
    // The inside normal points toward an earlier leg of the figure-eight and
    // left the 25-unit rim intersecting that road. Place the landmark on the
    // open side of the final sector instead, with ample whole-track clearance.
    wheel.position.copy(wheelPoint).addScaledVector(wheelNormal, -82);
    wheel.position.y = 31;
    wheel.rotation.y = Math.atan2(wheelTangent.x, wheelTangent.z);
    const rim = new Mesh(new TorusGeometry(25, 1.15, 8, 40), red);
    rim.castShadow = true;
    wheel.add(rim);
    const spokeGeometry = new CylinderGeometry(0.22, 0.22, 48, 6);
    const spokes = new InstancedMesh(spokeGeometry, concrete, 8);
    spokes.name = "suzuka-observation-wheel-spokes";
    const spokeRotation = new Matrix4();
    for (let spokeIndex = 0; spokeIndex < 8; spokeIndex += 1) {
      spokeRotation.makeRotationZ((Math.PI * spokeIndex) / 8);
      spokes.setMatrixAt(spokeIndex, spokeRotation);
    }
    spokes.instanceMatrix.needsUpdate = true;
    spokes.castShadow = true;
    wheel.add(spokes);
    const leftLeg = new Mesh(new CylinderGeometry(0.8, 1.2, 35, 8), dark);
    const rightLeg = leftLeg.clone();
    leftLeg.position.set(-8, -18, 0);
    rightLeg.position.set(8, -18, 0);
    leftLeg.rotation.z = -0.24;
    rightLeg.rotation.z = 0.24;
    wheel.add(leftLeg, rightLeg);
    this.root.add(wheel);
  }

  private async loadSilverstoneAssets(): Promise<void> {
    const result = await loadSilverstoneAssets(this, { generation: this.generation });
    if (this.disposed) return;
    // The procedural stands are a complete fallback. Once the authored
    // grandstand prototype is available, avoid drawing both versions at once.
    if (result.loaded.some((url) => url.endsWith("silverstone-grandstand.glb"))) {
      const fallback = this.root.getObjectByName("formula-procedural-grandstands");
      if (fallback) fallback.visible = false;
    }
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  isGenerationCurrent(generation: symbol): boolean {
    return !this.disposed && generation === this.generation;
  }

  /** Idempotently detach this stage and release only resources it owns. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<MeshStandardMaterial>();
    this.root.traverse((object) => {
      if (object.userData.sharedResource) return;
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry) geometries.add(mesh.geometry as BufferGeometry);
      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of meshMaterials) {
        if (material && material instanceof MeshStandardMaterial) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.silverstoneMaterials?.dispose();
    this.root.clear();
  }

  private buildCheckpoints(): void {
    const poleMaterial = new MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.72 });
    const bannerMaterial = new MeshStandardMaterial({ color: 0x24343c, roughness: 0.65, side: DoubleSide });
    const poleHeight = 6.8;
    const bannerHeight = 0.58;
    // Sample 700 closes onto sample 0, so adding both produced two almost
    // coincident start/finish gantries and visible z-fighting at the lap seam.
    const indices = this.checkpointIndices;
    const poleGeometry = new CylinderGeometry(0.1, 0.13, poleHeight, 8);
    const bannerGeometry = new BoxGeometry(this.roadWidth * 2 + 1.1, bannerHeight, 0.15);
    const poles = new InstancedMesh(poleGeometry, poleMaterial, indices.length * 2);
    const banners = new InstancedMesh(bannerGeometry, bannerMaterial, indices.length);
    poles.name = "checkpoint-poles";
    banners.name = "checkpoint-banners";
    poles.castShadow = true;
    banners.castShadow = true;
    const gateObject = new Object3D();
    const localMatrix = new Matrix4();
    let poleInstance = 0;
    indices.forEach((sampleIndex, checkpointIndex) => {
      const point = this.samples[sampleIndex];
      const normal = this.normals[sampleIndex];
      // The banner's long edge is local X, so rotate local X onto the road
      // normal. This makes every checkpoint span across the road.
      gateObject.position.copy(point);
      gateObject.rotation.y = Math.atan2(-normal.z, normal.x);
      gateObject.updateMatrix();
      localMatrix.makeTranslation(-this.roadWidth - 0.4, poleHeight / 2, 0);
      poles.setMatrixAt(poleInstance++, gateObject.matrix.clone().multiply(localMatrix));
      localMatrix.makeTranslation(this.roadWidth + 0.4, poleHeight / 2, 0);
      poles.setMatrixAt(poleInstance++, gateObject.matrix.clone().multiply(localMatrix));
      localMatrix.makeTranslation(0, poleHeight - 0.42, 0);
      banners.setMatrixAt(checkpointIndex, gateObject.matrix.clone().multiply(localMatrix));
      this.checkpoints.push(point.clone());
    });
    poles.instanceMatrix.needsUpdate = true;
    banners.instanceMatrix.needsUpdate = true;
    this.root.add(poles, banners);
  }

}
