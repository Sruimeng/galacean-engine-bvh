import { Vector3 } from '@galacean/engine-math';
import type { BVHNode } from './BVHNode';

/**
 * 碰撞检测结果
 */
export class CollisionResult {
  /** 碰撞的对象（userData） */
  public object: any;
  /** 碰撞距离 */
  public distance: number;
  /** 碰撞点位置 */
  public point: Vector3;
  /** 碰撞法线 */
  public normal: Vector3;
  /** 碰撞的节点 */
  public node: BVHNode;

  /**
   * 创建碰撞结果
   */
  constructor(object?: any, distance?: number, point?: Vector3, normal?: Vector3, node?: BVHNode) {
    this.object = object;
    this.distance = distance || 0;
    this.point = point || new Vector3();
    this.normal = normal || new Vector3();
    this.node = node;
  }

  /**
   * 克隆结果
   */
  clone(): CollisionResult {
    return new CollisionResult(
      this.object,
      this.distance,
      this.point.clone(),
      this.normal.clone(),
      this.node
    );
  }

  /**
   * 转换为字符串
   */
  toString(): string {
    return `CollisionResult(object=${this.object}, distance=${this.distance.toFixed(2)})`;
  }

  /**
   * 按距离排序比较函数
   */
  static compareByDistance(a: CollisionResult, b: CollisionResult): number {
    return a.distance - b.distance;
  }
}
