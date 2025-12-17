import type { BoundingBox } from '@galacean/engine-math';
import { AABB } from './AABB';
import { BVHTree } from './BVHTree';
import { BVHBuildStrategy } from './enums';
import type { BVHInsertObject } from './types';

/**
 * BVH 构建器
 *
 * 提供多种构建策略用于创建优化的 BVH 树
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
        this.buildSAH(tree, objects);
        break;
      case BVHBuildStrategy.Median:
        this.buildMedian(tree, objects);
        break;
      case BVHBuildStrategy.Equal:
        this.buildEqual(tree, objects);
        break;
    }

    return tree;
  }

  /**
   * 使用 SAH 策略构建 (Surface Area Heuristic)
   *
   * 最优但最慢的策略，查询性能最佳
   */
  private static buildSAH(tree: BVHTree, objects: BVHInsertObject[]): void {
    if (objects.length === 0) return;

    // 如果对象数量少，直接逐个插入
    if (objects.length <= tree.maxLeafSize) {
      for (const obj of objects) {
        tree.insert(obj.bounds, obj.userData);
      }
      return;
    }

    // 计算总的包围盒
    let unionAABB: AABB | null = null;
    for (const obj of objects) {
      const aabb = AABB.fromBoundingBox(obj.bounds);
      if (unionAABB === null) {
        unionAABB = aabb;
      } else {
        unionAABB = unionAABB.union(aabb);
      }
    }

    // 选择分割轴（最长轴）
    const splitAxis = this.selectSplitAxis(unionAABB);

    // 计算最佳分割位置 - SAH 代价函数
    const splitPos = this.findBestSplitPositionSAH(objects, splitAxis, unionAABB);

    // 分割对象
    const leftObjects: BVHInsertObject[] = [];
    const rightObjects: BVHInsertObject[] = [];

    for (const obj of objects) {
      const center = this.getCenter(obj.bounds);
      if (center[splitAxis] < splitPos) {
        leftObjects.push(obj);
      } else {
        rightObjects.push(obj);
      }
    }

    // 避免无限递归 - 如果分割不合理，使用中点分割
    if (leftObjects.length === 0 || rightObjects.length === 0) {
      this.buildMedian(tree, objects);
      return;
    }

    // 如果子集足够小，直接插入；否则递归
    if (leftObjects.length <= tree.maxLeafSize) {
      for (const obj of leftObjects) {
        tree.insert(obj.bounds, obj.userData);
      }
    } else {
      this.buildSAH(tree, leftObjects);
    }

    if (rightObjects.length <= tree.maxLeafSize) {
      for (const obj of rightObjects) {
        tree.insert(obj.bounds, obj.userData);
      }
    } else {
      this.buildSAH(tree, rightObjects);
    }
  }

  /**
   * 使用中位数分割策略
   *
   * 构建快速，性能均衡，适合动态场景
   */
  private static buildMedian(tree: BVHTree, objects: BVHInsertObject[]): void {
    if (objects.length === 0) return;

    // 少量对象直接插入
    if (objects.length <= tree.maxLeafSize) {
      for (const obj of objects) {
        tree.insert(obj.bounds, obj.userData);
      }
      return;
    }

    // 计算总包围盒
    let unionAABB: AABB | null = null;
    for (const obj of objects) {
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
    const sorted = [...objects].sort((a, b) => {
      const centerA = this.getCenter(a.bounds);
      const centerB = this.getCenter(b.bounds);
      return centerA[splitAxis] - centerB[splitAxis];
    });

    // 分割成两半
    const mid = Math.floor(sorted.length / 2);
    const leftObjects = sorted.slice(0, mid);
    const rightObjects = sorted.slice(mid);

    // 递归处理子集
    if (leftObjects.length > 0) {
      if (leftObjects.length <= tree.maxLeafSize) {
        for (const obj of leftObjects) {
          tree.insert(obj.bounds, obj.userData);
        }
      } else {
        this.buildMedian(tree, leftObjects);
      }
    }

    if (rightObjects.length > 0) {
      if (rightObjects.length <= tree.maxLeafSize) {
        for (const obj of rightObjects) {
          tree.insert(obj.bounds, obj.userData);
        }
      } else {
        this.buildMedian(tree, rightObjects);
      }
    }
  }

  /**
   * 使用均等分割策略
   *
   * 适用于均匀分布的场景，构建较快
   */
  private static buildEqual(tree: BVHTree, objects: BVHInsertObject[]): void {
    if (objects.length === 0) return;

    // 少量对象直接插入
    if (objects.length <= tree.maxLeafSize) {
      for (const obj of objects) {
        tree.insert(obj.bounds, obj.userData);
      }
      return;
    }

    // 计算总包围盒
    let unionAABB: AABB | null = null;
    for (const obj of objects) {
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
      for (const obj of objects) {
        tree.insert(obj.bounds, obj.userData);
      }
      return;
    }

    const center = unionAABB.getCenter();
    const splitPos = center[splitAxis === 0 ? 'x' : splitAxis === 1 ? 'y' : 'z'];

    // 分割对象
    const leftObjects: BVHInsertObject[] = [];
    const rightObjects: BVHInsertObject[] = [];

    for (const obj of objects) {
      const objCenter = this.getCenter(obj.bounds);
      if (objCenter[splitAxis] < splitPos) {
        leftObjects.push(obj);
      } else {
        rightObjects.push(obj);
      }
    }

    // 处理子集
    const processSet = (subset: BVHInsertObject[]) => {
      if (subset.length <= tree.maxLeafSize) {
        for (const obj of subset) {
          tree.insert(obj.bounds, obj.userData);
        }
      } else {
        this.buildEqual(tree, subset);
      }
    };

    processSet(leftObjects);
    processSet(rightObjects);
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
   * SAH 策略：寻找最佳分割位置
   *
   * SAH 代价计算公式: C = C_traversal + (SA_left / SA_parent) * N_left + (SA_right / SA_parent) * N_right
   * 我们需要找到使代价最小的分割位置
   */
  private static findBestSplitPositionSAH(
    objects: BVHInsertObject[],
    axis: number,
    parentAABB: AABB,
  ): number {
    const numBuckets = 12; // 使用桶(bucket)来离散化候选分割位置
    const parentSA = parentAABB.surfaceArea();

    if (parentSA <= 0) {
      // 退化情况，使用中点
      const center = parentAABB.getCenter();
      return axis === 0 ? center.x : axis === 1 ? center.y : center.z;
    }

    // 计算父包围盒在分割轴上的范围
    const axisMin =
      axis === 0 ? parentAABB.min.x : axis === 1 ? parentAABB.min.y : parentAABB.min.z;
    const axisMax =
      axis === 0 ? parentAABB.max.x : axis === 1 ? parentAABB.max.y : parentAABB.max.z;
    const axisRange = axisMax - axisMin;

    if (axisRange <= 0) {
      return axisMin;
    }

    // 初始化桶
    const buckets: { count: number; bounds: AABB | null }[] = [];
    for (let i = 0; i < numBuckets; i++) {
      buckets.push({ count: 0, bounds: null });
    }

    // 将对象分配到桶中
    for (const obj of objects) {
      const center = this.getCenter(obj.bounds);
      const centroid = axis === 0 ? center.x : axis === 1 ? center.y : center.z;
      let bucketIdx = Math.floor(((centroid - axisMin) / axisRange) * numBuckets);
      bucketIdx = Math.min(bucketIdx, numBuckets - 1);
      bucketIdx = Math.max(bucketIdx, 0);

      buckets[bucketIdx].count++;
      const objAABB = AABB.fromBoundingBox(obj.bounds);
      if (buckets[bucketIdx].bounds === null) {
        buckets[bucketIdx].bounds = objAABB;
      } else {
        buckets[bucketIdx].bounds = buckets[bucketIdx].bounds!.union(objAABB);
      }
    }

    // 计算每个分割点的 SAH 代价
    let bestCost = Infinity;
    let bestSplitIdx = Math.floor(numBuckets / 2);

    for (let i = 1; i < numBuckets; i++) {
      // 计算左侧包围盒和对象数
      let leftBounds: AABB | null = null;
      let leftCount = 0;
      for (let j = 0; j < i; j++) {
        if (buckets[j].bounds !== null) {
          if (leftBounds === null) {
            leftBounds = buckets[j].bounds;
          } else {
            leftBounds = leftBounds.union(buckets[j].bounds!);
          }
        }
        leftCount += buckets[j].count;
      }

      // 计算右侧包围盒和对象数
      let rightBounds: AABB | null = null;
      let rightCount = 0;
      for (let j = i; j < numBuckets; j++) {
        if (buckets[j].bounds !== null) {
          if (rightBounds === null) {
            rightBounds = buckets[j].bounds;
          } else {
            rightBounds = rightBounds.union(buckets[j].bounds!);
          }
        }
        rightCount += buckets[j].count;
      }

      // 如果任一侧为空，跳过此分割点
      if (leftCount === 0 || rightCount === 0) continue;
      if (leftBounds === null || rightBounds === null) continue;

      // 计算 SAH 代价
      const leftSA = leftBounds.surfaceArea();
      const rightSA = rightBounds.surfaceArea();
      const cost = 0.125 + (leftSA * leftCount + rightSA * rightCount) / parentSA;

      if (cost < bestCost) {
        bestCost = cost;
        bestSplitIdx = i;
      }
    }

    // 返回最佳分割位置
    return axisMin + (bestSplitIdx / numBuckets) * axisRange;
  }
}
