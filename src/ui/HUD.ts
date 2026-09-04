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

export interface HUDTelemetry {
  speed: number;
  elapsed: number;
  progress: number;
  offroad: boolean;
  checkpoint: number;
  turn: number;
}

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
  private readonly cornerArrow = this.cornerCall.querySelector<HTMLElement>("span");
  private readonly cornerValue = this.cornerCall.querySelector<HTMLElement>("b");
  private readonly cornerSpeed = this.cornerCall.querySelector<HTMLElement>("small");
  private readonly minimap = required<HTMLCanvasElement>("#minimap");
  private readonly drsStatus = required<HTMLElement>("#drs-status");
  private readonly ersFill = required<HTMLElement>("#ers-fill");
  private readonly sector = required<HTMLElement>("#sector");
  private visible = false;
  private lastSpeed = "";
  private lastGear = "";
  private lastSurface = "";
  private lastSurfaceDanger = false;
  private lastTime = "";
  private lastProgress = "";
  private lastCheckpoint = "";
  private lastRevWidth = "";
  private lastRevMask = -1;
  private lastCornerArrow = "";
  private lastCornerValue = "";
  private lastCornerSpeed = "";
  private lastDrs = "";
  private lastDrsArmed = false;
  private lastErsWidth = "";
  private lastSector = "";
  private lastCountdown = "";
  private lastMinimapTick = -1;

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
    if (this.visible) return;
    this.visible = true;
    this.root.classList.remove("hidden");
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.root.classList.add("hidden");
  }

  update(data: HUDTelemetry): void {
    const kmh = Math.round(Math.abs(data.speed) * 3.6);
    const absolute = Math.abs(data.speed);
    const gear = absolute < 1 ? "N" : String(Math.min(8, Math.max(1, Math.ceil(absolute / 12))));
    const speedText = String(kmh);
    if (speedText !== this.lastSpeed) {
      this.lastSpeed = speedText;
      this.speed.textContent = speedText;
    }
    const gearText = data.speed < -0.5 ? "R" : gear;
    if (gearText !== this.lastGear) {
      this.lastGear = gearText;
      this.gear.textContent = gearText;
    }
    const surfaceText = data.offroad ? "GRASS" : "SOFT";
    if (surfaceText !== this.lastSurface) {
      this.lastSurface = surfaceText;
      this.surface.textContent = surfaceText;
    }
    if (data.offroad !== this.lastSurfaceDanger) {
      this.lastSurfaceDanger = data.offroad;
      this.surface.classList.toggle("danger", data.offroad);
    }
    const timeText = formatTime(data.elapsed);
    if (timeText !== this.lastTime) {
      this.lastTime = timeText;
      this.time.textContent = timeText;
    }
    if (this.lastProgress !== "01 / 01") {
      this.lastProgress = "01 / 01";
      this.progress.textContent = this.lastProgress;
    }
    const checkpointText = data.progress > 0.985 ? "PIT / FINISH" : `SPLIT ${Math.min(5, data.checkpoint + 1)}/5`;
    if (checkpointText !== this.lastCheckpoint) {
      this.lastCheckpoint = checkpointText;
      this.checkpoint.textContent = checkpointText;
    }
    const revWidth = `${Math.min(100, 10 + (absolute / 92) * 90)}%`;
    if (revWidth !== this.lastRevWidth) {
      this.lastRevWidth = revWidth;
      this.revFill.style.width = revWidth;
    }
    const revRatio = Math.min(1, absolute / 92);
    let revMask = 0;
    for (let index = 0; index < this.revLights.length; index += 1) {
      const lightRatio = (index + 1) / this.revLights.length;
      if (revRatio >= lightRatio - 0.04) revMask |= 1 << index;
    }
    if (revMask !== this.lastRevMask) {
      this.lastRevMask = revMask;
      for (let index = 0; index < this.revLights.length; index += 1) {
        const light = this.revLights[index];
        const active = (revMask & (1 << index)) !== 0;
        const lightRatio = (index + 1) / this.revLights.length;
        light.classList.toggle("active", active);
        light.classList.toggle("hot", active && lightRatio > 0.72);
        light.classList.toggle("limit", active && lightRatio > 0.92);
      }
    }
    const severity = Math.max(1, 6 - Math.floor(Math.abs(data.turn) * 42));
    const arrow = data.turn > 0.015 ? "↱" : data.turn < -0.015 ? "↰" : "▲";
    const cornerValue = Math.abs(data.turn) < 0.008 ? "FLAT" : String(severity);
    const cornerSpeed = String(Math.max(30, Math.round(120 - Math.abs(data.turn) * 2600)));
    if (arrow !== this.lastCornerArrow) {
      this.lastCornerArrow = arrow;
      if (this.cornerArrow) this.cornerArrow.textContent = arrow;
    }
    if (cornerValue !== this.lastCornerValue) {
      this.lastCornerValue = cornerValue;
      if (this.cornerValue) this.cornerValue.textContent = cornerValue;
    }
    if (cornerSpeed !== this.lastCornerSpeed) {
      this.lastCornerSpeed = cornerSpeed;
      if (this.cornerSpeed) this.cornerSpeed.textContent = cornerSpeed;
    }
    const drsText = data.offroad ? "OFF" : absolute > 55 ? "ARMED" : "OFF";
    if (drsText !== this.lastDrs) {
      this.lastDrs = drsText;
      this.drsStatus.textContent = drsText;
    }
    const drsArmed = !data.offroad && absolute > 55;
    if (drsArmed !== this.lastDrsArmed) {
      this.lastDrsArmed = drsArmed;
      this.drsStatus.classList.toggle("armed", drsArmed);
    }
    const ersWidth = `${Math.min(100, Math.max(24, 100 - data.progress * 22 + (absolute < 35 ? 8 : 0)))}%`;
    if (ersWidth !== this.lastErsWidth) {
      this.lastErsWidth = ersWidth;
      this.ersFill.style.width = ersWidth;
    }
    const sectorText = data.progress < 0.333 ? "S1" : data.progress < 0.666 ? "S2" : "S3";
    if (sectorText !== this.lastSector) {
      this.lastSector = sectorText;
      this.sector.textContent = sectorText;
    }
    const minimapTick = Math.floor(data.elapsed * 30);
    if (minimapTick !== this.lastMinimapTick) {
      this.lastMinimapTick = minimapTick;
      this.stage.drawMinimap(this.minimap, data.progress);
    }
  }

  setCountdown(text: string): void {
    if (text === this.lastCountdown) return;
    this.lastCountdown = text;
    this.countdown.textContent = text;
    this.countdown.classList.toggle("active", text.length > 0);
  }

  finish(seconds: number): { isBest: boolean; best: number; delta: number | null } {
    const previous = Number(localStorage.getItem(`${this.stage.id}-best`));
    const isBest = !previous || seconds < previous;
    const best = isBest ? seconds : previous;
    if (isBest) localStorage.setItem(`${this.stage.id}-best`, String(seconds));
    const bestText = formatTime(best);
    if (this.best.textContent !== bestText) this.best.textContent = bestText;
    return { isBest, best, delta: previous > 0 ? seconds - previous : null };
  }

  static formatTime = formatTime;
}
