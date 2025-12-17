import { BoundingBox } from '@galacean/engine-math';

/**
 * BVH 树节点
 *
 * 表示 BVH 树中的一个节点，包含包围盒和子节点引用
 */
export class BVHNode {
  /** 节点包围盒 */
  public bounds: BoundingBox;
  /** 是否为叶子节点 */
  public isLeaf: boolean;
  /** 节点深度 */
  public depth: number;
  /** 左子节点 */
  public left: BVHNode | null;
  /** 右子节点 */
  public right: BVHNode | null;
  /** 父节点 */
  public parent: BVHNode | null;
  /** 用户数据（仅叶子节点有效） */
  public userData: any;
  /** 对象ID（仅叶子节点有效） */
  public objectId: number;

  /**
   * 创建 BVH 节点
   */
  constructor(bounds?: BoundingBox, isLeaf: boolean = false, depth: number = 0) {
    this.bounds = bounds || new BoundingBox();
    this.isLeaf = isLeaf;
    this.depth = depth;
    this.left = null;
    this.right = null;
    this.parent = null;
    this.userData = null;
    this.objectId = -1;
  }

  /**
   * 获取子节点数量
   */
  get childCount(): number {
    let count = 0;
    if (this.left) count++;
    if (this.right) count++;
    return count;
  }

  /**
   * 获取节点深度
   */
  getDepth(): number {
    let depth = 0;
    let node: BVHNode = this;
    while (node.parent) {
      depth++;
      node = node.parent;
    }
    return depth;
  }

  /**
   * 重置为非叶子节点（用于拆分）
   */
  resetAsInternal(): void {
    this.isLeaf = false;
    this.userData = null;
    this.objectId = -1;
  }

  /**
   * 创建叶子节点
   */
  static createLeaf(
    bounds: BoundingBox,
    userData: any,
    objectId: number,
    depth: number = 0,
  ): BVHNode {
    const node = new BVHNode(bounds, true, depth);
    node.userData = userData;
    node.objectId = objectId;
    return node;
  }

  /**
   * 创建内部节点
   */
  static createInternal(
    bounds: BoundingBox,
    left: BVHNode | null = null,
    right: BVHNode | null = null,
    depth: number = 0,
  ): BVHNode {
    const node = new BVHNode(bounds, false, depth);
    node.left = left;
    node.right = right;

    if (left) left.parent = node;
    if (right) right.parent = node;

    return node;
  }

  /**
   * 更新包围盒（递归向上）
   */
  updateBounds(): void {
    if (!this.isLeaf && this.left && this.right) {
      // 直接计算合并后的包围盒，避免创建临时 AABB 对象
      const minX = Math.min(this.left.bounds.min.x, this.right.bounds.min.x);
      const minY = Math.min(this.left.bounds.min.y, this.right.bounds.min.y);
      const minZ = Math.min(this.left.bounds.min.z, this.right.bounds.min.z);
      const maxX = Math.max(this.left.bounds.max.x, this.right.bounds.max.x);
      const maxY = Math.max(this.left.bounds.max.y, this.right.bounds.max.y);
      const maxZ = Math.max(this.left.bounds.max.z, this.right.bounds.max.z);

      this.bounds.min.x = minX;
      this.bounds.min.y = minY;
      this.bounds.min.z = minZ;
      this.bounds.max.x = maxX;
      this.bounds.max.y = maxY;
      this.bounds.max.z = maxZ;
    }

    // 向上更新父节点
    if (this.parent) {
      this.parent.updateBounds();
    }
  }

  /**
   * 转换为字符串表示
   */
  toString(): string {
    return `BVHNode(depth=${this.depth}, isLeaf=${this.isLeaf}, childCount=${this.childCount})`;
  }

  /**
   * 递归遍历节点
   */
  traverse(callback: (node: BVHNode) => void): void {
    callback(this);
    if (this.left) this.left.traverse(callback);
    if (this.right) this.right.traverse(callback);
  }

  /**
   * 计算节点的内存使用
   */
  estimateMemory(): number {
    let size = 0;
    this.traverse(() => {
      size += 64; // 估算每个节点占用字节
    });
    return size;
  }
}
