import type { BoundingBox, BoundingSphere, Plane } from '@galacean/engine-math';
import { Vector3 } from '@galacean/engine-math';

/**
 * 射线类
 *
 * 用于光线投射查询，必须指定起点和归一化方向
 */
export class Ray {
  /** 射线起点 */
  public origin: Vector3;
  /** 射线方向 (必须归一化) */
  public direction: Vector3;

  /**
   * 创建射线
   * @param origin - 起点 (默认: 0,0,0)
   * @param direction - 方向 (默认: 0,0,1，会自动归一化)
   */
  constructor(origin?: Vector3, direction?: Vector3) {
    this.origin = origin ? origin.clone() : new Vector3(0, 0, 0);

    if (direction) {
      this.direction = direction.clone();
      this.direction.normalize();
    } else {
      this.direction = new Vector3(0, 0, 1);
    }
  }

  /**
   * 获取指定距离的点
   */
  getPoint(distance: number): Vector3 {
    const scaled = new Vector3();
    Vector3.scale(this.direction, distance, scaled);
    const result = new Vector3();
    Vector3.add(this.origin, scaled, result);
    return result;
  }

  /**
   * 与 AABB 相交测试
   * @returns 相交距离，如果不相交返回 null
   */
  intersectBox(box: BoundingBox): number | null {
    const invDir = new Vector3(
      1 / (this.direction.x || 1e-10),
      1 / (this.direction.y || 1e-10),
      1 / (this.direction.z || 1e-10),
    );

    let tMin = -Infinity;
    let tMax = Infinity;

    // X 轴
    const t1 = (box.min.x - this.origin.x) * invDir.x;
    const t2 = (box.max.x - this.origin.x) * invDir.x;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));

    // Y 轴
    const t3 = (box.min.y - this.origin.y) * invDir.y;
    const t4 = (box.max.y - this.origin.y) * invDir.y;
    tMin = Math.max(tMin, Math.min(t3, t4));
    tMax = Math.min(tMax, Math.max(t3, t4));

    // Z 轴
    const t5 = (box.min.z - this.origin.z) * invDir.z;
    const t6 = (box.max.z - this.origin.z) * invDir.z;
    tMin = Math.max(tMin, Math.min(t5, t6));
    tMax = Math.min(tMax, Math.max(t5, t6));

    if (tMax >= Math.max(tMin, 0)) {
      return tMin >= 0 ? tMin : tMax;
    }

    return null;
  }

  /**
   * 与包围球相交测试
   * @returns 相交距离，如果不相交返回 null
   */
  intersectSphere(sphere: BoundingSphere): number | null {
    const m = new Vector3();
    Vector3.subtract(this.origin, sphere.center, m);
    const b = Vector3.dot(m, this.direction);
    const c = Vector3.dot(m, m) - sphere.radius * sphere.radius;

    if (c > 0 && b >= 0) {
      return null;
    }

    const discriminant = b * b - c;

    if (discriminant < 0) {
      return null;
    }

    const t = -b - Math.sqrt(discriminant);
    return t >= 0 ? t : -b + Math.sqrt(discriminant);
  }

  /**
   * 与平面相交测试
   * @returns 相交距离，如果不相交返回 null
   */
  intersectPlane(plane: Plane): number | null {
    const denominator = Vector3.dot(this.direction, plane.normal);

    if (Math.abs(denominator) < 1e-10) {
      return null; // 平行
    }

    const t = -(Vector3.dot(this.origin, plane.normal) + plane.distance) / denominator;
    return t >= 0 ? t : null;
  }

  /**
   * 创建从两点定义的射线
   */
  static fromPoints(start: Vector3, end: Vector3): Ray {
    const direction = new Vector3();
    Vector3.subtract(end, start, direction);
    direction.normalize();
    return new Ray(start.clone(), direction);
  }

  /**
   * 创建从参数定义的射线
   */
  static fromOriginDirection(origin: Vector3, direction: Vector3): Ray {
    return new Ray(origin.clone(), direction.clone());
  }
}
