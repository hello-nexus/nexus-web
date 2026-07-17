import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { NxPackReader } from './container';
import type {
  MaterialsFile,
  PackIndex,
  SceneFile,
  ScriptsFile,
  SpringBonesFile,
  StatesFile,
} from './types';

export interface AvatarPack {
  /**
   * URL the pack was loaded from: '/'-terminated base URL for plain pack
   * dirs, the container URL for encrypted (.nxpack) packs.
   */
  baseUrl: string;
  index: PackIndex;
  gltf: GLTF;
  /** Baked stage GLB (files.environment); null when the pack has none. */
  environment: GLTF | null;
  /** Equirect sky panorama (files.sky) for scene.background; null = none. */
  sky: THREE.Texture | null;
  materials: MaterialsFile | null;
  springbones: SpringBonesFile | null;
  scene: SceneFile | null;
  states: StatesFile | null;
  scripts: ScriptsFile | null;
  /**
   * Present only for encrypted packs: decrypts further entries (e.g.
   * textures/*) in memory on demand. Rendering does not need it in v1; the
   * GLB embeds its textures.
   */
  container?: NxPackReader;
}

export interface LoadPackOptions {
  /**
   * 32-byte content key for a .nxpack container. KEY-DELIVERY SEAM:
   * production resolves the key from an entitlement endpoint and passes it
   * here; when omitted, the dev-only fetchKey stub below fetches the
   * "<container>.key" hex sidecar written by scripts/encrypt-pack.mjs.
   * Ignored for plain pack dirs.
   */
  key?: Uint8Array;
  /**
   * Replaces global fetch for every pack request. Hosts whose pack URLs sit
   * behind bearer auth (the Nexus app-asset route) pass an authed wrapper.
   */
  fetchImpl?: typeof fetch;
}

async function fetchJson<T>(url: string, doFetch: typeof fetch): Promise<T> {
  const res = await doFetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Optional sidecars may be absent while the exporter is being brought up;
 * warn and continue instead of failing the whole pack.
 */
async function fetchOptionalJson<T>(url: string | undefined, label: string, doFetch: typeof fetch): Promise<T | null> {
  if (url === undefined) {
    console.warn(`[loadPack] pack.json lists no ${label} file; continuing without it`);
    return null;
  }
  try {
    return await fetchJson<T>(url, doFetch);
  } catch (err) {
    console.warn(`[loadPack] optional sidecar ${label} failed to load (${String(err)}); continuing without it`);
    return null;
  }
}

/**
 * DEV-ONLY key delivery: fetches the "<container>.key" hex sidecar that
 * scripts/encrypt-pack.mjs writes next to the container. This is the seam a
 * production entitlement endpoint replaces; callers with a real key skip it
 * entirely via LoadPackOptions.key.
 */
async function fetchKey(containerUrl: string, doFetch: typeof fetch): Promise<Uint8Array> {
  // Insert `.key` before any query so a cache-busting `?v=N` on the container
  // URL still resolves the sidecar next to the file.
  const [path, query] = containerUrl.split('?');
  const url = `${path}.key${query ? `?${query}` : ''}`;
  const res = await doFetch(url);
  if (!res.ok) {
    throw new Error(`${url}: HTTP ${res.status} (dev key sidecar missing; pass LoadPackOptions.key or re-run scripts/encrypt-pack.mjs)`);
  }
  const hex = (await res.text()).trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${url}: expected 64 hex chars (32-byte pack key)`);
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) key[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return key;
}

/**
 * EXT_meshopt_compression decode for GLBs rewritten by nexus-avatar-web's
 * scripts/optimize-pack.mjs. MeshoptDecoder instantiates its WASM from inline
 * base64, which requires 'wasm-unsafe-eval' in the dashboard CSP (added in
 * the service's CSP header alongside this change).
 */
function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/** Decodes an image entry into an equirect background texture. flipY rides
 *  the ImageBitmap decode: sampler flipY stays false, matching how three
 *  handles bitmap-backed textures. */
async function skyTextureFromBytes(bytes: ArrayBuffer): Promise<THREE.Texture> {
  const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'flipY' });
  const tex = new THREE.Texture(bitmap);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function versionCheck(index: PackIndex): void {
  if (index.formatVersion !== 1) {
    throw new Error(`unsupported pack formatVersion ${String(index.formatVersion)} (runtime supports 1)`);
  }
}

/**
 * Loads an encrypted NXPK container. All decryption happens in memory
 * (see src/pack/container.ts); the parsed results feed the exact same paths
 * as a plain pack dir: GLTFLoader.parseAsync on the model ArrayBuffer,
 * JSON.parse on the sidecar strings.
 */
async function loadEncryptedPack(containerUrl: string, options: LoadPackOptions): Promise<AvatarPack> {
  const doFetch = options.fetchImpl ?? fetch;
  const res = await doFetch(containerUrl);
  if (!res.ok) throw new Error(`${containerUrl}: HTTP ${res.status}`);
  const containerBytes = await res.arrayBuffer();
  const key = options.key ?? (await fetchKey(containerUrl, doFetch));
  const reader = await NxPackReader.open(containerBytes, key);

  const index = await reader.readJson<PackIndex>('pack.json');
  versionCheck(index);

  // Absent optional sidecars keep the plain-dir warn-and-continue semantics;
  // a PRESENT entry that fails GCM auth is tampering and stays fatal.
  const readOptionalJson = async <T>(path: string | undefined, label: string): Promise<T | null> => {
    if (path === undefined) {
      console.warn(`[loadPack] pack.json lists no ${label} file; continuing without it`);
      return null;
    }
    if (!reader.hasEntry(path)) {
      console.warn(`[loadPack] optional sidecar ${label} missing from container; continuing without it`);
      return null;
    }
    return reader.readJson<T>(path);
  };

  // Optional like the JSON sidecars: absent = warn and continue.
  const readOptionalGltf = async (path: string | undefined): Promise<GLTF | null> => {
    if (path === undefined) return null;
    if (!reader.hasEntry(path)) {
      console.warn('[loadPack] environment listed but missing from container; continuing without it');
      return null;
    }
    return createGltfLoader().parseAsync(await reader.readBytes(path), '');
  };

  const readOptionalSky = async (path: string | undefined): Promise<THREE.Texture | null> => {
    if (path === undefined) return null;
    if (!reader.hasEntry(path)) {
      console.warn('[loadPack] sky listed but missing from container; continuing without it');
      return null;
    }
    // Decode failures stay non-fatal like the dir path: the sky is cosmetic
    // and must never take the character down with it.
    try {
      return await skyTextureFromBytes(await reader.readBytes(path));
    } catch (err) {
      console.warn(`[loadPack] optional sky failed to decode (${String(err)}); continuing without it`);
      return null;
    }
  };

  const modelBytes = await reader.readBytes(index.files.model);
  const [gltf, environment, sky, materials, springbones, scene, states, scripts] = await Promise.all([
    // Empty resource path: the GLB embeds its textures, nothing external to resolve.
    createGltfLoader().parseAsync(modelBytes, ''),
    readOptionalGltf(index.files.environment),
    readOptionalSky(index.files.sky),
    readOptionalJson<MaterialsFile>(index.files.materials, 'materials'),
    readOptionalJson<SpringBonesFile>(index.files.springbones, 'springbones'),
    readOptionalJson<SceneFile>(index.files.scene, 'scene'),
    readOptionalJson<StatesFile>(index.files.states, 'states'),
    readOptionalJson<ScriptsFile>(index.files.scripts, 'scripts'),
  ]);

  return { baseUrl: containerUrl, index, gltf, environment, sky, materials, springbones, scene, states, scripts, container: reader };
}

/**
 * Loads a pack per docs/pack-format.md: a plain pack directory, or an
 * encrypted NXPK container when the URL ends in ".nxpack".
 * @param baseUrl e.g. "/packs/<id>/" or "/packs/<id>.nxpack" (trailing slash
 *   optional in both forms, so the harness's `/packs/<id>/` works for both)
 */
export async function loadPack(baseUrl: string, options: LoadPackOptions = {}): Promise<AvatarPack> {
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  // Container detection must ignore a cache-busting query (`<id>.nxpack?v=N`).
  if (trimmed.split('?')[0].endsWith('.nxpack')) return loadEncryptedPack(trimmed, options);

  const doFetch = options.fetchImpl ?? fetch;
  const base = `${trimmed}/`;
  const index = await fetchJson<PackIndex>(`${base}pack.json`, doFetch);
  versionCheck(index);

  const modelUrl = `${base}${index.files.model}`;
  const modelRes = await doFetch(modelUrl);
  if (!modelRes.ok) throw new Error(`${modelUrl}: HTTP ${modelRes.status}`);
  const modelBytes = await modelRes.arrayBuffer();

  const fetchOptionalGltf = async (url: string | undefined): Promise<GLTF | null> => {
    if (url === undefined) return null;
    try {
      const envRes = await doFetch(url);
      if (!envRes.ok) throw new Error(`HTTP ${envRes.status}`);
      return await createGltfLoader().parseAsync(await envRes.arrayBuffer(), base);
    } catch (err) {
      console.warn(`[loadPack] optional environment failed to load (${url}: ${String(err)}); continuing without it`);
      return null;
    }
  };

  const fetchOptionalSky = async (url: string | undefined): Promise<THREE.Texture | null> => {
    if (url === undefined) return null;
    try {
      const skyRes = await doFetch(url);
      if (!skyRes.ok) throw new Error(`HTTP ${skyRes.status}`);
      return await skyTextureFromBytes(await skyRes.arrayBuffer());
    } catch (err) {
      console.warn(`[loadPack] optional sky failed to load (${url}: ${String(err)}); continuing without it`);
      return null;
    }
  };

  const [gltf, environment, sky, materials, springbones, scene, states, scripts] = await Promise.all([
    createGltfLoader().parseAsync(modelBytes, base),
    fetchOptionalGltf(index.files.environment && `${base}${index.files.environment}`),
    fetchOptionalSky(index.files.sky && `${base}${index.files.sky}`),
    fetchOptionalJson<MaterialsFile>(index.files.materials && `${base}${index.files.materials}`, 'materials', doFetch),
    fetchOptionalJson<SpringBonesFile>(index.files.springbones && `${base}${index.files.springbones}`, 'springbones', doFetch),
    fetchOptionalJson<SceneFile>(index.files.scene && `${base}${index.files.scene}`, 'scene', doFetch),
    fetchOptionalJson<StatesFile>(index.files.states && `${base}${index.files.states}`, 'states', doFetch),
    fetchOptionalJson<ScriptsFile>(index.files.scripts && `${base}${index.files.scripts}`, 'scripts', doFetch),
  ]);

  return { baseUrl: base, index, gltf, environment, sky, materials, springbones, scene, states, scripts };
}
