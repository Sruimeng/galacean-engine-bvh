console.log('Galacean Engine BVH Demo Center');
/**
 * @galacean/engine-bvh - BVH 空间加速结构包
 *
 * 高效的 BVH (Bounding Volume Hierarchy) 实现，用于：
 * - 碰撞检测
 * - 光线投射 (Raycast)
 * - 空间范围查询
 * - 最近邻搜索
 */

// 核心类
export { BVHNode } from './BVHNode';
export { BVHTree } from './BVHTree';

// 包围体
export { AABB } from './AABB';
export { BoundingSphere } from './BoundingSphere';
export { BoundingVolume } from './BoundingVolume';

// 几何类
export { CollisionResult } from './CollisionResult';
export { Ray } from './Ray';

// 构建器
export { BVHBuilder } from './BVHBuilder';

// 枚举
export { BVHBuildStrategy, BoundingVolumeType } from './enums';

// 类型
export type {
  BVHInsertObject,
  BVHStats,
  CollisionResult as CollisionResultType,
  SpatialQueryResult,
} from './types';

// 工具函数
export {
  PerformanceTimer,
  boundsIntersects,
  boundsSurfaceArea,
  boundsVolume,
  getLongestAxis,
  toAABB,
  toBoundingSphere,
  unionBounds,
} from './utils';

/**
 * 当前版本号
 */
export const VERSION = '1.6.11';
