---
id: shared-utilities
type: reference
related_ids: [bvh-architecture, raycast-strategy]
---

# Shared Utilities Reference

Mathematical and performance utilities for BVH operations and spatial queries.

## Types

### BoundingBox interface from `@galacean/engine-math`
```typescript
interface BoundingBox {
  min: Vector3;
  max: Vector3;
}
```

### Vector3 interface from `@galacean/engine-math`
```typescript
interface Vector3 {
  x: number;
  y: number;
  z: number;
}
```

## 1. Math Utilities (src/utils.ts)

### Type Definitions
```typescript
// Utility Functions
function unionBounds(a: BoundingBox, b: BoundingBox): BoundingBox;
function boundsVolume(bounds: BoundingBox): number;
function boundsSurfaceArea(bounds: BoundingBox): number;
function boundsIntersects(a: BoundingBox, b: BoundingBox): boolean;
function getLongestAxis(bounds: BoundingBox): number; // 0:X, 1:Y, 2:Z
function toAABB(bounds: BoundingBox): AABB;
function toBoundingSphere(bounds: BoundingBox): BoundingSphere;

// Performance
class PerformanceTimer {
  start(): void;
  stop(): number;
  reset(): void;
  getTotal(): number;
}
```

### Optimized Direct Calculations (No Temp Objects)
```typescript
// OLD: Creates temporary AABB objects
function calculateBoundsGrowth(oldBounds, newBounds): number {
  const union = oldBounds.union(newBounds); // Creates temp AABB
  return union.volume() - oldBounds.volume();
}

// NEW: Direct calculation (used in BVHTree.ts)
function calculateBoundsGrowth(oldBounds, newBounds): number {
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

// Direct bounds update (used in BVHNode.ts)
function updateNodeBounds(node: BVHNode): void {
  if (!node.left || !node.right) return;

  // Direct calculation without temp objects
  const minX = Math.min(node.left.bounds.min.x, node.right.bounds.min.x);
  const minY = Math.min(node.left.bounds.min.y, node.right.bounds.min.y);
  const minZ = Math.min(node.left.bounds.min.z, node.right.bounds.min.z);
  const maxX = Math.max(node.left.bounds.max.x, node.right.bounds.max.x);
  const maxY = Math.max(node.left.bounds.max.y, node.right.bounds.max.y);
  const maxZ = Math.max(node.left.bounds.max.z, node.right.bounds.max.z);

  node.bounds.min.set(minX, minY, minZ);
  node.bounds.max.set(maxX, maxY, maxZ);
}
```

### Usage Examples
```typescript
// Union bounds for BVH node creation
const combined = unionBounds(nodeA.bounds, nodeB.bounds);

// SAH cost calculation
const cost = boundsSurfaceArea(combined) * primitiveCount;

// Longest axis for splitting
const axis = getLongestAxis(combined);
// Use axis: 0->X, 1->Y, 2:Z for partition

// Performance measurement
const timer = new PerformanceTimer();
timer.start();
// ... BVH construction ...
const buildTime = timer.stop();
```

## 2. Geometry Types

### AABB Class
```typescript
class AABB {
  min: Vector3;
  max: Vector3;

  // Construction
  static fromBoundingBox(box: BoundingBox): AABB;
  static fromCenterSize(center: Vector3, size: Vector3): AABB;

  // Intersection Tests
  intersect(other: BoundingVolume): boolean;
  intersectAABB(other: AABB): boolean;
  intersectRay(ray: Ray): boolean;
  intersectRayDistance(ray: Ray): number | null;

  // Containment
  contains(point: Vector3): boolean;

  // Queries
  getBounds(): BoundingBox;
  getCenter(): Vector3;

  // Modifications
  expand(delta: number): void;
  union(other: AABB): AABB;

  // Metrics
  volume(): number;
  surfaceArea(): number;
}
```

### BoundingSphere Class
```typescript
class BoundingSphere {
  center: Vector3;
  radius: number;

  // Construction
  static fromCenterRadius(center: Vector3, radius: number): BoundingSphere;

  // Intersection Tests
  intersect(other: BoundingVolume): boolean;
  intersectSphere(other: BoundingSphere): boolean;
  intersectAABB(aabb: AABB): boolean;
  intersectRay(ray: Ray): boolean;
  intersectRayDistance(ray: Ray): number | null;

  // Containment
  contains(point: Vector3): boolean;
  containsSphere(other: BoundingSphere): boolean;

  // Queries
  getBounds(): BoundingBox;
  getCenter(): Vector3;

  // Modifications
  merge(other: BoundingSphere): BoundingSphere;

  // Metrics
  volume(): number;
  surfaceArea(): number;
}
```

### Ray Class
```typescript
class Ray {
  origin: Vector3;
  direction: Vector3; // Normalized

  // Construction
  static fromPoints(start: Vector3, end: Vector3): Ray;
  static fromOriginDirection(origin: Vector3, direction: Vector3): Ray;

  // Queries
  getPoint(distance: number): Vector3;

  // Intersection Tests
  intersectBox(box: BoundingBox): number | null;
  intersectSphere(sphere: BoundingSphere): number | null;
  intersectPlane(plane: Plane): number | null;
}
```

### Usage Examples
```typescript
// AABB creation from mesh bounds
const meshBounds = mesh.boundingBox;
const aabb = AABB.fromBoundingBox(meshBounds);

// Fast sphere-AABB test
if (sphere.intersectAABB(aabb)) {
  // Collision detected
}

// Ray cast for mouse picking
const ray = Ray.fromPoints(cameraPos, mouseWorldPos);
const distance = ray.intersectBox(objectBounds);
if (distance !== null) {
  // Object hit at distance
}

// Sphere merge for hierarchical bounds
const combinedSphere = sphereA.merge(sphereB);
```

## 3. Performance Utilities

### PerformanceTimer Usage
```typescript
// BVH construction timing
const timer = new PerformanceTimer();
timer.start();

// Build BVH
const bvh = new BVH();
bvh.build(scenePrimitives);

const buildTime = timer.stop(); // Returns ms for this operation

// Accumulate multiple operations
timer.reset();
timer.start();
bvh.refit();
timer.start();
bvh.update(node);

const totalUpdate = timer.getTotal(); // Returns cumulative time
```

### Performance Patterns
```typescript
// Measure specific algorithms
function measureSAHvsSurfaceArea(primitives: Primitive[]) {
  const timer = new PerformanceTimer();

  timer.start();
  const bvhSAH = buildBVH(primitives, SplitStrategy.SAH);
  const sahTime = timer.stop();

  timer.start();
  const bvhMid = buildBVH(primitives, SplitStrategy.MIDPOINT);
  const midpointTime = timer.stop();

  return { bvhSAH, bvhMid, sahTime, midpointTime };
}
```

## 4. BoundingVolume Base Class
```typescript
abstract class BoundingVolume {
  abstract intersect(other: BoundingVolume): boolean;
  abstract intersectRay(ray: Ray): boolean;
  abstract contains(point: Vector3): boolean;
  abstract getBounds(): BoundingBox;
  abstract getCenter(): Vector3;
  abstract volume(): number;
  abstract surfaceArea(): number;
}
```

## What NOT to Do

### ❌ Don't Reinvent
- **Do not reimplement** AABB intersection logic - use existing methods
- **Do not create custom** ray-AABB tests - use `Ray.intersectBox()` or `AABB.intersectRay()`
- **Do not construct** bounding volumes manually when `fromBoundingBox()` exists
- **Do not recalculate** bounds for static objects - cache the results

### ❌ Performance Anti-Patterns
- **Do not call** `volume()` or `surfaceArea()` in hot loops without caching
- **Do not create** new Vector3 instances in tight loops - reuse objects
- **Do not ignore** the longest axis result - it's critical for BVH split efficiency
- **Do not skip** early-out tests using bounds intersections
- **Do not create** temporary AABB objects in performance-critical paths
- **Do not use** recursive algorithms when iterative/stack-based is available
- **Do not ignore** SAH constants (TRIANGLE_INTERSECT_COST=1.25, TRAVERSAL_COST=1.0)

### ❌ Type Safety
- **Do not use** nonsensical bounds (min > max) - always construct properly
- **Do not pass** unnormalized directions to Ray constructor
- **Do not mix** coordinate systems - ensure consistent Vector3 usage
- **Do not mutate** the input bounds parameters in utility functions

### ❌ BVH Context
- **Do not use** surface area when volume is needed for cost metrics
- **Do not ignore** the return value of `getLongestAxis()` - it dictates split strategy
- **Do not create** union bounds without checking input validity
- **Do not use** PerformanceTimer without reset between distinct operations

## Integration with BVH

These utilities serve as the mathematical foundation:

```
BVH Build Pipeline:
  Primitive Bounds → unionBounds() → Combined AABB
                    → getLongestAxis() → Split Axis
                    → boundsSurfaceArea() → SAH Cost
                    → boundsIntersects() → Early Rejection

Raycast Query:
  Ray → intersectBox(bvhNode.bounds) → Recurse
            → intersectBox(leaf.bounds) → Exact Test
            → intersectSphere() → Fallback

Update Operations:
  Dirty Node → refit() → toAABB() → union() → Propagate
```