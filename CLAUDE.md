# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`kfg` is a type-safe configuration library for Node.js/Bun/Deno, built on TypeBox. It is published to npm; only `dist/` ships. Runtime/tooling is **Bun**.

## Commands

- `bun test` — run all tests (Bun's test runner, files in `tests/*.test.ts`)
- `bun test tests/kfg.test.ts` — run a single test file
- `bun run typecheck` — `tsc --noEmit`
- `bun run check` — Biome lint/format with auto-fix (`biome check --write`)
- `bun run build` — typechecks (`tsconfig.test.json`) then runs `build.ts`: tsup bundles CJS+ESM to `dist/`, then `dts-bundle-generator` writes a single bundled `dist/index.d.ts`
- `bun run docs` — TypeDoc

## Architecture

Everything is exported from `src/index.ts`. Three layers:

1. **Schema builders (`src/factory.ts`, `src/rule.ts`)** — `c` (aliases `k`, `m`) wraps TypeBox `Type.*` with extra helpers (`Email`, `Port`, `UUID`, `Slug`, `Random`, `Model`, `createms`, ...) and custom metadata options (`prop`, `important`, `description` — see `CustomOptions` in `src/types.ts`). Both PascalCase and camelCase names exist. `c.rule` (`src/rule.ts`) parses Laravel-style rule strings (`"required|string|min:3"`) into TypeBox schemas, with a **type-level string parser** so the static type is inferred from the rule literal — changes to runtime parsing usually need matching changes to the type-level parser at the top of the file.

2. **Core (`src/kfg.ts`)** — `Kfg<Driver, Schema>` holds the schema in two forms (user-defined plain-object tree and compiled `TObject`, via `buildTypeBoxSchema` in `src/utils/schema.ts`). All reads/writes go through an in-memory `~cache`; `validateAndClean` (Default → Convert → Check via TypeBox `Value`) runs on every mutation, rolling back the cache on validation failure. `config` is a read-only Proxy over the cache. Internal fields use the `"~name"` convention. Methods return `inPromise<D["async"], T>` — sync or Promise depending on the driver's `async` flag, so the same API works for both.

3. **Drivers (`src/kfg-driver.ts`, `src/drivers/`)** — `KfgDriver` is abstract: required `load`/`save`, optional atomic `update`/`delete` (when implemented, `Kfg.set`/`del` call them instead of full `save`), optional `formatError`. `EnvDriver` (sync) maps nested schema paths to ENV keys (or the `prop` override), merges file `.env` + `process.env` + defaults, and records per-key **source tracing** (`file`/`process`/`default`/`injected`, printed with `debug: true`); it defaults `forceExit: true`, meaning validation failure calls `process.exit(1)` instead of throwing. `JsonDriver` persists to JSON files.

Key cross-cutting detail: schema definitions are plain nested objects whose leaves are TypeBox schemas; `src/utils/schema.ts` converts them to a compiled `TObject`, applies "smart defaults", and builds default objects, and `src/types.ts` provides the type machinery (`StaticSchema`, `Paths`, `DeepGet`) that powers dot-path autocompletion in `get`/`set`/`del`/`has`.

All file persistence goes through `src/utils/safe-write.ts`: lock file against concurrent writers (stolen instantly if the owner PID is dead, else time-based staleness), atomic temp-write + verify + rename (a failed/partial write never corrupts the target; disk-full raises a clear error), and an `allow_backup` mirror (default `true` → `<file>.bak`, or a custom path) that `JsonDriver.load` uses to auto-restore a corrupted main file. The plain `set`/`save` path gives write-atomicity but not update-isolation (concurrent read-modify-write loses updates) — `Kfg.mutate(fn)` is the transactional primitive: it holds the lock across the whole read→modify→write via the driver's optional `transaction` hook. `sim/` holds a multi-process concurrency simulation harness (`bun sim/run.ts`, `USE_MUTATE=1` for the transactional path). String formats are registered centrally in `src/utils/formats.ts` (side-effect import) — TypeBox silently accepts unregistered formats, so any new format must be registered there.

## Conventions

- Formatting/linting via Biome (`biome.json`); run `bun run check` before committing.
- `only_importants` load option makes non-`important` schema fields optional (via `makeSchemaOptional`).
- Tests live in `tests/` and exercise the public API plus utils directly; env-driver tests manipulate real temp `.env` files and `process.env`.
