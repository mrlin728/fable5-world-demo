/** Reproduce moving-camera shadow loss: static settle shot vs mid-motion shot. */
import { launchWebGPU, laasUrl } from './launch';

async function main(): Promise<void> {
  const { browser } = await launchWebGPU();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(
    laasUrl({
      scene: 'terrain',
      T: 16.5,
      extra: { x: '-380', z: '600', alt: '14', yaw: '0.8', pitch: '-0.12' },
    }),
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(
    () => window.__laas && (window.__laas.ready || window.__laas.error !== null),
    undefined,
    { timeout: 240000, polling: 250 },
  );
  await page.evaluate(async () => window.__laas.settle && (await window.__laas.settle(40)));
  await page.screenshot({ path: 'shots/wip/mv-static.png' });
  // glide BACKWARD along the view ray (framing stays put) for 40 frames,
  // no settle, capture mid-motion
  await page.evaluate(async () => {
    const h = window.__laas;
    if (!h.getPose || !h.setPose || !h.settle) return;
    const p0 = h.getPose();
    const bx = Math.sin(p0.yaw);
    const bz = Math.cos(p0.yaw);
    for (let i = 1; i <= 40; i++) {
      h.setPose({
        p: [p0.p[0] + bx * i * 0.55, p0.p[1] + i * 0.1, p0.p[2] + bz * i * 0.55],
        yaw: p0.yaw,
        pitch: p0.pitch,
      });
      await h.settle(1);
    }
  });
  await page.screenshot({ path: 'shots/wip/mv-moving.png' });
  // stop and settle again — do shadows come back?
  await page.evaluate(async () => window.__laas.settle && (await window.__laas.settle(40)));
  await page.screenshot({ path: 'shots/wip/mv-stopped.png' });
  await browser.close();
  console.log('wrote mv-static / mv-moving / mv-stopped');
}
void main();
