import type { Expr } from "./types.js";

/** Variables visible to an expression: `$rank`, `$rand`, `$1`, `$loop.index`, ... */
export interface Scope {
  vars: Readonly<Record<string, number>>;
  rand: () => number;
}

export type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node };

const cache = new Map<string, Node>();

/** Parse an expression (no `eval`/`Function`; only + - * / % ( ) numbers and `$vars`). */
export function parseExpression(src: string): Node {
  const hit = cache.get(src);
  if (hit) return hit;
  const re = /\s*(?:(\d+\.?\d*|\.\d+)|(\$[A-Za-z0-9_]+(?:\.[A-Za-z_]+)?)|(.))/gy;
  const tokens: { k: "n" | "v" | "o"; s: string }[] = [];
  let m: RegExpExecArray | null;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1] !== undefined) tokens.push({ k: "n", s: m[1] });
    else if (m[2] !== undefined) tokens.push({ k: "v", s: m[2] });
    else if (m[3] !== undefined && m[3].trim() !== "") tokens.push({ k: "o", s: m[3] });
  }
  let i = 0;
  const peek = () => tokens[i];
  const fail = (msg: string): never => {
    throw new Error(`Invalid expression "${src}": ${msg}`);
  };
  const primary = (): Node => {
    const t = tokens[i++];
    if (!t) return fail("unexpected end");
    if (t.k === "n") return { t: "num", v: parseFloat(t.s) };
    if (t.k === "v") return { t: "var", name: t.s };
    if (t.s === "(") {
      const e = additive();
      if (tokens[i++]?.s !== ")") fail("missing )");
      return e;
    }
    if (t.s === "-") return { t: "neg", a: primary() };
    if (t.s === "+") return primary();
    return fail(`unexpected "${t.s}"`);
  };
  const multiplicative = (): Node => {
    let a = primary();
    while (peek()?.k === "o" && "*/%".includes(peek()!.s)) {
      const op = tokens[i++]!.s;
      a = { t: "bin", op, a, b: primary() };
    }
    return a;
  };
  const additive = (): Node => {
    let a = multiplicative();
    while (peek()?.k === "o" && "+-".includes(peek()!.s)) {
      const op = tokens[i++]!.s;
      a = { t: "bin", op, a, b: multiplicative() };
    }
    return a;
  };
  const ast = additive();
  if (i < tokens.length) fail(`unexpected "${tokens[i]!.s}"`);
  cache.set(src, ast);
  return ast;
}

function run(n: Node, scope: Scope): number {
  switch (n.t) {
    case "num": return n.v;
    case "neg": return -run(n.a, scope);
    case "var": {
      if (n.name === "$rand") return scope.rand();
      const v = scope.vars[n.name];
      if (v === undefined) throw new Error(`Undefined variable ${n.name}`);
      return v;
    }
    case "bin": {
      const a = run(n.a, scope), b = run(n.b, scope);
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        default: return a % b;
      }
    }
  }
}

/** Evaluate an expression to a number. */
export function evaluate(expr: Expr, scope: Scope): number {
  if (typeof expr === "number") return expr;
  const n = Number(expr);
  if (expr.trim() !== "" && !Number.isNaN(n)) return n;
  return run(parseExpression(expr), scope);
}
