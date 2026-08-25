# K(con)fg - Simple, Type-Safe Configuration Management

[![npm version](https://badge.fury.io/js/kfg.svg)](https://badge.fury.io/js/kfg)
[![Build](https://github.com/drysius/kfg/actions/workflows/build.yaml/badge.svg)](https://github.com/drysius/kfg/actions/workflows/build.yaml)
[![Documentation](https://github.com/drysius/kfg/actions/workflows/docs.yml/badge.svg)](https://kfg.js.org/)

Kfg is a robust and 100% type-safe configuration management system for Node.js, Bun, and Deno. It provides a structured way to define, validate, and access environment variables and other configuration sources with the power of TypeScript.

- ✅ **Fully Typed**: Autocomplete and type safety for all your configurations.
- ✅ **Flexible Drivers**: Load configurations from `.env` files, JSON, or create your own driver.
- ✅ **Built-in Validation**: Define rules and formats (email, url, etc.) directly in the schema.
- ✅ **Smart Defaults**: Define defaults that are applied automatically.
- ✅ **Nested Structures**: Organize your configurations logically.
- ✅ **Scoped Pools**: One configuration per tenant, guild, or project — same API, no call-site changes.
- ✅ **Safeguarded Writes**: Atomic write + verify, cross-process locking, backup with auto-recovery.
- ✅ **Sync or Async**: `JsonDriver` blocks; `JsonAsyncDriver` does the same work without stalling the event loop.

---

## 📖 Documentation

- **[Full Usage Guide](https://kfg.js.org/)**: Learn how to install and use Kfg.
- **[llms.txt](https://kfg.js.org/llms.txt)**: Machine-readable reference for AI tools and agents.

## Installation

```bash
npm install kfg
# or
yarn add kfg
# or
bun add kfg
```

## Quick Example

**1. Define your schema (`schema.ts`):**

```typescript
import { c } from "kfg";

export const AppSchema = {
  server: {
    host: c.string({ default: "0.0.0.0" }),
    port: c.number({ default: 3000 }),
  },
  database: {
    url: c.string({ prop: "DATABASE_URL" }), // Reads from the DATABASE_URL environment variable
  },
};
```

**2. Create and load your instance (`config.ts`):**

```typescript
import { Kfg, EnvDriver } from "kfg";
import { AppSchema } from "./schema";

const config = new Kfg(new EnvDriver(), AppSchema);
config.load(); // Loads values from .env and process.env

export default config;
```

**3. Use it anywhere (`index.ts`):**

```typescript
import config from "./config";

const port = config.get("server.port"); // Inferred as `number`
const dbUrl = config.get("database.url"); // Inferred as `string`

console.log(`Server running on port ${port}`);

// Type Error! TypeScript prevents incorrect assignments.
// config.set("server.port", "not-a-number");
```

## File-based Configuration with `JsonDriver`

`JsonDriver` persists the configuration to a JSON file, with the same API and typing:

```typescript
import { Kfg, JsonDriver, c } from "kfg";

const config = new Kfg(new JsonDriver({ path: "resources/config.json" }), {
  items: c.array(c.string(), { default: [] }),
  owner: c.string({ default: "unknown" }),
});

config.load();
config.set("owner", "Alice");
config.set("items", ["sword", "shield"]);
```

Every write goes through the safeguard layer: the content is written to a temp
file, read back and verified, then atomically renamed over the target, under a
lock file that keeps concurrent processes from clobbering each other. A mirror
is kept in `<file>.bak` and restored automatically if the main file is ever
corrupted.

When several keys change at once, write them in a single transaction instead of
one `set` per key — it is both atomic across processes and far cheaper:

```typescript
config.mutate((draft) => {
  draft.owner = "Alice";
  draft.items = ["sword", "shield"];
});
```

## Scoped Configuration with `Kfg.pool`

For one configuration per tenant, guild, or project, `Kfg.pool` keeps an instance per scope id and exposes **the exact same API** as a single instance — existing call sites keep their types and autocompletion:

```typescript
import { Kfg, JsonDriver, c } from "kfg";

const Config = Kfg.pool(schema, {
    driver: (id) => new JsonDriver({ path: `resources/guilds/${id}/config.json` }),
    max: 500,            // keep at most 500 configs in memory (LRU)
});

// Ambient scope: everything inside sees this guild, including awaited code.
await Config.run(guildId, async () => {
    Config.get("tks.category");
    Config.set("tks.enabled", true);
});

// Or address a scope explicitly — for dashboards and background jobs.
Config.for(guildId).set("tks.enabled", false);
```

Instances are created on first access and reloaded lazily. A corrupted file for
one scope throws a `KfgValidationError` carrying that `scope` instead of
exiting the process, so the other scopes keep working.

Without an active scope, operations throw `KfgScopeError` rather than guessing.
During a migration you can set `defaultScope` and watch `missingScopeCount` (or
pass `onMissingScope`) to find the call sites that still run outside a scope.

## License

MIT