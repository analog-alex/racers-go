import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import type { CircuitDefinition } from "../core/Circuit";
import { loadPineRunAssets } from "./PineRunAssets";
import { createPineRunMaterials, type PineRunMaterials } from "./PineRunMaterials";
import { loadSilverstoneAssets } from "./SilverstoneAssets";
import { createSilverstoneMaterials, type SilverstoneMaterials } from "./SilverstoneMaterials";

const TRACK_POINTS = [
  [0, 0, 0], [-28, 1, -70], [-65, 3, -145], [-38, 7, -228], [35, 10, -292],
  [112, 12, -352], [126, 15, -435], [72, 17, -505], [-18, 20, -545],
  [-102, 23, -610], [-112, 28, -705], [-55, 32, -774], [35, 35, -820],
  [102, 38, -890], [90, 42, -978], [18, 44, -1045], [-72, 47, -1100],
  [-127, 50, -1182], [-86, 53, -1265], [2, 56, -1302], [86, 59, -1366],
  [112, 62, -1455], [58, 66, -1535], [-35, 68, -1580], [-98, 70, -1660],
  [-72, 73, -1750], [8, 76, -1815], [86, 78, -1880], [76, 80, -1970],
  [4, 82, -2042], [-65, 84, -2118], [-42, 87, -2202], [36, 89, -2265],
] as const;

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

export class Stage {
  readonly id: CircuitDefinition["id"];
  readonly root = new Group();
  readonly curve: CatmullRomCurve3;
  readonly samples: Vector3[];
  readonly roadWidth: number;
  readonly checkpoints: Vector3[] = [];
  readonly checkpointIndices = [140, 280, 420, 560, 700] as const;
  private readonly tangents: Vector3[] = [];
  private readonly normals: Vector3[] = [];
  private readonly pineRunMaterials?: PineRunMaterials;
  private readonly silverstoneMaterials?: SilverstoneMaterials;

  constructor(circuit: CircuitDefinition) {
    this.id = circuit.id;
    this.curve = new CatmullRomCurve3(
      (circuit.id === "silverstone" ? SILVERSTONE_TRACK_POINTS : TRACK_POINTS).map(([x, y, z]) => new Vector3(x, y, z)),
      circuit.id === "silverstone",
      "catmullrom",
      0.35,
    );
    this.samples = this.curve.getPoints(700);
    this.roadWidth = circuit.id === "silverstone" ? 14 : 10.5;
    if (this.id === "pine-run") this.pineRunMaterials = createPineRunMaterials();
    if (this.id === "silverstone") this.silverstoneMaterials = createSilverstoneMaterials();
    this.samples.forEach((_, index) => {
      const tangent = this.curve.getTangent(index / (this.samples.length - 1)).normalize();
      this.tangents.push(tangent);
      this.normals.push(new Vector3(-tangent.z, 0, tangent.x).normalize());
    });
    this.buildGround();
    this.buildRoad();
    if (this.id === "silverstone") {
      this.buildSilverstoneDetails();
      // Scenery is optional and loads independently of the playable stage.
      void this.loadSilverstoneAssets();
    }
    else {
      this.buildPineRunDetails();
      this.buildForest();
      // The authored structures are optional: procedural versions remain a
      // complete rally-stage fallback while their GLBs load in the background.
      void this.loadPineRunAssets();
    }
    this.buildCheckpoints();
    if (this.checkpoints.length !== this.checkpointIndices.length) {
      throw new Error("Stage checkpoint positions must include the finish gate.");
    }
    if (this.id === "pine-run") this.buildMountains();
  }

  startPose(): { position: Vector3; heading: number } {
    const direction = this.tangents[0];
    return {
      position: this.samples[0].clone().add(new Vector3(0, 0.42, 0)),
      heading: Math.atan2(-direction.x, -direction.z),
    };
  }

  nearest(point: Vector3, hint: number): { index: number; distance: number; side: number } {
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
    const offset = point.clone().sub(this.samples[bestIndex]);
    return {
      index: bestIndex,
      distance: Math.sqrt(bestDistanceSq),
      side: offset.dot(this.normals[bestIndex]),
    };
  }

  roadHeight(index: number): number {
    return this.samples[Math.max(0, Math.min(this.samples.length - 1, index))].y + 0.42;
  }

  tangent(index: number): Vector3 {
    return this.tangents[Math.max(0, Math.min(this.tangents.length - 1, index))];
  }

  surfaceGrip(index: number, side: number): number {
    if (this.id === "silverstone") return Math.abs(side) > this.roadWidth - 0.7 ? 0.42 : 1;
    if (Math.abs(side) > this.roadWidth - 0.7) return 0.4;

    // The centre of a stage is usually compacted by prior cars; gravel gets
    // looser towards the edge and varies modestly from one section to another.
    const packedLine = 1 - Math.min(1, Math.abs(side) / this.roadWidth);
    const sectionVariation = 0.94 + Math.sin(index * 0.19) * 0.035 + Math.sin(index * 0.047) * 0.025;
    return (0.62 + packedLine * 0.14) * sectionVariation;
  }

  drawMinimap(canvas: HTMLCanvasElement, progress: number): void {
    const context = canvas.getContext("2d");
    if (!context) return;
    const xs = this.samples.map((point) => point.x);
    const zs = this.samples.map((point) => point.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const scale = Math.min(146 / (maxX - minX), 146 / (maxZ - minZ));
    const mapPoint = (point: Vector3): [number, number] => [
      95 + (point.x - (minX + maxX) / 2) * scale,
      95 + (point.z - (minZ + maxZ) / 2) * scale,
    ];
    context.clearRect(0, 0, 190, 190);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "rgba(255,255,255,.22)";
    context.lineWidth = 7;
    context.beginPath();
    this.samples.forEach((point, index) => {
      const [x, y] = mapPoint(point);
      index === 0 ? context.moveTo(x, y) : context.lineTo(x, y);
    });
    context.stroke();
    context.strokeStyle = "#f8f4df";
    context.lineWidth = 3;
    context.stroke();
    const current = this.samples[Math.min(this.samples.length - 1, Math.floor(progress * (this.samples.length - 1)))];
    const [x, y] = mapPoint(current);
    context.fillStyle = "#ffcc30";
    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.fill();
    const [finishX, finishY] = mapPoint(this.samples[this.samples.length - 1]);
    context.fillStyle = "#ffffff";
    context.fillRect(finishX - 4, finishY - 4, 8, 8);
  }

  private buildGround(): void {
    const xs = this.samples.map((point) => point.x);
    const zs = this.samples.map((point) => point.z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    const width = Math.max(2400, maxX - minX + 900);
    const depth = Math.max(this.id === "silverstone" ? 1800 : 3000, maxZ - minZ + 900);
    const ground = new Mesh(
      new PlaneGeometry(width, depth),
      this.silverstoneMaterials?.grass ?? this.pineRunMaterials?.forestFloor ?? new MeshStandardMaterial({ color: 0x456b38, roughness: 1 })
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
    if (this.id === "silverstone") {
      this.root.add(makeStrip(-this.roadWidth - 3, this.roadWidth + 3, 0.035, 0x697176, 0x697176, this.silverstoneMaterials?.shoulder));
      this.root.add(makeStrip(-this.roadWidth, this.roadWidth, 0.075, 0x30363a, 0x30363a, this.silverstoneMaterials?.asphalt));
      this.root.add(makeStrip(this.roadWidth - 0.34, this.roadWidth, 0.092, 0xf0eee6, 0xf0eee6));
      this.root.add(makeStrip(-this.roadWidth, -this.roadWidth + 0.34, 0.092, 0xf0eee6, 0xf0eee6));
    } else {
      this.root.add(makeStrip(-this.roadWidth - 2.5, this.roadWidth + 2.5, 0.04, 0x876943, 0x75593b, this.pineRunMaterials?.shoulder));
      this.root.add(makeStrip(-this.roadWidth, this.roadWidth, 0.08, 0xa48358, 0x95744e, this.pineRunMaterials?.gravel));
    }
  }

  private buildSilverstoneDetails(): void {
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
    const kerbRuns: ReadonlyArray<readonly [number, number, -1 | 1]> = [
      [42, 74, -1], [82, 112, 1], [126, 157, -1], [165, 194, 1],
      [218, 252, -1], [273, 306, 1], [326, 360, -1], [374, 411, 1],
      [430, 466, -1], [485, 520, 1], [538, 576, -1], [590, 625, 1],
      [642, 680, -1],
    ];
    kerbRuns.forEach(([start, end, side]) => {
      const inside = this.roadWidth * side;
      const outside = (this.roadWidth + 2.15) * side;
      const runoffInside = (this.roadWidth + 2.1) * side;
      const runoffOutside = (this.roadWidth + 7.5) * side;
      this.root.add(buildDetailStrip(start, end, runoffInside, runoffOutside, 0.068, [0x59736a, 0x607a70], 10, this.silverstoneMaterials?.runoff));
      this.root.add(buildDetailStrip(start, end, inside, outside, 0.12, [0xe9e8de, 0xc9342f], 5));
    });

    const lineMaterial = new MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.82 });
    const startPoint = this.samples[0];
    const startNormal = this.normals[0];
    const startLine = new Mesh(new BoxGeometry(this.roadWidth * 2, 0.035, 0.9), lineMaterial);
    startLine.position.copy(startPoint);
    startLine.position.y += 0.13;
    startLine.rotation.y = Math.atan2(-startNormal.z, startNormal.x);
    this.root.add(startLine);

    const gridGeometry = new BoxGeometry(4.3, 0.035, 1.25);
    [684, 672, 660, 648, 636].forEach((sampleIndex, row) => {
      const point = this.samples[sampleIndex];
      const normal = this.normals[sampleIndex];
      for (const side of [-1, 1]) {
        const marker = new Mesh(gridGeometry, lineMaterial);
        marker.position.copy(point).addScaledVector(normal, side * (4.3 + (row % 2) * 1.25));
        marker.position.y += 0.13;
        marker.rotation.y = Math.atan2(-normal.z, normal.x);
        this.root.add(marker);
      }
    });

    const barrierMaterial = new MeshStandardMaterial({ color: 0xbfc5c5, roughness: 0.62, metalness: 0.25 });
    const darkBarrierMaterial = new MeshStandardMaterial({ color: 0x313b42, roughness: 0.78, metalness: 0.12 });
    const barrierGeometry = new BoxGeometry(0.45, 1.15, 7.5);
    const barrierRanges: ReadonlyArray<readonly [number, number, -1 | 1]> = [
      [8, 96, 1], [180, 258, -1], [300, 382, 1], [455, 528, -1], [612, 694, 1],
    ];
    barrierRanges.forEach(([start, end, side], rangeIndex) => {
      for (let sampleIndex = start; sampleIndex <= end; sampleIndex += 7) {
        const point = this.samples[sampleIndex];
        const normal = this.normals[sampleIndex];
        const tangent = this.tangents[sampleIndex];
        const barrier = new Mesh(barrierGeometry, rangeIndex % 2 === 0 ? barrierMaterial : darkBarrierMaterial);
        barrier.position.copy(point).addScaledVector(normal, side * (this.roadWidth + 10));
        barrier.position.y += 0.58;
        barrier.rotation.y = Math.atan2(tangent.x, tangent.z);
        barrier.castShadow = true;
        this.root.add(barrier);
      }
    });

    const standMaterial = new MeshStandardMaterial({ color: 0x4f5d64, roughness: 0.9 });
    const seatMaterial = new MeshStandardMaterial({ color: 0x1e343f, roughness: 0.92 });
    const proceduralGrandstands = new Group();
    proceduralGrandstands.name = "silverstone-procedural-grandstands";
    [24, 206, 346, 506, 650].forEach((sampleIndex, index) => {
      const point = this.samples[sampleIndex];
      const normal = this.normals[sampleIndex];
      const tangent = this.tangents[sampleIndex];
      const side = index % 2 === 0 ? 1 : -1;
      const stand = new Group();
      stand.position.copy(point).addScaledVector(normal, 40 * side);
      stand.rotation.y = Math.atan2(tangent.x, tangent.z);
      const base = new Mesh(new BoxGeometry(11, 2.4, 38), standMaterial);
      base.position.y = 1.2;
      stand.add(base);
      for (let tier = 0; tier < 4; tier += 1) {
        const seats = new Mesh(new BoxGeometry(2.2, 0.7, 36), seatMaterial);
        seats.position.set(side * (-2.6 + tier * 1.55), 2.3 + tier * 0.62, 0);
        seats.castShadow = true;
        stand.add(seats);
      }
      const roof = new Mesh(new BoxGeometry(13, 0.42, 41), barrierMaterial);
      roof.position.set(side * 1.5, 5.65, 0);
      roof.castShadow = true;
      stand.add(roof);
      proceduralGrandstands.add(stand);
    });
    this.root.add(proceduralGrandstands);
  }

  private async loadSilverstoneAssets(): Promise<void> {
    const result = await loadSilverstoneAssets(this);
    // The procedural stands are a complete fallback. Once the authored
    // grandstand prototype is available, avoid drawing both versions at once.
    if (result.loaded.some((url) => url.endsWith("silverstone-grandstand.glb"))) {
      const fallback = this.root.getObjectByName("silverstone-procedural-grandstands");
      if (fallback) fallback.visible = false;
    }
  }

  private buildPineRunDetails(): void {
    const lineMaterial = new MeshStandardMaterial({ color: 0xf0e8d1, roughness: .9 });
    const start = new Mesh(new BoxGeometry(this.roadWidth * 2, .028, .72), lineMaterial);
    start.position.copy(this.samples[0]);
    start.position.y += .11;
    start.rotation.y = Math.atan2(-this.normals[0].z, this.normals[0].x);
    this.root.add(start);

    // Mud patches are deliberately local instead of a baked all-lap texture:
    // they read at speed without turning a dry gravel stage into a brown blur.
    const mudGeometry = new BoxGeometry(this.roadWidth * 1.35, .014, 5.5);
    [118, 246, 411, 564, 676].forEach((sampleIndex) => {
      const patch = new Mesh(mudGeometry, this.pineRunMaterials?.mudDecal ?? new MeshStandardMaterial({ color: 0x60452e, roughness: 1 }));
      patch.position.copy(this.samples[sampleIndex]);
      patch.position.y += .105;
      patch.rotation.y = Math.atan2(-this.normals[sampleIndex].z, this.normals[sampleIndex].x);
      this.root.add(patch);
    });

    const hutWall = new MeshStandardMaterial({ color: 0x41382d, roughness: .96 });
    const hutRoof = new MeshStandardMaterial({ color: 0x293d39, roughness: .84, metalness: .08 });
    const hutGroup = new Group();
    hutGroup.name = "pine-run-procedural-timing-huts";
    [35, 278, 596].forEach((sampleIndex, index) => {
      const point = this.samples[sampleIndex];
      const normal = this.normals[sampleIndex];
      const tangent = this.tangents[sampleIndex];
      const hut = new Group();
      hut.position.copy(point).addScaledVector(normal, (index % 2 === 0 ? 1 : -1) * 38);
      hut.position.y += 2.4;
      hut.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI / 2;
      const cabin = new Mesh(new BoxGeometry(5.5, 4.8, 4.1), hutWall);
      const roof = new Mesh(new BoxGeometry(6.5, .42, 5.1), hutRoof);
      roof.position.y = 2.6;
      cabin.castShadow = true;
      roof.castShadow = true;
      hut.add(cabin, roof);
      hutGroup.add(hut);
    });
    this.root.add(hutGroup);

    const logMaterial = new MeshStandardMaterial({ color: 0x6c4e31, roughness: 1 });
    const braceMaterial = new MeshStandardMaterial({ color: 0x303433, roughness: .72, metalness: .28 });
    const barrierGroup = new Group();
    barrierGroup.name = "pine-run-procedural-log-barriers";
    [88, 176, 332, 454, 648].forEach((sampleIndex, index) => {
      const point = this.samples[sampleIndex];
      const normal = this.normals[sampleIndex];
      const tangent = this.tangents[sampleIndex];
      const barrier = new Group();
      barrier.position.copy(point).addScaledVector(normal, (index % 2 === 0 ? -1 : 1) * 25);
      barrier.position.y += 1.1;
      barrier.rotation.y = Math.atan2(tangent.x, tangent.z) + Math.PI / 2;
      [-.45, .45].forEach((height) => {
        const log = new Mesh(new CylinderGeometry(.22, .25, 7.4, 7), logMaterial);
        log.rotation.z = Math.PI / 2;
        log.position.y = height;
        log.castShadow = true;
        barrier.add(log);
      });
      [-2.9, 2.9].forEach((x) => {
        const brace = new Mesh(new BoxGeometry(.35, 2, .45), braceMaterial);
        brace.position.set(x, 0, 0);
        brace.castShadow = true;
        barrier.add(brace);
      });
      barrierGroup.add(barrier);
    });
    this.root.add(barrierGroup);
  }

  private async loadPineRunAssets(): Promise<void> {
    const result = await loadPineRunAssets(this);
    if (result.loaded.some((url) => url.endsWith("pine-run-timing-hut.glb"))) {
      this.root.getObjectByName("pine-run-procedural-timing-huts")?.removeFromParent();
    }
    if (result.loaded.some((url) => url.endsWith("pine-run-log-barrier.glb"))) {
      this.root.getObjectByName("pine-run-procedural-log-barriers")?.removeFromParent();
    }
  }

  private buildForest(): void {
    const trunkGeometry = new CylinderGeometry(0.22, 0.34, 2.8, 6);
    const crownGeometry = new ConeGeometry(1.65, 5.8, 7);
    const trunkMaterial = new MeshStandardMaterial({ color: 0x4c3225, roughness: 1 });
    const crownMaterial = new MeshStandardMaterial({ color: 0x174d3a, roughness: 0.92 });
    const count = 360;
    const trunks = new InstancedMesh(trunkGeometry, trunkMaterial, count);
    const crowns = new InstancedMesh(crownGeometry, crownMaterial, count);
    const matrix = new Matrix4();
    let seed = 8184;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let index = 0; index < count; index += 1) {
      const sampleIndex = Math.floor(random() * this.samples.length);
      const point = this.samples[sampleIndex];
      const normal = this.normals[sampleIndex];
      const side = random() > 0.5 ? 1 : -1;
      const distance = 18 + random() * 120;
      const x = point.x + normal.x * distance * side + (random() - 0.5) * 28;
      const z = point.z + normal.z * distance * side + (random() - 0.5) * 28;
      const y = point.y;
      const scale = 0.7 + random() * 1.35;
      matrix.compose(new Vector3(x, y + 1.4 * scale, z), new Quaternion(), new Vector3(scale, scale, scale));
      trunks.setMatrixAt(index, matrix);
      matrix.compose(new Vector3(x, y + 4.7 * scale, z), new Quaternion(), new Vector3(scale, scale, scale));
      crowns.setMatrixAt(index, matrix);
    }
    trunks.castShadow = true;
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    this.root.add(trunks, crowns);
  }

  private buildCheckpoints(): void {
    const poleMaterial = new MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.72 });
    const bannerMaterial = new MeshStandardMaterial({ color: this.id === "silverstone" ? 0x24343c : 0x1f63ce, roughness: 0.65, side: DoubleSide });
    const poleHeight = this.id === "silverstone" ? 6.8 : 5.2;
    const bannerHeight = this.id === "silverstone" ? 0.58 : 0.85;
    const indices = [0, ...this.checkpointIndices];
    indices.forEach((sampleIndex, checkpointIndex) => {
      const point = this.samples[sampleIndex];
      const normal = this.normals[sampleIndex];
      const gate = new Group();
      gate.position.copy(point);
      // The banner's long edge is local X, so rotate local X onto the road
      // normal. This makes every checkpoint span across the road.
      gate.rotation.y = Math.atan2(-normal.z, normal.x);
      const left = new Mesh(new CylinderGeometry(0.1, 0.13, poleHeight, 8), poleMaterial);
      const right = left.clone();
      left.position.set(-this.roadWidth - 0.4, poleHeight / 2, 0);
      right.position.set(this.roadWidth + 0.4, poleHeight / 2, 0);
      const banner = new Mesh(new BoxGeometry(this.roadWidth * 2 + 1.1, bannerHeight, 0.15), bannerMaterial);
      banner.position.y = poleHeight - 0.42;
      gate.add(left, right, banner);
      this.root.add(gate);
      if (checkpointIndex > 0) this.checkpoints.push(point.clone());
    });
  }

  private buildMountains(): void {
    const mountainMaterial = new MeshStandardMaterial({ color: 0x63808a, roughness: 1, flatShading: true });
    for (let index = 0; index < 18; index += 1) {
      const mountain = new Mesh(new ConeGeometry(80 + (index % 4) * 24, 150 + (index % 5) * 24, 7), mountainMaterial);
      const side = index % 2 === 0 ? -1 : 1;
      mountain.position.set(side * (330 + (index % 5) * 70), 58 + (index % 3) * 30, -80 - index * 145);
      mountain.rotation.y = index * 0.7;
      this.root.add(mountain);
    }
  }
}
