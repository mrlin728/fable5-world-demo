/** Dump full CSM runtime state (per-cascade light/camera/matrix) at a given T. */
import { launchWebGPU, laasUrl } from './launch';

async function main(): Promise<void> {
  const T = process.argv[2] ?? '11';
  const { browser } = await launchWebGPU();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[page:err] ${msg.text()}`);
  });
  await page.goto(
    laasUrl({
      scene: 'terrain',
      T: Number(T),
      extra: { x: '-380', z: '600', alt: '14', yaw: '0.8', pitch: '-0.12' },
    }),
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(
    () => window.__laas && (window.__laas.ready || window.__laas.error !== null),
    undefined,
    { timeout: 240000, polling: 250 },
  );
  await page.evaluate(async () => window.__laas.settle && (await window.__laas.settle(30)));
  const state = await page.evaluate(() => {
    interface Cam3 {
      left: number; right: number; top: number; bottom: number;
      near: number; far: number;
      position: { x: number; y: number; z: number };
      matrixWorldOk: boolean;
    }
    interface Casc {
      lightPos: number[]; targetPos: number[]; parent: string | null;
      cam: Cam3 | null; shadowMatrix: number[] | null;
      mapSize: number[]; bias: number; normalBias: number; radius: number;
      intensity: number | undefined; castShadow: boolean | undefined;
    }
    const dbg = (window as unknown as {
      __laasDbg?: {
        engine?: {
          camera?: {
            near: number; far: number; fov: number;
            position: { x: number; y: number; z: number };
            uuid: string;
          };
        };
        sunSky?: {
          sun?: {
            position: { x: number; y: number; z: number };
            target: { position: { x: number; y: number; z: number } };
            intensity: number;
          };
          timeOfDay?: number;
        };
        shadowRig?: { csm?: unknown };
      };
    }).__laasDbg;
    const csm = dbg?.shadowRig?.csm as {
      camera: { uuid: string; near: number; far: number } | null;
      breaks: number[];
      maxFar: number;
      lightMargin: number;
      fade: boolean;
      _cascades: { x: number; y: number }[];
      lights: {
        position: { x: number; y: number; z: number; toArray(): number[] };
        target: { position: { toArray(): number[] } };
        parent: { type: string } | null;
        castShadow?: boolean;
        intensity?: number;
        shadow: {
          bias: number; normalBias: number; radius: number;
          mapSize: { x: number; y: number };
          matrix: { elements: number[] };
          camera: {
            left: number; right: number; top: number; bottom: number;
            near: number; far: number;
            position: { x: number; y: number; z: number };
            matrixWorld: { elements: number[] };
          };
        };
      }[];
    } | undefined;
    if (!csm) return { error: 'no csm' };
    const cascades: Casc[] = csm.lights.map((lw) => {
      const sc = lw.shadow.camera;
      const mw = sc.matrixWorld.elements;
      return {
        lightPos: lw.position.toArray().map((v: number) => Math.round(v * 10) / 10),
        targetPos: lw.target.position.toArray().map((v: number) => Math.round(v * 10) / 10),
        parent: lw.parent ? lw.parent.type : null,
        cam: {
          left: sc.left, right: sc.right, top: sc.top, bottom: sc.bottom,
          near: sc.near, far: sc.far,
          position: { x: Math.round(sc.position.x), y: Math.round(sc.position.y), z: Math.round(sc.position.z) },
          matrixWorldOk: mw.every((e: number) => Number.isFinite(e)),
        },
        shadowMatrix: lw.shadow.matrix.elements.map((e: number) => Math.round(e * 1e4) / 1e4),
        mapSize: [lw.shadow.mapSize.x, lw.shadow.mapSize.y],
        bias: lw.shadow.bias, normalBias: lw.shadow.normalBias, radius: lw.shadow.radius,
        intensity: lw.intensity, castShadow: lw.castShadow,
      };
    });
    return {
      T: dbg?.sunSky?.timeOfDay,
      sun: {
        pos: dbg?.sunSky?.sun?.position,
        target: dbg?.sunSky?.sun?.target.position,
        intensity: dbg?.sunSky?.sun?.intensity,
      },
      mainCam: dbg?.engine?.camera
        ? {
            near: dbg.engine.camera.near,
            far: dbg.engine.camera.far,
            pos: dbg.engine.camera.position,
            uuid: dbg.engine.camera.uuid.slice(0, 8),
          }
        : null,
      csmCamera: csm.camera ? `${csm.camera.uuid.slice(0, 8)} near=${csm.camera.near} far=${csm.camera.far}` : null,
      breaks: csm.breaks,
      cascadeRanges: csm._cascades.map((c) => [c.x, c.y]),
      maxFar: csm.maxFar,
      lightMargin: csm.lightMargin,
      fade: csm.fade,
      cascades,
    };
  });
  console.log(JSON.stringify(state, null, 1));
  await browser.close();
}
void main();
