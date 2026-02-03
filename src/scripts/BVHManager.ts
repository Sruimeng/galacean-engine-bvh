import type { Entity } from '@galacean/engine';
import { Script } from '@galacean/engine';
import type { BoundingBox, Vector3 } from '@galacean/engine-math';
import { BVHBuilder } from '../BVHBuilder';
import { BVHTree } from '../BVHTree';
import { BVHBuildStrategy } from '../enums';
import type { Ray } from '../Ray';
import type { BVHStats } from '../types';

/**
 * BVH 管理器配置选项
 */
export interface BVHManagerOptions {
  /** 叶子节点最大对象数 (默认: 8) */
  maxLeafSize?: number;
  /** 树的最大深度 (默认: 32) */
  maxDepth?: number;
  /** 构建策略 (默认: SAH) */
  buildStrategy?: BVHBuildStrategy;
  /** 是否自动更新 (默认: true) */
  autoUpdate?: boolean;
  /** 更新间隔帧数 (默认: 1，每帧更新) */
  updateInterval?: number;
}

/**
 * BVH 碰撞体接口
 * 任何实现此接口的对象都可以被 BVHManager 管理
 */
export interface IBVHCollider {
  /** 获取世界空间包围盒 */
  getWorldBounds(): BoundingBox;
  /** 获取关联的 Entity */
  getEntity(): Entity;
  /** 是否启用 */
  isEnabled(): boolean;
  /** BVH 中的对象 ID */
  bvhObjectId?: number;
}

/**
 * Raycast 命中结果
 */
export interface RaycastHit {
  /** 命中的碰撞体 */
  collider: IBVHCollider;
  /** 命中的 Entity */
  entity: Entity;
  /** 命中距离 */
  distance: number;
  /** 命中点（��界坐标） */
  point: Vector3;
  /** 命中面法线 */
  normal: Vector3;
}

/**
 * BVH 管理器
 *
 * 作为 Galacean Script 组件，管理场景中所有 BVH 碰撞体。
 * 通常挂载在场景根节点上，作为全局单例使用。
 *
 * @example
 * ```typescript
 * // 在场景根节点上添加 BVH 管理器
 * const manager = rootEntity.addComponent(BVHManager);
 * manager.initialize({ buildStrategy: BVHBuildStrategy.SAH });
 *
 * // 执行射线检测
 * const hits = manager.raycast(ray, 100);
 * ```
 */
export class BVHManager extends Script {
  /** 全局实例引用 */
  private static _instance: BVHManager | null = null;

  /** BVH 树 */
  private _bvhTree: BVHTree | null = null;

  /** 注册的碰撞体列表 */
  private _colliders: Set<IBVHCollider> = new Set();

  /** 需要更新的碰撞体 */
  private _dirtyColliders: Set<IBVHCollider> = new Set();

  /** 配置选项 */
  private _options: Required<BVHManagerOptions> = {
    maxLeafSize: 8,
    maxDepth: 32,
    buildStrategy: BVHBuildStrategy.SAH,
    autoUpdate: true,
    updateInterval: 1,
  };

  /** 帧计数器 */
  private _frameCount: number = 0;

  /** 是否需要重建 */
  private _needsRebuild: boolean = false;

  /** 是否已初始化 */
  private _initialized: boolean = false;

  /**
   * 获取全局 BVHManager 实例
   */
  static getInstance(): BVHManager | null {
    return BVHManager._instance;
  }

  /**
   * 初始化 BVH 管理器
   * @param options - 配置选项
   */
  initialize(options?: BVHManagerOptions): void {
    if (options) {
      Object.assign(this._options, options);
    }

    this._bvhTree = new BVHTree(
      this._options.maxLeafSize,
      this._options.maxDepth,
      true, // enableSAH
    );

    this._initialized = true;
    BVHManager._instance = this;
  }

  /**
   * 注册碰撞体
   * @param collider - 碰撞体
   */
  registerCollider(collider: IBVHCollider): void {
    if (!this._initialized) {
      console.warn('BVHManager: 请先调用 initialize() 初始化');
      return;
    }

    if (this._colliders.has(collider)) {
      return;
    }

    this._colliders.add(collider);

    // 插入到 BVH 树
    if (this._bvhTree && collider.isEnabled()) {
      const bounds = collider.getWorldBounds();
      collider.bvhObjectId = this._bvhTree.insert(bounds, collider);
    }
  }

  /**
   * 注销碰撞体
   * @param collider - 碰撞体
   */
  unregisterCollider(collider: IBVHCollider): void {
    if (!this._colliders.has(collider)) {
      return;
    }

    this._colliders.delete(collider);
    this._dirtyColliders.delete(collider);

    // 从 BVH 树移除
    if (this._bvhTree && collider.bvhObjectId !== undefined) {
      this._bvhTree.remove(collider.bvhObjectId);
      collider.bvhObjectId = undefined;
    }
  }

  /**
   * 标记碰撞体需要更新
   * @param collider - 碰撞体
   */
  markDirty(collider: IBVHCollider): void {
    if (this._colliders.has(collider)) {
      this._dirtyColliders.add(collider);
    }
  }

  /**
   * 执行射线检测
   * @param ray - 射线
   * @param maxDistance - 最大距离
   * @returns 命中结果数组（按距离排序）
   */
  raycast(ray: Ray, maxDistance: number = Infinity): RaycastHit[] {
    if (!this._bvhTree) {
      return [];
    }

    const results = this._bvhTree.raycast(ray, maxDistance);

    return results
      .filter((result) => {
        const collider = result.object as IBVHCollider;
        return collider && collider.isEnabled();
      })
      .map((result) => {
        const collider = result.object as IBVHCollider;
        return {
          collider,
          entity: collider.getEntity(),
          distance: result.distance,
          point: result.point.clone(),
          normal: result.normal.clone(),
        };
      });
  }

  /**
   * 执行射线检测，只返回最近的命中
   * @param ray - 射线
   * @param maxDistance - 最大距离
   * @returns 最近的命中结果，如果没有命中返回 null
   */
  raycastFirst(ray: Ray, maxDistance: number = Infinity): RaycastHit | null {
    const hits = this.raycast(ray, maxDistance);
    return hits.length > 0 ? hits[0] : null;
  }

  /**
   * 范围查询
   * @param center - 中心点
   * @param radius - 半径
   * @returns 范围内的碰撞体列表
   */
  queryRange(center: Vector3, radius: number): IBVHCollider[] {
    if (!this._bvhTree) {
      return [];
    }

    const results = this._bvhTree.queryRange(center, radius);
    return results.filter((obj) => {
      const collider = obj as IBVHCollider;
      return collider && collider.isEnabled();
    }) as IBVHCollider[];
  }

  /**
   * 查找最近的碰撞体
   * @param position - 位置
   * @param maxDistance - 最大搜索距离
   * @returns 最近的碰撞体，如果没有找到返回 null
   */
  findNearest(position: Vector3, maxDistance?: number): IBVHCollider | null {
    if (!this._bvhTree) {
      return null;
    }

    const result = this._bvhTree.findNearest(position, maxDistance);
    if (result) {
      const collider = result as IBVHCollider;
      if (collider.isEnabled()) {
        return collider;
      }
    }
    return null;
  }

  /**
   * 包围盒相交查询
   * @param bounds - 包围盒
   * @returns 相交的碰撞体列表
   */
  intersectBounds(bounds: BoundingBox): IBVHCollider[] {
    if (!this._bvhTree) {
      return [];
    }

    const results = this._bvhTree.intersectBounds(bounds);
    return results.filter((obj) => {
      const collider = obj as IBVHCollider;
      return collider && collider.isEnabled();
    }) as IBVHCollider[];
  }

  /**
   * 强制重建 BVH 树
   */
  rebuild(): void {
    if (!this._bvhTree) {
      return;
    }

    // 收集所有启用的碰撞体
    const objects = Array.from(this._colliders)
      .filter((c) => c.isEnabled())
      .map((c) => ({
        bounds: c.getWorldBounds(),
        userData: c,
      }));

    // 使用构建器重建
    this._bvhTree = BVHBuilder.build(objects, this._options.buildStrategy);

    // 更新碰撞体的 objectId
    // 注意：重建后 objectId 会改变，需要重新映射
    this._colliders.forEach((collider) => {
      collider.bvhObjectId = undefined;
    });

    // 重新注册
    const id = 0;
    this._bvhTree.root?.traverse((node) => {
      if (node.isLeaf && node.userData) {
        const collider = node.userData as IBVHCollider;
        collider.bvhObjectId = node.objectId;
      }
    });

    this._dirtyColliders.clear();
    this._needsRebuild = false;
  }

  /**
   * 获取 BVH 统计信息
   */
  getStats(): BVHStats | null {
    return this._bvhTree?.getStats() ?? null;
  }

  /**
   * 获取碰撞体数量
   */
  get colliderCount(): number {
    return this._colliders.size;
  }

  /**
   * 获取 BVH 树（高级用法）
   */
  get bvhTree(): BVHTree | null {
    return this._bvhTree;
  }

  // ============ Script 生命周期 ============

  /**
   * 脚本启用时调用
   */
  override onEnable(): void {
    if (!this._initialized) {
      this.initialize();
    }
    BVHManager._instance = this;
  }

  /**
   * 脚本禁用时调用
   */
  override onDisable(): void {
    if (BVHManager._instance === this) {
      BVHManager._instance = null;
    }
  }

  /**
   * 每帧更新
   */
  override onUpdate(deltaTime: number): void {
    if (!this._options.autoUpdate || !this._bvhTree) {
      return;
    }

    this._frameCount++;

    // 按间隔更新
    if (this._frameCount % this._options.updateInterval !== 0) {
      return;
    }

    // 如果需要重建
    if (this._needsRebuild) {
      this.rebuild();
      return;
    }

    // 更新脏碰撞体
    if (this._dirtyColliders.size > 0) {
      // 如果脏碰撞体太多，直接重建
      if (this._dirtyColliders.size > this._colliders.size * 0.3) {
        this.rebuild();
      } else {
        // 增量更新
        for (const collider of this._dirtyColliders) {
          if (collider.bvhObjectId !== undefined && collider.isEnabled()) {
            const bounds = collider.getWorldBounds();
            this._bvhTree.update(collider.bvhObjectId, bounds);
          }
        }
        this._dirtyColliders.clear();

        // 执行 refit 优化
        this._bvhTree.refit();
      }
    }
  }

  /**
   * 脚本销毁时调用
   */
  override onDestroy(): void {
    this._colliders.clear();
    this._dirtyColliders.clear();
    this._bvhTree?.clear();
    this._bvhTree = null;

    if (BVHManager._instance === this) {
      BVHManager._instance = null;
    }
  }
}
