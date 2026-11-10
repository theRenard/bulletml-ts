# BulletML guide

BulletML describes *when* and *how* an emitter fires bullets. Every pattern is a tree of **actions**.
Try each snippet in the playground.

## Entry points

Actions labelled `top` (or `top1`, `top2`, ...) start running when the runner is created.

```xml
<bulletml type="vertical">
  <action label="top"> ... </action>
</bulletml>
```

## Commands

| Command | Meaning |
|---|---|
| `<fire>` | Spawn a bullet with a `<direction>`, `<speed>` and a `<bullet>` / `<bulletRef>` |
| `<wait>n</wait>` | Pause this action for `n` frames |
| `<repeat>` | `<times>n</times>` plus an `<action>` / `<actionRef>` |
| `<changeDirection>` | Turn over `<term>` frames |
| `<changeSpeed>` | Speed up or slow down over `<term>` frames |
| `<accel>` | Add horizontal / vertical acceleration over `<term>` frames |
| `<vanish/>` | Remove this bullet |
| `<bind variable="x">expr</bind>` | *(extension)* Set `$x` for the rest of the action |
| `<notify event="name"><param>..</param></notify>` | *(extension)* Call the host's `onNotify(runner, event, params)` |
| `<actionRef>`, `<fireRef>`, `<bulletRef>` | Call something defined at the top level, with `<param>`s |

## Direction types

Angles are degrees, clockwise.

- `aim`: relative to the line towards the target (the default)
- `absolute`: relative to up (vertical documents) or right (horizontal documents)
- `relative`: relative to the shooter's own direction
- `sequence`: relative to the *previous bullet this action fired*. This is how rings and fans are made.

Speed has `absolute`, `relative` and `sequence` too.

## Expressions

Anywhere a number is expected you can write arithmetic: `+ - * / %`, parentheses and variables.

| Variable | Value |
|---|---|
| `$rand` | Random number in [0, 1) |
| `$rank` | Difficulty passed to `createRunner({ rank })` |
| `$1`, `$2`, ... | Parameters of the current `actionRef` / `fireRef` / `bulletRef` |
| `$loop.index` / `$loop.count` | Current `repeat` iteration, from 0 / from 1 |
| `$loop.first` / `$loop.last` | 1 on the first / last iteration, otherwise 0 |

## Recipes

**Ring of N bullets:** fire the first with `absolute`, then `repeat` N-1 times with `sequence` 360/N. See `examples/02-ring.xml`.

**Fan centred on the target:** `aim` with `-(n-1)*step/2`, then `sequence` by `step`. See `examples/04-nway-fan.xml`.

**Bullet with behaviour:** put an `<action>` inside `<bullet>`. See `examples/08-splitting.xml`.

## Writing patterns in TypeScript

```ts
import { action, fire, repeat, wait, absolute, sequence, bulletml, createRunner } from "bulletml-ts";

const ring = bulletml([
  action("top", [
    repeat(9999, action([
      fire(absolute(0), 1.5),
      repeat(23, action([fire(sequence(15), 1.5)])),
      wait(45),
    ])),
  ]),
]);
const runner = createRunner(ring, { onFire: (b) => bullets.push(b) });
```

## Differences from the original BulletML spec / bulletml.js

- `horizontal` orientation is supported.
- Expressions are parsed, not evaluated, so only arithmetic is allowed.
- `<vanish/>` ends the runner immediately.
