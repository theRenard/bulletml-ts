import { parseExpression, type Node } from "./expression.js";
import type { Action, ActionRef, Bullet, BulletML, BulletRef, Command, Direction, Expr, Fire, Speed } from "./types.js";

export interface LuaOptions {
  /**
   * `pico8` emits code that only uses PICO-8 API (`cos`, `atan2`, `rnd`, `cocreate`...) and PICO-8-safe syntax.
   * `lua` targets plain Lua 5.1+/LuaJIT (LÖVE, Defold, ...). Default `lua`.
   */
  target?: "lua" | "pico8";
  /** Name the pattern is registered under: `bml.new("name", x, y)`. Default `pattern`. */
  name?: string;
  /** Include the small runtime (`bml.new`, `bml.update`, ...). Set false if you already loaded it. Default true. */
  runtime?: boolean;
}

const q = (s: string) => JSON.stringify(s);
const ident = (s: string) => s.replace(/\W/g, "_");

/** The runtime only. Include once, before any pattern. */
export function luaRuntime(target: "lua" | "pico8" = "lua"): string {
  const pico = target === "pico8";
  const prelude = pico
    ? `-- turns, clockwise from "right", y grows down. PICO-8's own trig is counter-clockwise, hence the flips.
local function cos_t(a) return cos(a) end
local function sin_t(a) return sin(-a) end
local function atan_t(dy,dx) return -atan2(dx,dy) end
bml.floor = flr
local bml_yield = yield
local mk_co, run_co, co_dead = cocreate, coresume, function(c) return costatus(c)=="dead" end
`
    : `-- angles are in turns (1.0 = full circle), clockwise from "right", y grows down.
local pi2 = math.pi*2
local function cos_t(a) return math.cos(a*pi2) end
local function sin_t(a) return math.sin(a*pi2) end
local atan = math.atan2 or math.atan
local function atan_t(dy,dx) return atan(dy,dx)/pi2 end
bml.floor = math.floor
local bml_yield = coroutine.yield
local mk_co, run_co, co_dead = coroutine.create, coroutine.resume, function(c) return coroutine.status(c)=="dead" end
`;
  return `-- bulletml-ts runtime (${target})
bml = bml or {}
bml.patterns = bml.patterns or {}
bml.rand = bml.rand or ${pico ? "function() return rnd(1) end" : "math.random"}
${prelude}
local function norm(a)
  a = a % 1
  if a > 0.5 then a = a - 1 end
  return a
end

local function new_runner(pat, o)
  return {x=0, y=0, dir=0, spd=0, vanished=false, pat=pat, o=o, rank=o.rank or 0, th={},
    dl=0, dinc=0, dfin=0, sl=0, sinc=0, sfin=0, al=0, ainch=0, afinh=0, aincv=0, afinv=0, sh=0, sv=0}
end

local function add_thread(b, fn)
  local t = {w=0, ld=0, ls=0, done=false}
  t.co = mk_co(function() fn(b, t) end)
  b.th[#b.th+1] = t
end

local function aim_at(b)
  local tg = b.o.target
  if not tg then return nil end
  if type(tg) == "function" then tg = tg() end
  return atan_t(tg.y - b.y, tg.x - b.x)
end

-- called by generated code ---------------------------------------------------
function bml.wait(b, t, n)
  t.w = n
  bml_yield()
end

function bml.vanish(b)
  b.vanished = true
  if b.o.on_vanish then b.o.on_vanish(b) end
  bml_yield()
end

function bml.notify(b, name, ...)
  if b.o.on_notify then b.o.on_notify(b, name, ...) end
end

function bml.fire(b, t, dk, dv, sk, sv, bu)
  bu = bu or {}
  local n = new_runner(b.pat, b.o)
  n.rank = b.rank
  n.label = bu.label
  n.x, n.y = b.x, b.y
  if bu.fn then add_thread(n, bu.fn) end

  if not dk then dk, dv = bu.dk, bu.dv end
  dk = dk or "aim"
  dv = dv or 0
  if dk == "aim" then
    local a = aim_at(b)
    if a then n.dir = a + dv else n.dir = dv + b.pat.base end
  elseif dk == "absolute" then n.dir = dv + b.pat.base
  elseif dk == "relative" then n.dir = b.dir + dv
  else n.dir = t.ld + dv end
  t.ld = n.dir

  if not sk then sk, sv = bu.sk, bu.sv end
  sk = sk or "absolute"
  sv = sv or 1
  if sk == "absolute" then n.spd = sv
  elseif sk == "relative" then n.spd = b.spd + sv
  else n.spd = t.ls + sv end
  t.ls = n.spd

  if b.o.on_fire then b.o.on_fire(n, bu.label) end
end

function bml.change_dir(b, k, v, term)
  if term < 1 then term = 1 end
  if k == "aim" then
    local a = aim_at(b)
    if a then b.dfin = a + v else b.dfin = v + b.pat.base end
    b.dinc = norm(b.dfin - b.dir) / term
  elseif k == "absolute" then
    b.dfin = v + b.pat.base
    b.dinc = norm(b.dfin - b.dir) / term
  elseif k == "relative" then
    b.dfin = b.dir + v
    b.dinc = norm(b.dfin - b.dir) / term
  else
    b.dinc = v
    b.dfin = b.dir + v * (term - 1)
  end
  b.dl = term
end

function bml.change_speed(b, k, v, term)
  if term < 1 then term = 1 end
  if k == "absolute" then b.sfin = v b.sinc = (v - b.spd) / term
  elseif k == "relative" then b.sfin = b.spd + v b.sinc = v / term
  else b.sinc = v b.sfin = b.spd + v * term end
  b.sl = term
end

local function axis(k, v, cur, term)
  if k == nil then return 0, cur end
  if k == "relative" then return v / term, cur + v end
  if k == "sequence" then return v, cur + v * term end
  return (v - cur) / term, v
end

function bml.accel(b, term, hk, hv, vk, vv)
  if term < 1 then term = 1 end
  b.al = term
  b.ainch, b.afinh = axis(hk, hv, b.sh, term)
  b.aincv, b.afinv = axis(vk, vv, b.sv, term)
end

-- public API -------------------------------------------------------------------
-- o = {rank=0, target={x=,y=} or function, speed_rate=1,
--      on_fire=function(bullet,label), on_vanish=function(b), on_notify=function(b,event,...)}
function bml.new(name, x, y, o)
  local pat = bml.patterns[name]
  assert(pat, "unknown bulletml pattern: " .. tostring(name))
  local b = new_runner(pat, o or {})
  b.x, b.y = x, y
  for i = 1, #pat.tops do add_thread(b, pat.tops[i]) end
  return b
end

-- Call once per frame for the emitter and for every bullet. Bullets: b.x, b.y, b.dir (turns), b.spd, b.vanished.
function bml.update(b)
  if b.vanished then return end
  if b.dl > 0 then
    b.dl = b.dl - 1
    if b.dl > 0 then b.dir = b.dir + b.dinc else b.dir = b.dfin end
  end
  if b.sl > 0 then
    b.sl = b.sl - 1
    if b.sl > 0 then b.spd = b.spd + b.sinc else b.spd = b.sfin end
  end
  if b.al > 0 then
    b.al = b.al - 1
    if b.al > 0 then b.sh = b.sh + b.ainch b.sv = b.sv + b.aincv
    else b.sh = b.afinh b.sv = b.afinv end
  end
  local r = b.o.speed_rate or 1
  b.x = b.x + (cos_t(b.dir) * b.spd + b.sh) * r
  b.y = b.y + (sin_t(b.dir) * b.spd + b.sv) * r

  for i = 1, #b.th do
    local t = b.th[i]
    if not t.done then
      t.w = t.w - 1
      if t.w <= 0 then
        local ok, err = run_co(t.co)
        assert(ok, err)
        if co_dead(t.co) then t.done = true end
        if b.vanished then return end
      end
    end
  end
end
`;
}

interface Ctx {
  target: "lua" | "pico8";
  doc: BulletML;
  maxParam: { v: number };
  binds: Set<string>;
  loop: { i: string; n: string } | null;
  uid: { n: number };
}

const BIN: Record<string, string> = { "+": "+", "-": "-", "*": "*", "/": "/", "%": "%" };

function expr(e: Expr, c: Ctx): string {
  return node(parseExpression(typeof e === "number" ? String(e) : e), c, String(e));
}

function node(n: Node, c: Ctx, src: string): string {
  switch (n.t) {
    case "num": return String(n.v);
    case "neg": return `(-${node(n.a, c, src)})`;
    case "bin": return `(${node(n.a, c, src)} ${BIN[n.op]} ${node(n.b, c, src)})`;
    case "var": {
      const name = n.name;
      if (name === "$rand") return "bml.rand()";
      if (name === "$rank") return "b.rank";
      const m = /^\$(\d+)$/.exec(name);
      if (m) { c.maxParam.v = Math.max(c.maxParam.v, Number(m[1])); return `p${m[1]}`; }
      if (name.startsWith("$loop.")) {
        if (!c.loop) throw new Error(`"${src}": ${name} used outside <repeat>`);
        const { i, n: count } = c.loop;
        switch (name) {
          case "$loop.index": return i;
          case "$loop.count": return `(${i} + 1)`;
          case "$loop.first": return `(${i} == 0 and 1 or 0)`;
          case "$loop.last": return `(${i} == ${count} - 1 and 1 or 0)`;
        }
        throw new Error(`"${src}": unknown ${name}`);
      }
      const v = name.slice(1);
      if (c.binds.has(v)) return `v_${ident(v)}`;
      throw new Error(`"${src}": undefined variable ${name}`);
    }
  }
}

const deg = (e: Expr, c: Ctx) => `(${expr(e, c)}) / 360`;

function dirArgs(d: Direction | undefined, c: Ctx): string {
  return d ? `${q(d.kind)}, ${deg(d.value, c)}` : "nil, nil";
}
function spdArgs(s: Speed | undefined, c: Ctx): string {
  return s ? `${q(s.kind)}, ${expr(s.value, c)}` : "nil, nil";
}

function args(params: Expr[], c: Ctx): string {
  return params.map((p) => `, ${expr(p, c)}`).join("");
}

/** Emits the Lua table describing a bullet (direction/speed defaults, label, behaviour function). */
function bulletTable(b: Bullet | BulletRef, c: Ctx, ind: string): string {
  if (b.type === "bulletRef") {
    if (!c.doc.bullets.some((x) => x.label === b.label)) throw new Error(`bullet "${b.label}" is not defined`);
    return `B[${q(b.label)}](${b.params.map((p) => expr(p, c)).join(", ")})`;
  }
  const fields: string[] = [];
  if (b.label) fields.push(`label=${q(b.label)}`);
  if (b.direction) fields.push(`dk=${q(b.direction.kind)}, dv=${deg(b.direction.value, c)}`);
  if (b.speed) fields.push(`sk=${q(b.speed.kind)}, sv=${expr(b.speed.value, c)}`);
  if (b.actions.length) {
    const body: string[] = [];
    for (const a of b.actions) actionOrRef(a, c, ind + "    ", body);
    fields.push(`fn=function(b, t)\n${body.join("\n")}\n${ind}  end`);
  }
  return fields.length ? `{${fields.join(", ")}}` : "nil";
}

function actionOrRef(a: Action | ActionRef, c: Ctx, ind: string, out: string[]): void {
  if (a.type === "actionRef") {
    if (!c.doc.actions.some((x) => x.label === a.label)) throw new Error(`action "${a.label}" is not defined`);
    out.push(`${ind}A[${q(a.label)}](b, t${args(a.params, c)})`);
  } else {
    out.push(`${ind}do`);
    commands(a.commands, { ...c, binds: new Set(c.binds) }, ind + "  ", out);
    out.push(`${ind}end`);
  }
}

function fireStmt(f: Fire, c: Ctx, ind: string): string {
  return `${ind}bml.fire(b, t, ${dirArgs(f.direction, c)}, ${spdArgs(f.speed, c)}, ${bulletTable(f.bullet, c, ind)})`;
}

function commands(list: Command[], c: Ctx, ind: string, out: string[]): void {
  for (const cmd of list) {
    switch (cmd.type) {
      case "action":
      case "actionRef":
        actionOrRef(cmd, c, ind, out);
        break;
      case "repeat": {
        const n = `_n${++c.uid.n}`, i = `_i${c.uid.n}`;
        out.push(`${ind}local ${n} = bml.floor(${expr(cmd.times, c)})`);
        out.push(`${ind}for ${i} = 0, ${n} - 1 do`);
        actionOrRef(cmd.action, { ...c, loop: { i, n }, binds: new Set(c.binds) }, ind + "  ", out);
        out.push(`${ind}end`);
        break;
      }
      case "fire": out.push(fireStmt(cmd, c, ind)); break;
      case "fireRef":
        if (!c.doc.fires.some((x) => x.label === cmd.label)) throw new Error(`fire "${cmd.label}" is not defined`);
        out.push(`${ind}F[${q(cmd.label)}](b, t${args(cmd.params, c)})`);
        break;
      case "wait": out.push(`${ind}bml.wait(b, t, ${expr(cmd.frames, c)})`); break;
      case "vanish": out.push(`${ind}bml.vanish(b)`); break;
      case "changeDirection":
        out.push(`${ind}bml.change_dir(b, ${q(cmd.direction.kind)}, ${deg(cmd.direction.value, c)}, ${expr(cmd.term, c)})`);
        break;
      case "changeSpeed":
        out.push(`${ind}bml.change_speed(b, ${q(cmd.speed.kind)}, ${expr(cmd.speed.value, c)}, ${expr(cmd.term, c)})`);
        break;
      case "accel": {
        const h = cmd.horizontal ? `${q(cmd.horizontal.kind)}, ${expr(cmd.horizontal.value, c)}` : "nil, nil";
        const v = cmd.vertical ? `${q(cmd.vertical.kind)}, ${expr(cmd.vertical.value, c)}` : "nil, nil";
        out.push(`${ind}bml.accel(b, ${expr(cmd.term, c)}, ${h}, ${v})`);
        break;
      }
      case "bind":
        out.push(`${ind}local v_${ident(cmd.variable)} = ${expr(cmd.value, c)}`);
        c.binds.add(cmd.variable);
        break;
      case "notify":
        out.push(`${ind}bml.notify(b, ${q(cmd.event)}${args(cmd.params, c)})`);
        break;
    }
  }
}

/** Wrap compiled `body` in a function; params `$1..$n` become `p1..pn` taken from `...`. */
function fn(header: string, c: Ctx, body: string[], tail: string): string {
  const params = c.maxParam.v > 0
    ? `  local ${Array.from({ length: c.maxParam.v }, (_, i) => `p${i + 1}`).join(", ")} = ...\n`
    : "";
  return `${header}\n${params}${body.join("\n")}${tail}\nend`;
}

/**
 * Compile a document to a standalone Lua file (runtime + pattern).
 *
 * Differences from the JS runner: a `<actionRef>`/`<fireRef>`/`<bulletRef>` without `<param>`s does not
 * inherit the caller's `$1..` or `bind` variables, and angles in the runtime are in turns, not radians.
 */
export function toLua(doc: BulletML, opts: LuaOptions = {}): string {
  const target = opts.target ?? "lua";
  const name = opts.name ?? "pattern";
  const mk = (): Ctx => ({ target, doc, maxParam: { v: 0 }, binds: new Set(), loop: null, uid: { n: 0 } });

  const parts: string[] = [];
  const tops: string[] = [];
  for (const a of doc.actions) {
    if (!a.label) continue;
    const c = mk();
    const body: string[] = [];
    commands(a.commands, c, "  ", body);
    parts.push(fn(`A[${q(a.label)}] = function(b, t, ...)`, c, body, ""));
    if (a.label.startsWith("top")) tops.push(`A[${q(a.label)}]`);
  }
  if (tops.length === 0) throw new Error('BulletML has no action labelled "top"');

  for (const f of doc.fires) {
    if (!f.label) continue;
    const c = mk();
    parts.push(fn(`F[${q(f.label)}] = function(b, t, ...)`, c, [fireStmt(f, c, "  ")], ""));
  }
  for (const b of doc.bullets) {
    if (!b.label) continue;
    const c = mk();
    const table = bulletTable(b, c, "  ");
    parts.push(fn(`B[${q(b.label)}] = function(...)`, c, [`  return ${table}`], ""));
  }

  const out: string[] = [`-- Generated by bulletml-ts (target: ${target}). Do not edit by hand.`];
  if (opts.runtime !== false) out.push(luaRuntime(target));
  out.push(
    "do",
    "local A, F, B = {}, {}, {}",
    // forward-declared tables above, so definitions can reference each other in any order
    ...parts,
    `bml.patterns[${q(name)}] = {base = ${doc.orientation === "horizontal" ? 0 : -0.25}, tops = {${tops.join(", ")}}}`,
    "end",
    "",
  );
  return out.join("\n");
}
