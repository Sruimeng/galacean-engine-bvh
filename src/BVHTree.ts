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
        // 继续向下搜索（使用迭代方式）
        this.insertIterative(this.root, bounds, userData, objectId, 0);
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

    this.raycastIterative(this.root, ray, results, maxDistance);

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
    this.queryRangeIterative(this.root, rangeAABB, results);

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
    this.findNearestIterative(this.root, position, candidates, maxDistance);

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

    this.intersectBoundsIterative(this.root, bounds, results);
    return results;
  }

  /**
   * 重拟合 - 高效更新包围盒而不重建树（迭代方式）
   */
  refit(): void {
    if (!this.root) return;

    // 使用后序遍历（先处理子节点，再处理父节点）
    // 收集所有节点并按深度排序
    const nodes: BVHNode[] = [];
    const stack: BVHNode[] = [this.root];

    // 安全限制：最大迭代次数
    const maxIterations = this._count * 2 + 1000;
    let iterations = 0;

    // 用于检测循环引用
    const visited = new Set<BVHNode>();

    while (stack.length > 0 && iterations < maxIterations) {
      iterations++;
      const node = stack.pop()!;

      // 检测循环引用
      if (visited.has(node)) {
        console.warn('BVH refit: 检测到循环引用，跳过节点');
        continue;
      }
      visited.add(node);

      nodes.push(node);
      if (node.left) stack.push(node.left);
      if (node.right) stack.push(node.right);
    }

    // 按深度降序排序（先处理深层节点）
    nodes.sort((a, b) => b.depth - a.depth);

    // 更新每个非叶子节点的包围盒
    for (const node of nodes) {
      if (node.isLeaf) continue;
      if (!node.left && !node.right) continue;

      if (node.left && node.right) {
        const leftAABB = AABB.fromBoundingBox(node.left.bounds);
        const rightAABB = AABB.fromBoundingBox(node.right.bounds);
        const union = leftAABB.union(rightAABB);
        node.bounds = union.getBounds();
      } else if (node.left) {
        node.bounds = node.left.bounds.clone();
      } else if (node.right) {
        node.bounds = node.right.bounds.clone();
      }
    }
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
   * 获取树的统计信息（迭代方式）
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

    // 使用迭代方式遍历
    const stack: { node: BVHNode; depth: number }[] = [{ node: this.root, depth: 0 }];
    const visited = new Set<BVHNode>();

    // 安全限制：最大迭代次数
    const maxIterations = this._count * 2 + 1000;
    let iterations = 0;

    while (stack.length > 0 && iterations < maxIterations) {
      iterations++;
      const { node, depth } = stack.pop()!;

      // 循环引用检测
      if (visited.has(node)) {
        console.warn('BVH getStats: 检测到循环引用，跳过节点');
        continue;
      }
      visited.add(node);

      stats.nodeCount++;
      stats.maxDepth = Math.max(stats.maxDepth, depth);

      if (node.isLeaf) {
        stats.leafCount++;
      }

      if (node.left) stack.push({ node: node.left, depth: depth + 1 });
      if (node.right) stack.push({ node: node.right, depth: depth + 1 });
    }

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
   * 验证树的状态是否健康（迭代方式）
   * @returns 验证结果，包含是否有效和错误信息
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.root) {
      return {
        valid: this._count === 0,
        errors: this._count !== 0 ? ['根节点为空但计数不为零'] : [],
      };
    }

    const seen = new Set<number>();

    // 使用迭代方式验证
    const stack: { node: BVHNode; depth: number }[] = [{ node: this.root, depth: 0 }];
    const visited = new Set<BVHNode>();

    // 安全限制：最大迭代次数
    const maxIterations = this._count * 2 + 1000;
    let iterations = 0;

    while (stack.length > 0 && iterations < maxIterations) {
      iterations++;
      const { node, depth } = stack.pop()!;
      if (!node) continue;

      // 循环引用检测
      if (visited.has(node)) {
        errors.push('检测到循环引用');
        continue;
      }
      visited.add(node);

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
          stack.push({ node: node.left, depth: depth + 1 });
        }
        if (node.right) {
          if (node.right.parent !== node) {
            errors.push('右子节点的父引用不正确');
          }
          stack.push({ node: node.right, depth: depth + 1 });
        }
      }
    }

    // 验证计数
    if (seen.size !== this._count) {
      errors.push(`对象计数不匹配: 期望 ${this._count}, 实际 ${seen.size}`);
    }

    return { valid: errors.length === 0, errors };
  }

  // ==================== 私有辅助方法 ====================

  private findBestLeaf(node: BVHNode, bounds: BoundingBox): BVHNode {
    // 使用迭代而非递归，避免栈溢出
    let current = node;
    const visited = new Set<BVHNode>();

    // 安全限制：最大迭代次数
    const maxIterations = this.maxDepth * 2;
    let iterations = 0;

    while (!current.isLeaf && iterations < maxIterations) {
      iterations++;

      // 循环引用检测
      if (visited.has(current)) {
        console.warn('BVH findBestLeaf: 检测到循环引用');
        break;
      }
      visited.add(current);

      if (!current.left) break;

      const leftGrow = this.calculateBoundsGrowth(current.left.bounds, bounds);
      const rightGrow = current.right
        ? this.calculateBoundsGrowth(current.right.bounds, bounds)
        : Infinity;

      if (leftGrow < rightGrow) {
        current = current.left;
      } else if (current.right) {
        current = current.right;
      } else {
        break;
      }
    }

    return current;
  }

  private shouldSplit(node: BVHNode): boolean {
    // 简单的分裂条件：深度和对象数
    if (node.depth >= this.maxDepth - 1) return false;

    // 使用迭代方式估算叶子节点中的对象数
    let leafCount = 0;
    const stack: BVHNode[] = [node];
    const visited = new Set<BVHNode>();

    // 安全限制：最大迭代次数
    const maxIterations = this._count * 2 + 1000;
    let iterations = 0;

    while (stack.length > 0 && iterations < maxIterations) {
      iterations++;
      const n = stack.pop()!;

      // 循环引用检测
      if (visited.has(n)) {
        console.warn('BVH shouldSplit: 检测到循环引用');
        continue;
      }
      visited.add(n);

      if (n.isLeaf) {
        if (n.objectId >= 0) leafCount++;
      } else {
        if (n.left) stack.push(n.left);
        if (n.right) stack.push(n.right);
      }
    }

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

  private insertIterative(
    startNode: BVHNode,
    bounds: BoundingBox,
    userData: unknown,
    objectId: number,
    startDepth: number,
  ): void {
    // 使用迭代而非递归，避免栈溢出
    let node = startNode;
    let depth = startDepth;

    // 最大迭代次数为树的最大深度的两倍
    const maxIterations = this.maxDepth * 2;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;

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
          } else {
            // 异常情况：内部节点没有子节点，直接创建叶子
            node.left = BVHNode.createLeaf(bounds, userData, objectId, depth);
            node.left.parent = node;
            this._objectMap.set(objectId, node.left);
            node.updateBounds();
          }
        }
        return;
      }

      if (node.isLeaf) {
        this.splitLeaf(node, bounds, userData, objectId);
        return;
      }

      // 非叶子节点，选择增长最小的子树继续
      if (!node.left) {
        // 异常情况：非叶子节点无左子节点，直接创建
        node.left = BVHNode.createLeaf(bounds, userData, objectId, depth);
        node.left.parent = node;
        this._objectMap.set(objectId, node.left);
        node.updateBounds();
        return;
      }

      const leftGrow = this.calculateBoundsGrowth(node.left.bounds, bounds);
      const rightGrow = node.right
        ? this.calculateBoundsGrowth(node.right.bounds, bounds)
        : Infinity;

      if (leftGrow <= rightGrow) {
        node = node.left;
      } else if (node.right) {
        node = node.right;
      } else {
        // 无右子节点，在左子节点继续
        node = node.left;
      }
      depth++;
    }

    // 如果达到最大迭代次数，强制插入到当前节点
    console.warn('BVH insertIterative: 达到最大迭代次数，强制插入');
    if (node.isLeaf) {
      this.splitLeaf(node, bounds, userData, objectId);
    } else if (node.left) {
      this.splitLeaf(node.left, bounds, userData, objectId);
    } else {
      node.left = BVHNode.createLeaf(bounds, userData, objectId, depth);
      node.left.parent = node;
      this._objectMap.set(objectId, node.left);
      node.updateBounds();
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

  private raycastIterative(
    startNode: BVHNode,
    ray: Ray,
    results: CollisionResult[],
    maxDistance?: number,
  ): void {
    const stack: BVHNode[] = [startNode];

    // 安全限制：最大迭代次数
    const maxIterations = this._count * 2 + 1000;
    let iterations = 0;

    while (stack.length > 0 && iterations < maxIterations) {
      iterations++;
      const node = stack.pop()!;

      if (node.isLeaf) {
        if (node.objectId < 0) continue;

        const aabb = AABB.fromBoundingBox(node.bounds);
        const distance = aabb.intersectRayDistance(ray);

        if (distance !== null && (maxDistance === undefined || distance <= maxDistance)) {
          const point = ray.getPoint(distance);
          const normal = this.calculateNormal(node.bounds, point);
          results.push(new CollisionResult(node.userData, distance, point, normal, node));
        }
        continue;
      }

      // 剔除测试 - 如果包围盒不相交，跳过整个子树
      const nodeAABB = AABB.fromBoundingBox(node.bounds);
      const nodeDistance = nodeAABB.intersectRayDistance(ray);
      if (nodeDistance === null) continue;

      // 如果内部节点的最近距离已经超过 maxDistance，跳过
      if (maxDistance !== undefined && nodeDistance > maxDistance) continue;

      // 将子节点加入栈（按距离排序，近的后入栈先处理）
      const left = node.left;
      const right = node.right;

      if (left && right) {
        const leftAABB = AABB.fromBoundingBox(left.bounds);
        const rightAABB = AABB.fromBoundingBox(right.bounds);
        const leftDist = leftAABB.intersectRayDistance(ray);
        const rightDist = rightAABB.intersectRayDistance(ray);

        // 按距离排序，近的后入栈（先处理）
        if (leftDist !== null && rightDist !== null) {
          if (leftDist <= rightDist) {
            stack.push(right);
            stack.push(left);
          } else {
            stack.push(left);
            stack.push(right);
          }
        } else if (leftDist !== null) {
          stack.push(left);
        } else if (rightDist !== null) {
          stack.push(right);
        }
      } else if (left) {
        stack.push(left);
      } else if (right) {
        stack.push(right);
      }
    }
  }

  private queryRangeIterative(startNode: BVHNode, range: AABB, results: unknown[]): void {
    const stack: BVHNode[] = [startNode];

    // 安全限制：最大迭代次数
    const maxIterations = this._count * 2 + 1000;
    let iterations = 0;

    while (stack.length > 0 && iterations < maxIterations) {
      iterations++;
      const node = stack.pop()!;

      if (node.isLeaf) {
        if (node.objectId >= 0 && node.userData !== undefined) {
          results.push(node.userData);
        }
        continue;
      }

      // 剔除测试
      const nodeAABB = AABB.fromBoundingBox(node.bounds);
      if (!nodeAABB.intersectAABB(range)) continue;

      if (node.right) stack.push(node.right);
      if (node.left) stack.push(node.left);
    }
  }

  private findNearestIterative(
    startNode: BVHNode,
    position: Vector3,
    candidates: { distance: number; data: unknown }[],
    maxDistance?: number,
  ): void {
    const stack: BVHNode[] = [startNode];

    // 安全限制：最大迭代次数
    const maxIterations = this._count * 2 + 1000;
    let iterations = 0;

    while (stack.length > 0 && iterations < maxIterations) {
      iterations++;
      const node = stack.pop()!;

      // 计算位置到包围盒的最近点距离
      const minDistance = this.getDistanceToBounding(position, node.bounds);

      // 早期剪枝
      if (maxDistance !== undefined && minDistance > maxDistance) continue;

      if (node.isLeaf) {
        if (node.objectId < 0 || node.userData === undefined) continue;

        if (maxDistance === undefined || minDistance <= maxDistance) {
          candidates.push({ distance: minDistance, data: node.userData });
        }
        continue;
      }

      // 将子节点加入栈（按距离排序，近的后入栈先处理）
      const left = node.left;
      const right = node.right;

      if (left && right) {
        const leftDist = this.getDistanceToBounding(position, left.bounds);
        const rightDist = this.getDistanceToBounding(position, right.bounds);

        if (leftDist <= rightDist) {
          stack.push(right);
          stack.push(left);
        } else {
          stack.push(left);
          stack.push(right);
        }
      } else if (left) {
        stack.push(left);
      } else if (right) {
        stack.push(right);
      }
    }
  }

  private intersectBoundsIterative(
    startNode: BVHNode,
    bounds: BoundingBox,
    results: unknown[],
  ): void {
    const checkAABB = AABB.fromBoundingBox(bounds);
    const stack: BVHNode[] = [startNode];

    // 安全限制：最大迭代次数
    const maxIterations = this._count * 2 + 1000;
    let iterations = 0;

    while (stack.length > 0 && iterations < maxIterations) {
      iterations++;
      const node = stack.pop()!;

      if (node.isLeaf) {
        if (node.objectId >= 0 && node.userData !== undefined) {
          const nodeAABB = AABB.fromBoundingBox(node.bounds);
          if (nodeAABB.intersectAABB(checkAABB)) {
            results.push(node.userData);
          }
        }
        continue;
      }

      // 剔除测试
      const nodeAABB = AABB.fromBoundingBox(node.bounds);
      if (!nodeAABB.intersectAABB(checkAABB)) continue;

      if (node.right) stack.push(node.right);
      if (node.left) stack.push(node.left);
    }
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

    // 使用迭代方式计算树深度，避免栈溢出
    let maxDepth = 0;
    const stack: { node: BVHNode; depth: number }[] = [{ node, depth: 1 }];
    const visited = new Set<BVHNode>();

    // 安全限制：最大迭代次数
    const maxIterations = this._count * 2 + 1000;
    let iterations = 0;

    while (stack.length > 0 && iterations < maxIterations) {
      iterations++;
      const { node: current, depth } = stack.pop()!;

      // 循环引用检测
      if (visited.has(current)) {
        console.warn('BVH getTreeDepth: 检测到循环引用');
        continue;
      }
      visited.add(current);

      if (current.isLeaf) {
        maxDepth = Math.max(maxDepth, depth);
      } else {
        if (current.left) stack.push({ node: current.left, depth: depth + 1 });
        if (current.right) stack.push({ node: current.right, depth: depth + 1 });
      }
    }

    return maxDepth;
  }
}
