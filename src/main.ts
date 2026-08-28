import "./style.css";
import { Game } from "./core/Game";
import { getCircuit, type CircuitDefinition } from "./core/Circuit";
import { getCar, type CarDefinition } from "./core/Cars";
import { CarPreview } from "./scene/CarPreview";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
const carScreen = document.querySelector<HTMLElement>("#car-screen");
const circuitScreen = document.querySelector<HTMLElement>("#circuit-screen");
const startButton = document.querySelector<HTMLButtonElement>("#start-button");
const circuitMenuButton = document.querySelector<HTMLButtonElement>("#circuit-menu-button");
const carMenuButton = document.querySelector<HTMLButtonElement>("#car-menu-button");
const briefingCarButton = document.querySelector<HTMLButtonElement>("#briefing-car-button");
const startScreen = document.querySelector<HTMLElement>("#start-screen");
const loading = document.querySelector<HTMLElement>("#loading");
const resumeButton = document.querySelector<HTMLButtonElement>("#resume-button");
const restartButton = document.querySelector<HTMLButtonElement>("#restart-button");
const mainMenuButton = document.querySelector<HTMLButtonElement>("#main-menu-button");
const failureRestartButton = document.querySelector<HTMLButtonElement>("#failure-restart-button");

if (!canvas || !carScreen || !circuitScreen || !circuitMenuButton || !carMenuButton || !briefingCarButton || !startButton || !startScreen || !loading || !resumeButton || !restartButton || !mainMenuButton || !failureRestartButton) {
  throw new Error("Game shell is incomplete");
}

const params = new URLSearchParams(location.search);
const selectedCarFromUrl = params.get("car");
const selectedCircuitFromUrl = params.get("circuit");
const selectedCarId = selectedCarFromUrl === "retro-force" ? selectedCarFromUrl : "formula";
let selectedCircuit: CircuitDefinition | null = null;
let selectedCar: CarDefinition | null = null;
let game: Game | null = null;

const setText = (selector: string, value: string): void => {
  const node = document.querySelector<HTMLElement>(selector);
  if (node) node.textContent = value;
};

const syncUrl = (): void => {
  const next = new URLSearchParams();
  if (selectedCar) next.set("car", selectedCar.id);
  if (selectedCircuit) next.set("circuit", selectedCircuit.id);
  const query = next.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}`);
};

const showScreen = (screen: HTMLElement): void => {
  for (const candidate of [carScreen, circuitScreen, startScreen]) candidate.classList.toggle("visible", candidate === screen);
};

const openCarSelection = (): void => {
  selectedCar = null;
  selectedCircuit = null;
  document.body.dataset.car = "";
  syncUrl();
  showScreen(carScreen);
};

const openCircuitSelection = (car: CarDefinition): void => {
  selectedCar = car;
  selectedCircuit = null;
  document.body.dataset.car = car.id;
  syncUrl();
  showScreen(circuitScreen);
};

const openStage = (circuit: CircuitDefinition): void => {
  const car = selectedCar ?? getCar("formula");
  selectedCar = car;
  selectedCircuit = circuit;
  syncUrl();
  document.body.dataset.car = car.id;
  document.body.dataset.circuit = circuit.id;
  startScreen.dataset.car = car.id;
  startScreen.dataset.circuit = circuit.id;
  setText("#selected-car-label", `${car.name} / ${car.category}`);
  setText("#start-kicker", `Racers / ${circuit.code} — ${circuit.discipline}`);
  setText("#hero-title", circuit.title);
  setText("#hero-accent", circuit.titleAccent);
  setText("#hero-tagline", circuit.tagline);
  setText("#stamp-code", circuit.code);
  setText("#stamp-region", circuit.region.toUpperCase());
  setText("#stamp-meta", `${circuit.distance} · ${circuit.surface} · ${circuit.condition}`);
  setText("#secondary-control-label", "Brake");
  setText("#control-tip-label", "Brake");
  circuitScreen.classList.remove("visible");
  startScreen.classList.add("visible");
  loading.classList.add("visible");
  game = new Game(canvas, circuit, car);
  void game.load().finally(() => loading.classList.remove("visible"));
};

document.querySelectorAll<HTMLButtonElement>("[data-car]").forEach((button) => {
  button.addEventListener("click", () => openCircuitSelection(getCar(button.dataset.car ?? null)));
});

document.querySelectorAll<HTMLButtonElement>("[data-circuit]").forEach((button) => {
  button.addEventListener("click", () => openStage(getCircuit(button.dataset.circuit ?? null)));
});

const previews = [...document.querySelectorAll<HTMLCanvasElement>("[data-car-preview]")].map((previewCanvas) => {
  const preview = new CarPreview(previewCanvas, getCar(previewCanvas.dataset.carPreview ?? null));
  void preview.load().then(() => preview.start());
  return preview;
});
void previews;

if (selectedCircuitFromUrl) {
  selectedCar = getCar(selectedCarId);
  openStage(getCircuit(selectedCircuitFromUrl));
} else if (selectedCarFromUrl) {
  openCircuitSelection(getCar(selectedCarFromUrl));
}

startButton.addEventListener("click", () => {
  if (!game) return;
  startScreen.classList.add("leaving");
  globalThis.setTimeout(() => startScreen.classList.remove("visible", "leaving"), 650);
  game.start();
});

circuitMenuButton.addEventListener("click", () => {
  if (selectedCar) openCircuitSelection(selectedCar);
  else openCarSelection();
});
carMenuButton.addEventListener("click", () => {
  if (selectedCar) openCarSelection();
  else showScreen(carScreen);
});
briefingCarButton.addEventListener("click", () => {
  openCarSelection();
});

resumeButton.addEventListener("click", () => game?.resume());
restartButton.addEventListener("click", () => {
  if (selectedCircuit && selectedCar) location.assign(`${location.pathname}?car=${selectedCar.id}&circuit=${selectedCircuit.id}`);
});
mainMenuButton.addEventListener("click", () => location.assign(selectedCar ? `${location.pathname}?car=${selectedCar.id}` : location.pathname));
failureRestartButton.addEventListener("click", () => {
  if (selectedCircuit && selectedCar) location.assign(`${location.pathname}?car=${selectedCar.id}&circuit=${selectedCircuit.id}`);
});
