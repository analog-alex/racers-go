import {
  CanvasTexture,
  Color,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
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
  texture.minFilter = LinearMipmapLinearFilter;
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
    // Aggregate should break up large flat surfaces without reading as visual
    // noise from the chase camera.
    context.globalAlpha = 0.055 + random() * 0.12;
    context.beginPath();
    context.arc(random() * 256, random() * 256, 0.25 + random() * radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
};

const surfaceMaterial = (map: CanvasTexture, roughness: number): MeshStandardMaterial =>
  // Also render the underside of elevated road sections.
  new MeshStandardMaterial({ map, roughness, metalness: 0, side: DoubleSide });

/**
 * Build the shared GP surface palette without external assets.
 * Both circuits use the same tarmac, runoff, and grass materials.
 */
export const createSilverstoneMaterials = (): SilverstoneMaterials => {
  // Restrained colour variation keeps the racing line readable at speed.
  const asphaltMap = makeTexture(256, 256, (context, random) => {
    context.fillStyle = "#42474a";
    context.fillRect(0, 0, 256, 256);
    // Fine, closely packed aggregate gives motion cues without the large
    // pale flecks that made the previous surface read like loose gravel.
    speckles(context, random, 6200, "#899094", 0.7);
    speckles(context, random, 4400, "#20272b", 0.9);
    speckles(context, random, 1600, "#adb1af", 0.35);
  }, 6, 6);

  const shoulderMap = makeTexture(256, 256, (context) => {
    context.fillStyle = "#7e8683";
    context.fillRect(0, 0, 256, 256);
  }, 1, 1);

  const runoffMap = makeTexture(256, 256, (context) => {
    context.fillStyle = "#429d92";
    context.fillRect(0, 0, 256, 256);
  }, 1, 1);

  const grassMap = makeTexture(256, 256, (context, random) => {
    context.fillStyle = "#586d3d";
    context.fillRect(0, 0, 256, 256);
    speckles(context, random, 4800, "#8a955a", 1.1);
    speckles(context, random, 2200, "#364d2c", 1.3);
  }, 60, 45);

  const decalMap = makeTexture(256, 64, (context, random) => {
    context.clearRect(0, 0, 256, 64);
    // A central paint stroke makes this useful on both narrow lines and grids.
    context.fillStyle = "rgba(250,248,236,.92)";
    context.fillRect(0, 25, 256, 14);
    speckles(context, random, 160, "#b4b7b0", 1.3);
  }, 1, 1);
  decalMap.colorSpace = SRGBColorSpace;

  let disposed = false;
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
      if (disposed) return;
      disposed = true;
      [asphaltMap, shoulderMap, runoffMap, grassMap, decalMap].forEach((texture) => texture.dispose());
      [materials.asphalt, materials.shoulder, materials.runoff, materials.grass, materials.decal].forEach((material) => material.dispose());
    },
  };
  return materials;
};

export const silverstoneSurfaceColor = new Color("#30363a");
