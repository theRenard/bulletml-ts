import type {
  AccelValue, Action, ActionRef, Bullet, BulletML, BulletRef, Command, Direction, Expr, Fire, Speed, SpeedKind,
} from "./types.js";

/**
 * Small helpers for writing patterns in code instead of XML. Everything returns plain objects,
 * so the result can be passed straight to `createRunner`.
 *
 * ```ts
 * const doc = bulletml([
 *   action("top", [repeat(9999, action([fire(aim(0), speed(2)), wait(20)]))]),
 * ]);
 * ```
 */
export const aim = (value: Expr = 0): Direction => ({ kind: "aim", value });
export const absolute = (value: Expr): Direction => ({ kind: "absolute", value });
export const relative = (value: Expr): Direction => ({ kind: "relative", value });
export const sequence = (value: Expr): Direction => ({ kind: "sequence", value });
export const speed = (value: Expr, kind: SpeedKind = "absolute"): Speed => ({ kind, value });

type Dir = Direction | Expr;
const dir = (d: Dir): Direction => (typeof d === "object" ? d : aim(d));

/** `fire(direction, speed, bullet?)`. A bare number direction means `aim`. */
export function fire(d: Dir, s: Speed | Expr, b: Bullet | BulletRef = bullet()): Fire {
  return { type: "fire", direction: dir(d), speed: typeof s === "object" ? s : speed(s), bullet: b };
}
export function bullet(actions: (Action | ActionRef)[] = [], label?: string): Bullet {
  return { type: "bullet", ...(label && { label }), actions };
}
export const bulletRef = (label: string, ...params: Expr[]): BulletRef => ({ type: "bulletRef", label, params });

export function action(commands: Command[]): Action;
export function action(label: string, commands: Command[]): Action;
export function action(a: string | Command[], b?: Command[]): Action {
  return typeof a === "string"
    ? { type: "action", label: a, commands: b ?? [] }
    : { type: "action", commands: a };
}
export const actionRef = (label: string, ...params: Expr[]): ActionRef => ({ type: "actionRef", label, params });

export const repeat = (times: Expr, a: Action | ActionRef): Command => ({ type: "repeat", times, action: a });
export const wait = (frames: Expr): Command => ({ type: "wait", frames });
export const vanish = (): Command => ({ type: "vanish" });
export const changeDirection = (d: Direction, term: Expr): Command => ({ type: "changeDirection", direction: d, term });
export const changeSpeed = (s: Speed, term: Expr): Command => ({ type: "changeSpeed", speed: s, term });
export const accel = (term: Expr, axes: { horizontal?: AccelValue; vertical?: AccelValue }): Command => ({ type: "accel", term, ...axes });

export const bind = (variable: string, value: Expr): Command => ({ type: "bind", variable, value });
export const notify = (event: string, ...params: Expr[]): Command => ({ type: "notify", event, params });

export function bulletml(actions: Action[], extra: Partial<Omit<BulletML, "actions">> = {}): BulletML {
  return { orientation: "vertical", bullets: [], fires: [], ...extra, actions };
}

