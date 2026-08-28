import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { RaceCar } from "./Car";
import type { CarDefinition } from "../core/Cars";

export class CarPreview {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(34, 1, 0.1, 100);
  private readonly car: RaceCar;
  private lastTime = performance.now();
  private elapsed = 0;
  private running = false;

  constructor(private readonly canvas: HTMLCanvasElement, definition: CarDefinition) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMappingExposure = 1.1;
    this.scene.background = new Color(0x102722);
    this.car = new RaceCar(definition.modelPath);
    this.car.root.position.y = -0.05;
    this.scene.add(this.car.root);
    this.scene.add(new AmbientLight(0xf8f4df, 2.4));
    const key = new DirectionalLight(0xffd76b, 4);
    key.position.set(-4, 7, 5);
    this.scene.add(key);
    const fill = new DirectionalLight(0x8fd9e3, 2.2);
    fill.position.set(5, 3, -4);
    this.scene.add(fill);
    this.camera.position.set(6.4, 3.35, 6.4);
    this.camera.lookAt(0, 0.35, 0);
    this.resize();
    globalThis.addEventListener("resize", this.resize);
  }

  async load(): Promise<void> {
    await this.car.loadGeneratedModel();
    this.resize();
    this.render();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop(this.frame);
  }

  private readonly frame = (): void => {
    const now = performance.now();
    const dt = Math.min(0.04, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsed += dt;
    this.car.root.rotation.y += dt * 0.34;
    this.car.update(16, 0, dt, this.elapsed);
    this.render();
  };

  private readonly render = (): void => {
    this.renderer.render(this.scene, this.camera);
  };

  private readonly resize = (): void => {
    const width = Math.max(1, this.canvas.clientWidth || this.canvas.width || 1);
    const height = Math.max(1, this.canvas.clientHeight || this.canvas.height || 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };
}

