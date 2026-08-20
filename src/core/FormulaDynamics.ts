import { MathUtils, Vector3 } from "three";

export interface FormulaDynamicsInput {
  dt: number;
  drive: number;
  steering: number;
  braking: boolean;
  offroad: boolean;
  topSpeed: number;
}

export interface FormulaDynamicsResult {
  heading: number;
  speed: number;
  aeroLoad: number;
  longitudinalG: number;
  lateralG: number;
  slipAngle: number;
}

/**
 * A compact single-track-inspired model for the Formula car. It keeps the
 * controls approachable while preserving the important F1 traits: steering
 * lock falls with speed, aero load adds high-speed grip and braking capacity,
 * and velocity takes time to realign with the chassis instead of snapping to it.
 */
export class FormulaDynamics {
  readonly velocity = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private yawRate = 0;
  private previousSpeed = 0;

  update(heading: number, input: FormulaDynamicsInput): FormulaDynamicsResult {
    const dt = Math.max(0.001, Math.min(0.04, input.dt));
    this.setAxes(heading);
    let longitudinal = this.velocity.dot(this.forward);
    const absoluteSpeed = Math.abs(longitudinal);
    const speedRatio = MathUtils.clamp(absoluteSpeed / input.topSpeed, 0, 1);
    const aeroLoad = speedRatio * speedRatio;

    // The wheelbase term gives the familiar bicycle-model yaw response. Limit
    // it with the lateral acceleration the tyres and aero can currently carry.
    const steeringBlend = MathUtils.smoothstep(absoluteSpeed, 12, input.topSpeed);
    const maxSteeringAngle = MathUtils.lerp(0.3, 0.072, steeringBlend);
    const steeringAngle = input.steering * maxSteeringAngle;
    const wheelbase = 3.55;
    const lateralAccelerationLimit = input.offroad ? 7.5 : 13 + aeroLoad * 34;
    const rawYawRate = longitudinal / wheelbase * Math.tan(steeringAngle);
    const yawLimit = lateralAccelerationLimit / Math.max(6, absoluteSpeed);
    const targetYawRate = MathUtils.clamp(rawYawRate, -yawLimit, yawLimit) * (input.offroad ? 0.52 : 1);
    const yawResponse = input.offroad ? 2.6 : 6.5 + aeroLoad * 5.5;
    this.yawRate += (targetYawRate - this.yawRate) * (1 - Math.exp(-yawResponse * dt));
    if (absoluteSpeed < 0.35) this.yawRate *= Math.exp(-10 * dt);
    heading += this.yawRate * dt;

    // Rotating the chassis underneath the existing world velocity naturally
    // creates a slip angle. Tyre cornering stiffness then bleeds that slip away.
    this.setAxes(heading);
    longitudinal = this.velocity.dot(this.forward);
    let lateral = this.velocity.dot(this.right);

    const wasMovingForward = longitudinal > 0.25;
    let acceleration = 0;
    if (input.braking && wasMovingForward) {
      // Aero load lets an F1 car brake hardest at the beginning of a stop.
      const brakeDeceleration = MathUtils.lerp(21, 49, aeroLoad);
      acceleration = -brakeDeceleration;
      longitudinal = Math.max(0, longitudinal + acceleration * dt);
    } else if (input.drive > 0) {
      // Strong launch acceleration tapers into an aero/drag-limited top speed.
      const engineAcceleration = 14.5 * (1 - speedRatio * 0.74);
      acceleration = Math.min(input.offroad ? 4.8 : 13.6, engineAcceleration) * input.drive;
      longitudinal += acceleration * dt;
    } else if (input.drive < 0 && !input.braking) {
      acceleration = -7.5;
      longitudinal = Math.max(-12, longitudinal + acceleration * dt);
    }

    const drag = 0.16 + longitudinal * longitudinal * 0.00043;
    const surfaceDrag = input.offroad ? 5.5 + Math.abs(longitudinal) * 0.12 : drag;
    longitudinal = this.moveTowards(longitudinal, 0, surfaceDrag * dt);
    const speedLimit = input.offroad ? Math.min(40, input.topSpeed) : input.topSpeed;
    longitudinal = MathUtils.clamp(longitudinal, -12, speedLimit);

    const corneringResponse = input.offroad ? 2.1 : 5.5 + aeroLoad * 10;
    lateral *= Math.exp(-corneringResponse * dt);
    const maximumSlipSpeed = input.offroad
      ? Math.abs(longitudinal) * 0.34 + 1.5
      : Math.abs(longitudinal) * MathUtils.lerp(0.13, 0.045, aeroLoad) + 0.35;
    lateral = MathUtils.clamp(lateral, -maximumSlipSpeed, maximumSlipSpeed);

    this.velocity.copy(this.forward).multiplyScalar(longitudinal).addScaledVector(this.right, lateral);
    const signedLateralG = longitudinal * this.yawRate / 9.81;
    const longitudinalG = (longitudinal - this.previousSpeed) / dt / 9.81;
    this.previousSpeed = longitudinal;

    return {
      heading,
      speed: longitudinal,
      aeroLoad,
      longitudinalG: MathUtils.clamp(longitudinalG, -5.2, 1.6),
      lateralG: MathUtils.clamp(signedLateralG, -5.2, 5.2),
      slipAngle: Math.atan2(lateral, Math.max(0.1, Math.abs(longitudinal))),
    };
  }

  private setAxes(heading: number): void {
    this.forward.set(-Math.sin(heading), 0, -Math.cos(heading));
    this.right.set(-this.forward.z, 0, this.forward.x);
  }

  private moveTowards(value: number, target: number, maximumDelta: number): number {
    if (value < target) return Math.min(target, value + maximumDelta);
    return Math.max(target, value - maximumDelta);
  }
}
