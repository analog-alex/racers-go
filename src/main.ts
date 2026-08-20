import "./style.css";
import { Game } from "./core/Game";
import { getCircuit, type CircuitDefinition } from "./core/Circuit";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const circuitScreen = document.querySelector<HTMLElement>("#circuit-screen");
const startButton = document.querySelector<HTMLButtonElement>("#start-button");
const circuitMenuButton = document.querySelector<HTMLButtonElement>("#circuit-menu-button");
const startScreen = document.querySelector<HTMLElement>("#start-screen");
const loading = document.querySelector<HTMLElement>("#loading");
const resumeButton = document.querySelector<HTMLButtonElement>("#resume-button");
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button");
const mainMenuButton = document.querySelector<HTMLButtonElement>("#main-menu-button");
const failureRestartButton = document.querySelector<HTMLButtonElement>("#failure-restart-button");

if (!canvas || !circuitScreen || !circuitMenuButton || !startButton || !startScreen || !loading || !resumeButton || !restartButton || !mainMenuButton || !failureRestartButton) {
  throw new Error("Game shell is incomplete");
}

const selectedFromUrl = new URLSearchParams(location.search).get("circuit");
let selectedCircuit: CircuitDefinition | null = null;
let game: Game | null = null;

const setText = (selector: string, value: string): void => {
  const node = document.querySelector<HTMLElement>(selector);
  if (node) node.textContent = value;
};

const openStage = (circuit: CircuitDefinition): void => {
  selectedCircuit = circuit;
  document.body.dataset.circuit = circuit.id;
  startScreen.dataset.circuit = circuit.id;
  setText("#start-kicker", `Racers / ${circuit.code} — ${circuit.discipline}`);
  setText("#hero-title", circuit.title);
  setText("#hero-accent", circuit.titleAccent);
  setText("#hero-tagline", circuit.tagline);
  setText("#stamp-code", circuit.code);
  setText("#stamp-region", circuit.region.toUpperCase());
  setText("#stamp-meta", `${circuit.distance} · ${circuit.surface} · ${circuit.condition}`);
  setText("#secondary-control-label", circuit.id === "silverstone" ? "Brake" : "Handbrake");
  setText("#control-tip-label", circuit.id === "silverstone" ? "Brake" : "Handbrake");
  circuitScreen.classList.remove("visible");
  startScreen.classList.add("visible");
  loading.classList.add("visible");
  game = new Game(canvas, circuit);
  void game.load().finally(() => loading.classList.remove("visible"));
};

document.querySelectorAll<HTMLButtonElement>("[data-circuit]").forEach((button) => {
  button.addEventListener("click", () => openStage(getCircuit(button.dataset.circuit ?? null)));
});

if (selectedFromUrl) openStage(getCircuit(selectedFromUrl));

startButton.addEventListener("click", () => {
  if (!game) return;
  startScreen.classList.add("leaving");
  globalThis.setTimeout(() => startScreen.classList.remove("visible", "leaving"), 650);
  game.start();
});

circuitMenuButton.addEventListener("click", () => location.assign(location.pathname));

resumeButton.addEventListener("click", () => game?.resume());
restartButton.addEventListener("click", () => {
  if (selectedCircuit) location.assign(`${location.pathname}?circuit=${selectedCircuit.id}`);
});
mainMenuButton.addEventListener("click", () => location.assign(location.pathname));
failureRestartButton.addEventListener("click", () => {
  if (selectedCircuit) location.assign(`${location.pathname}?circuit=${selectedCircuit.id}`);
});
