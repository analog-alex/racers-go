import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";

export interface PineRunMaterials {
  gravel: MeshStandardMaterial;
  shoulder: MeshStandardMaterial;
  forestFloor: MeshStandardMaterial;
  mudDecal: MeshStandardMaterial;
  dispose(): void;
}

// Keep the woodland stable between loads: random-looking ground should never
// cause the racing line or the visual language of a stage to shift on reload.
const randomSource = (seed: number): (() => number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const makeTexture = (
  draw: (context: CanvasRenderingContext2D, random: () => number) => void,
  repeatX: number,
  repeatY: number,
): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Pine Run materials require a 2D canvas context");
  draw(context, randomSource(7349));
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
};

const speckles = (
  context: CanvasRenderingContext2D,
  random: () => number,
  count: number,
  colors: readonly string[],
  radius: number,
): void => {
  for (let index = 0; index < count; index += 1) {
    context.fillStyle = colors[Math.floor(random() * colors.length)];
    context.globalAlpha = 0.08 + random() * 0.2;
    context.beginPath();
    context.arc(random() * 256, random() * 256, 0.3 + random() * radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
};

const surface = (map: CanvasTexture, roughness: number): MeshStandardMaterial =>
  new MeshStandardMaterial({ map, roughness, metalness: 0, side: DoubleSide });

/** Procedural surfaces for Pine Run only; do not share its rally palette with Silverstone. */
export const createPineRunMaterials = (): PineRunMaterials => {
  const gravelMap = makeTexture((context, random) => {
    context.fillStyle = "#927650";
    context.fillRect(0, 0, 256, 256);
    speckles(context, random, 2600, ["#d0b481", "#674d35", "#b08e62"], 1.45);
    context.strokeStyle = "rgba(78, 57, 38, .16)";
    context.lineWidth = 1.1;
    for (let index = 0; index < 48; index += 1) {
      const y = random() * 256;
      context.beginPath();
      context.moveTo(-6, y);
      context.bezierCurveTo(70, y - 3 + random() * 6, 170, y + random() * 7, 262, y - 3 + random() * 6);
      context.stroke();
    }
  }, 7, 7);

  const shoulderMap = makeTexture((context, random) => {
    context.fillStyle = "#70563a";
    context.fillRect(0, 0, 256, 256);
    speckles(context, random, 2000, ["#a8845c", "#443522", "#826342"], 1.7);
    context.strokeStyle = "rgba(49, 37, 24, .13)";
    context.lineWidth = 2.2;
    for (let index = 0; index < 36; index += 1) {
      const x = random() * 256;
      context.beginPath();
      context.moveTo(x, -4);
      context.lineTo(x + (random() - .5) * 22, 260);
      context.stroke();
    }
  }, 5, 5);

  const forestFloorMap = makeTexture((context, random) => {
    context.fillStyle = "#38513b";
    context.fillRect(0, 0, 256, 256);
    speckles(context, random, 1800, ["#6f8051", "#233728", "#846b40"], 1.8);
    context.strokeStyle = "rgba(151, 139, 83, .15)";
    context.lineWidth = .75;
    for (let index = 0; index < 360; index += 1) {
      const x = random() * 256;
      const y = random() * 256;
      context.beginPath();
      context.moveTo(x, y + 3);
      context.lineTo(x + (random() - .5) * 3, y - 2 - random() * 4);
      context.stroke();
    }
  }, 4, 4);

  const mudMap = makeTexture((context, random) => {
    context.clearRect(0, 0, 256, 256);
    context.fillStyle = "rgba(63, 45, 29, .58)";
    for (let index = 0; index < 26; index += 1) {
      const x = random() * 256;
      const y = random() * 256;
      context.beginPath();
      context.ellipse(x, y, 12 + random() * 26, 2 + random() * 5, (random() - .5) * .25, 0, Math.PI * 2);
      context.fill();
    }
  }, 1, 1);

  const materials: PineRunMaterials = {
    gravel: surface(gravelMap, .96),
    shoulder: surface(shoulderMap, 1),
    forestFloor: surface(forestFloorMap, 1),
    mudDecal: new MeshStandardMaterial({ map: mudMap, transparent: true, alphaTest: .06, depthWrite: false, roughness: 1, side: DoubleSide }),
    dispose: () => {
      [gravelMap, shoulderMap, forestFloorMap, mudMap].forEach((texture) => texture.dispose());
      [materials.gravel, materials.shoulder, materials.forestFloor, materials.mudDecal].forEach((material) => material.dispose());
    },
  };
  return materials;
};
