import type { BulletML } from "./types.js";
import { walk, type ResolvedBullet, type Step, type WalkContext } from "./walker.js";

export interface Point { x: number; y: number }

export interface RunnerOptions {
  /** Difficulty, exposed to patterns as `$rank` (0..1). Default 0. */
  rank?: number;
  /** What `aim` directions point at. May be a function evaluated at each shot. */
  target?: Point | (() => Point);
  /** Multiplier applied to all movement. Default 1. */
  speedRate?: number;
  /** Replacement for `Math.random`, e.g. a seeded generator, for reproducible patterns. */
  random?: () => number;
  /** Called for every bullet a pattern fires. Call `bullet.update()` once per frame on it. */
  onFire?: (bullet: Runner, info: { label?: string }) => void;
  /** Called when a runner executes `<vanish/>`. */
  onVanish?: (runner: Runner) => void;
}

interface Thread {
  steps: Generator<Step, void, void>;
  waitUntil: number;
  lastDirection: number;
  lastSpeed: number;
  done: boolean;
}

const TWO_PI = Math.PI * 2;
const normalize = (r: number) => {
  while (r <= -Math.PI) r += TWO_PI;
  while (r > Math.PI) r -= TWO_PI;
  return r;
};

/**
 * A bullet or emitter. Angles are in radians, y grows downward (screen coordinates).
 * Call {@link Runner.update} once per frame.
 */
export class Runner {
  x = 0;
  y = 0;
  /** Radians. In a vertical document, `-Math.PI / 2` is up. */
  direction = 0;
  speed = 0;
  /** Frames since creation (0 on the first update). */
  age = -1;
  vanished = false;
  /** True once every action has run to completion. */
  get completed(): boolean { return this.threads.every((t) => t.done); }

  private threads: Thread[] = [];
  private dirIncr = 0; private dirFin = 0; private dirEnd = -1;
  private spdIncr = 0; private spdFin = 0; private spdEnd = -1;
  private aclIncrH = 0; private aclFinH = 0;
  private aclIncrV = 0; private aclFinV = 0; private aclEnd = -1;
  private speedH = 0; private speedV = 0;

  /** @internal */
  constructor(
    private readonly ctx: WalkContext,
    private readonly opts: RunnerOptions,
    readonly label?: string,
  ) {}

  /** @internal */
  addThread(steps: Generator<Step, void, void>): void {
    this.threads.push({ steps, waitUntil: 0, lastDirection: 0, lastSpeed: 0, done: false });
  }

  update(): void {
    if (this.vanished) return;
    this.age += 1;
    const rate = this.opts.speedRate ?? 1;

    if (this.age < this.dirEnd) this.direction += this.dirIncr;
    else if (this.age === this.dirEnd) this.direction = this.dirFin;

    if (this.age < this.spdEnd) this.speed += this.spdIncr;
    else if (this.age === this.spdEnd) this.speed = this.spdFin;

    if (this.age < this.aclEnd) { this.speedH += this.aclIncrH; this.speedV += this.aclIncrV; }
    else if (this.age === this.aclEnd) { this.speedH = this.aclFinH; this.speedV = this.aclFinV; }

    this.x += (Math.cos(this.direction) * this.speed + this.speedH) * rate;
    this.y += (Math.sin(this.direction) * this.speed + this.speedV) * rate;

    for (const t of this.threads) {
      if (t.done || this.age < t.waitUntil) continue;
      this.runThread(t);
      if (this.vanished) return;
    }
  }

  private get base(): number {
    return this.ctx.doc.orientation === "horizontal" ? 0 : -Math.PI / 2;
  }

  private aimAt(from: Point): number | undefined {
    const t = this.opts.target;
    if (!t) return undefined;
    const p = typeof t === "function" ? t() : t;
    return Math.atan2(p.y - from.y, p.x - from.x);
  }

  private runThread(t: Thread): void {
    for (;;) {
      const r = t.steps.next();
      if (r.done) { t.done = true; return; }
      const s = r.value;
      switch (s.type) {
        case "wait":
          t.waitUntil = this.age + s.frames;
          return;
        case "fire": this.fire(t, s); break;
        case "changeDirection": this.changeDirection(s); break;
        case "changeSpeed": this.changeSpeed(s); break;
        case "accel": this.accel(s); break;
        case "vanish":
          this.vanished = true;
          this.opts.onVanish?.(this);
          return;
      }
    }
  }

  private fire(t: Thread, s: Extract<Step, { type: "fire" }>): void {
    const b: ResolvedBullet = s.bullet;
    const bullet = new Runner(this.ctx, this.opts, b.label);
    if (b.actions.length) bullet.addThread(walk(this.ctx, b.actions, b.vars));

    bullet.x = this.x;
    bullet.y = this.y;

    const d = s.direction ?? b.direction ?? { kind: "aim" as const, value: 0 };
    const dv = (d.value * Math.PI) / 180;
    switch (d.kind) {
      case "aim": {
        const a = this.aimAt(this);
        bullet.direction = a === undefined ? dv + this.base : a + dv;
        break;
      }
      case "absolute": bullet.direction = dv + this.base; break;
      case "relative": bullet.direction = this.direction + dv; break;
      case "sequence": bullet.direction = t.lastDirection + dv; break;
    }
    t.lastDirection = bullet.direction;

    const sp = s.speed ?? b.speed ?? { kind: "absolute" as const, value: 1 };
    switch (sp.kind) {
      case "absolute": bullet.speed = sp.value; break;
      case "relative": bullet.speed = this.speed + sp.value; break;
      case "sequence": bullet.speed = t.lastSpeed + sp.value; break;
    }
    t.lastSpeed = bullet.speed;

    this.opts.onFire?.(bullet, b.label ? { label: b.label } : {});
  }

  private changeDirection(s: Extract<Step, { type: "changeDirection" }>): void {
    const term = Math.max(1, s.term);
    const d = (s.value * Math.PI) / 180;
    switch (s.kind) {
      case "aim": {
        const a = this.aimAt(this);
        this.dirFin = a === undefined ? d + this.base : a + d;
        this.dirIncr = normalize(this.dirFin - this.direction) / term;
        break;
      }
      case "absolute":
        this.dirFin = d + this.base;
        this.dirIncr = normalize(this.dirFin - this.direction) / term;
        break;
      case "relative":
        this.dirFin = this.direction + d;
        this.dirIncr = normalize(this.dirFin - this.direction) / term;
        break;
      case "sequence":
        this.dirIncr = d;
        this.dirFin = this.direction + d * (term - 1);
        break;
    }
    this.dirEnd = this.age + term;
  }

  private changeSpeed(s: Extract<Step, { type: "changeSpeed" }>): void {
    const term = Math.max(1, s.term);
    switch (s.kind) {
      case "absolute": this.spdFin = s.value; this.spdIncr = (s.value - this.speed) / term; break;
      case "relative": this.spdFin = this.speed + s.value; this.spdIncr = s.value / term; break;
      case "sequence": this.spdIncr = s.value; this.spdFin = this.speed + s.value * term; break;
    }
    this.spdEnd = this.age + term;
  }

  private accel(s: Extract<Step, { type: "accel" }>): void {
    const term = Math.max(1, s.term);
    this.aclEnd = this.age + term;
    const axis = (a: { kind: string; value: number } | undefined, cur: number): [number, number] => {
      if (!a) return [0, cur];
      if (a.kind === "relative") return [a.value / term, cur + a.value];
      return [(a.value - cur) / term, a.value];
    };
    [this.aclIncrH, this.aclFinH] = axis(s.horizontal, this.speedH);
    [this.aclIncrV, this.aclFinV] = axis(s.vertical, this.speedV);
  }
}

/**
 * Create the emitter runner for a document. Place it with `x`/`y`, then call `update()` every frame.
 * Entry points are the actions whose label starts with `top` (`top`, `top1`, `top2`, ...).
 */
export function createRunner(doc: BulletML, options: RunnerOptions = {}): Runner {
  const rand = options.random ?? Math.random;
  const ctx: WalkContext = { doc, rank: options.rank ?? 0, rand };
  const tops = doc.actions.filter((a) => a.label?.startsWith("top"));
  if (tops.length === 0) throw new Error('BulletML has no action labelled "top"');
  const runner = new Runner(ctx, options);
  for (const top of tops) runner.addThread(walk(ctx, top.commands, { $rank: ctx.rank }));
  return runner;
}
