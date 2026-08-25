# K(con)fg - Simple, Type-Safe Configuration Management

[![npm version](https://badge.fury.io/js/kfg.svg)](https://badge.fury.io/js/kfg)
[![Documentation](https://github.com/drylian/kfg/actions/workflows/docs.yml/badge.svg)](https://kfg.drylian.com/)

Kfg is a robust and 100% type-safe configuration management system for Node.js and Bun applications. It provides a structured way to define, validate, and access environment variables and other configuration sources with the power of TypeScript.

- ✅ **Fully Typed**: Autocomplete and type safety for all your configurations.
- ✅ **Flexible Drivers**: Load configurations from `.env` files, JSON, or create your own driver.
- ✅ **Built-in Validation**: Define rules and formats (email, url, etc.) directly in the schema.
- ✅ **Smart Defaults**: Define defaults that are applied automatically.
- ✅ **Nested Structures**: Organize your configurations logically.
- ✅ **File-based Configuration**: Manage configurations across multiple files with `Kfg`.

- ✅ **Relations**: Create one-to-one and one-to-many relations between configurations.

---

## 📖 Documentation

- **[Full Usage Guide](https://kfg.drylian.com/)**: Learn how to install and use Kfg.

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
import { Kfg } from "kfg";
import { envDriver } from "kfg/drivers";
import { AppSchema } from "./schema";

const config = new Kfg(envDriver, AppSchema);
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

## File-based Configuration with `Kfg`

`Kfg` allows you to manage configurations across multiple files, which is useful for managing configurations for different users, tenants, or environments.

**1. Define your schemas:**

```typescript
import { Kfg, c, cfs, jsonDriver } from "kfg";

const inventory = new Kfg(jsonDriver, {
    items: c.array(c.string()),
});

const user = new Kfg(jsonDriver, {
    name: c.string(),
    inventory_ids: cfs.many(inventory),
});
```

**2. Initialize `Kfg`:**

```typescript
inventory.init((id) => `resources/inventory/${id}.json`);
user.init((id) => `resources/users/${id}.json`);
```

**3. Use it:**

```typescript
const user1 = user.file("user-1");
user1.set("name", "Alice");

const inv1 = inventory.file("inv-1");
inv1.set("items", ["sword", "shield"]);

user1.set("inventory_ids", [inv1]);

const user1Inventories = await user1.getMany("inventory_ids");
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