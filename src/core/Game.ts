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
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { Input } from "./Input";
import { FormulaDynamics } from "./FormulaDynamics";
import { RaceCar } from "../scene/Car";
import { SpeedLines } from "../scene/SpeedLines";
import { Stage } from "../scene/Stage";
import type { NearestTrackResult } from "../scene/Stage";
import { HUD, type HUDTelemetry } from "../ui/HUD";
import type { CircuitDefinition } from "./Circuit";
import type { CarDefinition } from "./Cars";

const required = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing interface element: ${selector}`);
  return node;
};

const THROTTLE_NEGATIVE = ["ArrowDown", "KeyS"] as const;
const THROTTLE_POSITIVE = ["ArrowUp", "KeyW"] as const;
const STEER_NEGATIVE = ["ArrowRight", "KeyD"] as const;
const STEER_POSITIVE = ["ArrowLeft", "KeyA"] as const;

export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(62, 1, 0.1, 2400);
  private readonly input = new Input();
  private readonly stage: Stage;
  private readonly car: RaceCar;
  private readonly speedLines = new SpeedLines();
  private readonly hud: HUD;
  private readonly clock = new Clock();
  private readonly right = new Vector3();
  private readonly forward = new Vector3();
  private readonly cameraGoal = new Vector3();
  private readonly lookGoal = new Vector3();
  private readonly startPose: { position: Vector3; heading: number };
  private readonly previousCarPosition: Vector3;
  private readonly cameraTravel = new Vector3();
  private readonly topSpeed: number;
  private readonly formulaDynamics: FormulaDynamics;
  private readonly dynamicsInput = {
    dt: 0,
    drive: 0,
    steering: 0,
    braking: false,
    offroad: false,
    topSpeed: 0,
  };
  private readonly feedback = { longitudinalG: 0, lateralG: 0, slipAngle: 0, aeroLoad: 0 };
  private readonly hudTelemetry: HUDTelemetry = {
    speed: 0,
    elapsed: 0,
    progress: 0,
    offroad: false,
    checkpoint: 0,
    turn: 0,
  };
  private readonly nearest = { index: 0, distance: 0, side: 0 } as NearestTrackResult;
  private readonly updatedNearest = { index: 0, distance: 0, side: 0 } as NearestTrackResult;
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
  private disposed = false;
  private progressIndex = 0;
  private nearestIndex = 0;
  private checkpoint = 0;
  private countdown = 3.8;
  private offCourseTime = 0;
  private stuckTime = 0;
  private lastFov = 62;

  constructor(canvas: HTMLCanvasElement, circuit: CircuitDefinition, carDefinition: CarDefinition) {
    this.stage = new Stage(circuit);
    this.topSpeed = 94;
    this.formulaDynamics = new FormulaDynamics();
    this.hud = new HUD(this.stage);
    this.startPose = this.stage.startPose();
    this.previousCarPosition = this.startPose.position.clone();
    this.car = new RaceCar(carDefinition);
    this.heading = this.startPose.heading;
    this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene.background = new Color(0x9baeb8);
    this.scene.fog = new FogExp2(0xb3c0c2, 0.0024);
    this.scene.add(this.stage.root, this.car.root, this.speedLines.root);
    this.car.root.position.copy(this.startPose.position);
    this.car.root.rotation.y = this.heading;

    this.scene.add(new HemisphereLight(0xdff4ff, 0x343c42, 2.5));
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

    this.camera.position.copy(this.car.root.position).add(new Vector3(0, 4.6, 9));
    this.resize();
    globalThis.addEventListener("resize", this.resize);
    globalThis.addEventListener("keydown", this.onGlobalKey);
  }

  async load(): Promise<void> {
    await Promise.all([this.car.loadGeneratedModel(), this.stage.ready]);
    if (this.disposed) return;
    // Compile and render behind the loading screen so model uploads and the
    // single static shadow pass cannot hitch the first visible race frame.
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) return;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
    this.renderer.shadowMap.autoUpdate = false;
  }

  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.hud.show();
    this.clock.start();
    this.renderer.setAnimationLoop(this.frame);
  }

  private readonly frame = (): void => {
    if (this.disposed || !this.running) return;
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

    const throttle = this.input.axis(THROTTLE_NEGATIVE, THROTTLE_POSITIVE);
    const steerTarget = this.raceStarted
      ? this.input.axis(STEER_NEGATIVE, STEER_POSITIVE)
      : 0;
    const braking = this.input.isDownCode("Space");
    this.stage.nearestInto(this.car.root.position, this.nearestIndex, this.nearest);
    const offroad = Math.abs(this.nearest.side) > this.stage.roadWidth - 0.7;
    const steerRate = braking ? 10 : 8.5;
    this.steering += (steerTarget - this.steering) * (1 - Math.exp(-steerRate * dt));
    this.dynamicsInput.dt = dt;
    this.dynamicsInput.drive = this.raceStarted ? throttle : 0;
    this.dynamicsInput.steering = this.raceStarted ? this.steering : 0;
    // Down/S brakes while moving, then becomes the recoverable reverse
    // gear once the car has stopped. Space always requests full braking.
    this.dynamicsInput.braking = this.raceStarted && (braking || (throttle < 0 && this.speed > 0.5));
    this.dynamicsInput.offroad = offroad;
    this.dynamicsInput.topSpeed = this.topSpeed;
    const motion = this.formulaDynamics.update(this.heading, this.dynamicsInput);
    this.heading = motion.heading;
    this.speed = motion.speed;
    this.longitudinalG = motion.longitudinalG;
    this.lateralG = motion.lateralG;
    this.slipAngle = motion.slipAngle;
    this.aeroLoad = motion.aeroLoad;
    this.forward.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.car.root.position.addScaledVector(this.formulaDynamics.velocity, dt);

    this.stage.nearestInto(this.car.root.position, this.nearest.index, this.updatedNearest);
    this.nearestIndex = this.updatedNearest.index;
    if (this.updatedNearest.index > this.progressIndex - 8) this.progressIndex = Math.max(this.progressIndex, this.updatedNearest.index);
    this.car.root.position.y += (this.stage.roadHeight(this.updatedNearest.index) - this.car.root.position.y) * Math.min(1, dt * 12);
    this.car.root.rotation.y = this.heading;
    this.feedback.longitudinalG = this.longitudinalG;
    this.feedback.lateralG = this.lateralG;
    this.feedback.slipAngle = this.slipAngle;
    this.feedback.aeroLoad = this.aeroLoad;
    this.car.update(this.speed, this.steering, dt, this.elapsed, this.feedback);
    this.speedLines.update(this.car.root.position, this.heading, this.speed, dt);

    if (this.raceStarted) this.elapsed += dt;
    const progress = this.progressIndex / (this.stage.samples.length - 1);
    this.updateCheckpoints(this.updatedNearest.index);
    const lookAhead = Math.min(this.stage.samples.length - 1, this.updatedNearest.index + 22);
    const lookTangent = this.stage.tangent(lookAhead);
    const currentTangent = this.stage.tangent(this.updatedNearest.index);
    const turn = lookTangent.z * currentTangent.x - lookTangent.x * currentTangent.z;
    this.hudTelemetry.speed = this.speed;
    this.hudTelemetry.elapsed = this.elapsed;
    this.hudTelemetry.progress = progress;
    this.hudTelemetry.offroad = offroad;
    this.hudTelemetry.checkpoint = this.checkpoint;
    this.hudTelemetry.turn = turn;
    this.hud.update(this.hudTelemetry);

    this.updateCamera(dt, braking || throttle < 0);
    if (this.checkpoint === this.stage.checkpointIndices.length && this.raceStarted) {
      this.finish();
      return;
    }
    this.checkFailure(dt, this.updatedNearest.distance, progress);
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

    const beyondRecoveryArea = distanceFromCourse > this.stage.roadWidth + 25;
    const strandedOffCourse = distanceFromCourse > this.stage.roadWidth + 9 && Math.abs(this.speed) < 1.2;
    this.offCourseTime = beyondRecoveryArea ? this.offCourseTime + dt : Math.max(0, this.offCourseTime - dt * 2);
    this.stuckTime = strandedOffCourse ? this.stuckTime + dt : 0;

    if (distanceFromCourse > 105) {
      this.fail("Stage boundary crossed.", progress);
    } else if (this.offCourseTime >= 2.8) {
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

    const speedEffect = MathUtils.smoothstep(Math.abs(this.speed), 32, this.topSpeed);
    const chaseDistance = 7.7 + speedEffect * 1.1 - Math.max(0, -this.longitudinalG) * 0.08;
    this.cameraGoal.copy(this.car.root.position).addScaledVector(this.forward, -chaseDistance);
    this.cameraGoal.y += 3.45;
    this.right.set(-this.forward.z, 0, this.forward.x);
    this.cameraGoal.addScaledVector(this.right, -this.slipAngle * 1.4);
    const follow = 1 - Math.exp(-(braking ? 5.2 : 8.4) * dt);
    this.camera.position.lerp(this.cameraGoal, follow);
    this.lookGoal.copy(this.car.root.position).addScaledVector(this.forward, 10.5);
    this.lookGoal.y += 0.95;
    this.camera.lookAt(this.lookGoal);
    this.camera.rotateZ(-this.lateralG * 0.0035);
    const targetFov = 62 + speedEffect * 8;
    const nextFov = this.camera.fov + (targetFov - this.camera.fov) * Math.min(1, dt * 3);
    if (Math.abs(nextFov - this.lastFov) > 0.001) {
      this.camera.fov = nextFov;
      this.lastFov = nextFov;
      this.camera.updateProjectionMatrix();
    }
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
    if (!this.paused || this.disposed) return;
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    this.paused = false;
    this.renderer.setAnimationLoop(null);
    this.hud.hide();
    globalThis.removeEventListener("resize", this.resize);
    globalThis.removeEventListener("keydown", this.onGlobalKey);
    this.input.dispose();
    this.car.dispose();
    this.speedLines.dispose();
    this.stage.dispose();
    this.renderer.dispose();
  }
}
