export type CarId = "formula" | "retro-force";

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
  },
};

export const getCar = (id: string | null): CarDefinition =>
  id === "retro-force" ? CARS["retro-force"] : CARS.formula;
