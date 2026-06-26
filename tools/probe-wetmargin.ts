/**
 * Wetland-margin wetness-pattern probe: samples the CPU ground/water
 * mirrors on a fine grid over a rectangle and reports wet fraction,
 * isolated-wet-texel count (wet with ≥6 of 8 dry neighbors), and the
 * wet-vs-dry waterY contrast — the precondition for clipmap "tent" shards
 * (a lone wet texel hoisting a coarse vertex). String evaluate: esbuild
 * __name trap.
 *
 * Run: npx tsx tools/probe-wetmargin.ts --x0 -450 --x1 -150 --z0 1150 --z1 1320
 */

import { launchWebGPU, laasUrl } from './launch';

interface LaasWindow {
  __laas?: { ready?: boolean };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (k: string, d: number): number => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? Number(argv[i + 1]) : d;
  };
  const x0 = arg('x0', -450);
  const x1 = arg('x1', -150);
  const z0 = arg('z0', 1150);
  const z1 = arg('z1', 1320);
  const step = arg('step', 2);

  const { browser } = await launchWebGPU();
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    await page.goto(laasUrl({ scene: 'world', hud: false }), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => (window as LaasWindow).__laas?.ready === true, undefined, {
      timeout: 240_000,
    });

    // --transect: profile along a ray (ox,oz)+(dx,dz)·t — prints W/ground
    // transitions and any adjacent-sample W jump > 0.6 m ("walls")
    if (argv.includes('--transect')) {
      const ox = arg('ox', 11);
      const oz = arg('oz', 1338);
      const yaw = arg('yaw', 1.2);
      const t0 = arg('t0', 100);
      const t1 = arg('t1', 560);
      const out = String(
        await page.evaluate(`(() => {
          const gp = window.__laas.groundProbe;
          const dx = -Math.sin(${yaw}), dz = -Math.cos(${yaw});
          const rows = [];
          let prev = null;
          for (let t = ${t0}; t <= ${t1}; t += 2) {
            const x = ${ox} + dx * t, z = ${oz} + dz * t;
            const g = gp(x, z);
            const wet = g.water > g.ground + 0.02;
            const jump = prev !== null ? Math.abs(g.water - prev) : 0;
            if (jump > 0.6 || t % 40 === 0 || rows.length === 0) {
              rows.push(t.toFixed(0) + 'm (' + x.toFixed(0) + ',' + z.toFixed(0) + ') gnd '
                + g.ground.toFixed(2) + ' W ' + g.water.toFixed(2) + (wet ? ' WET' : ' dry')
                + (jump > 0.6 ? '  <-- W JUMP ' + jump.toFixed(2) : ''));
            }
            prev = g.water;
          }
          return rows.join('\\n');
        })()`),
      );
      console.log(out);
      return;
    }

    const json = String(
      await page.evaluate(`(() => {
        const gp = window.__laas.groundProbe;
        const X0 = ${x0}, X1 = ${x1}, Z0 = ${z0}, Z1 = ${z1}, S = ${step};
        const nx = Math.floor((X1 - X0) / S), nz = Math.floor((Z1 - Z0) / S);
        const wet = [], wY = [], gY = [];
        for (let iz = 0; iz < nz; iz++) {
          for (let ix = 0; ix < nx; ix++) {
            const g = gp(X0 + ix * S, Z0 + iz * S);
            wet.push(g.water > g.ground + 0.02 ? 1 : 0);
            wY.push(g.water); gY.push(g.ground);
          }
        }
        let wetN = 0, isolated = 0, contrastMax = 0, contrastSum = 0, cN = 0;
        for (let iz = 1; iz < nz - 1; iz++) {
          for (let ix = 1; ix < nx - 1; ix++) {
            const i = iz * nx + ix;
            if (!wet[i]) continue;
            wetN++;
            let dry = 0, dryMinW = 1e9;
            for (const [dx, dz] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]) {
              const j = (iz + dz) * nx + (ix + dx);
              if (!wet[j]) { dry++; dryMinW = Math.min(dryMinW, wY[j]); }
            }
            if (dry >= 6) {
              isolated++;
              const c = wY[i] - dryMinW;
              contrastMax = Math.max(contrastMax, c); contrastSum += c; cN++;
            }
          }
        }
        return JSON.stringify({
          cells: nx * nz, wetN, wetFrac: wetN / (nx * nz), isolated,
          contrastAvg: cN ? contrastSum / cN : 0, contrastMax,
        });
      })()`),
    );
    console.log(json);
  } finally {
    await browser.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
