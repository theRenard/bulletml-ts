import { createRunner, parseBulletML, type Runner } from "../../src/index.js";

const files = import.meta.glob("../../examples/*.xml", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const examples = Object.entries(files)
  .map(([path, src]) => ({ name: path.split("/").pop()!.replace(/\.xml$/, ""), src }))
  .sort((a, b) => a.name.localeCompare(b.name));

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("canvas");
const ctx = canvas.getContext("2d")!;
const editor = $<HTMLTextAreaElement>("editor");
const errorBox = $("error");
const select = $<HTMLSelectElement>("examples");
const playBtn = $<HTMLButtonElement>("play");
const speedInput = $<HTMLInputElement>("speed");
const rankInput = $<HTMLInputElement>("rank");
const seedInput = $<HTMLInputElement>("seed");
const stats = $("stats");

const W = canvas.width, H = canvas.height;
const MAX_BULLETS = 20000;
const emitter = { x: W / 2, y: 110 };
const target = { x: W / 2, y: H - 100 };

let runner: Runner | null = null;
let bullets: Runner[] = [];
let playing = true;
let acc = 0;
let frame = 0;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function reset(): void {
  bullets = [];
  frame = 0;
  acc = 0;
  try {
    const doc = parseBulletML(editor.value);
    runner = createRunner(doc, {
      rank: Number(rankInput.value),
      target,
      random: mulberry32(Number(seedInput.value) || 1),
      onFire: (b) => { if (bullets.length < MAX_BULLETS) bullets.push(b); },
    });
    runner.x = emitter.x;
    runner.y = emitter.y;
    errorBox.textContent = "";
  } catch (e) {
    runner = null;
    errorBox.textContent = e instanceof Error ? e.message : String(e);
  }
}

function tick(): void {
  runner?.update();
  let w = 0;
  for (const b of bullets) {
    b.update();
    if (!b.vanished && b.x > -40 && b.x < W + 40 && b.y > -40 && b.y < H + 40) bullets[w++] = b;
  }
  bullets.length = w;
  frame++;
}

function draw(): void {
  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#6ea8ff";
  ctx.beginPath(); ctx.arc(emitter.x, emitter.y, 8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#5dd39e"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(target.x, target.y, 10, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#ff6b8b";
  for (const b of bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  stats.textContent = `frame ${frame} · bullets ${bullets.length}${bullets.length >= MAX_BULLETS ? " (capped)" : ""}`;
}

let last = performance.now();
function loop(now: number): void {
  acc += ((now - last) / 1000) * 60 * Number(speedInput.value);
  last = now;
  if (acc > 10) acc = 10; // avoid spiral of death after tab switch
  while (acc >= 1) { if (playing) tick(); acc -= 1; }
  draw();
  requestAnimationFrame(loop);
}

// --- UI wiring ---
for (const ex of examples) select.add(new Option(ex.name, ex.name));

function load(src: string): void { editor.value = src; reset(); }

select.onchange = () => load(examples.find((e) => e.name === select.value)!.src);
playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? "Pause" : "Play"; };
$("step").onclick = () => { playing = false; playBtn.textContent = "Play"; tick(); };
$("reset").onclick = reset;
rankInput.onchange = seedInput.onchange = reset;
let debounce = 0;
editor.oninput = () => { clearTimeout(debounce); debounce = window.setTimeout(reset, 300); };
editor.onkeydown = (e) => {
  if (e.key === "Tab") { e.preventDefault(); document.execCommand("insertText", false, "  "); }
};

const move = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  target.x = ((e.clientX - r.left) / r.width) * W;
  target.y = ((e.clientY - r.top) / r.height) * H;
};
canvas.onpointerdown = (e) => { canvas.setPointerCapture(e.pointerId); move(e); };
canvas.onpointermove = (e) => { if (canvas.hasPointerCapture(e.pointerId)) move(e); };

// Share link: pattern is stored (base64) in the URL hash.
const encode = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const decode = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
$("share").onclick = async () => {
  const url = `${location.origin}${location.pathname}#${encode(editor.value)}`;
  history.replaceState(null, "", url);
  await navigator.clipboard?.writeText(url).catch(() => {});
  $("share").textContent = "Copied!";
  setTimeout(() => ($("share").textContent = "Copy share link"), 1200);
};

let initial = examples[0]?.src ?? "";
if (location.hash.length > 1) {
  try { initial = decode(location.hash.slice(1)); } catch { /* ignore bad hash */ }
}
load(initial);
requestAnimationFrame(loop);
