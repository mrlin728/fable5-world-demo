/**
 * ?scene=shadowtest — minimal shadow repro: ground plane + boxes + one
 * DirectionalLight. NO post stack, NO atmosphere, NO GI by default. Switches:
 *   ?csm=1 (default) routes through setupSunShadows (CSMShadowNode + PCSS)
 *   ?csm=0 plain DirectionalLight shadow (three defaults)
 *   ?sunsky=1 use the SunSky rig's DirectionalLight instead of a local one
 *   ?post=1 wrap rendering in the PostStack (requires sunsky=1)
 * Binary-searches which layer of the real pipeline eats the shadows.
 */

import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { positionLocal, vec3 } from 'three/tsl';
import { setupSunShadows } from '../render/ShadowSetup';
import { PostStack } from '../render/PostStack';
import { SunSky } from '../sky/SunSky';
import type { WorldContext } from './Scenes';

export async function buildShadowTestScene(ctx: WorldContext): Promise<void> {
  const { engine, params } = ctx;
  const q = new URLSearchParams(window.location.search);
  const useCsm = q.get('csm') !== '0';
  const useSunSky = q.get('sunsky') === '1';
  const usePost = q.get('post') === '1';

  const ground = new Mesh(
    new PlaneGeometry(400, 400),
    new MeshStandardMaterial({ color: 0x88aa66 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  engine.scene.add(ground);

  for (let i = 0; i < 8; i++) {
    const h = 2 + (i % 4) * 2;
    const box = new Mesh(
      new BoxGeometry(2, h, 2),
      new MeshStandardMaterial({ color: 0xaa7755 }),
    );
    box.position.set(-30 + i * 9, h / 2, -10 + (i % 3) * 12);
    box.castShadow = true;
    box.receiveShadow = true;
    engine.scene.add(box);
  }

  // custom-positionNode caster (the world's veg/terrain-proxy pattern):
  // geometry at origin, lifted/offset in the vertex stage; the shadow pass
  // must use castShadowPositionNode or this casts at the wrong place/not at all
  const nm = new MeshStandardNodeMaterial();
  nm.color.set(0x4477cc);
  const lifted = positionLocal.add(vec3(0, 8, 12));
  nm.positionNode = lifted;
  (nm as unknown as { castShadowPositionNode: unknown }).castShadowPositionNode = lifted;
  const nbox = new Mesh(new BoxGeometry(6, 16, 6), nm);
  nbox.frustumCulled = false;
  nbox.castShadow = true;
  nbox.receiveShadow = true;
  engine.scene.add(nbox);

  // control: vanilla node material, NO custom nodes — separates "node
  // materials don't render here" from "positionNode breaks rendering"
  const nm2 = new MeshStandardNodeMaterial();
  nm2.color.set(0xcc44cc);
  const nbox2 = new Mesh(new BoxGeometry(3, 10, 3), nm2);
  nbox2.position.set(-12, 5, 14);
  nbox2.frustumCulled = false;
  nbox2.castShadow = true;
  nbox2.receiveShadow = true;
  engine.scene.add(nbox2);

  // control 2: node material WITH a colorNode graph (the veg pattern)
  const nm3 = new MeshStandardNodeMaterial();
  nm3.colorNode = vec3(0.9, 0.75, 0.1);
  const nbox3 = new Mesh(new BoxGeometry(3, 12, 3), nm3);
  nbox3.position.set(-22, 6, 20);
  nbox3.frustumCulled = false;
  nbox3.castShadow = true;
  nbox3.receiveShadow = true;
  engine.scene.add(nbox3);

  // control 3: positionNode WITHOUT castShadowPositionNode — does the
  // shadow pass fall back to the (origin-located) geometry or vanish?
  const nm4 = new MeshStandardNodeMaterial();
  nm4.colorNode = vec3(0.1, 0.8, 0.8);
  nm4.positionNode = positionLocal.add(vec3(10, 6, -8));
  const nbox4 = new Mesh(new BoxGeometry(3, 12, 3), nm4);
  nbox4.frustumCulled = false;
  nbox4.castShadow = true;
  nbox4.receiveShadow = true;
  engine.scene.add(nbox4);

  let sun: DirectionalLight;
  let sunSky: SunSky | null = null;
  if (useSunSky) {
    sunSky = new SunSky(engine, params.timeOfDay);
    await sunSky.init(engine.renderer);
    sun = sunSky.sun;
  } else {
    sun = new DirectionalLight(0xffffff, 3);
    // shadows fall toward +x/+z — TOWARD the default camera, never hidden
    // behind the casters themselves
    sun.position.set(-120, 180, -80);
    engine.scene.add(sun);
    engine.scene.add(sun.target);
    engine.scene.add(new AmbientLight(0x668899, 0.5));
  }

  if (useCsm) {
    setupSunShadows(sun, engine.camera);
  } else {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 600;
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
  }

  if (usePost && sunSky) {
    engine.post = new PostStack(engine, sunSky.atmosphere, params.timeOfDay, null);
  }

  engine.camera.position.set(30, 25, 55);
  engine.camera.lookAt(0, 0, 0);
  // FlyCamera owns orientation after boot — without this the lookAt above
  // is discarded and the framing is luck
  ctx.hooks.initialPose = { p: [30, 25, 55], yaw: -0.5, pitch: -0.38 };
  ctx.progress(1, 'shadowtest ready');
}
