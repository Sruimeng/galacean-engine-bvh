import { BoundingBox, Vector3 } from '@galacean/engine-math';
import { BVHTree } from './BVHTree';
import { AABB } from './AABB';
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
    strategy: BVHBuildStrategy = BVHBuildStrategy.SAH
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

    const processed = new Set<number>();

    // 根据策略选择构建方法
    switch (strategy) {
      case BVHBuildStrategy.SAH:
        this.buildSAH(tree, objects, processed);
        break;
      case BVHBuildStrategy.Median:
        this.buildMedian(tree, objects, processed);
        break;
      case BVHBuildStrategy.Equal:
        this.buildEqual(tree, objects, processed);
        break;
    }

    return tree;
  }

  /**
   * 使用 SAH 策略构建 (Surface Area Heuristic)
   *
   * 最优但最慢的策略，查询性能最佳
   */
  private static buildSAH(tree: BVHTree, objects: BVHInsertObject[], processed: Set<number>): void {
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
      this.buildMedian(tree, objects, processed);
      return;
    }

    // 如果子集足够小，直接插入；否则递归
    if (leftObjects.length <= tree.maxLeafSize) {
      for (const obj of leftObjects) {
        tree.insert(obj.bounds, obj.userData);
      }
    } else {
      this.buildSAH(tree, leftObjects, processed);
    }

    if (rightObjects.length <= tree.maxLeafSize) {
      for (const obj of rightObjects) {
        tree.insert(obj.bounds, obj.userData);
      }
    } else {
      this.buildSAH(tree, rightObjects, processed);
    }
  }

  /**
   * 使用中位数分割策略
   *
   * 构建快速，性能均衡，适合动态场景
   */
  private static buildMedian(tree: BVHTree, objects: BVHInsertObject[], processed: Set<number>): void {
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
        this.buildMedian(tree, leftObjects, processed);
      }
    }

    if (rightObjects.length > 0) {
      if (rightObjects.length <= tree.maxLeafSize) {
        for (const obj of rightObjects) {
          tree.insert(obj.bounds, obj.userData);
        }
      } else {
        this.buildMedian(tree, rightObjects, processed);
      }
    }
  }

  /**
   * 使用均等分割策略
   *
   * 适用于均匀分布的场景，构建较快
   */
  private static buildEqual(tree: BVHTree, objects: BVHInsertObject[], processed: Set<number>): void {
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
        this.buildEqual(tree, subset, processed);
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
  private static getCenter(bounds: BoundingBox): { x: number; y: number; z: number; } {
    return {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2
    };
  }

  /**
   * SAH 策略：寻找最佳分割位置
   */
  private static findBestSplitPositionSAH(
    objects: BVHInsertObject[],
    axis: number,
    unionAABB: AABB
  ): number {
    // 简化实现：使用中点作为候选
    const centers = objects.map(obj => this.getCenter(obj.bounds)[axis === 0 ? 'x' : axis === 1 ? 'y' : 'z']);
    centers.sort((a, b) => a - b);

    // 过滤掉重复值，保留中间位置
    const unique = [...new Set(centers)];
    if (unique.length === 0) return 0;

    return unique[Math.floor(unique.length / 2)];
  }
}
