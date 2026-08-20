import type { Stage } from "../scene/Stage";

const required = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing interface element: ${selector}`);
  return node;
};

const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(3).padStart(6, "0")}`;
};

export class HUD {
  private readonly root = required<HTMLElement>("#hud");
  private readonly speed = required<HTMLElement>("#speed");
  private readonly gear = required<HTMLElement>("#gear");
  private readonly surface = required<HTMLElement>("#surface");
  private readonly time = required<HTMLElement>("#time");
  private readonly best = required<HTMLElement>("#best");
  private readonly progress = required<HTMLElement>("#progress");
  private readonly progressLabel = required<HTMLElement>("#progress-label");
  private readonly checkpoint = required<HTMLElement>("#checkpoint");
  private readonly surfaceLabel = required<HTMLElement>("#surface-label");
  private readonly revFill = required<HTMLElement>("#rev-fill");
  private readonly revLights = Array.from(document.querySelectorAll<HTMLElement>(".rev-light"));
  private readonly countdown = required<HTMLElement>("#countdown");
  private readonly cornerCall = required<HTMLElement>("#corner-call");
  private readonly minimap = required<HTMLCanvasElement>("#minimap");
  private readonly drsStatus = required<HTMLElement>("#drs-status");
  private readonly ersFill = required<HTMLElement>("#ers-fill");
  private readonly sector = required<HTMLElement>("#sector");

  constructor(private readonly stage: Stage) {
    const isFormula = stage.id === "silverstone";
    this.root.dataset.circuit = stage.id;
    this.root.setAttribute("aria-label", isFormula ? "Formula telemetry" : "Rally telemetry");
    required<HTMLElement>("#stage-code").textContent = stage.id === "silverstone" ? "GP 02" : "SS 01";
    required<HTMLElement>("#stage-name").textContent = stage.id === "silverstone" ? "NORTHAMPTONSHIRE" : "LORA FOREST";
    required<HTMLElement>("#route-distance").textContent = stage.id === "silverstone" ? "5.9 KM" : "3.1 KM";
    this.progressLabel.textContent = isFormula ? "Lap" : "Progress";
    this.surfaceLabel.textContent = isFormula ? "Tyres" : "Surface";
    required<HTMLElement>("#surface").textContent = isFormula ? "SOFT" : "GRAVEL";
    const stored = Number(localStorage.getItem(`${stage.id}-best`));
    if (stored > 0) this.best.textContent = formatTime(stored);
    this.stage.drawMinimap(this.minimap, 0);
  }

  show(): void {
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  update(data: { speed: number; elapsed: number; progress: number; offroad: boolean; checkpoint: number; turn: number }): void {
    const isFormula = this.stage.id === "silverstone";
    const kmh = Math.round(Math.abs(data.speed) * 3.6);
    const absolute = Math.abs(data.speed);
    const gear = absolute < 1 ? "N" : String(Math.min(isFormula ? 8 : 6, Math.max(1, Math.ceil(absolute / (isFormula ? 12 : 9)))));
    this.speed.textContent = String(kmh);
    this.gear.textContent = data.speed < -0.5 ? "R" : gear;
    this.surface.textContent = data.offroad ? (isFormula ? "GRASS" : "LOOSE") : isFormula ? "SOFT" : "GRAVEL";
    this.surface.classList.toggle("danger", data.offroad);
    this.time.textContent = formatTime(data.elapsed);
    this.progress.textContent = isFormula ? "01 / 01" : `${Math.floor(data.progress * 100)}%`;
    this.checkpoint.textContent = isFormula
      ? (data.progress > 0.985 ? "PIT / FINISH" : `SPLIT ${Math.min(5, data.checkpoint + 1)}/5`)
      : data.progress > 0.985 ? "FINISH" : `SPLIT ${Math.min(5, data.checkpoint + 1)}/5`;
    this.revFill.style.width = isFormula
      ? `${Math.min(100, 10 + (absolute / 92) * 90)}%`
      : `${Math.min(100, 18 + (absolute % 9) * 9.2)}%`;
    const revRatio = Math.min(1, absolute / (isFormula ? 92 : 49));
    this.revLights.forEach((light, index) => {
      const lightRatio = (index + 1) / this.revLights.length;
      light.classList.toggle("active", isFormula && revRatio >= lightRatio - 0.04);
      light.classList.toggle("hot", isFormula && lightRatio > 0.72 && revRatio >= lightRatio - 0.04);
      light.classList.toggle("limit", isFormula && lightRatio > 0.92 && revRatio >= lightRatio - 0.04);
    });
    const severity = Math.max(1, 6 - Math.floor(Math.abs(data.turn) * 42));
    const arrow = data.turn > 0.015 ? "↱" : data.turn < -0.015 ? "↰" : "▲";
    this.cornerCall.innerHTML = `<span>${arrow}</span><b>${Math.abs(data.turn) < 0.008 ? "FLAT" : severity}</b><small>${Math.max(30, Math.round(120 - Math.abs(data.turn) * 2600))}</small>`;
    if (isFormula) {
      this.drsStatus.textContent = data.offroad ? "OFF" : absolute > 55 ? "ARMED" : "OFF";
      this.drsStatus.classList.toggle("armed", !data.offroad && absolute > 55);
      this.ersFill.style.width = `${Math.min(100, Math.max(24, 100 - data.progress * 22 + (absolute < 35 ? 8 : 0)))}%`;
      this.sector.textContent = data.progress < 0.333 ? "S1" : data.progress < 0.666 ? "S2" : "S3";
    }
    this.stage.drawMinimap(this.minimap, data.progress);
  }

  setCountdown(text: string): void {
    this.countdown.textContent = text;
    this.countdown.classList.toggle("active", text.length > 0);
  }

  finish(seconds: number): { isBest: boolean; best: number; delta: number | null } {
    const previous = Number(localStorage.getItem(`${this.stage.id}-best`));
    const isBest = !previous || seconds < previous;
    const best = isBest ? seconds : previous;
    if (isBest) localStorage.setItem(`${this.stage.id}-best`, String(seconds));
    this.best.textContent = formatTime(best);
    return { isBest, best, delta: previous > 0 ? seconds - previous : null };
  }

  static formatTime = formatTime;
}
