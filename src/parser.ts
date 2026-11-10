import type {
  Action, ActionRef, Bullet, BulletML, BulletRef, Command, Direction, Fire, Speed, AccelValue, Expr,
} from "./types.js";
import { parseXml, type XmlElement } from "./xml.js";

const child = (el: XmlElement, name: string) => el.children.find((c) => c.name === name);
const kids = (el: XmlElement, ...names: string[]) => el.children.filter((c) => names.includes(c.name));
const txt = (el: XmlElement): Expr => el.text.trim();
const label = (el: XmlElement) => el.attrs["label"] ?? el.attrs["Label"];

function params(el: XmlElement): Expr[] {
  return kids(el, "param").map(txt);
}

function typed<K extends string>(el: XmlElement, def: K, allowed: readonly K[]): { kind: K; value: Expr } {
  const kind = (el.attrs["type"] ?? def) as K;
  if (!allowed.includes(kind)) throw new Error(`<${el.name}> has invalid type "${kind}"`);
  return { kind, value: txt(el) };
}

const direction = (el: XmlElement): Direction =>
  typed(el, "aim", ["aim", "absolute", "relative", "sequence"]);
const speed = (el: XmlElement): Speed => typed(el, "absolute", ["absolute", "relative", "sequence"]);
const accelValue = (el: XmlElement): AccelValue => typed(el, "absolute", ["absolute", "relative", "sequence"]);

function actionOrRef(el: XmlElement): Action | ActionRef {
  return el.name === "actionref" ? actionRef(el) : action(el);
}
function actionRef(el: XmlElement): ActionRef {
  return { type: "actionRef", label: label(el) ?? "", params: params(el) };
}

function action(el: XmlElement): Action {
  const commands: Command[] = [];
  for (const c of el.children) {
    switch (c.name) {
      case "action": commands.push(action(c)); break;
      case "actionref": commands.push(actionRef(c)); break;
      case "fire": commands.push(fire(c)); break;
      case "fireref": commands.push({ type: "fireRef", label: label(c) ?? "", params: params(c) }); break;
      case "wait": commands.push({ type: "wait", frames: txt(c) }); break;
      case "vanish": commands.push({ type: "vanish" }); break;
      case "bind": {
        const variable = (c.attrs["variable"] ?? "").replace(/^\$/, "");
        if (!/^[A-Za-z_]\w*$/.test(variable)) throw new Error("<bind> needs a valid variable name");
        commands.push({ type: "bind", variable, value: txt(c) });
        break;
      }
      case "notify": {
        const event = c.attrs["event"];
        if (!event) throw new Error("<notify> needs an event attribute");
        commands.push({ type: "notify", event, params: params(c) });
        break;
      }
      case "repeat": {
        const a = kids(c, "action", "actionref")[0];
        if (!a) throw new Error("<repeat> has no action");
        commands.push({ type: "repeat", times: txt(child(c, "times") ?? { text: "1" } as XmlElement), action: actionOrRef(a) });
        break;
      }
      case "changedirection": {
        const d = child(c, "direction"), t = child(c, "term");
        if (!d || !t) throw new Error("<changeDirection> needs <direction> and <term>");
        commands.push({ type: "changeDirection", direction: direction(d), term: txt(t) });
        break;
      }
      case "changespeed": {
        const s = child(c, "speed"), t = child(c, "term");
        if (!s || !t) throw new Error("<changeSpeed> needs <speed> and <term>");
        commands.push({ type: "changeSpeed", speed: speed(s), term: txt(t) });
        break;
      }
      case "accel": {
        const h = child(c, "horizontal"), v = child(c, "vertical"), t = child(c, "term");
        if (!t) throw new Error("<accel> needs <term>");
        commands.push({
          type: "accel",
          ...(h && { horizontal: accelValue(h) }),
          ...(v && { vertical: accelValue(v) }),
          term: txt(t),
        });
        break;
      }
      default:
        throw new Error(`Unknown command <${c.name}> in <action>`);
    }
  }
  return { type: "action", ...(label(el) && { label: label(el)! }), commands };
}

function bullet(el: XmlElement): Bullet {
  const d = child(el, "direction"), s = child(el, "speed");
  return {
    type: "bullet",
    ...(label(el) && { label: label(el)! }),
    ...(d && { direction: direction(d) }),
    ...(s && { speed: speed(s) }),
    actions: kids(el, "action", "actionref").map(actionOrRef),
  };
}

function fire(el: XmlElement): Fire {
  const b = child(el, "bullet"), r = child(el, "bulletref");
  const d = child(el, "direction"), s = child(el, "speed");
  if (!b && !r) throw new Error("<fire> has no <bullet> or <bulletRef>");
  const ref: BulletRef | undefined = r && { type: "bulletRef", label: label(r) ?? "", params: params(r) };
  return {
    type: "fire",
    ...(label(el) && { label: label(el)! }),
    ...(d && { direction: direction(d) }),
    ...(s && { speed: speed(s) }),
    bullet: b ? bullet(b) : ref!,
  };
}

/** Parse a BulletML XML string. Throws `Error` with a readable message on invalid input. */
export function parseBulletML(xml: string): BulletML {
  const root = parseXml(xml);
  if (root.name !== "bulletml") throw new Error(`Root element must be <bulletml>, got <${root.name}>`);
  return {
    orientation: root.attrs["type"] === "horizontal" ? "horizontal" : "vertical",
    actions: kids(root, "action").map(action),
    bullets: kids(root, "bullet").map(bullet),
    fires: kids(root, "fire").map(fire),
  };
}
