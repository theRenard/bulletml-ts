import { evaluate, type Scope } from "./expression.js";
import type {
  Action, ActionRef, Bullet, BulletML, Command, DirectionKind, Expr, Fire, SpeedKind, AccelKind,
} from "./types.js";

type Vars = Readonly<Record<string, number>>;

export interface WalkContext {
  doc: BulletML;
  rank: number;
  rand: () => number;
}

/** A command with every expression evaluated to a number. */
export type Step =
  | { type: "fire"; direction?: { kind: DirectionKind; value: number }; speed?: { kind: SpeedKind; value: number }; bullet: ResolvedBullet }
  | { type: "wait"; frames: number }
  | { type: "changeDirection"; kind: DirectionKind; value: number; term: number }
  | { type: "changeSpeed"; kind: SpeedKind; value: number; term: number }
  | { type: "accel"; horizontal?: { kind: AccelKind; value: number }; vertical?: { kind: AccelKind; value: number }; term: number }
  | { type: "vanish" };

export interface ResolvedBullet {
  label?: string;
  direction?: { kind: DirectionKind; value: number };
  speed?: { kind: SpeedKind; value: number };
  actions: (Action | ActionRef)[];
  vars: Vars;
}

/** Walk a list of commands, yielding resolved steps. Control flow (repeat, refs) is handled here. */
export function* walk(ctx: WalkContext, commands: readonly Command[], vars: Vars): Generator<Step, void, void> {
  const num = (e: Expr, v: Vars) => evaluate(e, { vars: v, rand: ctx.rand } satisfies Scope);
  const find = <T extends { label?: string }>(list: T[], label: string, what: string): T => {
    const hit = list.find((x) => x.label === label);
    if (!hit) throw new Error(`${what} "${label}" is not defined`);
    return hit;
  };
  const callVars = (params: Expr[]): Vars => {
    if (params.length === 0) return vars;
    const out: Record<string, number> = { $rank: ctx.rank };
    params.forEach((p, i) => { out[`$${i + 1}`] = num(p, vars); });
    return out;
  };
  const resolveFire = (f: Fire, v: Vars): Step => {
    let b: Bullet, bv = v;
    if (f.bullet.type === "bulletRef") {
      b = find(ctx.doc.bullets, f.bullet.label, "bullet");
      const out: Record<string, number> = { $rank: ctx.rank };
      f.bullet.params.forEach((p, i) => { out[`$${i + 1}`] = num(p, v); });
      bv = f.bullet.params.length ? out : v;
    } else b = f.bullet;
    const dir = (d?: { kind: DirectionKind; value: Expr }) => d && { kind: d.kind, value: num(d.value, v) };
    const spd = (s?: { kind: SpeedKind; value: Expr }) => s && { kind: s.kind, value: num(s.value, v) };
    const rb: ResolvedBullet = { actions: b.actions, vars: bv };
    if (b.label) rb.label = b.label;
    const bd = dir(b.direction), bs = spd(b.speed);
    if (bd) rb.direction = bd;
    if (bs) rb.speed = bs;
    const step: Step = { type: "fire", bullet: rb };
    const fd = dir(f.direction), fs = spd(f.speed);
    if (fd) step.direction = fd;
    if (fs) step.speed = fs;
    return step;
  };

  for (const cmd of commands) {
    switch (cmd.type) {
      case "action":
        yield* walk(ctx, cmd.commands, vars);
        break;
      case "actionRef":
        yield* walk(ctx, find(ctx.doc.actions, cmd.label, "action").commands, callVars(cmd.params));
        break;
      case "repeat": {
        const times = Math.floor(num(cmd.times, vars));
        for (let i = 0; i < times; i++) {
          const loop = {
            ...vars,
            "$loop.index": i,
            "$loop.count": i + 1,
            "$loop.first": i === 0 ? 1 : 0,
            "$loop.last": i === times - 1 ? 1 : 0,
          };
          yield* walk(ctx, [cmd.action], loop);
        }
        break;
      }
      case "fire":
        yield resolveFire(cmd, vars);
        break;
      case "fireRef":
        yield resolveFire(find(ctx.doc.fires, cmd.label, "fire"), callVars(cmd.params));
        break;
      case "wait":
        yield { type: "wait", frames: num(cmd.frames, vars) };
        break;
      case "changeDirection":
        yield { type: "changeDirection", kind: cmd.direction.kind, value: num(cmd.direction.value, vars), term: num(cmd.term, vars) };
        break;
      case "changeSpeed":
        yield { type: "changeSpeed", kind: cmd.speed.kind, value: num(cmd.speed.value, vars), term: num(cmd.term, vars) };
        break;
      case "accel": {
        const step: Step = { type: "accel", term: num(cmd.term, vars) };
        if (cmd.horizontal) step.horizontal = { kind: cmd.horizontal.kind, value: num(cmd.horizontal.value, vars) };
        if (cmd.vertical) step.vertical = { kind: cmd.vertical.kind, value: num(cmd.vertical.value, vars) };
        yield step;
        break;
      }
      case "vanish":
        yield { type: "vanish" };
        break;
    }
  }
}
