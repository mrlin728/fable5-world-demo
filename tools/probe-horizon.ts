/**
 * Horizon-black repro probe (one boot): places the eye at ground+1.7 m on
 * the walk spawn, sweeps yaw in 45° steps with pitch 0, and scans each
 * capture's center columns for a near-black band around the horizon row.
 * Prints a per-yaw table + an RGB scanline for the worst framing, and
 * saves shots/wip/horizon-yaw*.png. `--cam` overrides the eye position.
 *
 * Run: npx tsx tools/probe-horizon.ts [--T 11] [--extra k=v]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { launchWebGPU, laasUrl } from './launch';

const W = 1280;
const H = 720;
const BLACK = 12; // max(R,G,B) below this = "full black"
const DARK = 30;

interface Scan {
  yaw: number;
  blackRows: number;
  darkRows: number;
  first: number;
  last: number;
  file: string;
}

async function scanBand(png: Buffer): Promise<Omit<Scan, 'yaw' | 'file'>> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  // scan rows around the pitch-0 horizon (h/2), averaged over 9 center columns
  const r0 = Math.floor(H * 0.35);
  const r1 = Math.floor(H * 0.7);
  let blackRows = 0;
  let darkRows = 0;
  let first = -1;
  let last = -1;
  for (let y = r0; y < r1; y++) {
    let m = 0;
    for (let dx = -4; dx <= 4; dx++) {
      const x = Math.floor(W / 2) + dx * 40;
      const o = (y * info.width + x) * ch;
      const px = Math.max(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0);
      m += px;
    }
    m /= 9;
    if (m < BLACK) {
      blackRows++;
      if (first < 0) first = y;
      last = y;
    }
    if (m < DARK) darkRows++;
  }
  return { blackRows, darkRows, first, last };
}

// in-page flat-sightline finder (STRING evaluate — esbuild __name trap):
// dry stand-points whose terrain/water silhouette stays within ~0.11° of
// the eye line for ≥900 m — "open land horizon" framings
const FLATSCAN = `(() => {
  const gp = window.__laas.groundProbe;
  const out = [];
  for (let sx = -1900; sx <= 1900; sx += 150) {
    for (let sz = -1900; sz <= 1900; sz += 150) {
      const g0 = gp(sx, sz);
      if (g0.water > g0.ground - 0.05) continue;
      const eye = g0.ground + 1.7;
      let best = null;
      for (let iy = 0; iy < 16; iy++) {
        const yaw = (iy * Math.PI) / 8;
        const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
        let ok = true, landM = 0, wetM = 0;
        for (let d = 60; d <= 2400; d += 60) {
          const X = sx + dx * d, Z = sz + dz * d;
          if (Math.abs(X) > 1995 || Math.abs(Z) > 1995) break;
          const g = gp(X, Z);
          if (Math.max(g.ground, g.water) > eye + d * 0.002) { ok = false; break; }
          if (g.water > g.ground - 0.05) wetM += 60;
          landM = d;
        }
        if (ok && landM >= 900 && (!best || landM - wetM > best.dry)) {
          best = { yaw, landM, wet: wetM, dry: landM - wetM };
        }
      }
      if (best) out.push({ x: sx, z: sz, eye, yaw: best.yaw, landM: best.landM, wet: best.wet });
    }
  }
  out.sort((a, b) => (b.landM - b.wet) - (a.landM - a.wet));
  return JSON.stringify(out.slice(0, 24));
})()`;

interface FlatSpot {
  x: number;
  z: number;
  eye: number;
  yaw: number;
  landM: number;
  wet: number;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const extra: Record<string, string> = {};
  let T = 11;
  let px: number | null = null;
  let pz: number | null = null;
  let scan = false;
  let poses: string | null = null;
  let yawOne = 0;
  let pitchOne = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--T') T = Number(argv[++i]);
    if (argv[i] === '--x') px = Number(argv[++i]);
    if (argv[i] === '--z') pz = Number(argv[++i]);
    if (argv[i] === '--scan') scan = true;
    if (argv[i] === '--poses') poses = String(argv[++i]);
    if (argv[i] === '--yaw') yawOne = Number(argv[++i]);
    if (argv[i] === '--pitch') pitchOne = Number(argv[++i]);
    if (argv[i] === '--extra') {
      const [k, v] = String(argv[++i]).split('=');
      if (k && v !== undefined) extra[k] = v;
    }
  }

  mkdirSync('shots/wip', { recursive: true });
  const { browser } = await launchWebGPU();
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    page.on('console', (m) => {
      if (m.type() === 'error') console.log(`[page:error] ${m.text()}`);
    });
    await page.goto(laasUrl({ scene: 'world', hud: false, T, extra }), {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => window.__laas && window.__laas.ready === true, undefined, {
      timeout: 240_000,
    });

    // --poses "x,z;x,z;..." --yaw N [--pitch P]: one framing per stand
    // point, eye = ground+1.7, unique filenames (parallel runs of the
    // yaw-sweep mode clobbered each other's horizon-yawN.png once)
    if (poses !== null) {
      for (const pair of poses.split(';')) {
        const [sx, sz] = pair.split(',').map(Number);
        if (sx === undefined || sz === undefined || !Number.isFinite(sx) || !Number.isFinite(sz))
          continue;
        const g = await page.evaluate(
          (q) => window.__laas.groundProbe?.(q[0], q[1]),
          [sx, sz] as [number, number],
        );
        if (!g) throw new Error('no groundProbe hook');
        const ey = Math.max(g.ground, g.water) + 1.7;
        await page.evaluate(
          (p) => window.__laas.setPose?.(p),
          { p: [sx, ey, sz] as [number, number, number], yaw: yawOne, pitch: pitchOne },
        );
        await page.evaluate(async () => {
          if (window.__laas.settle) await window.__laas.settle(24);
        });
        const file = `shots/wip/scout-${sx}_${sz}.png`;
        writeFileSync(file, await page.screenshot());
        console.log(`${file}  cam="${sx},${ey.toFixed(1)},${sz},${yawOne.toFixed(4)},${pitchOne}"`);
      }
      return;
    }

    if (scan) {
      const json = String(await page.evaluate(FLATSCAN));
      const spots = JSON.parse(json) as FlatSpot[];
      console.log(`flat-sightline candidates: ${spots.length}`);
      const picked: FlatSpot[] = [];
      for (const s of spots) {
        if (picked.every((p) => Math.hypot(p.x - s.x, p.z - s.z) >= 400)) picked.push(s);
        if (picked.length >= 6) break;
      }
      for (const s of picked) {
        await page.evaluate(
          (p) => window.__laas.setPose?.(p),
          { p: [s.x, s.eye, s.z] as [number, number, number], yaw: s.yaw, pitch: 0 },
        );
        await page.evaluate(async () => {
          if (window.__laas.settle) await window.__laas.settle(24);
        });
        const png = await page.screenshot();
        const file = `shots/wip/horizon-scan-${s.x}_${s.z}.png`;
        writeFileSync(file, png);
        const b = await scanBand(png);
        console.log(
          `(${String(s.x).padStart(5)},${String(s.z).padStart(5)}) land=${s.landM} wet=${s.wet}` +
            `  black ${String(b.blackRows).padStart(3)}  dark ${String(b.darkRows).padStart(3)}` +
            `  band y=[${b.first},${b.last}]  cam="${s.x},${s.eye.toFixed(1)},${s.z},${s.yaw.toFixed(4)},0"`,
        );
      }
      return;
    }

    const pose = await page.evaluate(() => window.__laas.getPose?.());
    if (!pose) throw new Error('no getPose hook');
    const x = px ?? pose.p[0];
    const z = pz ?? pose.p[2];
    const g = await page.evaluate(
      (q) => window.__laas.groundProbe?.(q[0], q[1]),
      [x, z] as [number, number],
    );
    if (!g) throw new Error('no groundProbe hook');
    const eyeY = g.ground + 1.7;
    console.log(`eye at (${x.toFixed(1)}, ${eyeY.toFixed(1)}, ${z.toFixed(1)})  T=${T}`);

    const scans: Scan[] = [];
    for (let i = 0; i < 8; i++) {
      const yaw = (i * Math.PI) / 4;
      await page.evaluate(
        (p) => window.__laas.setPose?.(p),
        { p: [x, eyeY, z] as [number, number, number], yaw, pitch: 0 },
      );
      await page.evaluate(async () => {
        if (window.__laas.settle) await window.__laas.settle(24);
      });
      const png = await page.screenshot();
      const file = `shots/wip/horizon-yaw${i * 45}.png`;
      writeFileSync(file, png);
      const s = await scanBand(png);
      scans.push({ yaw, file, ...s });
      console.log(
        `yaw ${String(i * 45).padStart(3)}°  black ${String(s.blackRows).padStart(3)} rows` +
          `  dark ${String(s.darkRows).padStart(3)}  band y=[${s.first},${s.last}]` +
          `  cam="${x.toFixed(1)},${eyeY.toFixed(1)},${z.toFixed(1)},${yaw.toFixed(4)},0"`,
      );
    }

    // RGB scanline through the worst band (diagnosis step 1: confirm RGB≈0)
    const worst = scans.reduce((a, b) => (b.blackRows > a.blackRows ? b : a));
    if (worst.blackRows > 0) {
      console.log(`\nscanline (center column) for ${worst.file}:`);
      await page.evaluate(
        (p) => window.__laas.setPose?.(p),
        { p: [x, eyeY, z] as [number, number, number], yaw: worst.yaw, pitch: 0 },
      );
      await page.evaluate(async () => {
        if (window.__laas.settle) await window.__laas.settle(24);
      });
      const png = await page.screenshot();
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      const xC = Math.floor(W / 2);
      for (let y = worst.first - 12; y <= worst.last + 12; y += 4) {
        const o = (y * info.width + xC) * info.channels;
        console.log(
          `  y=${y}  rgb(${data[o]},${data[o + 1]},${data[o + 2]})${
            y >= worst.first && y <= worst.last ? '  <- band' : ''
          }`,
        );
      }
    } else {
      console.log('\nNO black band found at any yaw from this pose.');
    }
  } finally {
    await browser.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
