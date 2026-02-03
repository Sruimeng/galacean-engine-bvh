/**
 * @galacean/engine-bvh - BVH 空间加速结构包
 *
 * 高效的 BVH (Bounding Volume Hierarchy) 实现，用于：
 * - 碰撞检测
 * - 光线投射 (Raycast)
 * - 空间范围查询
 * - 最近邻搜索
 * - 三角形级别的 Mesh BVH（类似 three-mesh-bvh）
 *
 * ## 快速开始（推荐方式）
 *
 * 使用 Script 组件方式，最简单的集成方法：
 *
 * ```typescript
 * import { BVHManager, BVHCollider } from '@galacean/engine-bvh';
 *
 * // 1. 在场景根节点添加 BVH 管理器
 * const manager = rootEntity.addComponent(BVHManager);
 * manager.initialize();
 *
 * // 2. 在需要碰撞检测的 Entity 上添加碰撞体
 * const collider = cubeEntity.addComponent(BVHCollider);
 *
 * // 3. 执行射线检测
 * const ray = new Ray(origin, direction);
 * const hits = manager.raycast(ray, 100);
 * ```
 */

// ============ Galacean Script 组件（推荐使用） ============
export {
  // BVH 碰撞体
  BVHCollider,
  // BVH 管理器
  BVHManager,
  ColliderShapeType,
  // MeshBVH 碰撞体（精确三角形检测）
  MeshBVHCollider,
} from './scripts';

export type {
  BVHColliderOptions,
  BVHManagerOptions,
  IBVHCollider,
  MeshBVHColliderOptions,
  PreciseRaycastHit,
  RaycastHit,
} from './scripts';

// ============ 核心类（高级用法） ============
export { BVHNode } from './BVHNode';
export { BVHTree } from './BVHTree';

// 三角形级别的 Mesh BVH
export { MeshBVH } from './MeshBVH';
export type { MeshBVHStats, MeshRaycastHit } from './MeshBVH';
export { Triangle } from './Triangle';

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

// 类型 - 注意：CollisionResult 类已从 './CollisionResult' 导出，这里导出其他接口类型
export type { BVHInsertObject, BVHStats, SpatialQueryResult } from './types';

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
 * 当前版本号 - 与 package.json 保持一致
 */
export const VERSION = '0.0.1';
