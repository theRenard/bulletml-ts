import { describe, expect, it } from "vitest";
import { createRunner, parseBulletML, type Runner, type RunnerOptions } from "../src/index.js";

function collect(body: string, frames: number, opts: RunnerOptions = {}) {
  const bullets: Runner[] = [];
  const r = createRunner(parseBulletML(`<bulletml>${body}</bulletml>`), { ...opts, onFire: (b) => bullets.push(b) });
  for (let i = 0; i < frames; i++) r.update();
  return bullets;
}

describe("bind and notify", () => {
  it("bind sets a variable for later commands in the same action", () => {
    const b = collect(`<action label="top"><bind variable="s">2+1</bind><fire><speed>$s*2</speed><bullet/></fire></action>`, 1);
    expect(b[0]!.speed).toBe(6);
  });
  it("notify reaches the host with evaluated params", () => {
    const calls: unknown[] = [];
    collect(`<action label="top"><notify event="boom"><param>1+1</param><param>$rank</param></notify></action>`, 1, {
      rank: 0.5,
      onNotify: (_r, e, p) => calls.push([e, p]),
    });
    expect(calls).toEqual([["boom", [2, 0.5]]]);
  });
  it("evaluates bullet speed inside the bulletRef scope", () => {
    const b = collect(
      `<action label="top"><fire><bulletRef label="b"><param>7</param></bulletRef></fire></action>
       <bullet label="b"><speed>$1</speed></bullet>`, 1,
    );
    expect(b[0]!.speed).toBe(7);
  });
});
