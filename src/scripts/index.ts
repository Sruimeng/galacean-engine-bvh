/**
 * Galacean Engine BVH Script 组件
 *
 * 提供基于 Galacean Script 机制的 BVH 封装，简化用户使用。
 */

// BVH 管理器
export { BVHManager } from './BVHManager';
export type { BVHManagerOptions, IBVHCollider, RaycastHit } from './BVHManager';

// BVH 碰撞体
export { BVHCollider, ColliderShapeType } from './BVHCollider';
export type { BVHColliderOptions } from './BVHCollider';

// MeshBVH 碰撞体（精确三角形检测）
export { MeshBVHCollider } from './MeshBVHCollider';
export type { MeshBVHColliderOptions, PreciseRaycastHit } from './MeshBVHCollider';
