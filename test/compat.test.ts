// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createRunner, parseBulletML, type Runner } from "../src/index.js";

const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

// Load the original library (a browser-style script) in Node.
(globalThis as any).DOMParser = new JSDOM("").window.DOMParser;
const orig: any = createRequire(import.meta.url)("./compat/bulletml.orig.cjs");

type Snap = { x: number; y: number; frame: number }[];
const FRAMES = 300;
const target = { x: 30, y: 250 };
const emitter = { x: 100, y: 50 };

function runOrig(xml: string, rank: number, seed: number): Snap {
  orig.Walker.random = seeded(seed);
  // The original ignores `rank` from the config; patterns only see `$rank` through this global.
  orig.Walker.globalScope = { $rank: rank };
  const root = orig.buildXML(xml);
  const bullets: { r: any; frame: number }[] = [];
  let frame = 0;
  const r = root.createRunner({ rank, target, createNewBullet: (b: any) => {
    // The original keeps moving a vanished bullet and leaves removal to the host; bulletml-ts stops it.
    b.onVanish = () => { b.stop = true; };
    bullets.push({ r: b, frame });
  } });
  r.x = emitter.x; r.y = emitter.y;
  for (; frame < FRAMES; frame++) { r.update(); bullets.forEach((b) => b.r.update()); }
  return bullets.map((b) => ({ x: b.r.x, y: b.r.y, frame: b.frame }));
}

function runNew(xml: string, rank: number, seed: number): Snap {
  const bullets: { r: Runner; frame: number }[] = [];
  let frame = 0;
  const r = createRunner(parseBulletML(xml), { rank, target, random: seeded(seed), onFire: (b) => bullets.push({ r: b, frame }) });
  r.x = emitter.x; r.y = emitter.y;
  for (; frame < FRAMES; frame++) { r.update(); bullets.forEach((b) => b.r.update()); }
  return bullets.map((b) => ({ x: b.r.x, y: b.r.y, frame: b.frame }));
}

describe("compatibility with bulletml.js 0.5.4", () => {
  const dir = new URL("../examples/", import.meta.url);
  // 10-gravity uses accel type="sequence", which the original treats like "absolute" (a spec deviation we fixed).
  const known = new Set(["10-gravity.xml"]);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".xml"))) {
    it.skipIf(known.has(f))(`${f} matches`, () => {
      const xml = readFileSync(new URL(f, dir), "utf8");
      const a = runOrig(xml, 0.5, 7);
      const b = runNew(xml, 0.5, 7);
      expect(b.length).toBe(a.length);
      expect(b.length).toBeGreaterThan(0);
      b.forEach((p, i) => {
        expect(p.frame, `bullet ${i} frame`).toBe(a[i]!.frame);
        expect(p.x).toBeCloseTo(a[i]!.x, 6);
        expect(p.y).toBeCloseTo(a[i]!.y, 6);
      });
    });
  }
});
