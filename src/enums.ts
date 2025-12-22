/**
 * BVH 构建策略枚举
 *
 * SAH: 表面积启发式 - 最优查询性能，构建较慢（推荐用于静态场景）
 * Median: 中位数分割 - 构建快速，性能均衡（推荐用于动态场景）
 * Equal: 均等分割 - 构建较快，适用于均匀分布
 */
export enum BVHBuildStrategy {
  /** 表面积启发式 - 最优查询性能 */
  SAH = 0,
  /** 中位数分割 - 构建快速 */
  Median = 1,
  /** 均等分割 - 均匀分布 */
  Equal = 2,
}

/**
 * 包围体类型
 */
export enum BoundingVolumeType {
  AABB = 0,
  BoundingSphere = 1,
}
