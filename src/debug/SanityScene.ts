/**
 * Phase-0 sanity scene — proves the full GPU stack end to end:
 *  1. compute kernel → storage buffers → instanced draw (GPU instance path)
 *  2. compute kernel → storage texture → material sampling
 *  3. TSL vertex displacement (procedural ground)
 *  4. CPU procedural geometry (displaced icosphere "rock")
 *  5. lights + shadows
 * Everything is deterministic from ?seed.
 */

import {
  DirectionalLight,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Mesh,
  PlaneGeometry,
  Vector3,
} from 'three';
import { MeshStandardNodeMaterial, StorageTexture } from 'three/webgpu';
import {
  Fn,
  cos,
  float,
  floor,
  fract,
  hash,
  instancedArray,
  instanceIndex,
  mix,
  positionLocal,
  sin,
  texture,
  textureStore,
  uniform,
  uv,
  uvec2,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { fbm3, ridged3 } from '../core/NoiseJS';
import type { WorldContext } from './Scenes';
import { fbm2 } from '../gpu/noise/NoiseTSL';

const CONE_COUNT = 8192;
const TEX_SIZE = 512;

export async function buildSanityScene(ctx: WorldContext): Promise<void> {
  const { engine, seed } = ctx;
  const { scene, renderer } = engine;

  ctx.progress(0.3, 'sanity: compute instance buffers');

  // --- 1. GPU-computed instances -------------------------------------------
  const posBuf = instancedArray(CONE_COUNT, 'vec4'); // xyz = offset, w = scale
  const colBuf = instancedArray(CONE_COUNT, 'vec4');
  const seedU = uniform(seed.sub('sanity-cones') % 1000);

  const fillInstances = Fn(() => {
    const i = instanceIndex;
    const fi = float(i);
    const ring = floor(fi.div(640));
    const inRing = fract(fi.div(640)).mul(Math.PI * 2);
    const h1 = hash(i.add(seedU));
    const h2 = hash(i.add(seedU).add(91283));
    const h3 = hash(i.add(seedU).add(58213));
    const ang = inRing.add(ring.mul(0.43));
    const rad = ring.mul(9).add(14).add(h1.mul(7));
    const x = cos(ang).mul(rad);
    const z = sin(ang).mul(rad);
    const s = h2.mul(h2).mul(2.2).add(0.35);
    posBuf.element(i).assign(vec4(x, 0, z, s));
    // green→amber procedural palette with value jitter
    const hue = h3;
    const col = mix(vec3(0.18, 0.34, 0.16), vec3(0.55, 0.42, 0.18), hue);
    colBuf.element(i).assign(vec4(col.mul(h1.mul(0.5).add(0.6)), 1));
  })().compute(CONE_COUNT);

  await renderer.computeAsync(fillInstances);

  ctx.progress(0.45, 'sanity: synthesize ground texture');

  // --- 2. compute-written storage texture ----------------------------------
  const groundTex = new StorageTexture(TEX_SIZE, TEX_SIZE);
  const writeGround = Fn(() => {
    const i = instanceIndex;
    const x = i.mod(TEX_SIZE);
    const y = i.div(TEX_SIZE);
    const p = vec2(float(x), float(y)).div(TEX_SIZE);
    const n = fbm2(p.mul(14), 5);
    const n2 = fbm2(p.mul(47).add(31.7), 4);
    const moss = vec3(0.16, 0.27, 0.12);
    const dirt = vec3(0.36, 0.28, 0.2);
    const col = mix(moss, dirt, n).mul(n2.mul(0.35).add(0.75));
    textureStore(groundTex, uvec2(x, y), vec4(col, 1)).toWriteOnly();
  })().compute(TEX_SIZE * TEX_SIZE);

  await renderer.computeAsync(writeGround);

  ctx.progress(0.6, 'sanity: build meshes');

  // --- 3. ground with TSL displacement -------------------------------------
  const groundGeo = new PlaneGeometry(420, 420, 220, 220);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new MeshStandardNodeMaterial();
  groundMat.colorNode = texture(groundTex, uv().mul(6).fract());
  const wxz = positionLocal.xz;
  groundMat.positionNode = positionLocal.add(
    vec3(0, fbm2(wxz.mul(0.015), 4).mul(7).sub(3.5), 0),
  );
  groundMat.roughnessNode = float(0.95);
  const ground = new Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // --- instanced cones (GPU transforms) -------------------------------------
  const coneGeo = new IcosahedronGeometry(1, 2);
  coneGeo.scale(0.7, 1.6, 0.7);
  coneGeo.translate(0, 1.3, 0);
  const coneMat = new MeshStandardNodeMaterial();
  const inst = posBuf.element(instanceIndex);
  coneMat.positionNode = positionLocal.mul(inst.w).add(inst.xyz);
  coneMat.colorNode = varying(colBuf.element(instanceIndex));
  coneMat.roughnessNode = float(0.85);
  const cones = new InstancedMesh(coneGeo, coneMat, CONE_COUNT);
  cones.castShadow = true;
  cones.receiveShadow = true;
  cones.frustumCulled = false;
  scene.add(cones);

  // --- 4. CPU procedural rock ----------------------------------------------
  const rockGeo = new IcosahedronGeometry(6, 40);
  const rockSeed = seed.sub('sanity-rock');
  const pos = rockGeo.attributes['position'];
  if (!pos) throw new Error('rock geometry missing position attribute');
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const dir = v.clone().normalize();
    const r =
      6 *
      (1 +
        0.42 * ridged3(dir.x * 1.9, dir.y * 1.9, dir.z * 1.9, rockSeed, 5) +
        0.16 * fbm3(dir.x * 6, dir.y * 6, dir.z * 6, rockSeed ^ 0x5bd1, 5));
    v.copy(dir.multiplyScalar(r));
    pos.setXYZ(i, v.x, v.y * 0.82, v.z);
  }
  rockGeo.computeVertexNormals();
  const rockMat = new MeshStandardNodeMaterial();
  rockMat.colorNode = vec3(0.42, 0.4, 0.38);
  rockMat.roughnessNode = float(0.9);
  const rock = new Mesh(rockGeo, rockMat);
  rock.position.set(0, 1.5, 0);
  rock.castShadow = true;
  rock.receiveShadow = true;
  scene.add(rock);

  // --- 5. lights -------------------------------------------------------------
  const sun = new DirectionalLight(0xfff2dd, 3.2);
  sun.position.set(120, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(new HemisphereLight(0xa8c8e8, 0x4a4438, 0.55));

  engine.camera.position.set(34, 16, 42);
  engine.camera.lookAt(0, 4, 0);

  engine.stats.counters['instances.cones'] = CONE_COUNT;
  ctx.progress(0.9, 'sanity: done');
}
