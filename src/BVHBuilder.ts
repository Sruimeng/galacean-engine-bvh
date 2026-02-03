import type { BoundingBox } from '@galacean/engine-math';
import { AABB } from './AABB';
import { BVHTree } from './BVHTree';
import { BVHBuildStrategy } from './enums';
import type { BVHInsertObject } from './types';

/**
 * SAH 代价常量
 * TRIANGLE_INTERSECT_COST: 三角形相交测试的相对代价
 * TRAVERSAL_COST: 遍历节点的相对代价
 */
const TRIANGLE_INTERSECT_COST = 1.25;
const TRAVERSAL_COST = 1.0;

/**
 * SAH 桶数量（参考 three-mesh-bvh 使用 32 个桶）
 */
const SAH_BIN_COUNT = 32;

/**
 * 工作项接口，用于迭代式构建
 */
interface BuildWorkItem {
  objects: BVHInsertObject[];
}

/**
 * BVH 构建器
 *
 * 提供多种构建策略用于创建优化的 BVH 树
 * 使用迭代方式避免栈溢出
 */
export class BVHBuilder {
  /**
   * 使用指定策略构建 BVH 树
   * @param objects - 要插入的对象数组
   * @param strategy - 构建策略 (默认: SAH)
   * @returns 构建好的 BVHTree
   */
  static build(
    objects: BVHInsertObject[],
    strategy: BVHBuildStrategy = BVHBuildStrategy.SAH,
  ): BVHTree {
    if (objects.length === 0) {
      return new BVHTree();
    }

    const tree = new BVHTree();

    // 特殊情况：只有少量对象，直接逐个插入
    if (objects.length <= tree.maxLeafSize) {
      for (const obj of objects) {
        tree.insert(obj.bounds, obj.userData);
      }
      return tree;
    }

    // 根据策略选择构建方法
    switch (strategy) {
      case BVHBuildStrategy.SAH:
        this.buildSAHIterative(tree, objects);
        break;
      case BVHBuildStrategy.Median:
        this.buildMedianIterative(tree, objects);
        break;
      case BVHBuildStrategy.Equal:
        this.buildEqualIterative(tree, objects);
        break;
    }

    return tree;
  }

  /**
   * 使用 SAH 策略构建 (Surface Area Heuristic) - 迭代版本
   *
   * 最优但最慢的策略，查询性能最佳
   *
   * - 使用 32 个桶进行离散化
   * - 同时评估三个轴，选择最优分割
   * - 使用更精确的 SAH 代价常量
   * - 使用迭代而非递归，避免栈溢出
   */
  private static buildSAHIterative(tree: BVHTree, objects: BVHInsertObject[]): void {
    if (objects.length === 0) return;

    // 使用工作栈代替递归
    const workStack: BuildWorkItem[] = [{ objects }];

    // 安全限制：最大迭代次数（每个对象最多产生 2 个工作项）
    const maxIterations = objects.length * 2 + 1000;
    let iterations = 0;

    while (workStack.length > 0 && iterations < maxIterations) {
      iterations++;
      const work = workStack.pop()!;
      const currentObjects = work.objects;

      // 如果对象数量少，直接逐个插入
      if (currentObjects.length <= tree.maxLeafSize) {
        for (const obj of currentObjects) {
          tree.insert(obj.bounds, obj.userData);
        }
        continue;
      }

      // 计算总的包围盒
      let unionAABB: AABB | null = null;
      for (const obj of currentObjects) {
        const aabb = AABB.fromBoundingBox(obj.bounds);
        if (unionAABB === null) {
          unionAABB = aabb;
        } else {
          unionAABB = unionAABB.union(aabb);
        }
      }

      if (!unionAABB) {
        // 没有有效包围盒，直接插入所有对象
        for (const obj of currentObjects) {
          tree.insert(obj.bounds, obj.userData);
        }
        continue;
      }

      // 使用优化的 SAH 策略找到最佳分割（同时评估三个轴）
      const {
        axis: splitAxis,
        position: splitPos,
        cost,
      } = this.findBestSplitSAH(currentObjects, unionAABB);

      // 如果分割代价大于不分割的代价，直接作为叶子节点
      const leafCost = TRIANGLE_INTERSECT_COST * currentObjects.length;
      if (cost >= leafCost && currentObjects.length <= tree.maxLeafSize * 2) {
        for (const obj of currentObjects) {
          tree.insert(obj.bounds, obj.userData);
        }
        continue;
      }

      // 分割对象
      const leftObjects: BVHInsertObject[] = [];
      const rightObjects: BVHInsertObject[] = [];

      for (const obj of currentObjects) {
        const center = this.getCenter(obj.bounds);
        const centroid = this.getAxisValue(center, splitAxis);
        if (centroid < splitPos) {
          leftObjects.push(obj);
        } else {
          rightObjects.push(obj);
        }
      }

      // 避免无限循环 - 如果分割不合理，使用中位数分割
      if (leftObjects.length === 0 || rightObjects.length === 0) {
        // 使用中位数分割作为后备
        const sorted = [...currentObjects].sort((a, b) => {
          const centerA = this.getCenter(a.bounds);
          const centerB = this.getCenter(b.bounds);
          return this.getAxisValue(centerA, splitAxis) - this.getAxisValue(centerB, splitAxis);
        });
        const mid = Math.floor(sorted.length / 2);
        const leftSorted = sorted.slice(0, mid);
        const rightSorted = sorted.slice(mid);

        // 如果仍然无法分割，直接插入所有对象
        if (leftSorted.length === 0 || rightSorted.length === 0) {
          for (const obj of currentObjects) {
            tree.insert(obj.bounds, obj.userData);
          }
          continue;
        }

        // 将分割后的子集加入工作栈
        if (rightSorted.length > 0) {
          workStack.push({ objects: rightSorted });
        }
        if (leftSorted.length > 0) {
          workStack.push({ objects: leftSorted });
        }
        continue;
      }

      // 将分割后的子集加入工作栈
      if (rightObjects.length > 0) {
        workStack.push({ objects: rightObjects });
      }
      if (leftObjects.length > 0) {
        workStack.push({ objects: leftObjects });
      }
    }
  }

  /**
   * 使用中位数分割策略 - 迭代版本
   *
   * 构建快速，性能均衡，适合动态场景
   */
  private static buildMedianIterative(tree: BVHTree, objects: BVHInsertObject[]): void {
    if (objects.length === 0) return;

    // 使用工作栈代替递归
    const workStack: BuildWorkItem[] = [{ objects }];

    // 安全限制：最大迭代次数
    const maxIterations = objects.length * 2 + 1000;
    let iterations = 0;

    while (workStack.length > 0 && iterations < maxIterations) {
      iterations++;
      const work = workStack.pop()!;
      const currentObjects = work.objects;

      // 少量对象直接插入
      if (currentObjects.length <= tree.maxLeafSize) {
        for (const obj of currentObjects) {
          tree.insert(obj.bounds, obj.userData);
        }
        continue;
      }

      // 计算总包围盒
      let unionAABB: AABB | null = null;
      for (const obj of currentObjects) {
        const aabb = AABB.fromBoundingBox(obj.bounds);
        if (unionAABB === null) {
          unionAABB = aabb;
        } else {
          unionAABB = unionAABB.union(aabb);
        }
      }

      // 选择最长轴
      const splitAxis = this.selectSplitAxis(unionAABB);

      // 按中心点排序
      const sorted = [...currentObjects].sort((a, b) => {
        const centerA = this.getCenter(a.bounds);
        const centerB = this.getCenter(b.bounds);
        return this.getAxisValue(centerA, splitAxis) - this.getAxisValue(centerB, splitAxis);
      });

      // 分割成两半
      const mid = Math.floor(sorted.length / 2);
      const leftObjects = sorted.slice(0, mid);
      const rightObjects = sorted.slice(mid);

      // 将分割后的子集加入工作栈
      if (rightObjects.length > 0) {
        workStack.push({ objects: rightObjects });
      }
      if (leftObjects.length > 0) {
        workStack.push({ objects: leftObjects });
      }
    }
  }

  /**
   * 使用均等分割策略 - 迭代版本
   *
   * 适用于均匀分布的场景，构建较快
   */
  private static buildEqualIterative(tree: BVHTree, objects: BVHInsertObject[]): void {
    if (objects.length === 0) return;

    // 使用工作栈代替递归
    const workStack: BuildWorkItem[] = [{ objects }];

    // 安全限制：最大迭代次数
    const maxIterations = objects.length * 2 + 1000;
    let iterations = 0;

    while (workStack.length > 0 && iterations < maxIterations) {
      iterations++;
      const work = workStack.pop()!;
      const currentObjects = work.objects;

      // 少量对象直接插入
      if (currentObjects.length <= tree.maxLeafSize) {
        for (const obj of currentObjects) {
          tree.insert(obj.bounds, obj.userData);
        }
        continue;
      }

      // 计算总包围盒
      let unionAABB: AABB | null = null;
      for (const obj of currentObjects) {
        const aabb = AABB.fromBoundingBox(obj.bounds);
        if (unionAABB === null) {
          unionAABB = aabb;
        } else {
          unionAABB = unionAABB.union(aabb);
        }
      }

      // 选择最长轴
      const splitAxis = this.selectSplitAxis(unionAABB);

      // 计算中点 - 添加空检查
      if (!unionAABB) {
        // 没有有效包围盒，直接插入所有对象
        for (const obj of currentObjects) {
          tree.insert(obj.bounds, obj.userData);
        }
        continue;
      }

      const center = unionAABB.getCenter();
      const splitPos = center[splitAxis === 0 ? 'x' : splitAxis === 1 ? 'y' : 'z'];

      // 分割对象
      const leftObjects: BVHInsertObject[] = [];
      const rightObjects: BVHInsertObject[] = [];

      for (const obj of currentObjects) {
        const objCenter = this.getCenter(obj.bounds);
        if (this.getAxisValue(objCenter, splitAxis) < splitPos) {
          leftObjects.push(obj);
        } else {
          rightObjects.push(obj);
        }
      }

      // 避免无限循环 - 如果分割不合理，使用中位数分割
      if (leftObjects.length === 0 || rightObjects.length === 0) {
        const sorted = [...currentObjects].sort((a, b) => {
          const centerA = this.getCenter(a.bounds);
          const centerB = this.getCenter(b.bounds);
          return this.getAxisValue(centerA, splitAxis) - this.getAxisValue(centerB, splitAxis);
        });
        const mid = Math.floor(sorted.length / 2);
        const leftSorted = sorted.slice(0, mid);
        const rightSorted = sorted.slice(mid);

        // 如果仍然无法分割，直接插入所有对象
        if (leftSorted.length === 0 || rightSorted.length === 0) {
          for (const obj of currentObjects) {
            tree.insert(obj.bounds, obj.userData);
          }
          continue;
        }

        // 将分割后的子集加入工作栈
        if (rightSorted.length > 0) {
          workStack.push({ objects: rightSorted });
        }
        if (leftSorted.length > 0) {
          workStack.push({ objects: leftSorted });
        }
        continue;
      }

      // 将分割后的子集加入工作栈
      if (rightObjects.length > 0) {
        workStack.push({ objects: rightObjects });
      }
      if (leftObjects.length > 0) {
        workStack.push({ objects: leftObjects });
      }
    }
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 选择最佳分割轴
   */
  private static selectSplitAxis(unionAABB: AABB | null): number {
    if (!unionAABB) return 0; // 默认返回 X 轴

    const sizeX = unionAABB.max.x - unionAABB.min.x;
    const sizeY = unionAABB.max.y - unionAABB.min.y;
    const sizeZ = unionAABB.max.z - unionAABB.min.z;

    if (sizeX > sizeY && sizeX > sizeZ) return 0; // X
    if (sizeY > sizeZ) return 1; // Y
    return 2; // Z
  }

  /**
   * 获取包围盒中心点
   */
  private static getCenter(bounds: BoundingBox): { x: number; y: number; z: number } {
    return {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    };
  }

  /**
   * 获取轴上的值
   */
  private static getAxisValue(point: { x: number; y: number; z: number }, axis: number): number {
    if (axis === 0) return point.x;
    if (axis === 1) return point.y;
    return point.z;
  }

  /**
   * 获取 AABB 在指定轴上的最小值
   */
  private static getAABBAxisMin(aabb: AABB, axis: number): number {
    if (axis === 0) return aabb.min.x;
    if (axis === 1) return aabb.min.y;
    return aabb.min.z;
  }

  /**
   * 获取 AABB 在指定轴上的最大值
   */
  private static getAABBAxisMax(aabb: AABB, axis: number): number {
    if (axis === 0) return aabb.max.x;
    if (axis === 1) return aabb.max.y;
    return aabb.max.z;
  }

  /**
   * SAH 策略：寻找最佳分割位置（优化版本）
   *
   * 参考 three-mesh-bvh 的实现：
   * - 使用 32 个桶进行离散化
   * - 同时评估三个轴，选择最优分割
   * - 使用更精确的 SAH 代价常量
   *
   * SAH 代价计算公式:
   * C = C_traversal + (SA_left / SA_parent) * N_left * C_intersect + (SA_right / SA_parent) * N_right * C_intersect
   */
  private static findBestSplitSAH(
    objects: BVHInsertObject[],
    parentAABB: AABB,
  ): { axis: number; position: number; cost: number } {
    const parentSA = parentAABB.surfaceArea();
    const objectCount = objects.length;

    // 不分割的代价（所有对象都在一个叶子节点）
    const leafCost = TRIANGLE_INTERSECT_COST * objectCount;

    let bestAxis = -1;
    let bestPosition = 0;
    let bestCost = leafCost; // 初始化为叶子节点代价

    // 如果表面积为 0，返回默认分割
    if (parentSA <= 0) {
      const center = parentAABB.getCenter();
      return { axis: 0, position: center.x, cost: Infinity };
    }

    // 预计算所有对象的中心点和 AABB
    const centers: { x: number; y: number; z: number }[] = [];
    const aabbs: AABB[] = [];
    for (const obj of objects) {
      centers.push(this.getCenter(obj.bounds));
      aabbs.push(AABB.fromBoundingBox(obj.bounds));
    }

    // 遍历三个轴
    for (let axis = 0; axis < 3; axis++) {
      const axisMin = this.getAABBAxisMin(parentAABB, axis);
      const axisMax = this.getAABBAxisMax(parentAABB, axis);
      const axisRange = axisMax - axisMin;

      // 如果轴范围为 0，跳过
      if (axisRange <= 0) continue;

      // 初始化桶
      const buckets: { count: number; bounds: AABB | null }[] = [];
      for (let i = 0; i < SAH_BIN_COUNT; i++) {
        buckets.push({ count: 0, bounds: null });
      }

      // 将对象分配到桶中
      for (let i = 0; i < objects.length; i++) {
        const centroid = this.getAxisValue(centers[i], axis);
        let bucketIdx = Math.floor(((centroid - axisMin) / axisRange) * SAH_BIN_COUNT);
        bucketIdx = Math.max(0, Math.min(bucketIdx, SAH_BIN_COUNT - 1));

        buckets[bucketIdx].count++;
        if (buckets[bucketIdx].bounds === null) {
          buckets[bucketIdx].bounds = aabbs[i];
        } else {
          buckets[bucketIdx].bounds = buckets[bucketIdx].bounds!.union(aabbs[i]);
        }
      }

      // 预计算从左到右的累积包围盒和计数
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

      // 预计算从右到左的累积包围盒和计数
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

        // 跳过空分割
        if (lCount === 0 || rCount === 0) continue;

        const lBounds = leftBounds[i];
        const rBounds = rightBounds[i + 1];

        if (lBounds === null || rBounds === null) continue;

        // 计算 SAH 代价
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

    // 如果没有找到更好的分割，使用最长轴的中点
    if (bestAxis === -1) {
      bestAxis = this.selectSplitAxis(parentAABB);
      const center = parentAABB.getCenter();
      bestPosition = this.getAxisValue({ x: center.x, y: center.y, z: center.z }, bestAxis);
    }

    return { axis: bestAxis, position: bestPosition, cost: bestCost };
  }
}
