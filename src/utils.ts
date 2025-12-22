import type { BoundingBox } from '@galacean/engine-math';
import { Vector3 } from '@galacean/engine-math';
import { AABB } from './AABB';
import { BoundingSphere } from './BoundingSphere';

/**
 * 计算两个包围盒的联合包围盒
 */
export function unionBounds(a: BoundingBox, b: BoundingBox): BoundingBox {
  const aabbA = AABB.fromBoundingBox(a);
  const aabbB = AABB.fromBoundingBox(b);
  return aabbA.union(aabbB).getBounds();
}

/**
 * 计算包围盒的体积
 */
export function boundsVolume(bounds: BoundingBox): number {
  const size = new Vector3();
  Vector3.subtract(bounds.max, bounds.min, size);
  return Math.max(0, size.x * size.y * size.z);
}

/**
 * 计算包围盒的表面积
 */
export function boundsSurfaceArea(bounds: BoundingBox): number {
  const size = new Vector3();
  Vector3.subtract(bounds.max, bounds.min, size);
  return 2 * (size.x * size.y + size.y * size.z + size.z * size.x);
}

/**
 * 检查两个包围盒是否相交
 */
export function boundsIntersects(a: BoundingBox, b: BoundingBox): boolean {
  return !(
    a.max.x < b.min.x ||
    a.min.x > b.max.x ||
    a.max.y < b.min.y ||
    a.min.y > b.max.y ||
    a.max.z < b.min.z ||
    a.min.z > b.max.z
  );
}

/**
 * 获取包围盒的最长轴
 * @returns 0: X, 1: Y, 2: Z
 */
export function getLongestAxis(bounds: BoundingBox): number {
  const size = new Vector3();
  Vector3.subtract(bounds.max, bounds.min, size);
  if (size.x > size.y && size.x > size.z) return 0;
  if (size.y > size.z) return 1;
  return 2;
}

/**
 * 将包围盒转换为 AABB
 */
export function toAABB(bounds: BoundingBox): AABB {
  return AABB.fromBoundingBox(bounds);
}

/**
 * 将包围盒转换为 BoundingSphere
 */
export function toBoundingSphere(bounds: BoundingBox): BoundingSphere {
  const center = new Vector3();
  Vector3.add(bounds.min, bounds.max, center);
  center.scale(0.5);

  const halfSize = new Vector3();
  Vector3.subtract(bounds.max, bounds.min, halfSize);
  const radius = halfSize.length() / 2;

  return new BoundingSphere(center, radius);
}

/**
 * 性能计时器辅助类
 */
export class PerformanceTimer {
  private startTime: number = 0;
  private totalTime: number = 0;

  start(): void {
    this.startTime = performance.now();
  }

  stop(): number {
    const elapsed = performance.now() - this.startTime;
    this.totalTime += elapsed;
    return elapsed;
  }

  reset(): void {
    this.totalTime = 0;
    this.startTime = 0;
  }

  getTotal(): number {
    return this.totalTime;
  }
}
