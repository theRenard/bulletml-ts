// Usage: npm run build && npm run bench
import { readFileSync } from "node:fs";
import { createRunner, parseBulletML } from "../dist/index.js";

const xml = readFileSync(new URL("../examples/02-ring.xml", import.meta.url), "utf8");
const doc = parseBulletML(xml);
const FRAMES = 1200;

let bullets = [];
const r = createRunner(doc, { target: { x: 0, y: 300 }, onFire: (b) => bullets.push(b) });
let peak = 0, updates = 0;
const t0 = performance.now();
for (let f = 0; f < FRAMES; f++) {
  r.update();
  let w = 0;
  for (const b of bullets) {
    b.update(); updates++;
    if (b.x > -50 && b.x < 600 && b.y > -50 && b.y < 800) bullets[w++] = b;
  }
  bullets.length = w;
  peak = Math.max(peak, w);
}
const ms = performance.now() - t0;
console.log(`${FRAMES} frames, peak ${peak} live bullets, ${updates} bullet updates in ${ms.toFixed(1)} ms`);
console.log(`${(updates / ms / 1000).toFixed(2)} M bullet updates/s, ${(ms / FRAMES).toFixed(3)} ms/frame`);
