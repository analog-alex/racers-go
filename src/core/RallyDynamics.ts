import { MathUtils, Vector3 } from "three";

export interface RallyDynamicsInput {
  dt: number;
  drive: number;
  steering: number;
  handbrake: boolean;
  surfaceGrip: number;
  topSpeed: number;
}

export interface RallyDynamicsResult {
  heading: number;
  speed: number;
  longitudinalG: number;
  lateralG: number;
  slipAngle: number;
}

/**
 * A deliberately compact loose-surface bicycle model. It preserves the rally
 * essentials without a full wheel simulation: speed-sensitive steering,
 * velocity that can slide away from the chassis, a shared tyre-force budget,
 * and rear-grip release from the handbrake.
 */
export class RallyDynamics {
  readonly velocity = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private yawRate = 0;
  private previousSpeed = 0;

  update(heading: number, input: RallyDynamicsInput): RallyDynamicsResult {
    const dt = MathUtils.clamp(input.dt, 0.001, 0.04);
    const grip = MathUtils.clamp(input.surfaceGrip, 0.32, 0.86);
    this.setAxes(heading);
    let longitudinal = this.velocity.dot(this.forward);
    let lateral = this.velocity.dot(this.right);
    const absoluteSpeed = Math.abs(longitudinal);
    const speedRatio = MathUtils.clamp(absoluteSpeed / input.topSpeed, 0, 1);

    // Loose gravel needs more steering lock than tarmac, while retaining a
    // stable high-speed response.
    const steeringLimit = MathUtils.lerp(0.58, 0.24, MathUtils.smoothstep(absoluteSpeed, 8, input.topSpeed));
    const steeringAngle = input.steering * steeringLimit;
    const wheelbase = 2.62;
    const maxLateralAcceleration = grip * 9.81 * 1.25;
    const requestedYawRate = longitudinal / wheelbase * Math.tan(steeringAngle);
    const yawLimit = maxLateralAcceleration / Math.max(4.5, absoluteSpeed);
    const handbrakeRotation = input.handbrake && absoluteSpeed > 3
      ? input.steering * Math.sign(longitudinal || 1) * 0.72
      : 0;
    const targetYawRate = MathUtils.clamp(requestedYawRate, -yawLimit, yawLimit) + handbrakeRotation;
    const yawResponse = input.handbrake ? 6.8 : 6.2;
    this.yawRate += (targetYawRate - this.yawRate) * (1 - Math.exp(-yawResponse * dt));
    if (absoluteSpeed < 0.35) this.yawRate *= Math.exp(-11 * dt);
    heading += this.yawRate * dt;

    this.setAxes(heading);
    longitudinal = this.velocity.dot(this.forward);
    lateral = this.velocity.dot(this.right);
    const braking = input.drive < 0 && longitudinal > 0.35;
    const accelerating = input.drive > 0;
    const forceBudget = grip * 11.2;
    let requestedAcceleration = 0;
    if (braking) requestedAcceleration = -forceBudget * 1.22;
    else if (accelerating) requestedAcceleration = 12.8 * input.drive * (1 - speedRatio * 0.72);
    else if (input.drive < 0) requestedAcceleration = -5.5;
    if (input.handbrake && absoluteSpeed > 1) requestedAcceleration -= grip * 4.2;

    // A friction-circle approximation: hard throttle/braking reduces the
    // lateral force available to pull a slide straight.
    const longitudinalUse = MathUtils.clamp(Math.abs(requestedAcceleration) / forceBudget, 0, 1);
    const lateralForce = maxLateralAcceleration * Math.sqrt(Math.max(0.15, 1 - longitudinalUse * longitudinalUse));
    longitudinal += requestedAcceleration * dt;
    const drag = 0.52 + absoluteSpeed * absoluteSpeed * 0.008;
    longitudinal = this.moveTowards(longitudinal, 0, drag * dt);
    longitudinal = MathUtils.clamp(longitudinal, -9, input.topSpeed);

    // On a normal turn the front tyres promptly pull the car toward the new
    // heading. The handbrake deliberately removes most of that correction so
    // the rear can rotate into a controllable slide.
    const lateralDamping = input.handbrake ? 0.28 : 1.18;
    lateral = this.moveTowards(lateral, 0, lateralForce * lateralDamping * dt);
    const maxSlip = absoluteSpeed * (input.handbrake ? 0.9 : 0.46) + 1.2;
    lateral = MathUtils.clamp(lateral, -maxSlip, maxSlip);
    this.velocity.copy(this.forward).multiplyScalar(longitudinal).addScaledVector(this.right, lateral);

    const longitudinalG = (longitudinal - this.previousSpeed) / dt / 9.81;
    this.previousSpeed = longitudinal;
    return {
      heading,
      speed: longitudinal,
      longitudinalG: MathUtils.clamp(longitudinalG, -1.35, 1.1),
      lateralG: MathUtils.clamp(longitudinal * this.yawRate / 9.81, -1.2, 1.2),
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
