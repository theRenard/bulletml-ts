import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRunner, evaluate, parseBulletML, type Runner } from "../src/index.js";

const seeded = (seed = 1) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

function collect(xml: string, frames: number, opts: Parameters<typeof createRunner>[1] = {}) {
  const bullets: { frame: number; b: Runner }[] = [];
  let frame = 0;
  const r = createRunner(parseBulletML(xml), { random: seeded(), ...opts, onFire: (b) => bullets.push({ frame, b }) });
  for (; frame < frames; frame++) { r.update(); bullets.forEach(({ b }) => b.update()); }
  return { runner: r, bullets };
}

const doc = (body: string) => `<bulletml>${body}</bulletml>`;
const deg = (r: number) => Math.round(((r * 180) / Math.PI) * 1000) / 1000;

describe("expression", () => {
  const scope = { vars: { $1: 4, $rank: 0.5, "$loop.index": 2 }, rand: () => 0.25 };
  it("evaluates arithmetic with precedence", () => {
    expect(evaluate("1+2*3", scope)).toBe(7);
    expect(evaluate("(1+2)*3", scope)).toBe(9);
    expect(evaluate("-$1/2", scope)).toBe(-2);
    expect(evaluate("10%4", scope)).toBe(2);
  });
  it("reads variables", () => {
    expect(evaluate("$1*$rank+$loop.index", scope)).toBe(4);
    expect(evaluate("$rand*8", scope)).toBe(2);
  });
  it("rejects garbage instead of executing it", () => {
    expect(() => evaluate("alert(1)", scope)).toThrow();
    expect(() => evaluate("$nope", scope)).toThrow(/Undefined/);
    expect(() => evaluate("1+", scope)).toThrow();
  });
});

describe("parser", () => {
  it("parses structure and orientation", () => {
    const d = parseBulletML(`<?xml version="1.0"?><!DOCTYPE bulletml SYSTEM "x.dtd"><bulletml type="horizontal">
      <action label="top"><fire><direction type="absolute">90</direction><bullet/></fire></action></bulletml>`);
    expect(d.orientation).toBe("horizontal");
    expect(d.actions[0]?.commands[0]).toMatchObject({ type: "fire", direction: { kind: "absolute", value: "90" } });
  });
  it("reports errors", () => {
    expect(() => parseBulletML("<foo/>")).toThrow(/bulletml/);
    expect(() => parseBulletML("<bulletml><action>")).toThrow(/not closed/);
    expect(() => parseBulletML(doc(`<action label="top"><fire/></action>`))).toThrow(/no <bullet>/);
    expect(() => parseBulletML(doc(`<action label="top"><fire><direction type="bogus">1</direction><bullet/></fire></action>`))).toThrow(/invalid type/);
  });
});

describe("runner", () => {
  it("fires absolute directions (0 = up) and respects horizontal", () => {
    const x = `<action label="top"><fire><direction type="absolute">90</direction><speed>2</speed><bullet/></fire></action>`;
    expect(deg(collect(doc(x), 1).bullets[0]!.b.direction)).toBe(0);
    expect(deg(collect(`<bulletml type="horizontal">${x}</bulletml>`, 1).bullets[0]!.b.direction)).toBe(90);
  });
  it("aims at the target", () => {
    const { bullets } = collect(
      doc(`<action label="top"><fire><direction type="aim">0</direction><bullet/></fire></action>`),
      1, { target: { x: 0, y: 10 } },
    );
    expect(deg(bullets[0]!.b.direction)).toBe(90); // straight down on screen
  });
  it("waits the right number of frames", () => {
    const { bullets } = collect(
      doc(`<action label="top"><repeat><times>3</times><action><fire><bullet/></fire><wait>10</wait></action></repeat></action>`),
      100,
    );
    expect(bullets.map((b) => b.frame)).toEqual([0, 10, 20]);
  });
  it("repeats, sequences direction and exposes $loop.index", () => {
    const { bullets } = collect(
      doc(`<action label="top"><fire><direction type="absolute">0</direction><bullet/></fire>
        <repeat><times>3</times><action><fire><direction type="sequence">10</direction><bullet/></fire></action></repeat></action>`),
      1,
    );
    expect(bullets.map((b) => deg(b.b.direction + Math.PI / 2))).toEqual([0, 10, 20, 30]);
    const idx = collect(
      doc(`<action label="top"><repeat><times>3</times><action><fire><speed>$loop.index+1</speed><bullet/></fire></action></repeat></action>`), 1,
    );
    expect(idx.bullets.map((b) => b.b.speed)).toEqual([1, 2, 3]);
  });
  it("passes params to actionRef and bulletRef", () => {
    const { bullets } = collect(
      doc(`<action label="top"><actionRef label="a"><param>3</param></actionRef></action>
        <action label="a"><fire><speed>$1*2</speed><bulletRef label="b"><param>$1+1</param></bulletRef></fire></action>
        <bullet label="b"><action><changeSpeed><speed>$1</speed><term>1</term></changeSpeed></action></bullet>`),
      3,
    );
    expect(bullets[0]!.b.speed).toBe(4); // overridden by bullet action using $1 = 3+1
  });
  it("uses $rank", () => {
    const x = doc(`<action label="top"><fire><speed>1+$rank</speed><bullet/></fire></action>`);
    expect(collect(x, 1, { rank: 0.5 }).bullets[0]!.b.speed).toBe(1.5);
  });
  it("changeSpeed ramps linearly and lands exactly", () => {
    const { runner } = collect(
      doc(`<action label="top"><changeSpeed><speed>10</speed><term>10</term></changeSpeed><wait>100</wait></action>`), 20,
    );
    expect(runner.speed).toBe(10);
  });
  it("vanish stops the runner and notifies", () => {
    let vanished = 0;
    const { runner } = collect(doc(`<action label="top"><wait>2</wait><vanish/></action>`), 10, { onVanish: () => vanished++ });
    expect(runner.vanished).toBe(true);
    expect(vanished).toBe(1);
  });
  it("is deterministic with a seeded random", () => {
    const x = doc(`<action label="top"><repeat><times>5</times><action><fire><direction type="absolute">$rand*360</direction><bullet/></fire></action></repeat></action>`);
    const a = collect(x, 1).bullets.map((b) => b.b.direction);
    const b = collect(x, 1).bullets.map((b) => b.b.direction);
    expect(a).toEqual(b);
  });
  it("throws without a top action", () => {
    expect(() => createRunner(parseBulletML(doc(`<action label="x"/>`)))).toThrow(/top/);
  });
});

describe("examples", () => {
  const dir = new URL("../examples/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".xml"))) {
    it(`${f} parses and runs 600 frames`, () => {
      const { bullets } = collect(readFileSync(new URL(f, dir), "utf8"), 600, { target: { x: 0, y: 200 } });
      expect(bullets.length).toBeGreaterThan(5);
      for (const { b } of bullets) {
        expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
      }
    });
  }
});

describe("builder", () => {
  it("builds the same document the runner can execute", async () => {
    const b = await import("../src/index.js");
    const d = b.bulletml([
      b.action("top", [b.repeat(3, b.action([b.fire(b.absolute(0), 2), b.wait(5)]))]),
    ]);
    const bullets: Runner[] = [];
    const r = createRunner(d, { onFire: (x) => bullets.push(x) });
    for (let i = 0; i < 20; i++) r.update();
    expect(bullets).toHaveLength(3);
    expect(bullets[0]!.speed).toBe(2);
  });
});
