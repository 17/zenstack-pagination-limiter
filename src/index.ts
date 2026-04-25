import {
  OperationNodeTransformer, LimitNode, OffsetNode, ValueNode,
  SelectQueryNode
 } from 'kysely'
import { definePlugin } from '@zenstackhq/orm'
import type { SchemaDef } from '@zenstackhq/orm/schema'

export type PaginationLimiterOptions = {
  defaultTake?: number,
  maxTake?: number,
  maxSkip?: number
}

export class PaginationLimiterTransformer extends OperationNodeTransformer {

  private defaultTake: number;
  private maxTake: number | undefined;
  private maxSkip: number | undefined;

  constructor({ defaultTake, maxTake, maxSkip }: PaginationLimiterOptions) {
    super();
    this.defaultTake = defaultTake || -1;
    this.maxTake = maxTake;
    this.maxSkip = maxSkip;
  }

  transformSelectQuery(node: SelectQueryNode) {
    // 首先调用父类方法，确保子节点已经被处理
    const transformedNode = super.transformSelectQuery(node);
    let newLimit = transformedNode.limit;
    let newOffset = transformedNode.offset;
    if (!newLimit) {
      // 添加默认 limit
      newLimit = LimitNode.create(ValueNode.create(this.defaultTake))
    }
    else if (this.maxTake && ValueNode.is(newLimit.limit)) {
      // 检查并修正现有 limit
      const val: number = newLimit.limit.value as number;
      if (val > this.maxTake || val < 0) {
        newLimit = LimitNode.create(ValueNode.create(this.maxTake))
      }
    }

    if (this.maxSkip && newOffset && ValueNode.is(newOffset.offset) && newOffset.offset.value as number > this.maxSkip) {
      // 添加最大 offset
      newOffset = OffsetNode.create(ValueNode.create(this.maxSkip))
    }

    return {
      ...transformedNode,
      limit: newLimit,
      offset: newOffset
    };
  }
}

export default function <Schema extends SchemaDef> (options: PaginationLimiterOptions) {
  return definePlugin({
    id: 'pagination-limiter',
    name: 'Pagination Limiter Plugin',
    description: 'Automatically adds a default Take, enforces a maximum Take, and caps Skip for queries to prevent unsafe pagination',
    onKyselyQuery: (args) => {
      const transformer = new PaginationLimiterTransformer(options)
      const transformedQuery = transformer.transformNode(args.query)
      return args.proceed(transformedQuery)
    }
  })
}
