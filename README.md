# zenstack-pagination-limiter

A [ZenStack](https://zenstack.dev/) runtime plugin that automatically enforces pagination limits on Kysely queries to prevent unsafe unbounded queries.

## Features

- **defaultTake** — Automatically adds a `LIMIT` to queries that don't specify one
- **maxTake** — Caps the maximum `LIMIT` value to prevent excessively large result sets
- **maxSkip** — Caps the maximum `OFFSET` value to prevent deep-pagination performance issues

## Installation

```bash
npm install zenstack-pagination-limiter
```

## Usage

```typescript
import PaginationLimiter from 'zenstack-pagination-limiter'
import { ZenStackClient } from '@zenstackhq/orm';
import schema from './schema.js';

const client = new ZenStackClient(schema, {
    plugins: [
        PaginationLimiter({
          defaultTake: 20,
          maxTake: 100,
          maxSkip: 1000,
        }),
    ],
});
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `defaultTake` | `number` | `-1` | The `LIMIT` value applied when a query has no limit. `-1` means no limit (Kysely convention). |
| `maxTake` | `number` | — | The maximum allowed `LIMIT` value. Queries with a limit exceeding this value (or a negative limit) will be capped. |
| `maxSkip` | `number` | — | The maximum allowed `OFFSET` value. Queries with an offset exceeding this value will be capped. |

All options are optional. You can use them individually or in combination.

## How It Works

The plugin uses Kysely's `OperationNodeTransformer` to intercept and transform `SelectQueryNode` objects before they are executed:

1. If no `LIMIT` is set and `defaultTake` is configured, a default limit is added
2. If a `LIMIT` exceeds `maxTake` or is negative, it is capped to `maxTake`
3. If an `OFFSET` exceeds `maxSkip`, it is capped to `maxSkip`

## Examples

### Prevent queries without a limit

```typescript
PaginationLimiter({ defaultTake: 50 })
// SELECT * FROM users       → SELECT * FROM users LIMIT 50
```

### Cap maximum page size

```typescript
PaginationLimiter({ maxTake: 100 })
// SELECT * FROM users LIMIT 9999 → SELECT * FROM users LIMIT 100
// SELECT * FROM users LIMIT -1   → SELECT * FROM users LIMIT 100
// SELECT * FROM users LIMIT 50   → SELECT * FROM users LIMIT 50  (unchanged)
```

### Prevent deep pagination

```typescript
PaginationLimiter({ maxSkip: 5000 })
// SELECT * FROM users OFFSET 10000 → SELECT * FROM users OFFSET 5000
// SELECT * FROM users OFFSET 3000  → SELECT * FROM users OFFSET 3000 (unchanged)
```

### All options combined

```typescript
PaginationLimiter({ defaultTake: 20, maxTake: 100, maxSkip: 1000 })
// SELECT * FROM users                     → SELECT * FROM users LIMIT 20
// SELECT * FROM users LIMIT 500           → SELECT * FROM users LIMIT 100
// SELECT * FROM users LIMIT 500 OFFSET 5000 → SELECT * FROM users LIMIT 100 OFFSET 1000
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npx vitest run
```

## License

MIT
