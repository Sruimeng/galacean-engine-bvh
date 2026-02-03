import { Vector3 } from '@galacean/engine-math';
import type { Ray } from './Ray';

/**
 * 三角形类
 *
 * 用于存储三角形的三个顶点，并提供射线-三角形相交测试
 * 使用 Möller–Trumbore 算法进行高效的相交检测
 */
export class Triangle {
  /** 顶点 A */
  public a: Vector3;
  /** 顶点 B */
  public b: Vector3;
  /** 顶点 C */
  public c: Vector3;
  /** 三角形索引（在原始 Mesh 中的索引） */
  public index: number;
  /** 用户数据 */
  public userData?: any;

  /**
   * 创建三角形
   * @param a - 顶点 A
   * @param b - 顶点 B
   * @param c - 顶点 C
   * @param index - 三角形索引
   * @param userData - 用户数据
   */
  constructor(a: Vector3, b: Vector3, c: Vector3, index: number = 0, userData?: any) {
    this.a = a.clone();
    this.b = b.clone();
    this.c = c.clone();
    this.index = index;
    this.userData = userData;
  }

  /**
   * 从顶点数组创建三角形
   * @param positions - 顶点位置数组 [x0, y0, z0, x1, y1, z1, ...]
   * @param i0 - 第一个顶点的索引
   * @param i1 - 第二个顶点的索引
   * @param i2 - 第三个顶点的索引
   * @param triangleIndex - 三角形索引
   * @param userData - 用户数据
   */
  static fromPositions(
    positions: Float32Array | number[],
    i0: number,
    i1: number,
    i2: number,
    triangleIndex: number = 0,
    userData?: any,
  ): Triangle {
    const a = new Vector3(positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2]);
    const b = new Vector3(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2]);
    const c = new Vector3(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2]);
    return new Triangle(a, b, c, triangleIndex, userData);
  }

  /**
   * 计算三角形的中心点
   */
  getCenter(): Vector3 {
    const center = new Vector3();
    Vector3.add(this.a, this.b, center);
    Vector3.add(center, this.c, center);
    center.scale(1 / 3);
    return center;
  }

  /**
   * 计算三角形的法线（未归一化）
   */
  getNormal(): Vector3 {
    const edge1 = new Vector3();
    const edge2 = new Vector3();
    const normal = new Vector3();

    Vector3.subtract(this.b, this.a, edge1);
    Vector3.subtract(this.c, this.a, edge2);
    Vector3.cross(edge1, edge2, normal);

    return normal;
  }

  /**
   * 计算三角形的面积
   */
  getArea(): number {
    const normal = this.getNormal();
    return normal.length() * 0.5;
  }

  /**
   * 射线-三角形相交测试（Möller–Trumbore 算法）
   *
   * @param ray - 射线
   * @param cullBackface - 是否剔除背面（默认 false）
   * @returns 相交距离，如果不相交返回 null
   */
  intersectRay(ray: Ray, cullBackface: boolean = false): number | null {
    const EPSILON = 1e-8;

    // 计算边向量
    const edge1 = new Vector3();
    const edge2 = new Vector3();
    Vector3.subtract(this.b, this.a, edge1);
    Vector3.subtract(this.c, this.a, edge2);

    // 计算行列式
    const h = new Vector3();
    Vector3.cross(ray.direction, edge2, h);
    const det = Vector3.dot(edge1, h);

    // 背面剔除检查
    if (cullBackface && det < EPSILON) {
      return null;
    }

    // 射线与三角形平行
    if (Math.abs(det) < EPSILON) {
      return null;
    }

    const invDet = 1.0 / det;

    // 计算从顶点 A 到射线原点的向量
    const s = new Vector3();
    Vector3.subtract(ray.origin, this.a, s);

    // 计算 u 参数并测试边界
    const u = invDet * Vector3.dot(s, h);
    if (u < 0.0 || u > 1.0) {
      return null;
    }

    // 计算 v 参数并测试边界
    const q = new Vector3();
    Vector3.cross(s, edge1, q);
    const v = invDet * Vector3.dot(ray.direction, q);
    if (v < 0.0 || u + v > 1.0) {
      return null;
    }

    // 计算 t 参数（射线上的距离）
    const t = invDet * Vector3.dot(edge2, q);

    // 检查 t 是否为正（射线方向上的相交）
    if (t > EPSILON) {
      return t;
    }

    return null;
  }

  /**
   * 获取射线与三角形的相交点
   * @param ray - 射线
   * @param cullBackface - 是否剔除背面
   * @returns 相交点，如果不相交返回 null
   */
  getIntersectionPoint(ray: Ray, cullBackface: boolean = false): Vector3 | null {
    const t = this.intersectRay(ray, cullBackface);
    if (t === null) return null;
    return ray.getPoint(t);
  }

  /**
   * 获取射线与三角形相交的重心坐标
   * @param ray - 射线
   * @param cullBackface - 是否剔除背面
   * @returns 重心坐标 {u, v, w}，如果不相交返回 null
   */
  getBarycentricCoords(
    ray: Ray,
    cullBackface: boolean = false,
  ): { u: number; v: number; w: number } | null {
    const EPSILON = 1e-8;

    const edge1 = new Vector3();
    const edge2 = new Vector3();
    Vector3.subtract(this.b, this.a, edge1);
    Vector3.subtract(this.c, this.a, edge2);

    const h = new Vector3();
    Vector3.cross(ray.direction, edge2, h);
    const det = Vector3.dot(edge1, h);

    if (cullBackface && det < EPSILON) {
      return null;
    }

    if (Math.abs(det) < EPSILON) {
      return null;
    }

    const invDet = 1.0 / det;

    const s = new Vector3();
    Vector3.subtract(ray.origin, this.a, s);

    const u = invDet * Vector3.dot(s, h);
    if (u < 0.0 || u > 1.0) {
      return null;
    }

    const q = new Vector3();
    Vector3.cross(s, edge1, q);
    const v = invDet * Vector3.dot(ray.direction, q);
    if (v < 0.0 || u + v > 1.0) {
      return null;
    }

    const t = invDet * Vector3.dot(edge2, q);
    if (t <= EPSILON) {
      return null;
    }

    return { u, v, w: 1 - u - v };
  }

  /**
   * 克隆三角形
   */
  clone(): Triangle {
    return new Triangle(this.a, this.b, this.c, this.index, this.userData);
  }
}
