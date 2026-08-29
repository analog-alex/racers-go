const PREVENT_DEFAULT_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

export class Input {
  private readonly held = new Set<string>();
  private disposed = false;

  constructor() {
    globalThis.addEventListener("keydown", this.onKeyDown);
    globalThis.addEventListener("keyup", this.onKeyUp);
    globalThis.addEventListener("blur", this.clear);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed) return;
    if (PREVENT_DEFAULT_CODES.has(event.code)) {
      event.preventDefault();
    }
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (this.disposed) return;
    this.held.delete(event.code);
  };

  isDown(...codes: string[]): boolean {
    return codes.some((code) => this.held.has(code));
  }

  isDownCode(code: string): boolean {
    return this.held.has(code);
  }

  axis(negative: readonly string[], positive: readonly string[]): number {
    let positiveDown = false;
    for (const code of positive) {
      if (this.held.has(code)) {
        positiveDown = true;
        break;
      }
    }
    let negativeDown = false;
    for (const code of negative) {
      if (this.held.has(code)) {
        negativeDown = true;
        break;
      }
    }
    return Number(positiveDown) - Number(negativeDown);
  }

  readonly clear = (): void => this.held.clear();

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    globalThis.removeEventListener("keydown", this.onKeyDown);
    globalThis.removeEventListener("keyup", this.onKeyUp);
    globalThis.removeEventListener("blur", this.clear);
    this.held.clear();
  }
}
