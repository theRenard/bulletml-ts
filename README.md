# bulletml-ts

A TypeScript [BulletML](http://www.asahi-net.or.jp/~cs8k-cyu/bulletml/index_e.html) parser and runner for danmaku (bullet hell) patterns.

- Zero dependencies, no DOM required (Node, browsers, workers)
- Fully typed document model; ESM + CJS builds
- Safe expression evaluator (no `eval` / `new Function`)
- Deterministic runs via an injectable random generator
- [Playground](playground/) with live editing, stepping, rank slider and draggable aim target
- [Examples](examples/): aimed shot, ring, spiral, n-way fan, rain, curving, splitting bombs, rank scaling, gravity

Inspired by [daishihmr/bulletml.js](https://github.com/daishihmr/bulletml.js) (MIT). This is a clean rewrite with a different API.

## Usage

```ts
import { parseBulletML, createRunner } from "bulletml-ts";

const doc = parseBulletML(xmlString);
const bullets = [];

const emitter = createRunner(doc, {
  rank: 0.5,                         // $rank in expressions
  target: () => player,              // {x, y} that `aim` points at
  onFire: (bullet) => bullets.push(bullet),
});
emitter.x = 240; emitter.y = 100;

// once per frame
emitter.update();
for (const b of bullets) b.update();   // b.x, b.y, b.direction, b.speed, b.vanished
```

Coordinates are screen coordinates (y grows down); angles are radians. In a `vertical` document, absolute direction 0 is up; in `horizontal` it is right.

Entry points are actions labelled `top`, `top1`, `top2`, ... See the [guide](docs/GUIDE.md) for the full language, and write patterns in TypeScript with the builder helpers if you prefer.

## Development

```sh
npm install
npm run dev              # playground at http://localhost:5173
npm test
npm run build            # library -> dist/
npm run build:playground # static site -> playground/dist
```

The playground is deployed to GitHub Pages by `.github/workflows/pages.yml`.

## Differences from bulletml.js

- New API (`parseBulletML` / `createRunner`), plain-object document model
- XML or the typed builder helpers (no JSON loader or `notify` / `bind` yet)
- `horizontal` orientation is honoured
- A vanished runner stops immediately

## License

MIT. See [LICENSE](LICENSE).
