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
    this.root.dataset.circuit = stage.id;
    this.root.setAttribute("aria-label", "Formula telemetry");
    required<HTMLElement>("#stage-code").textContent = stage.definition.code;
    required<HTMLElement>("#stage-name").textContent = stage.definition.region.toUpperCase();
    required<HTMLElement>("#route-distance").textContent = stage.definition.distance;
    this.progressLabel.textContent = "Lap";
    this.surfaceLabel.textContent = "Tyres";
    required<HTMLElement>("#surface").textContent = "SOFT";
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
    const kmh = Math.round(Math.abs(data.speed) * 3.6);
    const absolute = Math.abs(data.speed);
    const gear = absolute < 1 ? "N" : String(Math.min(8, Math.max(1, Math.ceil(absolute / 12))));
    this.speed.textContent = String(kmh);
    this.gear.textContent = data.speed < -0.5 ? "R" : gear;
    this.surface.textContent = data.offroad ? "GRASS" : "SOFT";
    this.surface.classList.toggle("danger", data.offroad);
    this.time.textContent = formatTime(data.elapsed);
    this.progress.textContent = "01 / 01";
    this.checkpoint.textContent = data.progress > 0.985 ? "PIT / FINISH" : `SPLIT ${Math.min(5, data.checkpoint + 1)}/5`;
    this.revFill.style.width = `${Math.min(100, 10 + (absolute / 92) * 90)}%`;
    const revRatio = Math.min(1, absolute / 92);
    this.revLights.forEach((light, index) => {
      const lightRatio = (index + 1) / this.revLights.length;
      light.classList.toggle("active", revRatio >= lightRatio - 0.04);
      light.classList.toggle("hot", lightRatio > 0.72 && revRatio >= lightRatio - 0.04);
      light.classList.toggle("limit", lightRatio > 0.92 && revRatio >= lightRatio - 0.04);
    });
    const severity = Math.max(1, 6 - Math.floor(Math.abs(data.turn) * 42));
    const arrow = data.turn > 0.015 ? "↱" : data.turn < -0.015 ? "↰" : "▲";
    this.cornerCall.innerHTML = `<span>${arrow}</span><b>${Math.abs(data.turn) < 0.008 ? "FLAT" : severity}</b><small>${Math.max(30, Math.round(120 - Math.abs(data.turn) * 2600))}</small>`;
    this.drsStatus.textContent = data.offroad ? "OFF" : absolute > 55 ? "ARMED" : "OFF";
    this.drsStatus.classList.toggle("armed", !data.offroad && absolute > 55);
    this.ersFill.style.width = `${Math.min(100, Math.max(24, 100 - data.progress * 22 + (absolute < 35 ? 8 : 0)))}%`;
    this.sector.textContent = data.progress < 0.333 ? "S1" : data.progress < 0.666 ? "S2" : "S3";
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
