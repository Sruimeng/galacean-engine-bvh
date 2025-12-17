import { BoundingBox, Vector3 } from '@galacean/engine-math';
import { BoundingSphere } from './BoundingSphere';
import { BoundingVolume } from './BoundingVolume';
import type { Ray } from './Ray';

/**
 * 轴对齐包围盒 (Axis-Aligned Bounding Box)
 *
 * 最常用的包围体类型，计算效率高，支持快速相交测试
 */
export class AABB extends BoundingVolume {
  /** 最小角点 */
  public min: Vector3;
  /** 最大角点 */
  public max: Vector3;

  /** 复用的临时向量，用于射线相交计算 */
  private static readonly _tempInvDir = new Vector3();

  /**
   * 创建 AABB
   * @param min - 最小角点 (默认: +∞)
   * @param max - 最大角点 (默认: -∞)
   */
  constructor(min?: Vector3, max?: Vector3) {
    super();
    this.min = min ? min.clone() : new Vector3(Infinity, Infinity, Infinity);
    this.max = max ? max.clone() : new Vector3(-Infinity, -Infinity, -Infinity);
  }

  /**
   * 与另一个包围体相交测试
   */
  intersect(other: BoundingVolume): boolean {
    if (other instanceof AABB) {
      return this.intersectAABB(other);
    } else if (other instanceof BoundingSphere) {
      return other.intersectAABB(this);
    }
    return false;
  }

  /**
   * 与 AABB 相交测试
   */
  intersectAABB(other: AABB): boolean {
    return !(
      this.max.x < other.min.x ||
      this.min.x > other.max.x ||
      this.max.y < other.min.y ||
      this.min.y > other.max.y ||
      this.max.z < other.min.z ||
      this.min.z > other.max.z
    );
  }

  /**
   * 与射线相交测试
   */
  intersectRay(ray: Ray): boolean {
    return this.intersectRayDistance(ray) !== null;
  }

  /**
   * 计算射线与 AABB 的相交距离
   * @param ray - 射线
   * @returns 相交距离，如果不相交返回 null
   */
  intersectRayDistance(ray: Ray): number | null {
    // 复用静态向量避免每次创建新对象
    const invDir = AABB._tempInvDir;
    invDir.x = 1 / ray.direction.x;
    invDir.y = 1 / ray.direction.y;
    invDir.z = 1 / ray.direction.z;

    let tMin = -Infinity;
    let tMax = Infinity;

    // X 轴
    const t1 = (this.min.x - ray.origin.x) * invDir.x;
    const t2 = (this.max.x - ray.origin.x) * invDir.x;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));

    // Y 轴
    const t3 = (this.min.y - ray.origin.y) * invDir.y;
    const t4 = (this.max.y - ray.origin.y) * invDir.y;
    tMin = Math.max(tMin, Math.min(t3, t4));
    tMax = Math.min(tMax, Math.max(t3, t4));

    // Z 轴
    const t5 = (this.min.z - ray.origin.z) * invDir.z;
    const t6 = (this.max.z - ray.origin.z) * invDir.z;
    tMin = Math.max(tMin, Math.min(t5, t6));
    tMax = Math.min(tMax, Math.max(t5, t6));

    // 检查是否相交
    if (tMax >= Math.max(tMin, 0)) {
      return tMin >= 0 ? tMin : tMax;
    }

    return null;
  }

  /**
   * 包含指定点
   */
  contains(point: Vector3): boolean {
    return (
      point.x >= this.min.x &&
      point.x <= this.max.x &&
      point.y >= this.min.y &&
      point.y <= this.max.y &&
      point.z >= this.min.z &&
      point.z <= this.max.z
    );
  }

  /**
   * 获取新的 BoundingBox
   */
  getBounds(): BoundingBox {
    return new BoundingBox(this.min.clone(), this.max.clone());
  }

  /**
   * 获取中心点
   */
  getCenter(): Vector3 {
    const center = new Vector3();
    Vector3.add(this.min, this.max, center);
    center.scale(0.5);
    return center;
  }

  /**
   * 扩展包围盒
   */
  expand(delta: number): void {
    this.min.x -= delta;
    this.min.y -= delta;
    this.min.z -= delta;
    this.max.x += delta;
    this.max.y += delta;
    this.max.z += delta;
  }

  /**
   * 合并另一个 AABB
   */
  union(other: AABB): AABB {
    return new AABB(
      new Vector3(
        Math.min(this.min.x, other.min.x),
        Math.min(this.min.y, other.min.y),
        Math.min(this.min.z, other.min.z),
      ),
      new Vector3(
        Math.max(this.max.x, other.max.x),
        Math.max(this.max.y, other.max.y),
        Math.max(this.max.z, other.max.z),
      ),
    );
  }

  /**
   * 计算体积
   */
  volume(): number {
    const size = new Vector3();
    Vector3.subtract(this.max, this.min, size);
    return Math.max(0, size.x * size.y * size.z);
  }

  /**
   * 计算表面积
   */
  surfaceArea(): number {
    const size = new Vector3();
    Vector3.subtract(this.max, this.min, size);
    return 2 * (size.x * size.y + size.y * size.z + size.z * size.x);
  }

  /**
   * 从 BoundingBox 创建 AABB
   */
  static fromBoundingBox(box: BoundingBox): AABB {
    return new AABB(box.min.clone(), box.max.clone());
  }

  /**
   * 从中心点和大小创建 AABB
   */
  static fromCenterSize(center: Vector3, size: Vector3): AABB {
    const half = new Vector3(size.x * 0.5, size.y * 0.5, size.z * 0.5);
    const min = new Vector3();
    const max = new Vector3();
    Vector3.subtract(center, half, min);
    Vector3.add(center, half, max);
    return new AABB(min, max);
  }
}
