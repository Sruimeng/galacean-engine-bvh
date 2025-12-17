---
id: data-models
type: reference
related_ids: []
---

# Data Models Reference

## Interfaces

```typescript
interface BVHStats {
  nodeCount: number;        // 节点总数
  leafCount: number;        // 叶子节点数
  maxDepth: number;         // 树的最大深度
  balanceFactor: number;    // 平衡因子 (越接近 1 越平衡)
  objectCount: number;      // 对象总数
  memoryUsage: number;      // 内存使用估算 (字节)
}

interface BVHInsertObject {
  bounds: BoundingBox;      // 对象的包围盒
  userData?: any;           // 用户数据
}

interface CollisionResult {
  object: any;              // 碰撞的对象（userData）
  distance: number;         // 碰撞距离
  point?: {                 // 碰撞点位置
    x: number;
    y: number;
    z: number;
  };
  normal?: {                // 碰撞法线
    x: number;
    y: number;
    z: number;
  };
  node: BVHNode;            // 碰撞的节点
}

interface SpatialQueryResult {
  userData: any;            // 用户数据
  bounds: BoundingBox;      // 包围盒
}
```

## Enums

```typescript
enum BVHBuildStrategy {
  SAH = 0,      // 表面积启发式 - 最优查询性能，构建较慢（推荐用于静态场景）
  Median = 1,   // 中位数分割 - 构建快速，性能均衡（推荐用于动态场景）
  Equal = 2,    // 均等分割 - 构建较快，适用于均匀分布
}

enum BoundingVolumeType {
  AABB = 0,              // 轴对齐包围盒
  BoundingSphere = 1,    // 包围球
}
```

## Classes

### BVHNode

```typescript
class BVHNode {
  // Properties
  bounds: BoundingBox;      // 节点包围盒
  isLeaf: boolean;          // 是否为叶子节点
  depth: number;            // 节点深度
  left: BVHNode | null;     // 左子节点
  right: BVHNode | null;    // 右子节点
  parent: BVHNode | null;   // 父节点
  userData: any;            // 用户数据（仅叶子节点有效）
  objectId: number;         // 对象ID（仅叶子节点有效）

  // Constructor
  constructor(bounds?: BoundingBox, isLeaf?: boolean, depth?: number)

  // Getters
  get childCount(): number   // 获取子节点数量

  // Methods
  isLeafNode(): boolean        // 是叶子节点的别名（兼容性）
  getDepth(): number           // 获取节点深度
  resetAsInternal(): void      // 重置为非叶子节点（用于拆分）
  updateBounds(): void         // 更新包围盒（递归向上）
  toString(): string           // 转换为字符串表示
  traverse(callback: (node: BVHNode) => void): void  // 递归遍历节点
  estimateMemory(): number     // 计算节点的内存使用

  // Static Factories
  static createLeaf(bounds, userData, objectId, depth): BVHNode
  static createInternal(bounds, left, right, depth): BVHNode
}
```

### BVHTree

```typescript
class BVHTree {
  // Properties
  root: BVHNode | null;        // 根节点
  maxLeafSize: number;         // 叶子节点最大对象数 (默认: 8)
  maxDepth: number;            // 树的最大深度 (默认: 32)
  enableSAH: boolean;          // 是否启用 SAH 优化 (默认: true)
  count: number;               // 树中对象数量 (getter)

  // Constructor
  constructor(maxLeafSize?: number, maxDepth?: number, enableSAH?: boolean)

  // CRUD Operations
  insert(bounds: BoundingBox, userData?: any): number
  update(objectId: number, newBounds: BoundingBox): boolean
  remove(objectId: number): boolean
  clear(): void

  // Query Operations
  raycast(ray: Ray, maxDistance?: number): CollisionResult[]
  queryRange(center: Vector3, radius: number): any[]
  findNearest(position: Vector3, maxDistance?: number): any
  intersectBounds(bounds: BoundingBox): any[]

  // Optimization & Maintenance
  refit(): void                                    // 高效更新包围盒
  rebuild(strategy?: BVHBuildStrategy): void       // 重建整个树
  getStats(): BVHStats                             // 获取统计信息
  validate(): boolean                              // 验证树的状态
}
```

### AABB

```typescript
class AABB extends BoundingVolume {
  // Properties
  min: Vector3;   // 最小角点
  max: Vector3;   // 最大角点

  // Constructor
  constructor(min?: Vector3, max?: Vector3)

  // Intersection Tests
  intersect(other: BoundingVolume): boolean
  intersectAABB(other: AABB): boolean
  intersectRay(ray: Ray): boolean
  intersectRayDistance(ray: Ray): number | null

  // Geometric Queries
  contains(point: Vector3): boolean
  getBounds(): BoundingBox
  getCenter(): Vector3
  expand(delta: number): void
  union(other: AABB): AABB
  volume(): number
  surfaceArea(): number

  // Static Factories
  static fromBoundingBox(box: BoundingBox): AABB
  static fromCenterSize(center: Vector3, size: Vector3): AABB
}
```

### BoundingSphere

```typescript
class BoundingSphere extends BoundingVolume {
  // Properties
  center: Vector3;  // 球心
  radius: number;   // 半径

  // Constructor
  constructor(center?: Vector3, radius?: number)

  // Intersection Tests
  intersect(other: BoundingVolume): boolean
  intersectSphere(other: BoundingSphere): boolean
  intersectAABB(aabb: AABB): boolean
  intersectRay(ray: Ray): boolean
  intersectRayDistance(ray: Ray): number | null

  // Geometric Queries
  contains(point: Vector3): boolean
  getBounds(): BoundingBox
  getCenter(): Vector3
  merge(other: BoundingSphere): BoundingSphere
  containsSphere(other: BoundingSphere): boolean
  volume(): number
  surfaceArea(): number

  // Static Factories
  static fromCenterRadius(center: Vector3, radius: number): BoundingSphere
}
```

### Ray

```typescript
class Ray {
  // Properties
  origin: Vector3;      // 射线起点
  direction: Vector3;   // 射线方向 (必须归一化)

  // Constructor
  constructor(origin?: Vector3, direction?: Vector3)

  // Methods
  getPoint(distance: number): Vector3

  // Intersection Tests
  intersectBox(box: BoundingBox): number | null
  intersectSphere(sphere: BoundingSphere): number | null
  intersectPlane(plane: Plane): number | null

  // Static Factories
  static fromPoints(start: Vector3, end: Vector3): Ray
  static fromOriginDirection(origin: Vector3, direction: Vector3): Ray
}
```

### CollisionResult

```typescript
class CollisionResult {
  // Properties
  object: any;          // 碰撞的对象（userData）
  distance: number;     // 碰撞距离
  point: Vector3;       // 碰撞点位置
  normal: Vector3;      // 碰撞法线
  node: BVHNode;        // 碰撞的节点

  // Constructor
  constructor(object?, distance?, point?, normal?, node?)

  // Methods
  clone(): CollisionResult
  toString(): string

  // Static Methods
  static compareByDistance(a: CollisionResult, b: CollisionResult): number
}
```

### BoundingVolume (Abstract Base)

```typescript
abstract class BoundingVolume {
  // Abstract Methods
  abstract intersect(other: BoundingVolume): boolean
  abstract intersectRay(ray: Ray): boolean
  abstract contains(point: Vector3): boolean
  abstract getBounds(): BoundingBox
  abstract getCenter(): Vector3
  abstract volume(): number
  abstract surfaceArea(): number
}
```

## Pseudocode: Key Algorithms

### BVHNode Traversal

```
TRAVERSE_NODE(node, callback):
  1. CALL callback(node)

  2. IF node.left IS NOT NULL:
     TRAVERSE_NODE(node.left, callback)

  3. IF node.right IS NOT NULL:
     TRAVERSE_NODE(node.right, callback)
```

### CollisionResult Sorting

```
SORT_COLLISIONS(results):
  1. RETURN results.sort(COMPARE_BY_DISTANCE)

COMPARE_BY_DISTANCE(a, b):
  1. RETURN a.distance - b.distance
```

### BVH Tree Construction (SAH Strategy)

```
BUILD_SAH(objects, unionAABB):
  1. IF objects.length <= maxLeafSize:
     FOR EACH obj IN objects:
       tree.insert(obj.bounds, obj.userData)
     RETURN

  2. splitAxis = SELECT_LONGEST_AXIS(unionAABB)
  3. splitPos = FIND_BEST_SPLIT_SAH(objects, splitAxis, unionAABB)

  4. leftObjects = []
     rightObjects = []

  5. FOR EACH obj IN objects:
     center = GET_CENTER(obj.bounds)
     IF center[splitAxis] < splitPos:
       leftObjects.push(obj)
     ELSE:
       rightObjects.push(obj)

  6. IF leftObjects.length > 0:
     IF leftObjects.length <= maxLeafSize:
       FOR EACH obj IN leftObjects:
         tree.insert(obj.bounds, obj.userData)
     ELSE:
       BUILD_SAH(leftObjects, ...)

  7. IF rightObjects.length > 0:
     IF rightObjects.length <= maxLeafSize:
       FOR EACH obj IN rightObjects:
         tree.insert(obj.bounds, obj.userData)
     ELSE:
       BUILD_SAH(rightObjects, ...)
```

### Raycast Query

```
RAYCAST(node, ray, results, maxDistance):
  1. IF node.isLeaf:
     IF node.objectId < 0: RETURN

     distance = AABB.intersectRayDistance(ray)

     IF distance != null AND (maxDistance == null OR distance <= maxDistance):
       point = ray.getPoint(distance)
       normal = CALCULATE_NORMAL(node.bounds, point)
       results.push(new CollisionResult(node.userData, distance, point, normal, node))

     RETURN

  2. // Frustum culling - skip if no intersection
  3. IF !AABB.intersectRay(ray): RETURN

  4. // Recurse on children
  5. IF node.left: RAYCAST(node.left, ray, results, maxDistance)
  6. IF node.right: RAYCAST(node.right, ray, results, maxDistance)
```

## Negative Constraints

- **DO NOT** store unnormalized vectors in Ray.direction (always normalize in constructor)
- **DO NOT** mutate input parameters (BoundingBox, Vector3) in bounding volume operations
- **DO NOT** rely on floating-point equality comparisons (use epsilon for precision)
- **DO NOT** create BVHNode instances directly without using static factory methods
- **DO NOT** modify BVHNode.bounds without calling updateBounds() on parent nodes
- **DO NOT** perform raycasts without checking for null/undefined bounds first
- **DO NOT** ignore edge cases where child nodes are null in tree operations
- **DO NOT** use BVHTree after calling clear() without reinitializing root