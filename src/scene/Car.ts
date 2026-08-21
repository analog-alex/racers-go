import {
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const material = (color: number, roughness = 0.55, metalness = 0.05) =>
  new MeshStandardMaterial({ color, roughness, metalness });

export interface CarDynamicsFeedback {
  longitudinalG: number;
  lateralG: number;
  slipAngle: number;
  aeroLoad: number;
}

export class RallyCar {
  readonly root = new Group();
  readonly wheels: Object3D[] = [];
  readonly frontWheels: Object3D[] = [];
  private readonly body = new Group();

  constructor(private readonly generatedModelPath = "./models/rally-car.glb") {
    this.root.add(this.body);
    this.buildFallback();
    if (this.generatedModelPath.includes("formula-car")) {
      const contactShadow = new Mesh(
        new CircleGeometry(1, 32),
        new MeshBasicMaterial({ color: 0x07090a, transparent: true, opacity: 0.3, depthWrite: false }),
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.y = -0.305;
      contactShadow.scale.set(1.2, 2.8, 1);
      contactShadow.renderOrder = 2;
      this.root.add(contactShadow);
    }
    this.root.scale.setScalar(1.08);
  }

  async loadGeneratedModel(): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(this.generatedModelPath);
      this.body.clear();
      this.wheels.length = 0;
      this.frontWheels.length = 0;
      const model = gltf.scene;
      // Meshy authored this vehicle lengthwise on X. Rotate its front from -X
      // onto the game's -Z forward axis so the chase camera looks at the rear.
      model.rotation.y = -Math.PI / 2;
      this.bindGeneratedWheels(model);
      model.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(model);
      const size = bounds.getSize(new Vector3());
      const center = bounds.getCenter(new Vector3());
      const targetLength = this.generatedModelPath.includes("formula-car") ? 5.4 : 4.2;
      const scale = targetLength / Math.max(size.x, size.z, 0.001);
      model.scale.setScalar(scale);
      model.position.set(-center.x * scale, -center.y * scale + size.y * scale * 0.5 + 0.02, -center.z * scale);
      model.traverse((child) => {
        if (child instanceof Mesh) {
          // The generated formula mesh contains long, nearly coplanar faces
          // that produce stretched shadow-map triangles across the circuit.
          // A compact contact shadow gives a stable result at racing speed.
          child.castShadow = !this.generatedModelPath.includes("formula-car");
          child.receiveShadow = true;
        }
      });
      this.body.add(model);
    } catch (error) {
      // The procedural car keeps this first version playable until the Meshy
      // model is generated and dropped into public/models.
      if (!(error instanceof Error && error.message.includes("404"))) {
        console.warn(`Generated vehicle could not be loaded from ${this.generatedModelPath}; using the built-in car.`, error);
      }
    }
  }

  update(speed: number, steering: number, dt: number, elapsed: number, feedback?: CarDynamicsFeedback): void {
    for (const wheel of this.wheels) {
      if (wheel.userData.rollAxis === "z") wheel.rotateZ(speed * dt * 0.42);
      else wheel.rotateX(speed * dt * 0.42);
    }
    for (const wheel of this.frontWheels) wheel.rotation.y = steering * 0.38;
    if (feedback) {
      const isFormula = this.generatedModelPath.includes("formula-car");
      const speedRatio = MathUtils.clamp(Math.abs(speed) / (isFormula ? 94 : 49), 0, 1);
      const vibration = Math.sin(elapsed * (isFormula ? 44 : 27)) * speedRatio * (isFormula ? 0.003 : 0.012);
      const rideHeight = (isFormula ? -feedback.aeroLoad * 0.035 : 0) + vibration;
      const pitch = MathUtils.clamp(feedback.longitudinalG * (isFormula ? 0.008 : 0.018), isFormula ? -0.04 : -0.065, isFormula ? 0.025 : 0.045);
      const roll = MathUtils.clamp(-feedback.lateralG * (isFormula ? 0.0055 : 0.024), isFormula ? -0.028 : -0.065, isFormula ? 0.028 : 0.065);
      this.body.position.y += (rideHeight - this.body.position.y) * Math.min(1, dt * 12);
      this.body.rotation.x += (pitch - this.body.rotation.x) * Math.min(1, dt * 10);
      this.body.rotation.z += (roll - this.body.rotation.z) * Math.min(1, dt * 12);
      this.body.rotation.y += (-feedback.slipAngle * (isFormula ? 0.18 : 0.5) - this.body.rotation.y) * Math.min(1, dt * 10);
    } else {
      this.body.position.y = Math.sin(elapsed * 16) * Math.min(speed / 45, 1) * 0.016;
      this.body.rotation.z += (steering * Math.min(speed / 28, 1) * -0.055 - this.body.rotation.z) * Math.min(1, dt * 8);
    }
  }

  /**
   * Meshy T2 exports clean disconnected parts inside a single mesh rather than
   * named wheel nodes. Split the four wheel-shaped connected components into
   * axle-centred pivots so they can roll and the front pair can steer.
   */
  private bindGeneratedWheels(model: Object3D): boolean {
    let source: Mesh | undefined;
    model.traverse((child) => {
      if (!source && child instanceof Mesh && child.geometry.index && !Array.isArray(child.material)) source = child;
    });
    if (!source || !source.parent) return false;

    const geometry = source.geometry;
    const positions = geometry.getAttribute("position");
    const indices = geometry.getIndex();
    if (!indices) return false;
    const parents = Array.from({ length: positions.count }, (_, index) => index);
    const find = (index: number): number => parents[index] === index
      ? index
      : (parents[index] = find(parents[index]));
    const join = (a: number, b: number): void => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parents[rootB] = rootA;
    };

    // Weld only position-identical seam vertices before finding components.
    const coincident = new Map<string, number>();
    for (let index = 0; index < positions.count; index += 1) {
      const key = `${Math.round(positions.getX(index) * 10_000)},${Math.round(positions.getY(index) * 10_000)},${Math.round(positions.getZ(index) * 10_000)}`;
      const match = coincident.get(key);
      if (match === undefined) coincident.set(key, index);
      else join(index, match);
    }

    for (let offset = 0; offset < indices.count; offset += 3) {
      const a = indices.getX(offset);
      const b = indices.getX(offset + 1);
      const c = indices.getX(offset + 2);
      join(a, b);
      join(b, c);
    }

    type Component = { triangles: number[]; min: Vector3; max: Vector3 };
    const components = new Map<number, Component>();
    for (let triangle = 0; triangle < indices.count / 3; triangle += 1) {
      const vertex = indices.getX(triangle * 3);
      const root = find(vertex);
      let component = components.get(root);
      if (!component) {
        component = {
          triangles: [],
          min: new Vector3(Infinity, Infinity, Infinity),
          max: new Vector3(-Infinity, -Infinity, -Infinity),
        };
        components.set(root, component);
      }
      component.triangles.push(triangle);
      for (let corner = 0; corner < 3; corner += 1) {
        const index = indices.getX(triangle * 3 + corner);
        component.min.min(new Vector3(positions.getX(index), positions.getY(index), positions.getZ(index)));
        component.max.max(new Vector3(positions.getX(index), positions.getY(index), positions.getZ(index)));
      }
    }

    const wheelParts = [...components.values()].filter((component) => {
      const size = component.max.clone().sub(component.min);
      const center = component.min.clone().add(component.max).multiplyScalar(0.5);
      return size.x > 0.45 && size.x < 0.8
        && size.y > 0.45 && size.y < 0.8
        && size.z > 0.12 && size.z < 0.3
        && center.y < 0.5;
    });
    if (wheelParts.length !== 4) {
      // The Formula export is a deliberately fused body mesh. Its slick tyres
      // have no visible tread, so static wheel rotation is not noticeable; do
      // not report that known asset topology as a runtime problem.
      if (!this.generatedModelPath.includes("formula-car")) {
        console.warn(`Generated vehicle has ${wheelParts.length} separable wheel components; keeping its wheels static.`);
      }
      return false;
    }

    const nonIndexed = geometry.toNonIndexed();
    const makeGeometry = (triangles: number[]): BufferGeometry => {
      const result = new BufferGeometry();
      for (const name of Object.keys(nonIndexed.attributes)) {
        const attribute = nonIndexed.getAttribute(name);
        const ArrayType = attribute.array.constructor as new (length: number) => typeof attribute.array;
        const values = new ArrayType(triangles.length * 3 * attribute.itemSize);
        let targetOffset = 0;
        for (const triangle of triangles) {
          const sourceOffset = triangle * 3 * attribute.itemSize;
          for (let value = 0; value < 3 * attribute.itemSize; value += 1) {
            values[targetOffset++] = attribute.array[sourceOffset + value];
          }
        }
        result.setAttribute(name, new BufferAttribute(values, attribute.itemSize, attribute.normalized));
      }
      result.computeBoundingBox();
      result.computeBoundingSphere();
      return result;
    };

    const wheelTriangles = new Set(wheelParts.flatMap((component) => component.triangles));
    const bodyTriangles = Array.from(
      { length: indices.count / 3 },
      (_, triangle) => triangle,
    ).filter((triangle) => !wheelTriangles.has(triangle));

    const assembly = new Group();
    assembly.name = "Animated generated vehicle assembly";
    assembly.position.copy(source.position);
    assembly.quaternion.copy(source.quaternion);
    assembly.scale.copy(source.scale);
    source.parent.add(assembly);
    source.parent.remove(source);

    const bodyMesh = new Mesh(makeGeometry(bodyTriangles), source.material);
    bodyMesh.name = "Generated vehicle body";
    assembly.add(bodyMesh);

    for (const component of wheelParts) {
      const center = component.min.clone().add(component.max).multiplyScalar(0.5);
      const steeringPivot = new Group();
      steeringPivot.position.copy(center);
      const rollPivot = new Group();
      rollPivot.userData.rollAxis = "z";
      const wheel = new Mesh(makeGeometry(component.triangles), source.material);
      wheel.position.copy(center).multiplyScalar(-1);
      rollPivot.add(wheel);
      steeringPivot.add(rollPivot);
      assembly.add(steeringPivot);
      this.wheels.push(rollPivot);
      if (center.x < 0) this.frontWheels.push(steeringPivot);
    }
    nonIndexed.dispose();
    geometry.dispose();
    return true;
  }

  private buildFallback(): void {
    const white = material(0xf4efe1, 0.38, 0.12);
    const blue = material(0x1267d6, 0.34, 0.18);
    const black = material(0x101820, 0.44, 0.2);
    const glass = material(0x102d39, 0.18, 0.35);
    const red = material(0xff3b30, 0.28, 0.1);
    const amber = material(0xffc229, 0.3, 0.08);

    const addBox = (size: [number, number, number], position: [number, number, number], mat: MeshStandardMaterial, radius = 0): Mesh => {
      const geometry = radius > 0
        ? new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius)
        : new BoxGeometry(...size);
      const mesh = new Mesh(geometry, mat);
      mesh.position.set(...position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.body.add(mesh);
      return mesh;
    };

    addBox([2.22, 0.5, 4.15], [0, 0.72, 0], blue, 0.16);
    addBox([2.05, 0.36, 1.15], [0, 1.13, -1.35], white, 0.12);
    addBox([1.76, 0.76, 1.76], [0, 1.25, 0.25], white, 0.16);
    const windshield = addBox([1.62, 0.52, 0.08], [0, 1.39, -0.68], glass, 0.04);
    windshield.rotation.x = -0.18;
    addBox([1.72, 0.43, 0.06], [0, 1.42, 0.95], glass, 0.03).rotation.x = 0.16;

    addBox([2.28, 0.2, 0.42], [0, 0.68, -1.98], black, 0.08);
    addBox([1.3, 0.06, 3.75], [0, 1.01, -0.05], white, 0.02);
    addBox([0.38, 0.035, 3.86], [0.25, 1.055, -0.05], blue);

    addBox([2.48, 0.1, 0.42], [0, 1.76, 1.73], black, 0.03);
    addBox([0.08, 0.48, 0.1], [-0.72, 1.52, 1.63], black);
    addBox([0.08, 0.48, 0.1], [0.72, 1.52, 1.63], black);

    addBox([0.54, 0.16, 0.05], [-0.63, 0.86, -2.11], amber, 0.04);
    addBox([0.54, 0.16, 0.05], [0.63, 0.86, -2.11], amber, 0.04);
    addBox([0.54, 0.18, 0.05], [-0.64, 0.9, 2.09], red, 0.04);
    addBox([0.54, 0.18, 0.05], [0.64, 0.9, 2.09], red, 0.04);

    const lampGeometry = new SphereGeometry(0.14, 12, 8);
    for (const x of [-0.5, -0.17, 0.17, 0.5]) {
      const lamp = new Mesh(lampGeometry, amber);
      lamp.position.set(x, 1.21, -1.94);
      lamp.scale.z = 0.45;
      this.body.add(lamp);
    }

    const tireGeometry = new CylinderGeometry(0.47, 0.47, 0.34, 16);
    tireGeometry.rotateZ(Math.PI / 2);
    for (const z of [-1.38, 1.38]) {
      for (const x of [-1.13, 1.13]) {
        const pivot = new Group();
        pivot.position.set(x, 0.5, z);
        const tire = new Mesh(tireGeometry, black);
        tire.castShadow = true;
        pivot.add(tire);
        this.body.add(pivot);
        this.wheels.push(tire);
        if (z < 0) this.frontWheels.push(pivot);
      }
    }
  }
}
