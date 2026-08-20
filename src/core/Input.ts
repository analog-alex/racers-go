export class Input {
  private readonly held = new Set<string>();

  constructor() {
    globalThis.addEventListener("keydown", this.onKeyDown);
    globalThis.addEventListener("keyup", this.onKeyUp);
    globalThis.addEventListener("blur", this.clear);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  isDown(...codes: string[]): boolean {
    return codes.some((code) => this.held.has(code));
  }

  axis(negative: string[], positive: string[]): number {
    return Number(this.isDown(...positive)) - Number(this.isDown(...negative));
  }

  readonly clear = (): void => this.held.clear();
}
