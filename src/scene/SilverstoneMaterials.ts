import {
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

export interface SilverstoneMaterials {
  /** Fine-grained, dark GP asphalt with subtle rubber and aggregate variation. */
  asphalt: MeshStandardMaterial;
  /** Pale concrete shoulder used outside the racing surface. */
  shoulder: MeshStandardMaterial;
  /** Blue-green painted runoff used at Silverstone's kerb exits. */
  runoff: MeshStandardMaterial;
  /** Dry Northamptonshire grass for the infield and verges. */
  grass: MeshStandardMaterial;
  /** Transparent paint/decal layer for line and rubber-mark details. */
  decal: MeshStandardMaterial;
  dispose(): void;
}

// A tiny integer PRNG keeps generated textures stable between runs/builds.
const randomSource = (seed: number): (() => number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const makeTexture = (
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, random: () => number) => void,
  repeatX: number,
  repeatY: number,
): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Silverstone materials require a 2D canvas context");
  draw(context, randomSource(width * 97 + height * 13));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  // Safe default for track surfaces; renderers clamp to their supported maximum.
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
};

const speckles = (
  context: CanvasRenderingContext2D,
  random: () => number,
  count: number,
  color: string,
  radius: number,
): void => {
  context.fillStyle = color;
  for (let index = 0; index < count; index += 1) {
    // Aggregate should break up large flat surfaces without reading as bright
    // gravel or visual noise from the chase camera.
    context.globalAlpha = 0.055 + random() * 0.12;
    context.beginPath();
    context.arc(random() * 256, random() * 256, 0.25 + random() * radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
};

const surfaceMaterial = (map: CanvasTexture, roughness: number): MeshStandardMaterial =>
  // Track ribbons can reverse winding as their Catmull-Rom normals turn around
  // tight corners, so keep both faces renderable instead of exposing the grass
  // plane underneath on half of the lap.
  new MeshStandardMaterial({ map, roughness, metalness: 0, side: DoubleSide });

/**
 * Build the Silverstone-specific surface palette without external assets.
 * Call this only for Silverstone: the generated maps are intentionally not
 * shared with Pine Run's gravel/forest materials.
 */
export const createSilverstoneMaterials = (): SilverstoneMaterials => {
  const asphaltMap = makeTexture(256, 256, (context, random) => {
    context.fillStyle = "#30363a";
    context.fillRect(0, 0, 256, 256);
    speckles(context, random, 2100, "#aab0af", 1.15);
    speckles(context, random, 1200, "#111719", 0.9);
    context.strokeStyle = "rgba(210,215,210,.08)";
    context.lineWidth = 0.65;
    for (let index = 0; index < 22; index += 1) {
      const y = random() * 256;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(256, y + (random() - 0.5) * 8);
      context.stroke();
    }
  }, 7, 7);

  const shoulderMap = makeTexture(256, 256, (context, random) => {
    context.fillStyle = "#7d8585";
    context.fillRect(0, 0, 256, 256);
    speckles(context, random, 1200, "#d2d0c1", 1.5);
    speckles(context, random, 500, "#424b4d", 1.2);
  }, 5, 5);

  const runoffMap = makeTexture(256, 256, (context, random) => {
    context.fillStyle = "#5f7d75";
    context.fillRect(0, 0, 256, 256);
    speckles(context, random, 800, "#94a79d", 1.2);
    speckles(context, random, 360, "#334e4d", 1.1);
    context.strokeStyle = "rgba(225,232,218,.12)";
    context.lineWidth = 1;
    for (let x = -256; x < 512; x += 22) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + 256, 256);
      context.stroke();
    }
  }, 3, 3);

  const grassMap = makeTexture(256, 256, (context, random) => {
    context.fillStyle = "#3e5543";
    context.fillRect(0, 0, 256, 256);
    speckles(context, random, 1600, "#73805b", 1.6);
    speckles(context, random, 900, "#263b33", 1.25);
    context.strokeStyle = "rgba(154,165,111,.2)";
    context.lineWidth = 0.8;
    for (let index = 0; index < 500; index += 1) {
      const x = random() * 256;
      const y = random() * 256;
      context.beginPath();
      context.moveTo(x, y + 2);
      context.lineTo(x + (random() - 0.5) * 2, y - 2 - random() * 3);
      context.stroke();
    }
  }, 4, 4);

  const decalMap = makeTexture(256, 64, (context, random) => {
    context.clearRect(0, 0, 256, 64);
    // A central paint stroke makes this useful on both narrow lines and grids.
    context.fillStyle = "rgba(250,248,236,.92)";
    context.fillRect(0, 25, 256, 14);
    speckles(context, random, 160, "#b4b7b0", 1.3);
  }, 1, 1);
  decalMap.colorSpace = SRGBColorSpace;

  const materials: SilverstoneMaterials = {
    asphalt: surfaceMaterial(asphaltMap, 0.94),
    shoulder: surfaceMaterial(shoulderMap, 0.88),
    runoff: surfaceMaterial(runoffMap, 0.86),
    grass: surfaceMaterial(grassMap, 1),
    decal: new MeshStandardMaterial({
      map: decalMap,
      transparent: true,
      alphaTest: 0.1,
      roughness: 0.78,
      depthWrite: false,
    }),
    dispose: () => {
      [asphaltMap, shoulderMap, runoffMap, grassMap, decalMap].forEach((texture) => texture.dispose());
      [materials.asphalt, materials.shoulder, materials.runoff, materials.grass, materials.decal].forEach((material) => material.dispose());
    },
  };
  return materials;
};

export const silverstoneSurfaceColor = new Color("#30363a");
