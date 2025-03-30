# ConfigJS - Type-Safe Environment Configuration Manager

## Overview

ConfigJS is a robust, type-safe configuration management system for Node.js applications. It provides a structured way to define, validate, and access environment variables and other configuration sources with full TypeScript support.

## Features

- **Type-safe configuration** with TypeScript inference
- **Multiple drivers** (env, file, etc.)
- **Synchronous and asynchronous** support
- **Validation and transformation** of configuration values
- **Nested configuration** structures
- **Caching** of resolved values
- **CRUD operations** for configuration values
- **Schema definition** for all configuration keys

## Installation

```bash
npm install @caeljs/config
# or
yarn add @caeljs/config
# or
bun add @caeljs/config
```

## Basic Usage

### 1. Define your configuration schema

```typescript
import { c, ConfigJS, ConfigJSDriver } from "@caeljs/config";

const Config = new ConfigJS(envDriver, {
  db: {
    host: c.string().prop("DB_HOST"),
    port: c.number().prop("DB_PORT"),
    username: c.string().prop("DB_USER"),
    password: c.string().secret().prop("DB_PASS"),
  },
  environment: c.enum(["development", "production", "staging"]).prop("NODE_ENV"),
  featureFlags: {
    newUI: c.boolean().default(false).prop("NEW_UI_ENABLED"),
  }
});
```

### 2. Load configuration

```typescript
// Load
Config.load();

// Or load with additional options
Config.load({
  processEnv: false,
});
```

### 3. Use configuration values

```typescript

// Get values
const dbHost = Config.get("db.host");
const isProduction = Config.get("environment") === "production";

// Set values
Config.set("featureFlags.newUI", true);

// Delete values
Config.del("db.password");
```

## API Reference

Main configuration manager class.

**Constructor:**
```typescript
import { ConfigJS } from "@caeljs/config";

new ConfigJS(driver: AnyConfigDriver, shapes: Shapes)
```

**Properties:**
- `async`: Boolean indicating if driver operates asynchronously
- `cached`: Object with cached values of all configurations
- `shapes`: Original shape definitions
- `driver`: The configuration driver instance
- `config`: Driver-specific configuration

**Methods:**
- `getSchema(key)`: Get the shape definition for a key
- `get(key)`: Get a configuration value
- `set(key, value)`: Set a configuration value
- `del(key)`: Delete a configuration value
- `conf(key)`: Get configuration metadata
- `keys()`: Get all configuration keys
- `has(...keys)`: Check if keys exist
- `load(opts)`: Load configuration
- `save()`: Save current configuration

### Shape Types

All shape types extend `BaseShape` and provide validation and transformation:

- `StringShape`: String values
- `NumberShape`: Numeric values
- `BooleanShape`: Boolean values
- `EnumShape`: Enumeration of allowed values
- `ObjectShape`: Nested objects
- `ArrayShape`: Arrays of values
- `RecordShape`: Dictionary types

Each shape provides methods:
- `.prop(envVar)`: Map to environment variable
- `.default(value)`: Set default value
- `.secret()`: Mark as sensitive value
- `.refire(fn)`: Add custom validation
- `.transform(fn)`: Add transformation
- `.coerce()`: Enable type coercion
- And another props, based on type 

### Drivers

Built-in drivers:
- `envDriver`: Environment variables driver

Driver interface:
```typescript
interface AnyConfigDriver<IsAsync extends boolean, ConfigType> {
  async: IsAsync;
  config: ConfigType;
  get(shape: BaseShape<any>): IsAsync extends true ? Promise<any> : any;
  set(shape: BaseShape<any>, value: any): IsAsync extends true ? Promise<void> : void;
  del(shape: BaseShape<any>): IsAsync extends true ? Promise<void> : void;
  has(...shapes: BaseShape<any>[]): IsAsync extends true ? Promise<boolean> : boolean;
  load(shapes: BaseShape<any>[]): IsAsync extends true ? Promise<void> : void;
  save(shapes: BaseShape<any>[]): IsAsync extends true ? Promise<void> : void;
}
```

## Advanced Usage

### Custom Validation

```typescript
const config = new ConfigJS(envDriver, {
  port: c.number()
    .prop("APP_PORT")
    .refine(val => (val > 1024), "Port must be > 1024")
    .default(3000),
});
```

### Creating Custom Drivers

```typescript
import { c, ConfigJS, ConfigJSDriver } from "@caeljs/config";

const fileDriver = new ConfigJSDriver({
  async: true,
  config: { filePath: './config.json' },
  async get(shape) {
    const config = await readJsonFile(this.config.filePath);
    return config[shape._prop];
  },
  // Implement other required methods...
});

const fileConfig = new ConfigJS(fileDriver, {
  settings: c.object({
    logLevel: c.string().prop("logLevel"),
  }),
});
```

## Best Practices

1. **Centralize configuration**: Define all configuration in one place
2. **Use descriptive names**: For both config keys and env vars
3. **Validate early**: Validate configuration at application startup
4. **Use secrets marking**: For sensitive values
5. **Provide defaults**: Wherever possible
6. **Document schema**: Add comments explaining each configuration

## Type Safety

ConfigJS provides complete TypeScript support:

```typescript
import { c, ConfigJS } from "@caeljs/config";

const config = new ConfigJS(envDriver, {
  server: {
    port: c.number().prop("PORT"),
    ssl: c.boolean().prop("SSL_ENABLED"),
  },
});

// Type is inferred as number
const port = config.get("server.port");

// Type error - port is a number
config.set("server.port", "8080"); // Error: Type 'string' is not assignable to type 'number'
```

## License

MIT