import { Box3, Group, Mesh, Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface PineRunPlacementStage {
  readonly id: string;
  readonly root: Group;
  readonly samples: readonly Vector3[];
  tangent(index: number): Vector3;
  normal?(index: number): Vector3;
}

export interface PineRunAssetPlacement {
  readonly url: string;
  readonly sampleIndex: number;
  readonly side: -1 | 1;
  readonly lateralOffset: number;
  readonly elevation?: number;
  readonly yaw?: number;
  readonly scale?: number;
  readonly targetHeight?: number;
  readonly anchorBottom?: boolean;
}

export interface PineRunAssetOptions {
  readonly modelBasePath?: string;
  readonly placements?: readonly PineRunAssetPlacement[];
  readonly normalize?: boolean;
  readonly onError?: (url: string, error: unknown) => void;
}

export interface PineRunAssetLoadResult {
  readonly group: Group;
  readonly loaded: readonly string[];
  readonly missing: readonly string[];
}

const DEFAULT_PLACEMENTS: readonly PineRunAssetPlacement[] = [
  ...([35, 278, 596] as const).map((sampleIndex, index) => ({
    url: "pine-run-timing-hut.glb",
    sampleIndex,
    side: (index % 2 === 0 ? 1 : -1) as -1 | 1,
    lateralOffset: 38,
    targetHeight: 7,
    yaw: Math.PI / 2,
  })),
  ...([88, 176, 332, 454, 648] as const).map((sampleIndex, index) => ({
    url: "pine-run-log-barrier.glb",
    sampleIndex,
    side: (index % 2 === 0 ? -1 : 1) as -1 | 1,
    lateralOffset: 25,
    targetHeight: 2.2,
    yaw: Math.PI / 2,
  })),
];

const gltfCache = new Map<string, Promise<GLTF>>();

const clampIndex = (index: number, length: number): number => Math.max(0, Math.min(Math.max(0, length - 1), Math.round(index)));

const setQuality = (object: Object3D): void => {
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => {
      if (!material) return;
      const textures = ["map", "normalMap", "roughnessMap", "metalnessMap"] as const;
      textures.forEach((key) => {
        const texture = (material as unknown as Record<string, { anisotropy: number } | undefined>)[key];
        if (texture) texture.anisotropy = Math.min(8, texture.anisotropy || 1);
      });
      material.needsUpdate = true;
    });
  });
};

const normalizedScale = (object: Object3D, targetHeight?: number): number => {
  if (!targetHeight || targetHeight <= 0) return 1;
  const size = new Box3().setFromObject(object).getSize(new Vector3());
  const authoredHeight = size.y > 0 ? size.y : Math.max(size.x, size.z);
  return authoredHeight > 0 ? targetHeight / authoredHeight : 1;
};

/** Loads optional Pine Run scenery without affecting the playable rally stage. */
export async function loadPineRunAssets(
  stage: PineRunPlacementStage,
  options: PineRunAssetOptions = {},
): Promise<PineRunAssetLoadResult> {
  const group = new Group();
  group.name = "pine-run-optional-assets";
  if (stage.id !== "pine-run" || stage.samples.length === 0) return { group, loaded: [], missing: [] };
  stage.root.add(group);
  const loader = new GLTFLoader();
  const loaded: string[] = [];
  const missing: string[] = [];
  const basePath = options.modelBasePath ?? "/models/";
  const placements = options.placements ?? DEFAULT_PLACEMENTS;
  const normalize = options.normalize ?? true;

  await Promise.all(placements.map(async (placement) => {
    const url = placement.url.startsWith("/") || placement.url.startsWith("http")
      ? placement.url : `${basePath.replace(/\/$/, "")}/${placement.url}`;
    try {
      let load = gltfCache.get(url);
      if (!load) {
        load = loader.loadAsync(url);
        gltfCache.set(url, load);
      }
      const instance = (await load).scene.clone(true);
      instance.name = `pine-run-${placement.url.split("/").pop()?.replace(/\.glb$/i, "") ?? "asset"}`;
      instance.scale.setScalar((normalize ? normalizedScale(instance, placement.targetHeight) : 1) * (placement.scale ?? 1));
      const index = clampIndex(placement.sampleIndex, stage.samples.length);
      const sample = stage.samples[index];
      const tangent = stage.tangent(index).clone().setY(0).normalize();
      const normal = (stage.normal?.(index) ?? new Vector3(-tangent.z, 0, tangent.x)).clone().setY(0).normalize();
      instance.position.copy(sample).addScaledVector(normal, placement.side * placement.lateralOffset);
      instance.position.y = 0;
      instance.rotation.set(0, Math.atan2(tangent.x, tangent.z) + (placement.yaw ?? 0), 0);
      if (placement.anchorBottom ?? true) {
        instance.position.y += sample.y + (placement.elevation ?? 0) - new Box3().setFromObject(instance).min.y;
      } else instance.position.y += sample.y + (placement.elevation ?? 0);
      setQuality(instance);
      group.add(instance);
      loaded.push(url);
    } catch (error) {
      missing.push(url);
      options.onError?.(url, error);
    }
  }));
  return { group, loaded, missing };
}

export { DEFAULT_PLACEMENTS as PINE_RUN_ASSET_PLACEMENTS };
