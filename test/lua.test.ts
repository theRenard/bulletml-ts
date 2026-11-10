import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { createRunner, parseBulletML, toLua, type Runner } from "../src/index.js";

const fengari = createRequire(import.meta.url)("fengari");
const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

const FRAMES = 300;
const target = { x: 30, y: 250 };

function runLua(code: string, harness: string): string {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(code + "\n" + harness));
  if (status !== 0) throw new Error("Lua error: " + to_jsstring(lua.lua_tostring(L, -1)));
  lua.lua_getglobal(L, to_luastring("OUT"));
  return to_jsstring(lua.lua_tostring(L, -1));
}

const HARNESS = `
local seed = 7
bml.rand = function() seed = (seed * 1664525 + 1013904223) % 4294967296 return seed / 4294967296 end
local bullets, frames = {}, {}
local frame = 0
local e = bml.new("p", 100, 50, {rank = 0.5, target = {x = ${target.x}, y = ${target.y}},
  on_fire = function(b) bullets[#bullets+1] = b frames[#frames+1] = frame end})
for f = 0, ${FRAMES - 1} do
  frame = f
  bml.update(e)
  for i = 1, #bullets do bml.update(bullets[i]) end
end
local out = {}
for i = 1, #bullets do out[#bullets and i] = frames[i] .. " " .. bullets[i].x .. " " .. bullets[i].y end
OUT = table.concat(out, "\\n")
`;

function runTs(xml: string): { frame: number; x: number; y: number }[] {
  let seed = 7;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const list: { r: Runner; frame: number }[] = [];
  let frame = 0;
  const e = createRunner(parseBulletML(xml), { rank: 0.5, target, random, onFire: (r) => list.push({ r, frame }) });
  e.x = 100; e.y = 50;
  for (; frame < FRAMES; frame++) { e.update(); list.forEach(({ r }) => r.update()); }
  return list.map(({ r, frame }) => ({ frame, x: r.x, y: r.y }));
}

describe("Lua export", () => {
  const dir = new URL("../examples/", import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".xml"))) {
    it(`${f}: generated Lua matches the JS runner`, () => {
      const xml = readFileSync(new URL(f, dir), "utf8");
      const expected = runTs(xml);
      const got = runLua(toLua(parseBulletML(xml), { name: "p" }), HARNESS)
        .split("\n").filter(Boolean).map((l) => l.split(" ").map(Number) as [number, number, number]);
      expect(got.length).toBe(expected.length);
      expect(got.length).toBeGreaterThan(0);
      expected.forEach((p, i) => {
        expect(got[i]![0], `bullet ${i} frame`).toBe(p.frame);
        expect(got[i]![1]).toBeCloseTo(p.x, 4);
        expect(got[i]![2]).toBeCloseTo(p.y, 4);
      });
    });
  }

  // Emulates the PICO-8 functions the runtime relies on, including its upside-down sin and atan2.
  const PICO8_SHIMS = `
local TAU = math.pi * 2
function cos(a) return math.cos(a * TAU) end
function sin(a) return -math.sin(a * TAU) end
function atan2(dx, dy) return (math.atan(-dy, dx) / TAU) % 1 end
flr = math.floor
rnd = function() return 0.5 end
cocreate, coresume, costatus, yield = coroutine.create, coroutine.resume, coroutine.status, coroutine.yield
`;
  for (const f of ["02-ring.xml", "04-nway-fan.xml", "07-curving.xml", "08-splitting.xml", "10-gravity.xml"]) {
    it(`${f}: pico8 target behaves like the JS runner (with PICO-8 trig conventions)`, () => {
      const xml = readFileSync(new URL(f, dir), "utf8");
      const expected = runTs(xml);
      const got = runLua(PICO8_SHIMS + toLua(parseBulletML(xml), { target: "pico8", name: "p" }), HARNESS)
        .split("\n").filter(Boolean).map((l) => l.split(" ").map(Number) as [number, number, number]);
      expect(got.length).toBe(expected.length);
      expected.forEach((p, i) => {
        expect(got[i]![1]).toBeCloseTo(p.x, 3);
        expect(got[i]![2]).toBeCloseTo(p.y, 3);
      });
    });
  }

  it("pico8 target avoids non-PICO-8 API", () => {
    const code = toLua(parseBulletML(readFileSync(new URL("04-nway-fan.xml", dir), "utf8")), { target: "pico8" });
    expect(code).not.toMatch(/math\.|coroutine\.|ipairs|\bgoto\b|\/\//);
    expect(code).toContain("cocreate");
  });

  it("reports undefined variables at compile time", () => {
    const d = parseBulletML(`<bulletml><action label="top"><fire><speed>$nope</speed><bullet/></fire></action></bulletml>`);
    expect(() => toLua(d)).toThrow(/undefined variable \$nope/);
  });
});
