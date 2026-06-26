/**
 * Pixel-difference tool for motion/ablate A/B checks: writes |a−b| amplified
 * (default ×4) and prints the fraction of pixels whose max-channel delta
 * exceeds a threshold (default 12/255), plus the mean delta.
 *
 *   npx tsx tools/diff.ts --a x.png --b y.png --out d.png [--amp 4] [--thr 12]
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';

function arg(k: string, d: string): string {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? (process.argv[i + 1] ?? d) : d;
}

async function main(): Promise<void> {
  const aPath = arg('a', '');
  const bPath = arg('b', '');
  const out = arg('out', '');
  const amp = Number(arg('amp', '4'));
  const thr = Number(arg('thr', '12'));
  if (!aPath || !bPath) throw new Error('--a and --b are required');

  const a = await sharp(aPath).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(bPath).raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    throw new Error(
      `size mismatch: ${a.info.width}x${a.info.height} vs ${b.info.width}x${b.info.height}`,
    );
  }
  const ch = a.info.channels;
  const n = a.info.width * a.info.height;
  const d = Buffer.alloc(n * 3);
  let changed = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let c = 0; c < Math.min(ch, 3); c++) {
      const dv = Math.abs((a.data[i * ch + c] ?? 0) - (b.data[i * ch + c] ?? 0));
      d[i * 3 + c] = Math.min(255, dv * amp);
      if (dv > m) m = dv;
    }
    sum += m;
    if (m > thr) changed++;
  }
  console.log(
    `changed ${((changed / n) * 100).toFixed(2)}% of pixels (>|${thr}|), mean max-channel delta ${(sum / n).toFixed(2)}`,
  );
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    await sharp(d, {
      raw: { width: a.info.width, height: a.info.height, channels: 3 },
    })
      .png()
      .toFile(out);
    console.log(`wrote ${out}`);
  }
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
