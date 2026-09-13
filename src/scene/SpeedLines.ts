import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Vector3,
} from "three";

const LINE_COUNT = 96;
/** Two segments per streak so it tapers to nothing at both ends instead of popping. */
const VERTICES_PER_LINE = 4;

/** Car-local metres. Streaks spawn ahead in the fog and retire behind the chase camera. */
const SPAWN_Z = -56;
const SPAWN_SPREAD = 16;
const DESPAWN_Z = 15;

/** Half-width of the corridor kept clear so streaks never cut through the car. */
const CORRIDOR = 3.2;

/**
 * The ramp is expressed as a fraction of the car's own top speed, so the F1 and
 * the road car each get the full effect across their whole range. The floor
 * keeps the slow car from streaking at what is, for it, a gentle cruise.
 */
const ONSET_FRACTION = 0.22;
const ONSET_FLOOR = 16;
const SATURATION_FRACTION = 0.95;

const TINT = [1, 0.93, 0.69] as const;

/**
 * Lightweight world-space streaks that stream past the chase camera at speed.
 *
 * The illusion rests on three cues, all driven by speed: the streaks stretch,
 * more of them switch on, and they rake sideways with cornering load so the
 * wind tracks a slide rather than sitting rigidly on the car's heading.
 */
export class SpeedLines {
  readonly root = new Group();
  private readonly positions = new Float32Array(LINE_COUNT * VERTICES_PER_LINE * 3);
  private readonly colors = new Float32Array(LINE_COUNT * VERTICES_PER_LINE * 3);
  private readonly originX = new Float32Array(LINE_COUNT);
  private readonly originY = new Float32Array(LINE_COUNT);
  private readonly originZ = new Float32Array(LINE_COUNT);
  /** Per-streak length multiplier, so they do not stretch in lockstep. */
  private readonly lengthScale = new Float32Array(LINE_COUNT);
  /** Speed intensity at which this streak starts to fade in. Fixed per slot. */
  private readonly activation = new Float32Array(LINE_COUNT);
  private readonly geometry = new BufferGeometry();
  private readonly positionAttribute = new BufferAttribute(this.positions, 3);
  private readonly colorAttribute = new BufferAttribute(this.colors, 3);
  private readonly material = new LineBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: true,
    toneMapped: false,
  });
  private readonly onsetSpeed: number;
  private readonly rampSpeed: number;
  private seed = 0x51eed;
  private lastIntensity = -1;
  private disposed = false;

  constructor(topSpeed: number) {
    this.onsetSpeed = Math.max(ONSET_FLOOR, topSpeed * ONSET_FRACTION);
    this.rampSpeed = Math.max(1, topSpeed * SATURATION_FRACTION - this.onsetSpeed);
    this.geometry.setAttribute("position", this.positionAttribute);
    this.geometry.setAttribute("color", this.colorAttribute);
    const lines = new LineSegments(this.geometry, this.material);
    lines.frustumCulled = false;
    this.root.add(lines);

    for (let index = 0; index < LINE_COUNT; index += 1) {
      this.activation[index] = this.random() * 0.55;
      this.spawn(index, SPAWN_Z + this.random() * (DESPAWN_Z - SPAWN_Z));
    }
    this.root.visible = false;
  }

  update(carPosition: Vector3, heading: number, speed: number, lateralG: number, dt: number): void {
    if (this.disposed) return;
    const absoluteSpeed = Math.abs(speed);
    const intensity = MathUtils.clamp((absoluteSpeed - this.onsetSpeed) / this.rampSpeed, 0, 1);
    this.root.visible = intensity > 0.01;
    if (!this.root.visible) {
      this.material.opacity = 0;
      return;
    }

    // Squared ramp holds the effect back at cruising speed and lets it bloom
    // only as the car approaches its top end.
    const eased = intensity * intensity;
    this.material.opacity = 0.08 + eased * 0.44;
    this.root.position.copy(carPosition);
    this.root.rotation.y = heading;

    const length = 1.8 + eased * 9.6;
    const sweep = MathUtils.clamp(lateralG / 5.2, -1, 1) * 0.45;
    const travel = (absoluteSpeed - 6) * dt * (0.9 + intensity * 0.8);

    for (let index = 0; index < LINE_COUNT; index += 1) {
      let z = this.originZ[index] + travel;
      if (z > DESPAWN_Z) {
        this.spawn(index, SPAWN_Z - this.random() * SPAWN_SPREAD);
        z = this.originZ[index];
      } else {
        this.originZ[index] = z;
      }

      const span = length * this.lengthScale[index];
      const x = this.originX[index];
      const y = this.originY[index];
      // Rake the tail across the corridor so the streak leans into the corner.
      const drift = sweep * span;
      const offset = index * VERTICES_PER_LINE * 3;
      this.positions[offset] = x;
      this.positions[offset + 1] = y;
      this.positions[offset + 2] = z;
      this.positions[offset + 3] = x + drift * 0.5;
      this.positions[offset + 4] = y;
      this.positions[offset + 5] = z + span * 0.5;
      this.positions[offset + 6] = this.positions[offset + 3];
      this.positions[offset + 7] = y;
      this.positions[offset + 8] = this.positions[offset + 5];
      this.positions[offset + 9] = x + drift;
      this.positions[offset + 10] = y;
      this.positions[offset + 11] = z + span;
    }

    this.positionAttribute.needsUpdate = true;
    if (Math.abs(intensity - this.lastIntensity) > 0.004) {
      this.writeColors(intensity);
      this.lastIntensity = intensity;
      this.colorAttribute.needsUpdate = true;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  /** Fades each streak in once the car passes its activation speed, so density grows with pace. */
  private writeColors(intensity: number): void {
    for (let index = 0; index < LINE_COUNT; index += 1) {
      const level = MathUtils.clamp((intensity - this.activation[index]) / 0.25, 0, 1);
      const offset = index * VERTICES_PER_LINE * 3;
      // Both ends sit at black; additive blending renders that as nothing.
      this.colors[offset] = 0;
      this.colors[offset + 1] = 0;
      this.colors[offset + 2] = 0;
      this.colors[offset + 9] = 0;
      this.colors[offset + 10] = 0;
      this.colors[offset + 11] = 0;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = TINT[channel] * level;
        this.colors[offset + 3 + channel] = value;
        this.colors[offset + 6 + channel] = value;
      }
    }
  }

  private spawn(index: number, z: number): void {
    let x = (this.random() - 0.5) * 30;
    if (Math.abs(x) < CORRIDOR) x += x < 0 ? -CORRIDOR : CORRIDOR;
    this.originX[index] = x;
    this.originY[index] = 0.35 + this.random() * 9.6;
    this.originZ[index] = z;
    this.lengthScale[index] = 0.55 + this.random() * 0.75;
  }

  private random(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
}
