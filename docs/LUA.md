# Exporting patterns to Lua

`toLua(doc, options)` compiles a pattern to a standalone Lua file, so you can author or tweak a pattern in the
playground (or in XML) and ship it in a Lua game without any JavaScript.

```ts
import { parseBulletML, toLua } from "bulletml-ts";

const lua = toLua(parseBulletML(xml), { target: "pico8", name: "fan" });
```

| Option | Default | |
|---|---|---|
| `target` | `"lua"` | `"pico8"` uses only PICO-8 API (`cos`, `atan2`, `rnd`, `cocreate`, ...). `"lua"` targets plain Lua 5.1+ / LuaJIT (LÖVE, Defold, ...) |
| `name` | `"pattern"` | Name to pass to `bml.new` |
| `runtime` | `true` | Include the small runtime. Export the first pattern with it and the rest with `runtime: false`, or use `luaRuntime(target)` |

In the playground use **Export Lua…**.

## How it works

Each BulletML action becomes a Lua function that runs inside a **coroutine**. `<wait>` yields, so the generated
code reads like the XML:

```lua
A["nway"] = function(b, t, ...)
  local p1, p2 = ...
  bml.fire(b, t, "aim", ((((-(p1 - 1)) * p2) / 2)) / 360, "absolute", 2.5, nil)
  local _n1 = bml.floor((p1 - 1))
  for _i1 = 0, _n1 - 1 do
    bml.fire(b, t, "sequence", (p2) / 360, "absolute", 2.5, nil)
  end
end
```

The runtime (about 150 lines) moves bullets and resumes the coroutines once per frame.

## Using it (PICO-8)

```lua
-- paste the generated file at the top of your cart, or #include it
player = {x = 64, y = 110}

function _init()
  bullets = {}
  boss = bml.new("fan", 64, 20, {
    target = player,          -- a table {x=,y=} (updated in place) or a function returning one
    rank = 0.5,               -- $rank in the pattern
    on_fire = function(b, label) add(bullets, b) end,
    on_notify = function(b, event, ...) end,   -- <notify> / notify()
  })
end

function _update60()
  bml.update(boss)
  for b in all(bullets) do
    bml.update(b)
    if b.vanished or b.x < -8 or b.x > 136 or b.y < -8 or b.y > 136 then del(bullets, b) end
  end
end

function _draw()
  cls()
  for b in all(bullets) do pset(b.x, b.y, 8) end
end
```

Every bullet is a table with `x`, `y`, `dir` (turns), `spd` (pixels per `update`), `vanished`, and `label`.
If your game already has its own bullet objects, create them in `on_fire` and copy `x`, `y` from the runner each frame
(or let the runner own the movement and just draw it).

## Runtime API

| | |
|---|---|
| `bml.new(name, x, y, opts)` | Create an emitter at `x, y`. Returns a runner. |
| `bml.update(runner)` | Advance one frame. Call for the emitter and every bullet. |
| `bml.rand` | Replace to control randomness (default `rnd(1)` / `math.random`) |
| `opts.rank`, `opts.target`, `opts.speed_rate` | As in the JS `RunnerOptions` |
| `opts.on_fire(bullet, label)`, `opts.on_vanish(runner)`, `opts.on_notify(runner, event, ...)` | Callbacks |

## Notes and limits

- Angles inside the runtime are **turns** (1.0 = a full circle), clockwise from "right", y down. Your pattern's degrees are converted for you.
- A `<actionRef>` / `<fireRef>` / `<bulletRef>` **without** `<param>`s does not inherit the caller's `$1..` or `bind` variables in Lua (the JS runner does). Pass params explicitly.
- Expressions are compiled to Lua arithmetic, so an undefined variable is a compile-time error rather than a runtime one.
- PICO-8 numbers are 16.16 fixed point: values beyond ±32767 overflow, and very small speeds lose precision. `<repeat><times>9999</times>` is fine.
- The runtime is tested against the JS runner (all examples, same random sequence, positions agree to 4 decimals) for plain Lua. The PICO-8 build is tested against the same, using an emulation of PICO-8's `cos`/`sin`/`atan2` conventions, not the real PICO-8.
