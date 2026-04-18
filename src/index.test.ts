import { describe, it, expect } from 'vitest'
import {
  Kysely,
  SqliteQueryCompiler,
  SqliteAdapter,
  ValueNode,
  type Dialect,
  type Driver,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type CompiledQuery,
  type QueryResult,
} from 'kysely'
import { PaginationLimiterTransformer } from './index.js'
import type { PaginationLimiterOptions } from './index.js'

interface Database {
  users: {
    id: number
    name: string
    email: string
  }
  posts: {
    id: number
    title: string
    user_id: number
  }
}

class MockConnection implements DatabaseConnection {
  async executeQuery<R>(_compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    return { rows: [] as R[] }
  }
  async *streamQuery<R>(_compiledQuery: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    yield { rows: [] as R[] }
  }
}

class MockDriver implements Driver {
  async init() {}
  async acquireConnection() { return new MockConnection() }
  async releaseConnection() {}
  async beginTransaction() {}
  async commitTransaction() {}
  async rollbackTransaction() {}
  async destroy() {}
}

class MockDialect implements Dialect {
  createDriver() { return new MockDriver() }
  createQueryCompiler() { return new SqliteQueryCompiler() }
  createAdapter() { return new SqliteAdapter() }
  createIntrospector(_db: Kysely<any>): DatabaseIntrospector {
    return {} as DatabaseIntrospector
  }
}

const db = new Kysely<Database>({ dialect: new MockDialect() })

function transformQuery(queryNode: any, options: PaginationLimiterOptions) {
  const transformer = new PaginationLimiterTransformer(options)
  return transformer.transformNode(queryNode) as any
}

function getLimitValue(result: any): number | undefined {
  return result?.limit?.limit?.value
}

function getOffsetValue(result: any): number | undefined {
  return result?.offset?.offset?.value
}

describe('PaginationLimiterTransformer', () => {
  describe('defaultTake', () => {
    it('should add defaultTake as limit when no limit is set', () => {
      const node = db.selectFrom('users').selectAll().toOperationNode()
      const result = transformQuery(node, { defaultTake: 20 })
      expect(getLimitValue(result)).toBe(20)
    })

    it('should use -1 as default when defaultTake is not provided', () => {
      const node = db.selectFrom('users').selectAll().toOperationNode()
      const result = transformQuery(node, {})
      expect(getLimitValue(result)).toBe(-1)
    })

    it('should not override existing limit when defaultTake is set', () => {
      const node = db.selectFrom('users').selectAll().limit(5).toOperationNode()
      const result = transformQuery(node, { defaultTake: 20 })
      expect(getLimitValue(result)).toBe(5)
    })
  })

  describe('maxTake', () => {
    it('should cap limit to maxTake when limit exceeds maxTake', () => {
      const node = db.selectFrom('users').selectAll().limit(200).toOperationNode()
      const result = transformQuery(node, { maxTake: 100 })
      expect(getLimitValue(result)).toBe(100)
    })

    it('should cap limit to maxTake when limit is negative', () => {
      const node = db.selectFrom('users').selectAll().limit(-1).toOperationNode()
      const result = transformQuery(node, { maxTake: 100 })
      expect(getLimitValue(result)).toBe(100)
    })

    it('should not modify limit when it is within maxTake', () => {
      const node = db.selectFrom('users').selectAll().limit(50).toOperationNode()
      const result = transformQuery(node, { maxTake: 100 })
      expect(getLimitValue(result)).toBe(50)
    })

    it('should not restrict limit when maxTake is not set', () => {
      const node = db.selectFrom('users').selectAll().limit(9999).toOperationNode()
      const result = transformQuery(node, {})
      expect(getLimitValue(result)).toBe(9999)
    })

    it('should not modify limit when it equals maxTake', () => {
      const node = db.selectFrom('users').selectAll().limit(100).toOperationNode()
      const result = transformQuery(node, { maxTake: 100 })
      expect(getLimitValue(result)).toBe(100)
    })
  })

  describe('maxSkip', () => {
    it('should cap offset to maxSkip when offset exceeds maxSkip', () => {
      const node = db.selectFrom('users').selectAll().offset(5000).toOperationNode()
      const result = transformQuery(node, { maxSkip: 1000 })
      expect(getOffsetValue(result)).toBe(1000)
    })

    it('should not modify offset when it is within maxSkip', () => {
      const node = db.selectFrom('users').selectAll().offset(500).toOperationNode()
      const result = transformQuery(node, { maxSkip: 1000 })
      expect(getOffsetValue(result)).toBe(500)
    })

    it('should not restrict offset when maxSkip is not set', () => {
      const node = db.selectFrom('users').selectAll().offset(5000).toOperationNode()
      const result = transformQuery(node, {})
      expect(getOffsetValue(result)).toBe(5000)
    })

    it('should not add offset when there is none', () => {
      const node = db.selectFrom('users').selectAll().toOperationNode()
      const result = transformQuery(node, { maxSkip: 1000 })
      expect(result.offset).toBeUndefined()
    })

    it('should not modify offset when it equals maxSkip', () => {
      const node = db.selectFrom('users').selectAll().offset(1000).toOperationNode()
      const result = transformQuery(node, { maxSkip: 1000 })
      expect(getOffsetValue(result)).toBe(1000)
    })
  })

  describe('combined options', () => {
    it('should add defaultTake without offset when no limit and no offset are set', () => {
      const node = db.selectFrom('users').selectAll().toOperationNode()
      const result = transformQuery(node, { defaultTake: 20, maxTake: 100, maxSkip: 1000 })
      expect(getLimitValue(result)).toBe(20)
      expect(result.offset).toBeUndefined()
    })

    it('should cap both limit and offset when both exceed their limits', () => {
      const node = db.selectFrom('users').selectAll().limit(500).offset(5000).toOperationNode()
      const result = transformQuery(node, { maxTake: 100, maxSkip: 1000 })
      expect(getLimitValue(result)).toBe(100)
      expect(getOffsetValue(result)).toBe(1000)
    })

    it('should apply defaultTake and cap offset at the same time', () => {
      const node = db.selectFrom('users').selectAll().offset(5000).toOperationNode()
      const result = transformQuery(node, { defaultTake: 20, maxSkip: 1000 })
      expect(getLimitValue(result)).toBe(20)
      expect(getOffsetValue(result)).toBe(1000)
    })

    it('should cap limit with maxTake while keeping offset unchanged', () => {
      const node = db.selectFrom('users').selectAll().limit(500).offset(500).toOperationNode()
      const result = transformQuery(node, { maxTake: 100, maxSkip: 1000 })
      expect(getLimitValue(result)).toBe(100)
      expect(getOffsetValue(result)).toBe(500)
    })
  })

  describe('complex queries', () => {
    it('should handle pagination for queries with where clause', () => {
      const node = db
        .selectFrom('users')
        .selectAll()
        .where('id', '>', 10)
        .limit(500)
        .offset(5000)
        .toOperationNode()
      const result = transformQuery(node, { maxTake: 100, maxSkip: 1000 })
      expect(getLimitValue(result)).toBe(100)
      expect(getOffsetValue(result)).toBe(1000)
    })

    it('should handle pagination for queries with orderBy', () => {
      const node = db
        .selectFrom('users')
        .selectAll()
        .orderBy('id', 'desc')
        .limit(500)
        .toOperationNode()
      const result = transformQuery(node, { maxTake: 100 })
      expect(getLimitValue(result)).toBe(100)
    })

    it('should handle pagination for queries with join', () => {
      const node = db
        .selectFrom('users')
        .innerJoin('posts', 'posts.user_id', 'users.id')
        .selectAll()
        .limit(500)
        .offset(5000)
        .toOperationNode()
      const result = transformQuery(node, { maxTake: 100, maxSkip: 1000 })
      expect(getLimitValue(result)).toBe(100)
      expect(getOffsetValue(result)).toBe(1000)
    })

    it('should handle pagination for queries with groupBy', () => {
      const node = db
        .selectFrom('users')
        .select('name')
        .groupBy('name')
        .limit(500)
        .toOperationNode()
      const result = transformQuery(node, { maxTake: 100 })
      expect(getLimitValue(result)).toBe(100)
    })

    it('should handle pagination for queries selecting partial fields', () => {
      const node = db
        .selectFrom('users')
        .select(['id', 'name'])
        .limit(500)
        .offset(5000)
        .toOperationNode()
      const result = transformQuery(node, { maxTake: 100, maxSkip: 1000 })
      expect(getLimitValue(result)).toBe(100)
      expect(getOffsetValue(result)).toBe(1000)
    })

    it('should add defaultTake for complex queries without pagination params', () => {
      const node = db
        .selectFrom('users')
        .innerJoin('posts', 'posts.user_id', 'users.id')
        .select(['users.id', 'posts.title'])
        .where('users.id', '>', 10)
        .orderBy('users.id', 'asc')
        .toOperationNode()
      const result = transformQuery(node, { defaultTake: 20 })
      expect(getLimitValue(result)).toBe(20)
    })
  })
})
