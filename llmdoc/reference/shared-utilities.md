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

### Usage Examples
```typescript
// Union bounds for BVH node creation
const combined = unionBounds(nodeA.bounds, nodeB.bounds);

// SAH cost calculation
const cost = boundsSurfaceArea(combined) * primitiveCount;

// Longest axis for splitting
const axis = getLongestAxis(combined);
// Use axis: 0->X, 1->Y, 2->Z for partition

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