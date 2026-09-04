import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Vector3,
} from "three";

const LINE_COUNT = 46;

/** Lightweight world-space streaks that stream past the chase camera at speed. */
export class SpeedLines {
  readonly root = new Group();
  private readonly positions = new Float32Array(LINE_COUNT * 6);
  private readonly geometry = new BufferGeometry();
  private readonly material = new LineBasicMaterial({
    color: 0xffedb0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  private seed = 0x51eed;
  private disposed = false;

  constructor() {
    this.geometry.setAttribute("position", new Float32BufferAttribute(this.positions, 3));
    const lines = new LineSegments(this.geometry, this.material);
    lines.frustumCulled = false;
    this.root.add(lines);

    for (let index = 0; index < LINE_COUNT; index += 1) {
      this.resetLine(index, -42 + this.random() * 52);
    }
    this.root.visible = false;
  }

  update(carPosition: Vector3, heading: number, speed: number, dt: number): void {
    if (this.disposed) return;
    const absoluteSpeed = Math.abs(speed);
    const intensity = MathUtils.clamp((absoluteSpeed - 18) / 31, 0, 1);
    this.root.visible = intensity > 0.01;
    this.material.opacity = intensity * 0.34;
    if (!this.root.visible) return;

    this.root.position.copy(carPosition);
    this.root.rotation.y = heading;

    const travel = (absoluteSpeed - 8) * dt * (0.65 + intensity * 0.65);
    for (let index = 0; index < LINE_COUNT; index += 1) {
      const offset = index * 6;
      this.positions[offset + 2] += travel;
      this.positions[offset + 5] += travel;
      if (this.positions[offset + 2] > 13) this.resetLine(index, -42 - this.random() * 12);
    }
    const attribute = this.geometry.getAttribute("position") as Float32BufferAttribute;
    attribute.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  private resetLine(index: number, z: number): void {
    const offset = index * 6;
    let x = (this.random() - 0.5) * 23;
    if (Math.abs(x) < 2.8) x += x < 0 ? -2.8 : 2.8;
    const y = 0.8 + this.random() * 8.5;
    const length = 0.75 + this.random() * 2.6;
    this.positions.set([x, y, z, x, y, z + length], offset);
  }

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
}
