import {
  Box3,
  Group,
  Mesh,
  Object3D,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/** The small part of Stage used by the optional Silverstone scenery pass. */
export interface SilverstonePlacementStage {
  readonly id: string;
  readonly root: Group;
  readonly samples: readonly Vector3[];
  tangent(index: number): Vector3;
  /** Optional because older/custom Stage implementations can derive it. */
  normal?(index: number): Vector3;
  isDisposed?(): boolean;
  isGenerationCurrent?(generation: symbol): boolean;
}

export interface SilverstoneAssetPlacement {
  /** URL relative to the app origin, normally /models/*.glb. */
  readonly url: string;
  /** Sample along the centre line to place the asset beside. */
  readonly sampleIndex: number;
  /** -1 is left of the track, +1 is right of the track. */
  readonly side: -1 | 1;
  /** Distance from the centre line, in world units. */
  readonly lateralOffset: number;
  /** Additional world-space Y offset. */
  readonly elevation?: number;
  /** Additional yaw in radians, relative to the track tangent. */
  readonly yaw?: number;
  /** Multiplier applied after optional target-height normalization. */
  readonly scale?: number;
  /** If supplied, the model's largest dimension is scaled to this height. */
  readonly targetHeight?: number;
  /** Keep the lowest point on the ground at the selected sample. */
  readonly anchorBottom?: boolean;
}

export interface SilverstoneAssetOptions {
  readonly modelBasePath?: string;
  readonly placements?: readonly SilverstoneAssetPlacement[];
  /** Set false to use the model's authored scale unchanged. */
  readonly normalize?: boolean;
  readonly onError?: (url: string, error: unknown) => void;
  readonly generation?: symbol;
}

export interface SilverstoneAssetLoadResult {
  readonly group: Group;
  readonly loaded: readonly string[];
  readonly missing: readonly string[];
}

interface ProcessedSilverstoneAsset {
  readonly scene: Object3D;
  readonly bounds: Box3;
  readonly authoredHeight: number;
}

const DEFAULT_PLACEMENTS: readonly SilverstoneAssetPlacement[] = [
  ...([24, 206, 346, 506, 650] as const).map((sampleIndex, index) => ({
    url: "silverstone-grandstand.glb",
    sampleIndex,
    side: (index % 2 === 0 ? 1 : -1) as -1 | 1,
    lateralOffset: 40,
    targetHeight: 8,
    yaw: Math.PI / 2,
    scale: 1,
  })),
  { url: "silverstone-pit-building.glb", sampleIndex: 680, side: -1, lateralOffset: 36, targetHeight: 11, yaw: Math.PI / 2, scale: 1 },
  { url: "silverstone-pit-building.glb", sampleIndex: 10, side: -1, lateralOffset: 36, targetHeight: 11, yaw: Math.PI / 2, scale: 1 },
];

const gltfCache = new Map<string, Promise<GLTF>>();
const processedCache = new Map<string, Promise<ProcessedSilverstoneAsset>>();

const clampIndex = (index: number, length: number): number =>
  Math.max(0, Math.min(Math.max(0, length - 1), Math.round(index)));

const setQuality = (object: Object3D): void => {
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      if (!material) return;
      // Imported GLBs vary wildly in authored roughness. Keep their colors and
      // maps, but avoid shiny plastic scenery when a material omits roughness.
      if ("roughness" in material && typeof material.roughness !== "number") {
        material.roughness = 0.82;
      }
      material.needsUpdate = true;
      const textures = ["map", "normalMap", "roughnessMap", "metalnessMap"] as const;
      textures.forEach((key) => {
        const texture = (material as unknown as Record<string, { anisotropy: number } | undefined>)[key];
        if (texture) texture.anisotropy = Math.min(8, texture.anisotropy || 1);
      });
    });
  });
};

const processedAsset = (url: string, loader: GLTFLoader): Promise<ProcessedSilverstoneAsset> => {
  const cached = processedCache.get(url);
  if (cached) return cached;
  const promise = (async (): Promise<ProcessedSilverstoneAsset> => {
    let load = gltfCache.get(url);
    if (!load) {
      load = loader.loadAsync(url);
      gltfCache.set(url, load);
    }
    const gltf = await load;
    setQuality(gltf.scene);
    const bounds = new Box3().setFromObject(gltf.scene);
    const size = bounds.getSize(new Vector3());
    return {
      scene: gltf.scene,
      bounds,
      authoredHeight: size.y > 0 ? size.y : Math.max(size.x, size.z),
    };
  })();
  processedCache.set(url, promise);
  return promise;
};

const normalizedScale = (authoredHeight: number, targetHeight?: number): number => {
  if (!targetHeight || targetHeight <= 0) return 1;
  // Asset authors generally model the building upright, so its Y extent is
  // the useful physical height. Keep a defensive fallback for flat exports.
  return authoredHeight > 0 ? targetHeight / authoredHeight : 1;
};

/**
 * Loads optional Silverstone scenery. Missing models are deliberately treated
 * as a normal outcome: the procedural track remains fully playable.
 */
export async function loadSilverstoneAssets(
  stage: SilverstonePlacementStage,
  options: SilverstoneAssetOptions = {},
): Promise<SilverstoneAssetLoadResult> {
  const group = new Group();
  group.name = "silverstone-optional-assets";
  if (stage.id !== "silverstone" || stage.samples.length === 0) {
    return { group, loaded: [], missing: [] };
  }
  stage.root.add(group);

  const basePath = options.modelBasePath ?? "/models/";
  const placements = options.placements ?? DEFAULT_PLACEMENTS;
  const loader = new GLTFLoader();
  const loaded: string[] = [];
  const missing: string[] = [];
  const normalize = options.normalize ?? true;

  await Promise.all(placements.map(async (placement) => {
    if (stage.isDisposed?.() || (options.generation !== undefined && stage.isGenerationCurrent && !stage.isGenerationCurrent(options.generation))) return;
    const url = placement.url.startsWith("/") || placement.url.startsWith("http")
      ? placement.url
      : `${basePath.replace(/\/$/, "")}/${placement.url}`;
    try {
      const source = await processedAsset(url, loader);
      if (stage.isDisposed?.() || (options.generation !== undefined && stage.isGenerationCurrent && !stage.isGenerationCurrent(options.generation))) return;
      const instance = source.scene.clone(true);
      instance.name = `silverstone-${placement.url.split("/").pop()?.replace(/\.glb$/i, "") ?? "asset"}`;
      const scale = (normalize ? normalizedScale(source.authoredHeight, placement.targetHeight) : 1) * (placement.scale ?? 1);
      instance.scale.setScalar(scale);

      const sampleIndex = clampIndex(placement.sampleIndex, stage.samples.length);
      const sample = stage.samples[sampleIndex];
      const tangent = stage.tangent(sampleIndex).clone().setY(0).normalize();
      const normal = (stage.normal?.(sampleIndex) ?? new Vector3(-tangent.z, 0, tangent.x)).clone().setY(0).normalize();
      instance.position.copy(sample).addScaledVector(normal, placement.side * placement.lateralOffset);
      // Calculate the authored model's local bottom before putting it at the
      // track elevation; this also avoids applying the sample height twice.
      instance.position.y = 0;
      instance.rotation.set(0, Math.atan2(tangent.x, tangent.z) + (placement.yaw ?? 0), 0);

      if (placement.anchorBottom ?? true) {
        instance.position.y += sample.y + (placement.elevation ?? 0) - source.bounds.min.y * scale;
      } else {
        instance.position.y += sample.y + (placement.elevation ?? 0);
      }
      // Clones share the immutable cached geometry/material resources. Stage
      // teardown detaches these instances but intentionally never disposes
      // their shared source buffers.
      instance.traverse((object) => {
        object.userData.sharedResource = true;
      });
      group.add(instance);
      loaded.push(url);
    } catch (error) {
      missing.push(url);
      options.onError?.(url, error);
    }
  }));

  return { group, loaded, missing };
}

export { DEFAULT_PLACEMENTS as SILVERSTONE_ASSET_PLACEMENTS };
