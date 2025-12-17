import type { BoundingBox } from '@galacean/engine-math';
import type { BVHNode } from './BVHNode';

/**
 * BVH 树统计信息
 */
export interface BVHStats {
  /** 节点总数 */
  nodeCount: number;
  /** 叶子节点数 */
  leafCount: number;
  /** 树的最大深度 */
  maxDepth: number;
  /** 平衡因子 (越接近 1 越平衡) */
  balanceFactor: number;
  /** 对象总数 */
  objectCount: number;
  /** 内存使用估算 (字节) */
  memoryUsage: number;
}

/**
 * 插入到 BVH 的对象接口
 */
export interface BVHInsertObject {
  /** 对象的包围盒 */
  bounds: BoundingBox;
  /** 用户数据 */
  userData?: any;
}

/**
 * 碰撞检测结果
 */
export interface CollisionResult {
  /** 碰撞的对象（userData） */
  object: any;
  /** 碰撞距离 */
  distance: number;
  /** 碰撞点位置 */
  point?: { x: number; y: number; z: number };
  /** 碰撞法线 */
  normal?: { x: number; y: number; z: number };
  /** 碰撞的节点 */
  node: BVHNode;
}

/**
 * 空间查询结果
 */
export interface SpatialQueryResult {
  /** 用户数据 */
  userData: any;
  /** 包围盒 */
  bounds: BoundingBox;
}
