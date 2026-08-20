export type CircuitId = "pine-run" | "silverstone";

export interface CircuitDefinition {
  id: CircuitId;
  code: string;
  menuKicker: string;
  name: string;
  title: string;
  titleAccent: string;
  tagline: string;
  region: string;
  distance: string;
  surface: string;
  condition: string;
  discipline: string;
  description: string;
}

export const CIRCUITS: Record<CircuitId, CircuitDefinition> = {
  "pine-run": {
    id: "pine-run",
    code: "SS 01",
    menuKicker: "Rally / Gravel",
    name: "Pine Run",
    title: "Pine",
    titleAccent: "Run",
    tagline: "Loose gravel. Thin air. One clean run.",
    region: "Lora Forest",
    distance: "3.1 KM",
    surface: "GRAVEL",
    condition: "DRY",
    discipline: "Alpine rally",
    description: "A narrow forest stage where rhythm matters more than bravery.",
  },
  silverstone: {
    id: "silverstone",
    code: "GP 02",
    menuKicker: "Formula / Tarmac",
    name: "Silverstone",
    title: "Silver",
    titleAccent: "stone",
    tagline: "Late apexes. Flat kerbs. No room for a lazy lap.",
    region: "Northamptonshire",
    distance: "5.9 KM",
    surface: "TARMAC",
    condition: "DRY",
    discipline: "Grand prix circuit",
    description: "A fast, open circuit built for commitment, precision, and clean exits.",
  },
};

export const getCircuit = (id: string | null): CircuitDefinition =>
  id === "silverstone" ? CIRCUITS.silverstone : CIRCUITS["pine-run"];
