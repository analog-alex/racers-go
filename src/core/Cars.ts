export type CarId = "formula" | "retro-force" | "model-y";

export interface CarDefinition {
  id: CarId;
  code: string;
  name: string;
  modelPath: string;
  category: string;
  tagline: string;
  description: string;
  topSpeed: string;
  handling: string;
  /** Game tuning, not a manufacturer specification. Existing Formula cars retain their defaults. */
  performance?: { topSpeed: number; acceleration: number; braking: number; grip: number; aero: number; wheelbase: number };
  /** Keep static, detect separate parts, or split the Formula asset at its axle regions. */
  wheelComponents: "static" | "detect" | "detect-road" | "regions" | "authored";
}

export const CARS: Record<CarId, CarDefinition> = {
  formula: {
    id: "formula",
    code: "CAR 01",
    name: "Retro Force",
    modelPath: "./models/formula-car.glb",
    category: "Modern single-seater",
    tagline: "Clean air. Clean lines. Pure speed.",
    description: "A precise, lightweight F1 machine built for fast direction changes and tidy exits.",
    topSpeed: "310 KM/H",
    handling: "PRECISION",
    wheelComponents: "regions",
  },
  "retro-force": {
    id: "retro-force",
    code: "CAR 02",
    name: "E-Modern",
    modelPath: "./models/retro-force.glb",
    category: "Retro-modern grand prix",
    tagline: "60s soul. Modern edge.",
    description: "A black-and-yellow love letter to classic Grand Prix cars with today's F1 attitude.",
    topSpeed: "302 KM/H",
    handling: "BALANCED",
    wheelComponents: "detect",
  },
  "model-y": {
    id: "model-y",
    code: "CAR 03",
    name: "Tesla Model Y",
    modelPath: "./models/tesla-model-y.glb",
    category: "Electric crossover",
    tagline: "Quiet power. A different kind of racing line.",
    description: "A stylized electric road car with a relaxed pace, softer cornering, and everyday character.",
    topSpeed: "210 KM/H",
    handling: "ROAD",
    wheelComponents: "static",
    performance: { topSpeed: 210 / 3.6, acceleration: 0.55, braking: 0.62, grip: 0.72, aero: 0.08, wheelbase: 3.0 },
  },
};

export const getCar = (id: string | null): CarDefinition =>
  id === "model-y" ? CARS["model-y"] : id === "retro-force" ? CARS["retro-force"] : CARS.formula;
