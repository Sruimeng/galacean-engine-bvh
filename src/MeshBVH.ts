import { BoundingBox, Vector3 } from '@galacean/engine-math';
import { AABB } from './AABB';
import { BVHBuildStrategy } from './enums';
import type { Ray } from './Ray';
import { Triangle } from './Triangle';

/**
 * 三角形 BVH 节点
 */
interface MeshBVHNode {
  /** 包围盒 */
  bounds: AABB;
  /** 左子节点 */
  left: MeshBVHNode | null;
  /** 右子节点 */
  right: MeshBVHNode | null;
  /** 三角形列表（仅叶子节点） */
  triangles: Triangle[] | null;
  /** 是否为叶子节点 */
  isLeaf: boolean;
  /** 节点深度 */
  depth: number;
}

/**
 * 三角形相交结果
 */
export interface MeshRaycastHit {
  /** 相交的三角形 */
  triangle: Triangle;
  /** 相交距离 */
  distance: number;
  /** 相交点 */
  point: Vector3;
  /** 三角形索引 */
  triangleIndex: number;
  /** 重心坐标 */
  barycentricCoords?: { u: number; v: number; w: number };
}

/**
 * MeshBVH 统计信息
 */
export interface MeshBVHStats {
  /** 节点总数 */
  nodeCount: number;
  /** 叶子节点数 */
  leafCount: number;
  /** 最大深度 */
  maxDepth: number;
  /** 三角形总数 */
  triangleCount: number;
  /** 平均每个叶子节点的三角形数 */
  avgTrianglesPerLeaf: number;
}

/**
 * SAH 代价常量
 */
const TRIANGLE_INTERSECT_COST = 1.25;
const TRAVERSAL_COST = 1.0;
const SAH_BIN_COUNT = 32;

/**
 * MeshBVH - 三角形级别的 BVH
 * 
 * 用于对单个 Mesh 内部的三角形进行 BVH 加速，
 * 实现精确的射线-三角形相交测试。
 * 
 * 参考 three-mesh-bvh 的实现思路。
 */
export class MeshBVH {
  /** 根节点 */
  private root: MeshBVHNode | null = null;
  /** 所有三角形 */
  private triangles: Triangle[] = [];
  /** 叶子节点最大三角形数 */
  private maxLeafTriangles: number;
  /** 最大深度 */
  private maxDepth: number;
  /** 构建策略 */
  private strategy: BVHBuildStrategy;

  /**
   * 创建 MeshBVH
   * @param maxLeafTriangles - 叶子节点最大三角形数（默认 10）
   * @param maxDepth - 最大深度（默认 40）
   * @param strategy - 构建策略（默认 SAH）
   */
  constructor(
    maxLeafTriangles: number = 10,
    maxDepth: number = 40,
    strategy: BVHBuildStrategy = BVHBuildStrategy.SAH
  ) {
    this.maxLeafTriangles = Math.max(1, maxLeafTriangles);
    this.maxDepth = Math.max(1, maxDepth);
    this.strategy = strategy;
  }

  /**
   * 从顶点和索引数据构建 BVH
   * @param positions - 顶点位置数组 [x0, y0, z0, x1, y1, z1, ...]
   * @param indices - 索引数组（可选，如果没有则假设是非索引几何体）
   * @param userData - 用户数据（会附加到每个三角形）
   */
  buildFromGeometry(
    positions: Float32Array | number[],
    indices?: Uint16Array | Uint32Array | number[],
    userData?: any
  ): void {
    this.triangles = [];

    if (indices && indices.length > 0) {
      // 索引几���体
      const triangleCount = Math.floor(indices.length / 3);
      for (let i = 0; i < triangleCount; i++) {
        const i0 = indices[i * 3];
        const i1 = indices[i * 3 + 1];
        const i2 = indices[i * 3 + 2];
        const triangle = Triangle.fromPositions(positions, i0, i1, i2, i, userData);
        this.triangles.push(triangle);
      }
    } else {
      // 非索引几何体
      const vertexCount = Math.floor(positions.length / 3);
      const triangleCount = Math.floor(vertexCount / 3);
      for (let i = 0; i < triangleCount; i++) {
        const i0 = i * 3;
        const i1 = i * 3 + 1;
        const i2 = i * 3 + 2;
        const triangle = Triangle.fromPositions(positions, i0, i1, i2, i, userData);
        this.triangles.push(triangle);
      }
    }

    // 构建 BVH
    this.build();
  }

  /**
   * 从三角形数组构建 BVH
   * @param triangles - 三角形数组
   */
  buildFromTriangles(triangles: Triangle[]): void {
    this.triangles = triangles;
    this.build();
  }

  /**
   * 构建 BVH 树
   */
  private build(): void {
    if (this.triangles.length === 0) {
      this.root = null;
      return;
    }

    this.root = this.buildNode(this.triangles, 0);
  }

  /**
   * 递归构建节点
   */
  private buildNode(triangles: Triangle[], depth: number): MeshBVHNode {
    // 计算包围盒
    const bounds = this.computeBounds(triangles);

    // 如果三角形数量少于阈值或达到最大深度，创建叶子节点
    if (triangles.length <= this.maxLeafTriangles || depth >= this.maxDepth) {
      return {
        bounds,
        left: null,
        right: null,
        triangles: triangles,
        isLeaf: true,
        depth,
      };
    }

    // 根据策略选择分割方式
    let splitResult: { left: Triangle[]; right: Triangle[] };
    
    switch (this.strategy) {
      case BVHBuildStrategy.SAH:
        splitResult = this.splitSAH(triangles, bounds);
        break;
      case BVHBuildStrategy.Median:
        splitResult = this.splitMedian(triangles, bounds);
        break;
      case BVHBuildStrategy.Equal:
      default:
        splitResult = this.splitEqual(triangles, bounds);
        break;
    }

    // 如果分割失败，创建叶子节点
    if (splitResult.left.length === 0 || splitResult.right.length === 0) {
      return {
        bounds,
        left: null,
        right: null,
        triangles: triangles,
        isLeaf: true,
        depth,
      };
    }

    // 递归构建子节点
    return {
      bounds,
      left: this.buildNode(splitResult.left, depth + 1),
      right: this.buildNode(splitResult.right, depth + 1),
      triangles: null,
      isLeaf: false,
      depth,
    };
  }

  /**
   * 计算三角形列表的包围盒
   */
  private computeBounds(triangles: Triangle[]): AABB {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);

    for (const tri of triangles) {
      // 顶点 A
      min.x = Math.min(min.x, tri.a.x);
      min.y = Math.min(min.y, tri.a.y);
      min.z = Math.min(min.z, tri.a.z);
      max.x = Math.max(max.x, tri.a.x);
      max.y = Math.max(max.y, tri.a.y);
      max.z = Math.max(max.z, tri.a.z);

      // 顶点 B
      min.x = Math.min(min.x, tri.b.x);
      min.y = Math.min(min.y, tri.b.y);
      min.z = Math.min(min.z, tri.b.z);
      max.x = Math.max(max.x, tri.b.x);
      max.y = Math.max(max.y, tri.b.y);
      max.z = Math.max(max.z, tri.b.z);

      // 顶点 C
      min.x = Math.min(min.x, tri.c.x);
      min.y = Math.min(min.y, tri.c.y);
      min.z = Math.min(min.z, tri.c.z);
      max.x = Math.max(max.x, tri.c.x);
      max.y = Math.max(max.y, tri.c.y);
      max.z = Math.max(max.z, tri.c.z);
    }

    return new AABB(min, max);
  }

  /**
   * SAH 分割策略
   */
  private splitSAH(triangles: Triangle[], parentBounds: AABB): { left: Triangle[]; right: Triangle[] } {
    const parentSA = parentBounds.surfaceArea();
    if (parentSA <= 0) {
      return this.splitMedian(triangles, parentBounds);
    }

    let bestAxis = -1;
    let bestPosition = 0;
    let bestCost = TRIANGLE_INTERSECT_COST * triangles.length;

    // 预计算三角形中心点
    const centers = triangles.map(tri => tri.getCenter());

    // 遍历三个轴
    for (let axis = 0; axis < 3; axis++) {
      const axisMin = axis === 0 ? parentBounds.min.x : axis === 1 ? parentBounds.min.y : parentBounds.min.z;
      const axisMax = axis === 0 ? parentBounds.max.x : axis === 1 ? parentBounds.max.y : parentBounds.max.z;
      const axisRange = axisMax - axisMin;

      if (axisRange <= 0) continue;

      // 初始化桶
      const buckets: { count: number; bounds: AABB | null }[] = [];
      for (let i = 0; i < SAH_BIN_COUNT; i++) {
        buckets.push({ count: 0, bounds: null });
      }

      // 将三角形分配到桶中
      for (let i = 0; i < triangles.length; i++) {
        const center = centers[i];
        const centroid = axis === 0 ? center.x : axis === 1 ? center.y : center.z;
        let bucketIdx = Math.floor(((centroid - axisMin) / axisRange) * SAH_BIN_COUNT);
        bucketIdx = Math.max(0, Math.min(bucketIdx, SAH_BIN_COUNT - 1));

        buckets[bucketIdx].count++;
        const triBounds = this.computeBounds([triangles[i]]);
        if (buckets[bucketIdx].bounds === null) {
          buckets[bucketIdx].bounds = triBounds;
        } else {
          buckets[bucketIdx].bounds = buckets[bucketIdx].bounds!.union(triBounds);
        }
      }

      // 预计算累积数据
      const leftBounds: (AABB | null)[] = new Array(SAH_BIN_COUNT);
      const leftCounts: number[] = new Array(SAH_BIN_COUNT);
      let accBounds: AABB | null = null;
      let accCount = 0;

      for (let i = 0; i < SAH_BIN_COUNT; i++) {
        accCount += buckets[i].count;
        if (buckets[i].bounds !== null) {
          accBounds = accBounds === null ? buckets[i].bounds : accBounds.union(buckets[i].bounds!);
        }
        leftBounds[i] = accBounds;
        leftCounts[i] = accCount;
      }

      const rightBounds: (AABB | null)[] = new Array(SAH_BIN_COUNT);
      const rightCounts: number[] = new Array(SAH_BIN_COUNT);
      accBounds = null;
      accCount = 0;

      for (let i = SAH_BIN_COUNT - 1; i >= 0; i--) {
        accCount += buckets[i].count;
        if (buckets[i].bounds !== null) {
          accBounds = accBounds === null ? buckets[i].bounds : accBounds.union(buckets[i].bounds!);
        }
        rightBounds[i] = accBounds;
        rightCounts[i] = accCount;
      }

      // 评估每个分割点
      for (let i = 0; i < SAH_BIN_COUNT - 1; i++) {
        const lCount = leftCounts[i];
        const rCount = rightCounts[i + 1];

        if (lCount === 0 || rCount === 0) continue;

        const lBounds = leftBounds[i];
        const rBounds = rightBounds[i + 1];

        if (lBounds === null || rBounds === null) continue;

        const leftSA = lBounds.surfaceArea();
        const rightSA = rBounds.surfaceArea();
        const cost =
          TRAVERSAL_COST +
          (leftSA / parentSA) * lCount * TRIANGLE_INTERSECT_COST +
          (rightSA / parentSA) * rCount * TRIANGLE_INTERSECT_COST;

        if (cost < bestCost) {
          bestCost = cost;
          bestAxis = axis;
          bestPosition = axisMin + ((i + 1) / SAH_BIN_COUNT) * axisRange;
        }
      }
    }

    // 如果没有找到更好的分割，使用中位数分割
    if (bestAxis === -1) {
      return this.splitMedian(triangles, parentBounds);
    }

    // 执行分割
    const left: Triangle[] = [];
    const right: Triangle[] = [];

    for (let i = 0; i < triangles.length; i++) {
      const center = centers[i];
      const centroid = bestAxis === 0 ? center.x : bestAxis === 1 ? center.y : center.z;
      if (centroid < bestPosition) {
        left.push(triangles[i]);
      } else {
        right.push(triangles[i]);
      }
    }

    return { left, right };
  }

  /**
   * 中位数分割策略
   */
  private splitMedian(triangles: Triangle[], parentBounds: AABB): { left: Triangle[]; right: Triangle[] } {
    // 选择最长轴
    const sizeX = parentBounds.max.x - parentBounds.min.x;
    const sizeY = parentBounds.max.y - parentBounds.min.y;
    const sizeZ = parentBounds.max.z - parentBounds.min.z;

    let axis = 0;
    if (sizeY > sizeX && sizeY > sizeZ) axis = 1;
    else if (sizeZ > sizeX) axis = 2;

    // 按中心点排序
    const sorted = [...triangles].sort((a, b) => {
      const centerA = a.getCenter();
      const centerB = b.getCenter();
      const valA = axis === 0 ? centerA.x : axis === 1 ? centerA.y : centerA.z;
      const valB = axis === 0 ? centerB.x : axis === 1 ? centerB.y : centerB.z;
      return valA - valB;
    });

    const mid = Math.floor(sorted.length / 2);
    return {
      left: sorted.slice(0, mid),
      right: sorted.slice(mid),
    };
  }

  /**
   * 均等分割策略
   */
  private splitEqual(triangles: Triangle[], parentBounds: AABB): { left: Triangle[]; right: Triangle[] } {
    // 选择最长轴
    const sizeX = parentBounds.max.x - parentBounds.min.x;
    const sizeY = parentBounds.max.y - parentBounds.min.y;
    const sizeZ = parentBounds.max.z - parentBounds.min.z;

    let axis = 0;
    if (sizeY > sizeX && sizeY > sizeZ) axis = 1;
    else if (sizeZ > sizeX) axis = 2;

    // 计算中点
    const center = parentBounds.getCenter();
    const splitPos = axis === 0 ? center.x : axis === 1 ? center.y : center.z;

    const left: Triangle[] = [];
    const right: Triangle[] = [];

    for (const tri of triangles) {
      const triCenter = tri.getCenter();
      const val = axis === 0 ? triCenter.x : axis === 1 ? triCenter.y : triCenter.z;
      if (val < splitPos) {
        left.push(tri);
      } else {
        right.push(tri);
      }
    }

    // 如果分割失败，使用中位数分割
    if (left.length === 0 || right.length === 0) {
      return this.splitMedian(triangles, parentBounds);
    }

    return { left, right };
  }

  /**
   * 射线投射 - 返回所有相交的三角形
   * @param ray - 射线
   * @param maxDistance - 最大距离
   * @param cullBackface - 是否剔除背面
   * @returns 相交结果数组（按距离排序）
   */
  raycast(ray: Ray, maxDistance: number = Infinity, cullBackface: boolean = false): MeshRaycastHit[] {
    const results: MeshRaycastHit[] = [];

    if (!this.root) return results;

    this.raycastNode(this.root, ray, maxDistance, cullBackface, results);

    // 按距离排序
    results.sort((a, b) => a.distance - b.distance);

    return results;
  }

  /**
   * 射线投射 - 返回最近的相交三角形
   * @param ray - 射线
   * @param maxDistance - 最大距离
   * @param cullBackface - 是否剔除背面
   * @returns 最近的相交结果，如果没有相交返回 null
   */
  raycastFirst(ray: Ray, maxDistance: number = Infinity, cullBackface: boolean = false): MeshRaycastHit | null {
    if (!this.root) return null;

    let closestHit: MeshRaycastHit | null = null;
    let closestDistance = maxDistance;

    this.raycastNodeFirst(this.root, ray, closestDistance, cullBackface, (hit) => {
      if (hit.distance < closestDistance) {
        closestDistance = hit.distance;
        closestHit = hit;
      }
    });

    return closestHit;
  }

  /**
   * 递归射线投射节点
   */
  private raycastNode(
    node: MeshBVHNode,
    ray: Ray,
    maxDistance: number,
    cullBackface: boolean,
    results: MeshRaycastHit[]
  ): void {
    // 检查射线是否与节点包围盒相交
    const boundsDistance = node.bounds.intersectRayDistance(ray);
    if (boundsDistance === null || boundsDistance > maxDistance) {
      return;
    }

    if (node.isLeaf && node.triangles) {
      // 叶子节点：测试所有三角形
      for (const tri of node.triangles) {
        const distance = tri.intersectRay(ray, cullBackface);
        if (distance !== null && distance <= maxDistance) {
          const point = ray.getPoint(distance);
          const barycentricCoords = tri.getBarycentricCoords(ray, cullBackface) || undefined;
          results.push({
            triangle: tri,
            distance,
            point,
            triangleIndex: tri.index,
            barycentricCoords,
          });
        }
      }
    } else {
      // 内部节点：递归遍历子节点
      if (node.left) {
        this.raycastNode(node.left, ray, maxDistance, cullBackface, results);
      }
      if (node.right) {
        this.raycastNode(node.right, ray, maxDistance, cullBackface, results);
      }
    }
  }

  /**
   * 递归射线投射节点（只找最近的）
   */
  private raycastNodeFirst(
    node: MeshBVHNode,
    ray: Ray,
    maxDistance: number,
    cullBackface: boolean,
    onHit: (hit: MeshRaycastHit) => void
  ): void {
    // 检查射线是否与节点包围盒相交
    const boundsDistance = node.bounds.intersectRayDistance(ray);
    if (boundsDistance === null || boundsDistance > maxDistance) {
      return;
    }

    if (node.isLeaf && node.triangles) {
      // 叶子节点：测试所有三角形
      for (const tri of node.triangles) {
        const distance = tri.intersectRay(ray, cullBackface);
        if (distance !== null && distance <= maxDistance) {
          const point = ray.getPoint(distance);
          const barycentricCoords = tri.getBarycentricCoords(ray, cullBackface) || undefined;
          onHit({
            triangle: tri,
            distance,
            point,
            triangleIndex: tri.index,
            barycentricCoords,
          });
        }
      }
    } else {
      // 内部节点：按距离排序遍历子节点（优先遍历近的）
      const leftDist = node.left ? node.left.bounds.intersectRayDistance(ray) : null;
      const rightDist = node.right ? node.right.bounds.intersectRayDistance(ray) : null;

      if (leftDist !== null && rightDist !== null) {
        if (leftDist <= rightDist) {
          this.raycastNodeFirst(node.left!, ray, maxDistance, cullBackface, onHit);
          this.raycastNodeFirst(node.right!, ray, maxDistance, cullBackface, onHit);
        } else {
          this.raycastNodeFirst(node.right!, ray, maxDistance, cullBackface, onHit);
          this.raycastNodeFirst(node.left!, ray, maxDistance, cullBackface, onHit);
        }
      } else if (leftDist !== null) {
        this.raycastNodeFirst(node.left!, ray, maxDistance, cullBackface, onHit);
      } else if (rightDist !== null) {
        this.raycastNodeFirst(node.right!, ray, maxDistance, cullBackface, onHit);
      }
    }
  }

  /**
   * 暴力法射线投射（用于对比测试）
   * @param ray - 射线
   * @param maxDistance - 最大距离
   * @param cullBackface - 是否剔除背面
   * @returns 最近的相交结果
   */
  raycastBruteForce(ray: Ray, maxDistance: number = Infinity, cullBackface: boolean = false): MeshRaycastHit | null {
    let closestHit: MeshRaycastHit | null = null;
    let closestDistance = maxDistance;

    for (const tri of this.triangles) {
      const distance = tri.intersectRay(ray, cullBackface);
      if (distance !== null && distance < closestDistance) {
        closestDistance = distance;
        const point = ray.getPoint(distance);
        const barycentricCoords = tri.getBarycentricCoords(ray, cullBackface) || undefined;
        closestHit = {
          triangle: tri,
          distance,
          point,
          triangleIndex: tri.index,
          barycentricCoords,
        };
      }
    }

    return closestHit;
  }

  /**
   * 获取统计信息
   */
  getStats(): MeshBVHStats {
    const stats: MeshBVHStats = {
      nodeCount: 0,
      leafCount: 0,
      maxDepth: 0,
      triangleCount: this.triangles.length,
      avgTrianglesPerLeaf: 0,
    };

    if (!this.root) return stats;

    let totalTrianglesInLeaves = 0;

    const traverse = (node: MeshBVHNode) => {
      stats.nodeCount++;
      stats.maxDepth = Math.max(stats.maxDepth, node.depth);

      if (node.isLeaf) {
        stats.leafCount++;
        if (node.triangles) {
          totalTrianglesInLeaves += node.triangles.length;
        }
      } else {
        if (node.left) traverse(node.left);
        if (node.right) traverse(node.right);
      }
    };

    traverse(this.root);

    if (stats.leafCount > 0) {
      stats.avgTrianglesPerLeaf = totalTrianglesInLeaves / stats.leafCount;
    }

    return stats;
  }

  /**
   * 获取三角形数量
   */
  get triangleCount(): number {
    return this.triangles.length;
  }

  /**
   * 获取根节点包围盒
   */
  getBounds(): BoundingBox | null {
    if (!this.root) return null;
    return this.root.bounds.getBounds();
  }
}