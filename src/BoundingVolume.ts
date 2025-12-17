import type { BoundingBox, Vector3 } from '@galacean/engine-math';
import type { Ray } from './Ray';

/**
 * 包围体基类
 *
 * 定义了所有包围体必须实现的通用接口
 */
export abstract class BoundingVolume {
  /**
   * 与另一个包围体相交测试
   */
  abstract intersect(other: BoundingVolume): boolean;

  /**
   * 与射线相交测试
   */
  abstract intersectRay(ray: Ray): boolean;

  /**
   * 包含指定点
   */
  abstract contains(point: Vector3): boolean;

  /**
   * 获取包围盒
   */
  abstract getBounds(): BoundingBox;

  /**
   * 获取中心点
   */
  abstract getCenter(): Vector3;

  /**
   * 计算体积
   */
  abstract volume(): number;

  /**
   * 计算表面积
   */
  abstract surfaceArea(): number;
}
