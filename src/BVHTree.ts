import type { BoundingBox } from '@galacean/engine-math';
import { Vector3 } from '@galacean/engine-math';
import { AABB } from './AABB';
import { BVHBuilder } from './BVHBuilder';
import { BVHNode } from './BVHNode';
import { CollisionResult } from './CollisionResult';
import type { Ray } from './Ray';
import type { BVHBuildStrategy } from './enums';
import type { BVHInsertObject, BVHStats } from './types';

/**
 * BVH 树 (Bounding Volume Hierarchy)
 *
 * 高效的空间加速结构，用于碰撞检测、光线投射、空间查询等
 */
export class BVHTree {
  /** 根节点 */
  public root: BVHNode | null = null;
  /** 叶子节点最大对象数 (默认: 8) */
  public maxLeafSize: number;
  /** 树的最大深度 (默认: 32) */
  public maxDepth: number;
  /** 是否启用 SAH 优化 (默认: true) */
  public enableSAH: boolean;

  /** 对象计数 */
  private _count: number = 0;
  /** 对象映射 ID -> 节点 */
  private _objectMap: Map<number, BVHNode> = new Map();
  /** 下一个对象 ID */
  private _nextId: number = 0;

  /**
   * 创建 BVH 树
   * @param maxLeafSize - 叶子节点最大对象数 (默认: 8)
   * @param maxDepth - 树的最大深度 (默认: 32)
   * @param enableSAH - 启用 SAH 优化 (默认: true)
   */
  constructor(maxLeafSize: number = 8, maxDepth: number = 32, enableSAH: boolean = true) {
    this.maxLeafSize = Math.max(1, maxLeafSize);
    this.maxDepth = Math.max(1, maxDepth);
    this.enableSAH = enableSAH;
  }

  /**
   * 树中对象数量
   */
  get count(): number {
    return this._count;
  }

  /**
   * 插入对象到 BVH 树
   * @param bounds - 对象的轴对齐包围盒
   * @param userData - 用户数据（可选）
   * @returns 对象的唯一 ID
   */
  insert(bounds: BoundingBox, userData?: any): number {
    const objectId = this._nextId++;

    if (this.root === null) {
      const leaf = BVHNode.createLeaf(bounds, userData, objectId, 0);
      this.root = leaf;
      this._objectMap.set(objectId, leaf);
      this._count++;
      return objectId;
    }

    // 找到最佳叶子节点
    const targetLeaf = this.findBestLeaf(this.root, bounds);

    // 如果叶子节点已满，将其拆分
    if (targetLeaf.isLeaf && this.shouldSplit(targetLeaf)) {
      this.splitLeaf(targetLeaf, bounds, userData, objectId);
    } else {
      // 直接添加到叶子节点（简单情况）
      if (targetLeaf.isLeaf) {
        // 创建新节点来容纳多个对象
        this.splitLeaf(targetLeaf, bounds, userData, objectId);
      } else {
        // 继续向下搜索
        this.insertRecursive(this.root, bounds, userData, objectId, 0);
      }
    }

    this._count++;
    return objectId;
  }

  /**
   * 更新对象的包围盒
   * @param objectId - 对象 ID
   * @param newBounds - 新的包围盒
   * @returns 是否更新成功
   */
  update(objectId: number, newBounds: BoundingBox): boolean {
    const node = this._objectMap.get(objectId);
    if (!node) return false;

    // 更新节点包围盒
    node.bounds = newBounds;

    // 使用 refit 优化更新父节点
    if (node.parent) {
      node.parent.updateBounds();
    }

    return true;
  }

  /**
   * 移除对象
   * @param objectId - 对象 ID
   * @returns 是否移除成功
   */
  remove(objectId: number): boolean {
    const node = this._objectMap.get(objectId);
    if (!node || !node.isLeaf) return false;

    this._objectMap.delete(objectId);
    this._count--;

    const parent = node.parent;

    // 如果是根节点，直接清空
    if (!parent) {
      this.root = null;
      return true;
    }

    // 找到兄弟节点
    const sibling = parent.left === node ? parent.right : parent.left;

    // 如果没有兄弟节点，将父节点转换为空叶子
    if (!sibling) {
      parent.isLeaf = true;
      parent.userData = null;
      parent.objectId = -1;
      parent.left = null;
      parent.right = null;
      if (parent.parent) {
        parent.parent.updateBounds();
      }
      return true;
    }

    // 用兄弟节点替换父节点
    const grandParent = parent.parent;
    if (grandParent) {
      if (grandParent.left === parent) {
        grandParent.left = sibling;
      } else {
        grandParent.right = sibling;
      }
      sibling.parent = grandParent;
      grandParent.updateBounds();
    } else {
      // 父节点是根节点，兄弟节点变为新的根节点
      this.root = sibling;
      sibling.parent = null;
    }

    return true;
  }

  /**
   * 清空整个树
   */
  clear(): void {
    this.root = null;
    this._count = 0;
    this._objectMap.clear();
    this._nextId = 0;
  }

  /**
   * 光线投射查询
   * @param ray - 射线
   * @param maxDistance - 最大距离（可选）
   * @returns 碰撞结果数组（按距离排序）
   */
  raycast(ray: Ray, maxDistance?: number): CollisionResult[] {
    const results: CollisionResult[] = [];

    if (!this.root) return results;

    this.raycastRecursive(this.root, ray, results, maxDistance);

    // 按距离排序
    results.sort((a, b) => a.distance - b.distance);

    return results;
  }

  /**
   * 范围查询 - 查找指定中心点半径内的所有对象
   * @param center - 中心点
   * @param radius - 半径
   * @returns 用户数据数组
   */
  queryRange(center: Vector3, radius: number): any[] {
    const results: any[] = [];
    if (!this.root) return results;

    const rangeAABB = AABB.fromCenterSize(center, new Vector3(radius * 2, radius * 2, radius * 2));
    this.queryRangeRecursive(this.root, rangeAABB, results);

    return results;
  }

  /**
   * 查找最近的邻居
   * @param position - 位置
   * @param maxDistance - 最大搜索距离（可选）
   * @returns 最近的对象数据
   */
  findNearest(position: Vector3, maxDistance?: number): any {
    if (!this.root) return null;

    const candidates: { distance: number; data: any }[] = [];
    this.findNearestRecursive(this.root, position, candidates, maxDistance);

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0].data;
  }

  /**
   * 相交检测 - 查找与指定包围盒相交的对象
   * @param bounds - 包围盒
   * @returns 用户数据数组
   */
  intersectBounds(bounds: BoundingBox): any[] {
    const results: any[] = [];
    if (!this.root) return results;

    this.intersectBoundsRecursive(this.root, bounds, results);
    return results;
  }

  /**
   * 重拟合 - 高效更新包围盒而不重建树
   */
  refit(): void {
    if (!this.root) return;

    const updateNode = (node: BVHNode): void => {
      if (node.isLeaf) return;

      const leftAABB = AABB.fromBoundingBox(node.left.bounds);
      const rightAABB = node.right ? AABB.fromBoundingBox(node.right.bounds) : leftAABB;
      const union = node.right ? leftAABB.union(rightAABB) : leftAABB;
      node.bounds = union.getBounds();

      if (node.left) updateNode(node.left);
      if (node.right) updateNode(node.right);
    };

    updateNode(this.root);
  }

  /**
   * 重建整个树
   * @param strategy - 构建策略（可选）
   */
  rebuild(strategy?: BVHBuildStrategy): void {
    // 收集所有对象
    const objects: BVHInsertObject[] = [];
    this.root?.traverse((node) => {
      if (node.isLeaf && node.objectId >= 0) {
        objects.push({ bounds: node.bounds.clone(), userData: node.userData });
      }
    });

    if (objects.length === 0) return;

    // 清空现有树
    this.clear();

    // 使用构建器创建新树
    const newTree = BVHBuilder.build(objects, strategy);

    // 复制新树状态
    this.root = newTree.root;
    this._count = newTree._count;
    this._objectMap = new Map(newTree._objectMap);
    this._nextId = newTree._nextId;
  }

  /**
   * 获取树的统计信息
   */
  getStats(): BVHStats {
    const stats: BVHStats = {
      nodeCount: 0,
      leafCount: 0,
      maxDepth: 0,
      balanceFactor: 1,
      objectCount: this._count,
      memoryUsage: 0,
    };

    if (!this.root) return stats;

    const traverse = (node: BVHNode, depth: number = 0): void => {
      stats.nodeCount++;
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      if (node.isLeaf) {
        stats.leafCount++;
      }

      if (node.left) traverse(node.left, depth + 1);
      if (node.right) traverse(node.right, depth + 1);
    };

    traverse(this.root);

    // 计算平衡因子
    const leftDepth = this.getTreeDepth(this.root?.left);
    const rightDepth = this.getTreeDepth(this.root?.right);
    if (leftDepth > 0 && rightDepth > 0) {
      stats.balanceFactor = Math.min(leftDepth, rightDepth) / Math.max(leftDepth, rightDepth);
    }

    // 估算内存使用
    stats.memoryUsage = stats.nodeCount * 64;

    return stats;
  }

  /**
   * 验证树的状态是否健康
   * @returns 验证结果，包含是否有效和错误信息
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.root) {
      return { valid: this._count === 0, errors: this._count !== 0 ? ['根节点为空但计数不为零'] : [] };
    }

    const seen = new Set<number>();

    const validateNode = (node: BVHNode, depth: number): void => {
      if (!node) return;

      // 检查深度一致性
      if (node.depth !== depth) {
        errors.push(`节点深度不一致: 期望 ${depth}, 实际 ${node.depth}`);
      }

      // 检查叶子节点
      if (node.isLeaf) {
        if (node.objectId >= 0) {
          if (seen.has(node.objectId)) {
            errors.push(`重复的对象 ID: ${node.objectId}`);
          } else {
            seen.add(node.objectId);
          }
          if (!this._objectMap.has(node.objectId)) {
            errors.push(`对象 ID ${node.objectId} 不在映射中`);
          }
        }
        // 叶子节点不应该有子节点
        if (node.left || node.right) {
          errors.push('叶子节点不应该有子节点');
        }
      } else {
        // 内部节点必须有左子节点
        if (!node.left) {
          errors.push('内部节点缺少左子节点');
        } else {
          // 检查父引用
          if (node.left.parent !== node) {
            errors.push('左子节点的父引用不正确');
          }
          validateNode(node.left, depth + 1);
        }
        if (node.right) {
          if (node.right.parent !== node) {
            errors.push('右子节点的父引用不正确');
          }
          validateNode(node.right, depth + 1);
        }
      }
    };

    validateNode(this.root, 0);

    // 验证计数
    if (seen.size !== this._count) {
      errors.push(`对象计数不匹配: 期望 ${this._count}, 实际 ${seen.size}`);
    }

    return { valid: errors.length === 0, errors };
  }

  // ==================== 私有辅助方法 ====================

  private findBestLeaf(node: BVHNode, bounds: BoundingBox): BVHNode {
    if (node.isLeaf) return node;

    if (!node.left) return node;

    const leftGrow = this.calculateBoundsGrowth(node.left.bounds, bounds);
    const rightGrow = node.right ? this.calculateBoundsGrowth(node.right.bounds, bounds) : Infinity;

    if (leftGrow < rightGrow) {
      return this.findBestLeaf(node.left, bounds);
    } else if (node.right) {
      return this.findBestLeaf(node.right, bounds);
    }

    return node;
  }

  private shouldSplit(node: BVHNode): boolean {
    // 简单的分裂条件：深度和对象数
    if (node.depth >= this.maxDepth - 1) return false;

    // 估算叶子节点中的对象数
    let leafCount = 0;
    const countLeafs = (n: BVHNode): void => {
      if (n.isLeaf) {
        // 如果已经有对象或正在分裂
        if (n.objectId >= 0) leafCount++;
      } else {
        if (n.left) countLeafs(n.left);
        if (n.right) countLeafs(n.right);
      }
    };
    countLeafs(node);

    return leafCount >= this.maxLeafSize;
  }

  private splitLeaf(
    leaf: BVHNode,
    newBounds: BoundingBox,
    newUserData: unknown,
    newObjectId: number,
  ): void {
    // 创建新叶子节点
    const newLeaf = BVHNode.createLeaf(newBounds, newUserData, newObjectId, leaf.depth + 1);

    // 如果叶子是空的（已被移除），直接替换
    if (leaf.objectId < 0) {
      leaf.bounds = newBounds;
      leaf.userData = newUserData;
      leaf.objectId = newObjectId;
      this._objectMap.set(newObjectId, leaf);
      return;
    }

    // 将旧对象和新对象的数据保存
    const existingData = { bounds: leaf.bounds, userData: leaf.userData, objectId: leaf.objectId };

    // 转换为内部节点
    leaf.resetAsInternal();

    // 根据现有对象和新对象的包围盒创建子节点
    const allBounds = [existingData.bounds, newBounds];
    const splitAxis = this.getLongestAxis(allBounds);

    // 决定左右分配 - 使用显式属性访问而非索引
    const getAxisValue = (v: Vector3, axis: number): number => {
      if (axis === 0) return v.x;
      if (axis === 1) return v.y;
      return v.z;
    };

    const existingMid =
      (getAxisValue(existingData.bounds.min, splitAxis) +
        getAxisValue(existingData.bounds.max, splitAxis)) /
      2;
    const newMid =
      (getAxisValue(newBounds.min, splitAxis) + getAxisValue(newBounds.max, splitAxis)) / 2;

    const existingDataNode = BVHNode.createLeaf(
      existingData.bounds,
      existingData.userData,
      existingData.objectId,
      leaf.depth + 1,
    );
    this._objectMap.set(existingData.objectId, existingDataNode);

    if (existingMid < newMid) {
      leaf.left = existingDataNode;
      leaf.right = newLeaf;
    } else {
      leaf.left = newLeaf;
      leaf.right = existingDataNode;
    }

    existingDataNode.parent = leaf;
    newLeaf.parent = leaf;

    this._objectMap.set(newObjectId, newLeaf);

    // 更新父节点包围盒
    leaf.updateBounds();
  }

  private insertRecursive(
    node: BVHNode,
    bounds: BoundingBox,
    userData: unknown,
    objectId: number,
    depth: number,
  ): void {
    if (depth >= this.maxDepth) {
      // 达到最大深度时，强制在当前节点进行分裂
      if (node.isLeaf) {
        this.splitLeaf(node, bounds, userData, objectId);
      } else {
        // 如果是内部节点，选择增长最小的子树插入
        if (node.left && node.right) {
          const leftGrow = this.calculateBoundsGrowth(node.left.bounds, bounds);
          const rightGrow = this.calculateBoundsGrowth(node.right.bounds, bounds);
          if (leftGrow <= rightGrow) {
            this.splitLeaf(node.left, bounds, userData, objectId);
          } else {
            this.splitLeaf(node.right, bounds, userData, objectId);
          }
        } else if (node.left) {
          this.splitLeaf(node.left, bounds, userData, objectId);
        }
      }
      return;
    }

    if (node.isLeaf) {
      this.splitLeaf(node, bounds, userData, objectId);
      return;
    }

    // 非叶子节点，选择增长最小的子树递归插入
    if (!node.left) {
      // 异常情况：非叶子节点无左子节点，直接创建
      node.left = BVHNode.createLeaf(bounds, userData, objectId, depth);
      node.left.parent = node;
      this._objectMap.set(objectId, node.left);
      node.updateBounds();
      return;
    }

    const leftGrow = this.calculateBoundsGrowth(node.left.bounds, bounds);
    const rightGrow = node.right ? this.calculateBoundsGrowth(node.right.bounds, bounds) : Infinity;

    if (leftGrow <= rightGrow) {
      this.insertRecursive(node.left, bounds, userData, objectId, depth + 1);
    } else if (node.right) {
      this.insertRecursive(node.right, bounds, userData, objectId, depth + 1);
    } else {
      // 无右子节点，在左子节点继续
      this.insertRecursive(node.left, bounds, userData, objectId, depth + 1);
    }
  }

  private calculateBoundsGrowth(oldBounds: BoundingBox, newBounds: BoundingBox): number {
    // 直接计算体积变化，避免创建临时 AABB 对象
    const unionMinX = Math.min(oldBounds.min.x, newBounds.min.x);
    const unionMinY = Math.min(oldBounds.min.y, newBounds.min.y);
    const unionMinZ = Math.min(oldBounds.min.z, newBounds.min.z);
    const unionMaxX = Math.max(oldBounds.max.x, newBounds.max.x);
    const unionMaxY = Math.max(oldBounds.max.y, newBounds.max.y);
    const unionMaxZ = Math.max(oldBounds.max.z, newBounds.max.z);

    const unionVolume =
      Math.max(0, unionMaxX - unionMinX) *
      Math.max(0, unionMaxY - unionMinY) *
      Math.max(0, unionMaxZ - unionMinZ);

    const oldVolume =
      Math.max(0, oldBounds.max.x - oldBounds.min.x) *
      Math.max(0, oldBounds.max.y - oldBounds.min.y) *
      Math.max(0, oldBounds.max.z - oldBounds.min.z);

    return unionVolume - oldVolume;
  }

  private getLongestAxis(boundsArray: BoundingBox[]): number {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);

    for (const bounds of boundsArray) {
      min.x = Math.min(min.x, bounds.min.x);
      min.y = Math.min(min.y, bounds.min.y);
      min.z = Math.min(min.z, bounds.min.z);
      max.x = Math.max(max.x, bounds.max.x);
      max.y = Math.max(max.y, bounds.max.y);
      max.z = Math.max(max.z, bounds.max.z);
    }

    const size = new Vector3();
    Vector3.subtract(max, min, size);
    if (size.x > size.y && size.x > size.z) return 0; // X
    if (size.y > size.z) return 1; // Y
    return 2; // Z
  }

  private raycastRecursive(
    node: BVHNode,
    ray: Ray,
    results: CollisionResult[],
    maxDistance?: number,
  ): void {
    if (node.isLeaf) {
      if (node.objectId < 0) return;

      const aabb = AABB.fromBoundingBox(node.bounds);
      const distance = aabb.intersectRayDistance(ray);

      if (distance !== null && (maxDistance === undefined || distance <= maxDistance)) {
        const point = ray.getPoint(distance);
        // 简化的法线计算（实际可以根据面方向计算）
        const normal = this.calculateNormal(node.bounds, point);

        results.push(new CollisionResult(node.userData, distance, point, normal, node));
      }
      return;
    }

    // 剔除测试 - 如果包围盒不相交，跳过整个子树
    const aabb = AABB.fromBoundingBox(node.bounds);
    if (!aabb.intersectRay(ray)) return;

    // 递归子节点
    if (node.left) this.raycastRecursive(node.left, ray, results, maxDistance);
    if (node.right) this.raycastRecursive(node.right, ray, results, maxDistance);
  }

  private queryRangeRecursive(node: BVHNode, range: AABB, results: unknown[]): void {
    if (node.isLeaf) {
      if (node.objectId >= 0 && node.userData !== undefined) {
        results.push(node.userData);
      }
      return;
    }

    // 剔除测试
    const nodeAABB = AABB.fromBoundingBox(node.bounds);
    if (!nodeAABB.intersectAABB(range)) return;

    if (node.left) this.queryRangeRecursive(node.left, range, results);
    if (node.right) this.queryRangeRecursive(node.right, range, results);
  }

  private findNearestRecursive(
    node: BVHNode,
    position: Vector3,
    candidates: { distance: number; data: unknown }[],
    maxDistance?: number,
  ): void {
    // 计算位置到包围盒的最近点距离
    const minDistance = this.getDistanceToBounding(position, node.bounds);

    // 早期剪枝
    if (maxDistance !== undefined && minDistance > maxDistance) return;

    if (node.isLeaf) {
      if (node.objectId < 0 || node.userData === undefined) return;

      if (maxDistance === undefined || minDistance <= maxDistance) {
        candidates.push({ distance: minDistance, data: node.userData });
      }
      return;
    }

    // 优先搜索较近的子节点
    const left = node.left;
    const right = node.right;

    if (left && right) {
      const leftDist = this.getDistanceToBounding(position, left.bounds);
      const rightDist = this.getDistanceToBounding(position, right.bounds);

      // 按距离排序搜索，可以更快找到最近的对象
      if (leftDist <= rightDist) {
        this.findNearestRecursive(left, position, candidates, maxDistance);
        this.findNearestRecursive(right, position, candidates, maxDistance);
      } else {
        this.findNearestRecursive(right, position, candidates, maxDistance);
        this.findNearestRecursive(left, position, candidates, maxDistance);
      }
    } else if (left) {
      this.findNearestRecursive(left, position, candidates, maxDistance);
    } else if (right) {
      this.findNearestRecursive(right, position, candidates, maxDistance);
    }
  }

  private intersectBoundsRecursive(node: BVHNode, bounds: BoundingBox, results: unknown[]): void {
    if (node.isLeaf) {
      if (node.objectId >= 0 && node.userData !== undefined) {
        const nodeAABB = AABB.fromBoundingBox(node.bounds);
        const checkAABB = AABB.fromBoundingBox(bounds);
        if (nodeAABB.intersectAABB(checkAABB)) {
          results.push(node.userData);
        }
      }
      return;
    }

    // 剔除测试
    const nodeAABB = AABB.fromBoundingBox(node.bounds);
    const checkAABB = AABB.fromBoundingBox(bounds);
    if (!nodeAABB.intersectAABB(checkAABB)) return;

    if (node.left) this.intersectBoundsRecursive(node.left, bounds, results);
    if (node.right) this.intersectBoundsRecursive(node.right, bounds, results);
  }

  private getDistanceToBounding(position: Vector3, bounds: BoundingBox): number {
    const nearestPoint = new Vector3(
      Math.max(bounds.min.x, Math.min(position.x, bounds.max.x)),
      Math.max(bounds.min.y, Math.min(position.y, bounds.max.y)),
      Math.max(bounds.min.z, Math.min(position.z, bounds.max.z)),
    );
    return Vector3.distance(position, nearestPoint);
  }

  private calculateNormal(bounds: BoundingBox, point: Vector3): Vector3 {
    const center = new Vector3();
    Vector3.add(bounds.min, bounds.max, center);
    center.scale(0.5);

    const diff = new Vector3();
    Vector3.subtract(point, center, diff);
    const absX = Math.abs(diff.x);
    const absY = Math.abs(diff.y);
    const absZ = Math.abs(diff.z);

    if (absX > absY && absX > absZ) {
      return new Vector3(Math.sign(diff.x), 0, 0);
    } else if (absY > absZ) {
      return new Vector3(0, Math.sign(diff.y), 0);
    } else {
      return new Vector3(0, 0, Math.sign(diff.z));
    }
  }

  private getTreeDepth(node: BVHNode | null): number {
    if (!node) return 0;
    if (node.isLeaf) return 1;
    const leftDepth = node.left ? this.getTreeDepth(node.left) : 0;
    const rightDepth = node.right ? this.getTreeDepth(node.right) : 0;
    return 1 + Math.max(leftDepth, rightDepth);
  }
}
