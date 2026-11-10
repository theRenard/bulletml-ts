/** Tiny XML reader, enough for BulletML. No DOM required, so it works in Node and workers. */
export interface XmlElement {
  /** Lower-cased tag name. */
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) => {
    if (e[0] === "#") {
      const code = e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e] ?? all;
  });

export function parseXml(src: string): XmlElement {
  const root: XmlElement = { name: "#root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!(?:\[CDATA\[([\s\S]*?)\]\]|[^>]*)>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) top.text += m[1];
    else if (m[6] !== undefined) top.text += decode(m[6]);
    else if (m[3] !== undefined) {
      const name = m[3].toLowerCase();
      if (m[2]) {
        if (stack.length < 2 || top.name !== name) {
          throw new Error(`XML error: unexpected </${m[3]}>`);
        }
        stack.pop();
      } else {
        const attrs: Record<string, string> = {};
        for (const a of (m[4] ?? "").matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
          attrs[a[1]!] = decode(a[2] ?? a[3] ?? "");
        }
        const el: XmlElement = { name, attrs, children: [], text: "" };
        top.children.push(el);
        if (!m[5]) stack.push(el);
      }
    }
  }
  if (stack.length > 1) throw new Error(`XML error: <${stack[stack.length - 1]!.name}> is not closed`);
  const el = root.children[0];
  if (!el) throw new Error("XML error: empty document");
  return el;
}
