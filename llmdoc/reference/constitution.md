---
id: constitution
type: reference
related_ids: [doc-standard, bvh-architecture]
---

# BVH Constitution - Rules of Engagement

> **Domain Authority:** Right-handed, Y-up 3D space with strict precision handling for galacean-engine-math compatibility.

## Type Definitions

### Coordinate Systems & Primitives
```typescript
// RIGHT-HANDED Y-UP SYSTEM (Inherited from @galacean/engine-math)
interface CoordinateSystem {
  axis: 'X' | 'Y' | 'Z';
  rightHanded: true;
  upVector: Vector3(0, 1, 0);
  epsilon: 1e-10;  // Precision threshold
}

// Core Types
interface BVHNode {
  bounds: BoundingBox;
  isLeaf: boolean;
  depth: number;
  left: BVHNode | null;
  right: BVHNode | null;
  parent: BVHNode | null;
  userData: any;
  objectId: number;
}

interface BoundingBox {
  min: Vector3;
  max: Vector3;
}

// Build Configuration
interface BVHConfig {
  maxLeafSize: 8;      // Default: 8 objects per leaf
  maxDepth: 32;        // Default: 32 levels max
  enableSAH: true;     // Default: Use Surface Area Heuristic
}
```

### Strategy Enum
```typescript
enum BVHBuildStrategy {
  SAH = 0,      // Surface Area Heuristic - static scenes
  Median = 1,   // Midpoint split - dynamic scenes
  Equal = 2,    // Equal distribution - uniform data
}
```

## Core Algorithms (Pseudocode)

### BVH Construction Flow
```
BUILD_BVH(objects, strategy):
  1. IF empty -> return empty tree

  2. IF objects.length <= maxLeafSize:
     RETURN direct_insertion(objects)

  3. SWITCH strategy:
     - SAH:    buildSAH()
     - Median: buildMedian()
     - Equal:  buildEqual()

  4. RETURN optimized_tree
```

### SAH Build (Optimal Static)
```
BUILD_SAH(objects):
  1. CALCULATE unionAABB of all objects
  2. SELECT longest axis (X/Y/Z)
  3. FIND best split position via cost function
  4. PARTITION objects by split plane
  5. IF partition invalid -> fallback to Median
  6. RECURSE left_objects, right_objects
```

### Median Build (Dynamic)
```
BUILD_MEDIAN(objects):
  1. CALCULATE unionAABB
  2. SELECT longest axis
  3. SORT objects by center on split axis
  4. SPLIT at middle index
  5. RECURSE left/right halves
```

### Insertion (Runtime Updates)
```
INSERT(bounds, userData):
  1. IF tree empty -> create root leaf
  2. FIND best leaf (min growth)
  3. IF leaf full AND depth < maxDepth:
     SPLIT leaf -> internal node
  4. ELSE:
     ADD to leaf or continue recursion
  5. UPDATE parent bounds (refit)
  6. RETURN objectId
```

## Query Operations

### Raycast (Optimized Traversal)
```
RAYCAST(ray, maxDistance):
  1. INIT results = []
  2. RECURSIVE_TRAVERSE(root, ray):
     - IF leaf: test intersection -> add to results
     - IF internal: early exit if ray misses bounds
     - VISIT left, then right (depth-first)
  3. SORT results by distance
  4. RETURN results
```

### Range Query (Sphere/AABB)
```
QUERY_RANGE(center, radius):
  1. CREATE queryAABB from center/radius
  2. RECURSIVE_TRAVERSE(root, queryAABB):
     - IF leaf: check if intersects -> collect userData
     - IF internal: early exit if no overlap
  3. RETURN collected_data
```

### Insertion Sort
```
INSERT_SORT_UP(node):
  WHILE node.parent:
    IF growth(parent.left) > growth(parent.right):
       SWAP children
    UPDATE parent bounds
    node = parent
```

## Error Handling & Validation

### Null Safety Rules
```typescript
// ALWAYS validate before dereference
function validateNode(node: BVHNode): boolean {
  if (!node) return false;
  if (node.isLeaf && node.objectId < 0) return false;
  if (!node.isLeaf && !node.left) return false;
  return true;
}

// Bounds validation
function validateBounds(bounds: BoundingBox): boolean {
  return bounds.min.x <= bounds.max.x &&
         bounds.min.y <= bounds.max.y &&
         bounds.min.z <= bounds.max.z;
}
```

### Precision & Epsilon
```typescript
// Critical: Use epsilon for floating point comparisons
const EPSILON = 1e-10;

function equalsEpsilon(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

function boundsEqual(a: BoundingBox, b: BoundingBox): boolean {
  return vectorEqualsEpsilon(a.min, b.min) &&
         vectorEqualsEpsilon(a.max, b.max);
}
```

## Constraints

### Positive Rules (DO)
- ✅ **DO** use right-handed Y-up coordinate system
- ✅ **DO** return new objects (immutability)
- ✅ **DO** check for null/undefined before dereference
- ✅ **DO** use epsilon comparisons for floating point
- ✅ **DO** use single quotes for strings
- ✅ **DO** use semicolons
- ✅ **DO** use 2-space indentation
- ✅ **DO** use ES modules with barrel exports
- ✅ **DO** validate bounds before operations
- ✅ **DO** use SAH for static scenes
- ✅ **DO** use Median for dynamic scenes

### Negative Rules (DO NOT)
- ❌ **DO NOT** mutate input parameters
- ❌ **DO NOT** use `any` in public APIs
- ❌ **DO NOT** ignore floating-point precision
- ❌ **DO NOT** skip null checks in recursive functions
- ❌ **DO NOT** use left-handed coordinates
- ❌ **DO NOT** assume bounds are valid
- ❌ **DO NOT** use tabs for indentation
- ❌ **DO NOT** double quotes unless template literals needed
- ❌ **DO NOT** skip epsilon in comparisons
- ❌ **DO NOT** rebuild tree for small updates (use refit)
- ❌ **DO NOT** exceed maxDepth recursion
- ❌ **DO NOT** ignore empty partitions in SAH

### Build Constraints
- **Target**: ES5 (for browser compatibility)
- **Compiler**: SWC (not Babel/TSC)
- **External**: @galacean/engine-math (Vector3, BoundingBox only)
- **Memory**: ~64 bytes per node (estimated)
- **Depth**: Max 32 levels (prevents stack overflow)
- **Leaf Size**: Max 8 objects (tunable for performance)

## Memory & Performance

### Reference Benchmarks
```
Build: O(n log n) average
Raycast: O(log n) typical, O(n) worst
Range Query: O(log n) typical
Insert/Update: O(log n) typical
Memory: 64 bytes/node + BoundingBox
```

### Optimization Triggers
```
STATIC_SCENE: BVHBuildStrategy.SAH
DYNAMIC_SCENE: BVHBuildStrategy.Median
UNIFORM_DATA: BVHBuildStrategy.Equal
REAL_TIME: Insert + Refit (no rebuild)
```

## Version Compliance
Current: [v1.6.11](/Users/mac/Desktop/project/Sruimeng/galacean-engine-bvh/src/index.ts:54)

This constitution defines the inviolable rules for all BVH operations in the galacean-engine-bvh system.