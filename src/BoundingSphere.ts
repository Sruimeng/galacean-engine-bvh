import { BoundingBox, Vector3 } from '@galacean/engine-math';
import { AABB } from './AABB';
import { BoundingVolume } from './BoundingVolume';
import type { Ray } from './Ray';

/**
 * 包围球 (Bounding Sphere)
 *
 * 适用于球形对象和旋转不变性的场景，计算简单
 */
export class BoundingSphere extends BoundingVolume {
  /** 球心 */
  public center: Vector3;
  /** 半径 */
  public radius: number;

  /**
   * 创建包围球
   * @param center - 球心 (默认: 0,0,0)
   * @param radius - 半径 (默认: 0)
   */
  constructor(center?: Vector3, radius?: number) {
    super();
    this.center = center ? center.clone() : new Vector3(0, 0, 0);
    this.radius = radius || 0;
  }

  /**
   * 与另一个包围体相交测试
   */
  intersect(other: BoundingVolume): boolean {
    if (other instanceof BoundingSphere) {
      return this.intersectSphere(other);
    } else if (other instanceof AABB) {
      return this.intersectAABB(other);
    }
    return false;
  }

  /**
   * 与包围球相交测试
   */
  intersectSphere(other: BoundingSphere): boolean {
    const distanceSq = Vector3.distanceSquared(this.center, other.center);
    const radiusSum = this.radius + other.radius;
    return distanceSq <= radiusSum * radiusSum;
  }

  /**
   * 与 AABB 相交测试
   */
  intersectAABB(aabb: AABB): boolean {
    // 找到 AABC 上最近的点
    const closest = new Vector3(
      Math.max(aabb.min.x, Math.min(this.center.x, aabb.max.x)),
      Math.max(aabb.min.y, Math.min(this.center.y, aabb.max.y)),
      Math.max(aabb.min.z, Math.min(this.center.z, aabb.max.z)),
    );

    // 计算到最近点的距离
    const distanceSq = Vector3.distanceSquared(this.center, closest);
    return distanceSq <= this.radius * this.radius;
  }

  /**
   * 与射线相交测试
   */
  intersectRay(ray: Ray): boolean {
    return this.intersectRayDistance(ray) !== null;
  }

  /**
   * 计算射线与球的相交距离
   */
  intersectRayDistance(ray: Ray): number | null {
    // 使用几何方法求解二次方程
    const m = new Vector3();
    Vector3.subtract(ray.origin, this.center, m);
    const b = Vector3.dot(m, ray.direction);
    const c = Vector3.dot(m, m) - this.radius * this.radius;

    // 如果 c > 0，射线起点在球外，且 b >= 0，则不会相交
    if (c > 0 && b >= 0) {
      return null;
    }

    const discriminant = b * b - c;

    // 无解，不相交
    if (discriminant < 0) {
      return null;
    }

    // 返回最近的相交距离
    const t = -b - Math.sqrt(discriminant);
    return t >= 0 ? t : -b + Math.sqrt(discriminant);
  }

  /**
   * 包含指定点
   */
  contains(point: Vector3): boolean {
    const distanceSq = Vector3.distanceSquared(this.center, point);
    return distanceSq <= this.radius * this.radius;
  }

  /**
   * 获取包围盒
   */
  getBounds(): BoundingBox {
    const halfRadius = this.radius;
    const min = new Vector3(
      this.center.x - halfRadius,
      this.center.y - halfRadius,
      this.center.z - halfRadius,
    );
    const max = new Vector3(
      this.center.x + halfRadius,
      this.center.y + halfRadius,
      this.center.z + halfRadius,
    );
    return new BoundingBox(min, max);
  }

  /**
   * 获取中心点
   */
  getCenter(): Vector3 {
    return this.center.clone();
  }

  /**
   * 与另一个包围球合并
   */
  merge(other: BoundingSphere): BoundingSphere {
    const distance = Vector3.distance(this.center, other.center);
    const newRadius = (distance + this.radius + other.radius) / 2;

    const centerDir = new Vector3();
    Vector3.subtract(other.center, this.center, centerDir);
    centerDir.normalize();

    const scaledDir = new Vector3();
    Vector3.scale(centerDir, newRadius - distance * 0.5, scaledDir);

    const newCenter = new Vector3();
    Vector3.add(this.center, scaledDir, newCenter);

    return new BoundingSphere(newCenter, newRadius);
  }

  /**
   * 包含另一个包围球
   */
  containsSphere(other: BoundingSphere): boolean {
    const distanceSq = Vector3.distanceSquared(this.center, other.center);
    const radiusDiff = this.radius - other.radius;
    return distanceSq <= radiusDiff * radiusDiff;
  }

  /**
   * 计算体积
   */
  volume(): number {
    return (4 / 3) * Math.PI * this.radius * this.radius * this.radius;
  }

  /**
   * 计算表面积
   */
  surfaceArea(): number {
    return 4 * Math.PI * this.radius * this.radius;
  }

  /**
   * 从中心点和半径创建
   */
  static fromCenterRadius(center: Vector3, radius: number): BoundingSphere {
    return new BoundingSphere(center.clone(), radius);
  }
}
