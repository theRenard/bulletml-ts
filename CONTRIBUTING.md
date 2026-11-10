# Contributing

Bug reports, new example patterns and fixes are welcome.

```sh
npm install
npm test            # unit tests, Lua-vs-JS tests, comparison with the original bulletml.js
npm run typecheck
npm run dev         # playground
```

- **Examples** live in `examples/*.xml` and are picked up automatically by the playground and the tests. Use `<bulletRef label="x"/>` to reference a top-level `<bullet>`; a `<bullet label="x"/>` is a new, empty bullet.
- **Changing runner behaviour?** `test/compat.test.ts` compares against bulletml.js 0.5.4, and `test/lua.test.ts` compares the Lua export with the JS runner. Update both implementations together, and document intentional differences in the README.
- Keep the library dependency-free and DOM-free.
