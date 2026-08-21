import {
  ACESFilmicToneMapping,
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  MathUtils,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
  WebGLRenderer,
} from "three";
import { Input } from "./Input";
import { FormulaDynamics } from "./FormulaDynamics";
import { RallyDynamics } from "./RallyDynamics";
import { RallyCar } from "../scene/Car";
import { SpeedLines } from "../scene/SpeedLines";
import { Stage } from "../scene/Stage";
import { HUD } from "../ui/HUD";
import type { CircuitDefinition } from "./Circuit";

const required = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing interface element: ${selector}`);
  return node;
};

export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(62, 1, 0.1, 2400);
  private readonly input = new Input();
  private readonly stage: Stage;
  private readonly car: RallyCar;
  private readonly speedLines = new SpeedLines();
  private readonly hud: HUD;
  private readonly clock = new Clock();
  private readonly right = new Vector3();
  private readonly forward = new Vector3();
  private readonly cameraGoal = new Vector3();
  private readonly lookGoal = new Vector3();
  private readonly dust: Points;
  private readonly dustPositions: Float32Array;
  private readonly dustVelocities: Float32Array;
  private readonly dustLife: Float32Array;
  private readonly startPose: { position: Vector3; heading: number };
  private readonly previousCarPosition: Vector3;
  private readonly cameraTravel = new Vector3();
  private readonly isFormula: boolean;
  private readonly topSpeed: number;
  private readonly formulaDynamics?: FormulaDynamics;
  private readonly rallyDynamics?: RallyDynamics;
  private heading: number;
  private speed = 0;
  private steering = 0;
  private longitudinalG = 0;
  private lateralG = 0;
  private slipAngle = 0;
  private aeroLoad = 0;
  private elapsed = 0;
  private raceStarted = false;
  private running = false;
  private paused = false;
  private progressIndex = 0;
  private nearestIndex = 0;
  private checkpoint = 0;
  private countdown = 3.8;
  private dustCursor = 0;
  private dustSpawnCarry = 0;
  private offCourseTime = 0;
  private stuckTime = 0;

  constructor(canvas: HTMLCanvasElement, circuit: CircuitDefinition) {
    this.stage = new Stage(circuit);
    this.isFormula = circuit.id === "silverstone";
    this.topSpeed = this.isFormula ? 94 : 49;
    if (this.isFormula) this.formulaDynamics = new FormulaDynamics();
    else this.rallyDynamics = new RallyDynamics();
    this.hud = new HUD(this.stage);
    this.startPose = this.stage.startPose();
    this.previousCarPosition = this.startPose.position.clone();
    this.car = new RallyCar(circuit.id === "silverstone" ? "./models/formula-car.glb" : "./models/rally-car.glb");
    this.heading = this.startPose.heading;
    this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene.background = new Color(this.stage.id === "silverstone" ? 0x9baeb8 : 0x77c8ef);
    this.scene.fog = new FogExp2(this.stage.id === "silverstone" ? 0xb3c0c2 : 0x9ccad1, this.stage.id === "silverstone" ? 0.0024 : 0.0018);
    this.scene.add(this.stage.root, this.car.root, this.speedLines.root);
    this.car.root.position.copy(this.startPose.position);
    this.car.root.rotation.y = this.heading;

    this.scene.add(new HemisphereLight(0xdff4ff, this.stage.id === "silverstone" ? 0x343c42 : 0x29452d, 2.5));
    this.scene.add(new AmbientLight(0xffffff, 0.6));
    const sun = new DirectionalLight(0xfff1c7, 4.2);
    sun.position.set(-160, 220, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -130;
    sun.shadow.camera.right = 130;
    sun.shadow.camera.top = 130;
    sun.shadow.camera.bottom = -130;
    sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.0001;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 2;
    this.scene.add(sun);

    const dustGeometry = new BufferGeometry();
    this.dustPositions = new Float32Array(180 * 3);
    this.dustVelocities = new Float32Array(180 * 3);
    this.dustLife = new Float32Array(180);
    this.dustPositions.fill(-9999);
    dustGeometry.setAttribute("position", new Float32BufferAttribute(this.dustPositions, 3));
    this.dust = new Points(dustGeometry, new PointsMaterial({ color: 0xe0ba78, size: 2.15, transparent: true, opacity: 0.62, depthWrite: false }));
    this.scene.add(this.dust);

    this.camera.position.copy(this.car.root.position).add(new Vector3(0, 4.6, 9));
    this.resize();
    globalThis.addEventListener("resize", this.resize);
    globalThis.addEventListener("keydown", this.onGlobalKey);
  }

  async load(): Promise<void> {
    await this.car.loadGeneratedModel();
  }

  start(): void {
    this.running = true;
    this.hud.show();
    this.clock.start();
    this.renderer.setAnimationLoop(this.frame);
  }

  private readonly frame = (): void => {
    if (!this.running) return;
    const dt = Math.min(0.04, this.clock.getDelta());
    if (!this.paused) this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number): void {
    if (this.countdown > 0) {
      this.countdown -= dt;
      const display = this.countdown > 2.8 ? "3" : this.countdown > 1.8 ? "2" : this.countdown > 0.8 ? "1" : "GO";
      this.hud.setCountdown(display);
      if (this.countdown <= 0) {
        this.hud.setCountdown("");
        this.raceStarted = true;
      }
    }

    const throttle = this.input.axis(["ArrowDown", "KeyS"], ["ArrowUp", "KeyW"]);
    const steerTarget = this.raceStarted
      ? this.input.axis(["ArrowRight", "KeyD"], ["ArrowLeft", "KeyA"])
      : 0;
    const handbrake = this.input.isDown("Space");
    const nearest = this.stage.nearest(this.car.root.position, this.nearestIndex);
    const offroad = Math.abs(nearest.side) > this.stage.roadWidth - 0.7;
    const steerRate = handbrake ? (this.isFormula ? 10 : 7) : (this.isFormula ? 8.5 : 5);
    this.steering += (steerTarget - this.steering) * (1 - Math.exp(-steerRate * dt));
    if (this.isFormula && this.formulaDynamics) {
      const motion = this.formulaDynamics.update(this.heading, {
        dt,
        drive: this.raceStarted ? throttle : 0,
        steering: this.raceStarted ? this.steering : 0,
        // Down/S brakes while moving, then becomes the recoverable reverse
        // gear once the car has stopped. Space always requests full braking.
        braking: this.raceStarted && (handbrake || (throttle < 0 && this.speed > 0.5)),
        offroad,
        topSpeed: this.topSpeed,
      });
      this.heading = motion.heading;
      this.speed = motion.speed;
      this.longitudinalG = motion.longitudinalG;
      this.lateralG = motion.lateralG;
      this.slipAngle = motion.slipAngle;
      this.aeroLoad = motion.aeroLoad;
      this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
      this.car.root.position.addScaledVector(this.formulaDynamics.velocity, dt);
    } else if (this.rallyDynamics) {
      const motion = this.rallyDynamics.update(this.heading, {
        dt,
        drive: this.raceStarted ? throttle : 0,
        steering: this.raceStarted ? this.steering : 0,
        handbrake: this.raceStarted && handbrake,
        surfaceGrip: this.stage.surfaceGrip(nearest.index, nearest.side),
        topSpeed: this.topSpeed,
      });
      this.heading = motion.heading;
      this.speed = motion.speed;
      this.longitudinalG = motion.longitudinalG;
      this.lateralG = motion.lateralG;
      this.slipAngle = motion.slipAngle;
      this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
      this.car.root.position.addScaledVector(this.rallyDynamics.velocity, dt);
    }

    const updated = this.stage.nearest(this.car.root.position, nearest.index);
    this.nearestIndex = updated.index;
    if (updated.index > this.progressIndex - 8) this.progressIndex = Math.max(this.progressIndex, updated.index);
    this.car.root.position.y += (this.stage.roadHeight(updated.index) - this.car.root.position.y) * Math.min(1, dt * 12);
    this.car.root.rotation.y = this.heading;
    this.car.update(this.speed, this.steering, dt, this.elapsed, {
      longitudinalG: this.longitudinalG,
      lateralG: this.lateralG,
      slipAngle: this.slipAngle,
      aeroLoad: this.aeroLoad,
    });
    this.speedLines.update(this.car.root.position, this.heading, this.speed, dt);

    if (this.raceStarted) this.elapsed += dt;
    const progress = this.progressIndex / (this.stage.samples.length - 1);
    this.updateCheckpoints(updated.index);
    const lookAhead = Math.min(this.stage.samples.length - 1, updated.index + 22);
    const turn = this.stage.tangent(lookAhead).clone().cross(this.stage.tangent(updated.index)).y;
    this.hud.update({ speed: this.speed, elapsed: this.elapsed, progress, offroad, checkpoint: this.checkpoint, turn });

    this.updateDust(dt, this.stage.id === "pine-run" && this.raceStarted, offroad, handbrake);
    this.updateCamera(dt, handbrake || (this.isFormula && throttle < 0));
    if (this.checkpoint === this.stage.checkpointIndices.length && this.raceStarted) {
      this.finish();
      return;
    }
    this.checkFailure(dt, updated.distance, progress);
  }

  private updateCheckpoints(nearestIndex: number): void {
    const targetIndex = this.stage.checkpointIndices[this.checkpoint];
    const target = this.stage.checkpoints[this.checkpoint];
    if (targetIndex === undefined || !target) return;
    const gateRadius = this.stage.roadWidth + 5;
    if (nearestIndex >= targetIndex - 2 && this.car.root.position.distanceTo(target) <= gateRadius) {
      this.checkpoint += 1;
    }
  }

  private checkFailure(dt: number, distanceFromCourse: number, progress: number): void {
    if (!this.raceStarted) return;

    const position = this.car.root.position;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      this.fail("Vehicle telemetry was lost.", progress);
      return;
    }

    // Minor excursions are part of rallying. Only start the recovery clock once
    // the car is well beyond the usable verge, and count a stopped car separately.
    const beyondRecoveryArea = distanceFromCourse > this.stage.roadWidth + (this.isFormula ? 25 : 34);
    const strandedOffCourse = distanceFromCourse > this.stage.roadWidth + (this.isFormula ? 9 : 12) && Math.abs(this.speed) < 1.2;
    this.offCourseTime = beyondRecoveryArea ? this.offCourseTime + dt : Math.max(0, this.offCourseTime - dt * 2);
    this.stuckTime = strandedOffCourse ? this.stuckTime + dt : 0;

    if (distanceFromCourse > (this.isFormula ? 105 : 145)) {
      this.fail("Stage boundary crossed.", progress);
    } else if (this.offCourseTime >= (this.isFormula ? 2.8 : 4.5)) {
      this.fail("Unable to return to the course.", progress);
    } else if (this.stuckTime >= 10) {
      this.fail("Car stranded off-course.", progress);
    }
  }

  private fail(reason: string, progress: number): void {
    this.raceStarted = false;
    this.running = false;
    this.input.clear();
    this.renderer.setAnimationLoop(null);
    this.hud.hide();
    required<HTMLElement>("#failure-reason").textContent = reason;
    required<HTMLElement>("#failure-time").textContent = HUD.formatTime(this.elapsed);
    required<HTMLElement>("#failure-progress").textContent = `${Math.floor(progress * 100)}%`;
    required<HTMLElement>("#game-over-screen").classList.add("visible");
    required<HTMLButtonElement>("#failure-restart-button").focus();
  }

  private updateCamera(dt: number, braking: boolean): void {
    // Carry the camera through the car's translation before smoothing its
    // orientation. Without this feed-forward step, lerp lag grows with speed
    // and makes the car appear progressively smaller.
    this.cameraTravel.copy(this.car.root.position).sub(this.previousCarPosition);
    this.camera.position.add(this.cameraTravel);
    this.previousCarPosition.copy(this.car.root.position);

    const speedEffect = MathUtils.smoothstep(Math.abs(this.speed), this.isFormula ? 32 : 18, this.topSpeed);
    const chaseDistance = this.isFormula
      ? 7.7 + speedEffect * 1.1 - Math.max(0, -this.longitudinalG) * 0.08
      : 8.8 + speedEffect * 0.4;
    this.cameraGoal.copy(this.car.root.position).addScaledVector(this.forward, -chaseDistance);
    this.cameraGoal.y += this.isFormula ? 3.45 : 4.2;
    this.right.set(-this.forward.z, 0, this.forward.x);
    if (this.isFormula) this.cameraGoal.addScaledVector(this.right, -this.slipAngle * 1.4);
    const follow = 1 - Math.exp(-(braking ? 5.2 : this.isFormula ? 8.4 : 7.2) * dt);
    this.camera.position.lerp(this.cameraGoal, follow);
    this.lookGoal.copy(this.car.root.position).addScaledVector(this.forward, this.isFormula ? 10.5 : 7.5);
    this.lookGoal.y += this.isFormula ? 0.95 : 1.2;
    this.camera.lookAt(this.lookGoal);
    if (this.isFormula) this.camera.rotateZ(-this.lateralG * 0.0035);
    const targetFov = 62 + speedEffect * (this.isFormula ? 8 : 1.5);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 3);
    this.camera.updateProjectionMatrix();
  }

  private updateDust(dt: number, active: boolean, offroad: boolean, handbrake: boolean): void {
    const position = this.dust.geometry.getAttribute("position") as Float32BufferAttribute;
    for (let particle = 0; particle < this.dustLife.length; particle += 1) {
      if (this.dustLife[particle] <= 0) continue;
      const index = particle * 3;
      this.dustLife[particle] -= dt;
      if (this.dustLife[particle] <= 0) {
        this.dustPositions[index] = -9999;
        continue;
      }
      this.dustPositions[index] += this.dustVelocities[index] * dt;
      this.dustPositions[index + 1] += this.dustVelocities[index + 1] * dt;
      this.dustPositions[index + 2] += this.dustVelocities[index + 2] * dt;
      this.dustVelocities[index] *= Math.exp(-1.7 * dt);
      this.dustVelocities[index + 1] += 0.26 * dt;
      this.dustVelocities[index + 2] *= Math.exp(-1.7 * dt);
    }

    const speedRatio = MathUtils.clamp(Math.abs(this.speed) / this.topSpeed, 0, 1);
    const slideIntensity = Math.min(1, Math.abs(this.slipAngle) * 2.2 + Math.abs(this.steering) * speedRatio * 0.55);
    const particlesPerSecond = active && Math.abs(this.speed) > 3
      ? 7 + speedRatio * 19 + slideIntensity * 24 + (offroad ? 18 : 0) + (handbrake ? 12 : 0)
      : 0;
    this.dustSpawnCarry += particlesPerSecond * dt;
    while (this.dustSpawnCarry >= 1) {
      this.dustSpawnCarry -= 1;
      const particle = this.dustCursor++ % this.dustLife.length;
      const index = particle * 3;
      const side = (Math.random() < 0.5 ? -1 : 1) * (0.68 + Math.random() * 0.3);
      const rear = 1.65 + Math.random() * 0.7;
      this.dustPositions[index] = this.car.root.position.x - this.forward.x * rear + this.right.x * side;
      this.dustPositions[index + 1] = this.car.root.position.y + 0.12 + Math.random() * 0.14;
      this.dustPositions[index + 2] = this.car.root.position.z - this.forward.z * rear + this.right.z * side;
      const lateralKick = side * (0.7 + slideIntensity * 2.8);
      this.dustVelocities[index] = -this.forward.x * Math.abs(this.speed) * 0.14 + this.right.x * lateralKick + (Math.random() - 0.5) * 1.1;
      this.dustVelocities[index + 1] = 0.55 + Math.random() * (0.72 + slideIntensity * 0.5);
      this.dustVelocities[index + 2] = -this.forward.z * Math.abs(this.speed) * 0.14 + this.right.z * lateralKick + (Math.random() - 0.5) * 1.1;
      this.dustLife[particle] = 0.85 + Math.random() * (0.65 + slideIntensity * 0.45);
    }
    position.needsUpdate = true;
  }

  private finish(): void {
    this.raceStarted = false;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    const result = this.hud.finish(this.elapsed);
    this.hud.hide();
    required<HTMLElement>("#finish-title").textContent = result.isBest ? "Record!" : "Finished";
    required<HTMLElement>("#final-time").textContent = HUD.formatTime(this.elapsed);
    required<HTMLElement>("#final-best").textContent = HUD.formatTime(result.best);
    const delta = required<HTMLElement>("#finish-delta");
    if (result.delta === null) {
      delta.textContent = "First run";
      delta.className = "gain";
    } else {
      const sign = result.delta <= 0 ? "−" : "+";
      delta.textContent = `${result.delta <= 0 ? "↑" : "↓"} ${sign}${Math.abs(result.delta).toFixed(3)}`;
      delta.className = result.delta <= 0 ? "gain" : "loss";
    }
    required<HTMLElement>("#finish-screen").classList.add("visible");
    required<HTMLButtonElement>("#main-menu-button").focus();
  }

  private readonly onGlobalKey = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.code === "KeyR") {
      location.assign(`${location.pathname}?circuit=${this.stage.id}`);
      return;
    }
    if (event.code === "Escape" && this.running) {
      this.paused = !this.paused;
      this.input.clear();
      this.clock.getDelta();
      required<HTMLElement>("#pause-screen").classList.toggle("visible", this.paused);
      if (this.paused) required<HTMLButtonElement>("#resume-button").focus();
    }
  };

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.clock.getDelta();
    required<HTMLElement>("#pause-screen").classList.remove("visible");
    required<HTMLCanvasElement>("#game").focus();
  }

  private readonly resize = (): void => {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  };
}
