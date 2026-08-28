export type CircuitId = "silverstone" | "suzuka";

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
  suzuka: {
    id: "suzuka",
    code: "GP 03",
    menuKicker: "Formula / Tarmac",
    name: "Suzuka",
    title: "Suzuka",
    titleAccent: "Circuit",
    tagline: "Esses. Spoon. 130R. One lap, no wasted motion.",
    region: "Mie, Japan",
    distance: "5.8 KM",
    surface: "TARMAC",
    condition: "DRY",
    discipline: "Grand prix circuit",
    description: "A flowing figure-eight GP layout where rhythm, commitment, and clean transitions make the lap.",
  },
};

export const getCircuit = (id: string | null): CircuitDefinition =>
  id === "suzuka" ? CIRCUITS.suzuka : CIRCUITS.silverstone;
