import type { Entity, MeshRenderer, ModelMesh } from '@galacean/engine';
import { Script } from '@galacean/engine';
import { Matrix, Vector3 } from '@galacean/engine-math';
import type { MeshRaycastHit } from '../MeshBVH';
import { MeshBVH } from '../MeshBVH';
import { Ray } from '../Ray';
import { BVHBuildStrategy } from '../enums';

/**
 * MeshBVH 碰撞体配置
 */
export interface MeshBVHColliderOptions {
  /** 叶子节点最大三角形数 (默认: 10) */
  maxLeafTriangles?: number;
  /** 最大深度 (默认: 40) */
  maxDepth?: number;
  /** 构建策略 (默认: SAH) */
  buildStrategy?: BVHBuildStrategy;
  /** 是否剔除背面 (默认: false) */
  cullBackface?: boolean;
  /** 用户自定义数据 */
  userData?: any;
}

/**
 * 精确射线命中结果
 */
export interface PreciseRaycastHit {
  /** 命中的 Entity */
  entity: Entity;
  /** 命中距离 */
  distance: number;
  /** 命中点（世界坐标） */
  point: Vector3;
  /** 三角形索引 */
  triangleIndex: number;
  /** 重心坐标 */
  barycentricCoords?: { u: number; v: number; w: number };
  /** 原始 MeshBVH 命中结果 */
  meshHit: MeshRaycastHit;
}

/**
 * MeshBVH 碰撞体组件
 *
 * 提供三角形级别的精确射线检测。
 * 适用于需要精确碰撞检测的场景，如角色拾取、精确点击等。
 *
 * @example
 * ```typescript
 * // 添加 MeshBVH 碰撞体
 * const collider = entity.addComponent(MeshBVHCollider);
 *
 * // 配置选项
 * collider.configure({
 *   cullBackface: true,
 *   buildStrategy: BVHBuildStrategy.SAH,
 * });
 *
 * // 执行精确射线检测
 * const hit = collider.raycastFirst(ray, 100);
 * if (hit) {
 *   console.log('命中三角形:', hit.triangleIndex);
 *   console.log('命中点:', hit.point);
 * }
 * ```
 */
export class MeshBVHCollider extends Script {
  /** MeshBVH 实例 */
  private _meshBVH: MeshBVH | null = null;

  /** 关联的 MeshRenderer */
  private _meshRenderer: MeshRenderer | null = null;

  /** 配置选项 */
  private _options: Required<MeshBVHColliderOptions> = {
    maxLeafTriangles: 10,
    maxDepth: 40,
    buildStrategy: BVHBuildStrategy.SAH,
    cullBackface: false,
    userData: null,
  };

  /** 是否已构建 */
  private _built: boolean = false;

  /** 缓存的世界矩阵逆矩阵 */
  private _worldMatrixInverse: Matrix = new Matrix();

  /** 临时射线（用于变换） */
  private _tempRay: Ray = new Ray();

  /** 临时向量 */
  private _tempVec3: Vector3 = new Vector3();

  /**
   * 配置 MeshBVH 碰撞体
   * @param options - 配置选项
   */
  configure(options: MeshBVHColliderOptions): void {
    Object.assign(this._options, options);

    // 如果已构建，需要重建
    if (this._built) {
      this._built = false;
      this.build();
    }
  }

  /**
   * 设置是否剔除背面
   */
  set cullBackface(value: boolean) {
    this._options.cullBackface = value;
  }

  get cullBackface(): boolean {
    return this._options.cullBackface;
  }

  /**
   * 获取用户数据
   */
  get userData(): any {
    return this._options.userData;
  }

  set userData(value: any) {
    this._options.userData = value;
  }

  /**
   * 构建 MeshBVH
   * 通常在 onEnable 时自动调用，也可以手动调用以重建
   */
  build(): void {
    if (!this._meshRenderer) {
      this._meshRenderer = this.entity.getComponent(MeshRenderer);
    }

    if (!this._meshRenderer || !this._meshRenderer.mesh) {
      console.warn('MeshBVHCollider: 未找到 MeshRenderer 或 Mesh');
      return;
    }

    const mesh = this._meshRenderer.mesh as ModelMesh;

    // 获取顶点和索引数据
    const positions = mesh.getPositions();
    const indices = mesh.getIndices();

    if (!positions || positions.length === 0) {
      console.warn('MeshBVHCollider: Mesh 没有顶点数据');
      return;
    }

    // 将 Vector3 数组转换为 Float32Array
    const positionArray = new Float32Array(positions.length * 3);
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      positionArray[i * 3] = pos.x;
      positionArray[i * 3 + 1] = pos.y;
      positionArray[i * 3 + 2] = pos.z;
    }

    // 创建 MeshBVH
    this._meshBVH = new MeshBVH(
      this._options.maxLeafTriangles,
      this._options.maxDepth,
      this._options.buildStrategy,
    );

    // 构建 BVH
    if (indices && indices.length > 0) {
      this._meshBVH.buildFromGeometry(positionArray, indices, this._options.userData);
    } else {
      this._meshBVH.buildFromGeometry(positionArray, undefined, this._options.userData);
    }

    this._built = true;
  }

  /**
   * 执行射线检测（世界空间）
   * @param ray - 世界空间射线
   * @param maxDistance - 最大距离
   * @returns 所有命中结果（按距离排序）
   */
  raycast(ray: Ray, maxDistance: number = Infinity): PreciseRaycastHit[] {
    if (!this._meshBVH || !this._built) {
      return [];
    }

    // 将射线从世界空间变换到局部空间
    const localRay = this._transformRayToLocal(ray);

    // 执行射线检测
    const hits = this._meshBVH.raycast(localRay, maxDistance, this._options.cullBackface);

    // 转换结果到世界空间
    return hits.map((hit) => this._transformHitToWorld(hit));
  }

  /**
   * 执行射线检测，只返回最近的命中
   * @param ray - 世界空间射线
   * @param maxDistance - 最大距离
   * @returns 最近的命中结果，如果没有命中返回 null
   */
  raycastFirst(ray: Ray, maxDistance: number = Infinity): PreciseRaycastHit | null {
    if (!this._meshBVH || !this._built) {
      return null;
    }

    // 将射线从世界空间变换到局部空间
    const localRay = this._transformRayToLocal(ray);

    // 执行射线检测
    const hit = this._meshBVH.raycastFirst(localRay, maxDistance, this._options.cullBackface);

    if (!hit) {
      return null;
    }

    // 转换结果到世界空间
    return this._transformHitToWorld(hit);
  }

  /**
   * 获取 MeshBVH 统计信息
   */
  getStats() {
    return this._meshBVH?.getStats() ?? null;
  }

  /**
   * 获取三角形数量
   */
  get triangleCount(): number {
    return this._meshBVH?.triangleCount ?? 0;
  }

  /**
   * 是否已构建
   */
  get isBuilt(): boolean {
    return this._built;
  }

  // ============ 私有方法 ============

  /**
   * 将射线从世界空间变换到局部空间
   */
  private _transformRayToLocal(worldRay: Ray): Ray {
    const transform = this.entity.transform;
    const worldMatrix = transform.worldMatrix;

    // 计算世界矩阵的逆矩阵
    Matrix.invert(worldMatrix, this._worldMatrixInverse);

    // 变换射线原点
    Vector3.transformCoordinate(worldRay.origin, this._worldMatrixInverse, this._tempRay.origin);

    // 变换射线方向（使用法线变换，即逆转置矩阵的上 3x3 部分）
    // 对于方向向量，我们使用 transformNormal
    Vector3.transformNormal(worldRay.direction, this._worldMatrixInverse, this._tempRay.direction);
    this._tempRay.direction.normalize();

    return this._tempRay;
  }

  /**
   * 将命中结果从局部空间变换到世界空间
   */
  private _transformHitToWorld(localHit: MeshRaycastHit): PreciseRaycastHit {
    const transform = this.entity.transform;
    const worldMatrix = transform.worldMatrix;

    // 变换命中点到世界空间
    const worldPoint = new Vector3();
    Vector3.transformCoordinate(localHit.point, worldMatrix, worldPoint);

    // 计算世界空间距离
    // 注意：由于缩放的存在，局部空间距离和世界空间距离可能不同
    const worldDistance = Vector3.distance(transform.worldPosition, worldPoint);

    return {
      entity: this.entity,
      distance: localHit.distance, // 保持局部空间距离，因为这是射线检测的原始结果
      point: worldPoint,
      triangleIndex: localHit.triangleIndex,
      barycentricCoords: localHit.barycentricCoords,
      meshHit: localHit,
    };
  }

  // ============ Script 生命周期 ============

  /**
   * 脚本启用时调用
   */
  override onEnable(): void {
    if (!this._built) {
      this.build();
    }
  }

  /**
   * 脚本销毁时调用
   */
  override onDestroy(): void {
    this._meshBVH = null;
    this._meshRenderer = null;
    this._built = false;
  }
}
