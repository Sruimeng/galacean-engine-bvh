import type { Entity, MeshRenderer, SkinnedMeshRenderer } from '@galacean/engine';
import { Script } from '@galacean/engine';
import { BoundingBox, Matrix, Vector3 } from '@galacean/engine-math';
import type { IBVHCollider } from './BVHManager';
import { BVHManager } from './BVHManager';

/**
 * 碰撞体形状类型
 */
export enum ColliderShapeType {
  /** 自动从 MeshRenderer 获取 */
  Auto = 'auto',
  /** 自定义包围盒 */
  Box = 'box',
  /** 自定义球体（转换为包围盒） */
  Sphere = 'sphere',
}

/**
 * BVH 碰撞体配置
 */
export interface BVHColliderOptions {
  /** 碰撞体形状类型 */
  shapeType?: ColliderShapeType;
  /** 自定义包围盒大小（仅 Box 类型） */
  boxSize?: Vector3;
  /** 自定义包围盒中心偏移（仅 Box 类型） */
  boxCenter?: Vector3;
  /** 自定义球体半径（仅 Sphere 类型） */
  sphereRadius?: number;
  /** 自定义球体中心偏移（仅 Sphere 类型） */
  sphereCenter?: Vector3;
  /** 碰撞层（用于过滤） */
  layer?: number;
  /** 用户自定义数据 */
  userData?: any;
}

/**
 * BVH 碰撞体组件
 *
 * 添加到 Entity 上，自动注册到 BVHManager 进行空间加速查询。
 * 支持自动从 MeshRenderer 获取包围盒，或手动指定包围盒。
 *
 * @example
 * ```typescript
 * // 自动模式 - 从 MeshRenderer 获取包围盒
 * const collider = entity.addComponent(BVHCollider);
 *
 * // 自定义包围盒
 * const collider = entity.addComponent(BVHCollider);
 * collider.configure({
 *   shapeType: ColliderShapeType.Box,
 *   boxSize: new Vector3(2, 2, 2),
 *   boxCenter: new Vector3(0, 1, 0),
 * });
 *
 * // 设置碰撞层
 * collider.layer = 1; // 用于过滤
 * ```
 */
export class BVHCollider extends Script implements IBVHCollider {
  /** BVH 对象 ID */
  bvhObjectId?: number;

  /** 碰撞层 */
  layer: number = 0;

  /** 用户自定义数据 */
  userData: any;

  /** 形状类型 */
  private _shapeType: ColliderShapeType = ColliderShapeType.Auto;

  /** 自定义包围盒大小 */
  private _boxSize: Vector3 = new Vector3(1, 1, 1);

  /** 自定义包围盒中心偏移 */
  private _boxCenter: Vector3 = new Vector3(0, 0, 0);

  /** 自定义球体半径 */
  private _sphereRadius: number = 0.5;

  /** 自定义球体中心偏移 */
  private _sphereCenter: Vector3 = new Vector3(0, 0, 0);

  /** 缓存的世界包围盒 */
  private _worldBounds: BoundingBox = new BoundingBox();

  /** 上一帧的世界矩阵（用于检测变化） */
  private _lastWorldMatrix: Matrix = new Matrix();

  /** 是否需要更新包围盒 */
  private _boundsDirty: boolean = true;

  /** 关联的 MeshRenderer */
  private _meshRenderer: MeshRenderer | SkinnedMeshRenderer | null = null;

  /** BVH 管理器引用 */
  private _manager: BVHManager | null = null;

  /**
   * 配置碰撞体
   * @param options - 配置选项
   */
  configure(options: BVHColliderOptions): void {
    if (options.shapeType !== undefined) {
      this._shapeType = options.shapeType;
    }
    if (options.boxSize) {
      this._boxSize.copyFrom(options.boxSize);
    }
    if (options.boxCenter) {
      this._boxCenter.copyFrom(options.boxCenter);
    }
    if (options.sphereRadius !== undefined) {
      this._sphereRadius = options.sphereRadius;
    }
    if (options.sphereCenter) {
      this._sphereCenter.copyFrom(options.sphereCenter);
    }
    if (options.layer !== undefined) {
      this.layer = options.layer;
    }
    if (options.userData !== undefined) {
      this.userData = options.userData;
    }

    this._boundsDirty = true;
    this._notifyManager();
  }

  /**
   * 设置形状类型
   */
  set shapeType(value: ColliderShapeType) {
    if (this._shapeType !== value) {
      this._shapeType = value;
      this._boundsDirty = true;
      this._notifyManager();
    }
  }

  get shapeType(): ColliderShapeType {
    return this._shapeType;
  }

  /**
   * 设置包围盒大小（Box 类型）
   */
  setBoxSize(x: number, y: number, z: number): void {
    this._boxSize.set(x, y, z);
    this._boundsDirty = true;
    this._notifyManager();
  }

  /**
   * 设置包围盒中心偏移（Box 类型）
   */
  setBoxCenter(x: number, y: number, z: number): void {
    this._boxCenter.set(x, y, z);
    this._boundsDirty = true;
    this._notifyManager();
  }

  /**
   * 设置球体半径（Sphere 类型）
   */
  setSphereRadius(radius: number): void {
    this._sphereRadius = radius;
    this._boundsDirty = true;
    this._notifyManager();
  }

  /**
   * 设置球体中心偏移（Sphere 类型）
   */
  setSphereCenter(x: number, y: number, z: number): void {
    this._sphereCenter.set(x, y, z);
    this._boundsDirty = true;
    this._notifyManager();
  }

  // ============ IBVHCollider 接口实现 ============

  /**
   * 获取世界空间包围盒
   */
  getWorldBounds(): BoundingBox {
    this._updateWorldBounds();
    return this._worldBounds;
  }

  /**
   * 获取关联的 Entity
   */
  getEntity(): Entity {
    return this.entity;
  }

  /**
   * 是否启用
   */
  isEnabled(): boolean {
    return this.enabled && this.entity.isActiveInHierarchy;
  }

  // ============ 私有方法 ============

  /**
   * 更新世界空间包围盒
   */
  private _updateWorldBounds(): void {
    const transform = this.entity.transform;
    const worldMatrix = transform.worldMatrix;

    // 检查世界矩阵是否变化
    if (!this._boundsDirty && Matrix.equals(worldMatrix, this._lastWorldMatrix)) {
      return;
    }

    this._lastWorldMatrix.copyFrom(worldMatrix);
    this._boundsDirty = false;

    switch (this._shapeType) {
      case ColliderShapeType.Auto:
        this._updateFromMeshRenderer();
        break;
      case ColliderShapeType.Box:
        this._updateFromBox();
        break;
      case ColliderShapeType.Sphere:
        this._updateFromSphere();
        break;
    }
  }

  /**
   * 从 MeshRenderer 更新包围盒
   */
  private _updateFromMeshRenderer(): void {
    if (!this._meshRenderer) {
      this._meshRenderer =
        this.entity.getComponent(MeshRenderer) || this.entity.getComponent(SkinnedMeshRenderer);
    }

    if (this._meshRenderer) {
      const bounds = this._meshRenderer.bounds;
      this._worldBounds.min.copyFrom(bounds.min);
      this._worldBounds.max.copyFrom(bounds.max);
    } else {
      // 如果没有 MeshRenderer，使用默认的单位包围盒
      this._updateFromBox();
    }
  }

  /**
   * 从自定义 Box 更新包围盒
   */
  private _updateFromBox(): void {
    const transform = this.entity.transform;
    const worldPosition = transform.worldPosition;
    const worldScale = transform.lossyWorldScale;

    // 计算世界空间的半尺寸
    const halfX = this._boxSize.x * 0.5 * Math.abs(worldScale.x);
    const halfY = this._boxSize.y * 0.5 * Math.abs(worldScale.y);
    const halfZ = this._boxSize.z * 0.5 * Math.abs(worldScale.z);

    // 计算世界空间的中心
    const centerX = worldPosition.x + this._boxCenter.x * worldScale.x;
    const centerY = worldPosition.y + this._boxCenter.y * worldScale.y;
    const centerZ = worldPosition.z + this._boxCenter.z * worldScale.z;

    // 设置包围盒
    this._worldBounds.min.set(centerX - halfX, centerY - halfY, centerZ - halfZ);
    this._worldBounds.max.set(centerX + halfX, centerY + halfY, centerZ + halfZ);
  }

  /**
   * 从自定义 Sphere 更新包围盒
   */
  private _updateFromSphere(): void {
    const transform = this.entity.transform;
    const worldPosition = transform.worldPosition;
    const worldScale = transform.lossyWorldScale;

    // 使用最大缩放作为球体半径的缩放
    const maxScale = Math.max(
      Math.abs(worldScale.x),
      Math.abs(worldScale.y),
      Math.abs(worldScale.z),
    );
    const worldRadius = this._sphereRadius * maxScale;

    // 计算世界空间的中心
    const centerX = worldPosition.x + this._sphereCenter.x * worldScale.x;
    const centerY = worldPosition.y + this._sphereCenter.y * worldScale.y;
    const centerZ = worldPosition.z + this._sphereCenter.z * worldScale.z;

    // 设置包围盒（球体的 AABB）
    this._worldBounds.min.set(centerX - worldRadius, centerY - worldRadius, centerZ - worldRadius);
    this._worldBounds.max.set(centerX + worldRadius, centerY + worldRadius, centerZ + worldRadius);
  }

  /**
   * 通知管理器碰撞体已更新
   */
  private _notifyManager(): void {
    if (this._manager) {
      this._manager.markDirty(this);
    }
  }

  /**
   * 查找并缓存 BVH 管理器
   */
  private _findManager(): BVHManager | null {
    // 优先使用全局实例
    let manager = BVHManager.getInstance();

    if (!manager) {
      // 向上查找父节点
      let current: Entity | null = this.entity;
      while (current) {
        manager = current.getComponent(BVHManager);
        if (manager) break;
        current = current.parent;
      }
    }

    return manager;
  }

  // ============ Script 生命周期 ============

  /**
   * 脚本启用时调用
   */
  override onEnable(): void {
    this._manager = this._findManager();

    if (this._manager) {
      this._manager.registerCollider(this);
    } else {
      console.warn('BVHCollider: 未找到 BVHManager，请确保场景中存在 BVHManager 组件');
    }
  }

  /**
   * 脚本禁用时调用
   */
  override onDisable(): void {
    if (this._manager) {
      this._manager.unregisterCollider(this);
    }
  }

  /**
   * 每帧更新
   */
  override onUpdate(deltaTime: number): void {
    // 检查变换是否变化
    const transform = this.entity.transform;
    const worldMatrix = transform.worldMatrix;

    if (!Matrix.equals(worldMatrix, this._lastWorldMatrix)) {
      this._boundsDirty = true;
      this._notifyManager();
    }
  }

  /**
   * 脚本销毁时调用
   */
  override onDestroy(): void {
    if (this._manager) {
      this._manager.unregisterCollider(this);
    }
    this._manager = null;
    this._meshRenderer = null;
  }
}
