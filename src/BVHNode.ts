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
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let node: BVHNode | null = this;
    while (node?.parent) {
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
   * 更新包围盒（迭代向上）
   * 从当前节点开始，向上遍历到根节点，更新每个内部节点的包围盒
   */
  updateBounds(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let current: BVHNode | null = this;

    // 安全限制：最大迭代次数（防止循环引用导致无限循环）
    // 正常情况下，树的深度不会超过 64 层
    const maxIterations = 64;
    let iterations = 0;

    // 用于检测循环引用
    const visited = new Set<BVHNode>();

    while (current && iterations < maxIterations) {
      // 检测循环引用
      if (visited.has(current)) {
        console.warn('BVH updateBounds: 检测到循环引用，停止更新');
        break;
      }
      visited.add(current);
      iterations++;

      if (!current.isLeaf) {
        // 内部节点：根据子节点更新包围盒
        if (current.left && current.right) {
          // 有两个子节点，合并包围盒
          current.bounds.min.x = Math.min(current.left.bounds.min.x, current.right.bounds.min.x);
          current.bounds.min.y = Math.min(current.left.bounds.min.y, current.right.bounds.min.y);
          current.bounds.min.z = Math.min(current.left.bounds.min.z, current.right.bounds.min.z);
          current.bounds.max.x = Math.max(current.left.bounds.max.x, current.right.bounds.max.x);
          current.bounds.max.y = Math.max(current.left.bounds.max.y, current.right.bounds.max.y);
          current.bounds.max.z = Math.max(current.left.bounds.max.z, current.right.bounds.max.z);
        } else if (current.left) {
          // 只有左子节点，复制其包围盒
          current.bounds.min.x = current.left.bounds.min.x;
          current.bounds.min.y = current.left.bounds.min.y;
          current.bounds.min.z = current.left.bounds.min.z;
          current.bounds.max.x = current.left.bounds.max.x;
          current.bounds.max.y = current.left.bounds.max.y;
          current.bounds.max.z = current.left.bounds.max.z;
        } else if (current.right) {
          // 只有右子节点，复制其包围盒
          current.bounds.min.x = current.right.bounds.min.x;
          current.bounds.min.y = current.right.bounds.min.y;
          current.bounds.min.z = current.right.bounds.min.z;
          current.bounds.max.x = current.right.bounds.max.x;
          current.bounds.max.y = current.right.bounds.max.y;
          current.bounds.max.z = current.right.bounds.max.z;
        }
        // 如果没有子节点，保持当前包围盒不变
      }

      // 向上移动到父节点
      current = current.parent;
    }

    if (iterations >= maxIterations) {
      console.warn('BVH updateBounds: 达到最大迭代次数，可能存在异常深度的树');
    }
  }

  /**
   * 转换为字符串表示
   */
  toString(): string {
    return `BVHNode(depth=${this.depth}, isLeaf=${this.isLeaf}, childCount=${this.childCount})`;
  }

  /**
   * 遍历节点（迭代方式）
   * 使用深度优先遍历访问所有节点
   */
  traverse(callback: (node: BVHNode) => void): void {
    const stack: BVHNode[] = [this];

    // 用于检测循环引用
    const visited = new Set<BVHNode>();

    // 安全限制：最大节点数（防止无限循环）
    const maxNodes = 1000000; // 100万个节点
    let nodeCount = 0;

    while (stack.length > 0 && nodeCount < maxNodes) {
      const node = stack.pop()!;

      // 检测循环引用
      if (visited.has(node)) {
        console.warn('BVH traverse: 检测到循环引用，跳过节点');
        continue;
      }
      visited.add(node);
      nodeCount++;

      callback(node);

      if (node.right) stack.push(node.right);
      if (node.left) stack.push(node.left);
    }

    if (nodeCount >= maxNodes) {
      console.warn('BVH traverse: 达到最大节点数限制，可能存在循环引用');
    }
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
