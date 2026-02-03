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
     - SAH:    buildSAHIterative()
     - Median: buildMedianIterative()
     - Equal:  buildEqualIterative()

  4. RETURN optimized_tree
```

### SAH Build (Iterative, Optimized)
```
BUILD_SAH_ITERATIVE(objects):
  1. INIT workStack = [{ objects }]
  2. WHILE workStack.length > 0:
     work = workStack.pop()
     current = work.objects

     3. IF current.length <= maxLeafSize:
        FOR EACH obj: tree.insert(obj.bounds, obj.userData)
        CONTINUE

     4. CALCULATE unionAABB
     5. FIND best split (32-bin, all 3 axes)
     6. CALCULATE leafCost = TRIANGLE_INTERSECT_COST * count

     7. IF cost >= leafCost AND count <= maxLeafSize * 2:
        direct insert all, CONTINUE

     8. PARTITION objects -> left[], right[]
     9. IF invalid: median split fallback

     10. PUSH right then left to workStack
```

### Median Build (Iterative)
```
BUILD_MEDIAN_ITERATIVE(objects):
  1. INIT workStack = [{ objects }]
  2. WHILE workStack.length > 0:
     work = workStack.pop()
     current = work.objects

     3. IF current.length <= maxLeafSize:
        direct insert all, CONTINUE

     4. CALCULATE unionAABB
     5. SELECT longest axis
     6. SORT objects by center on axis
     7. SPLIT at middle index
     8. PUSH right then left to workStack
```

### Insertion (Runtime Updates, Iterative)
```
INSERT(bounds, userData):
  1. IF tree empty -> create root leaf
  2. FIND best leaf (min growth, iterative)
  3. IF leaf full AND depth < maxDepth:
     SPLIT leaf -> internal node
  4. ELSE:
     ADD to leaf or continue iterative search
  5. UPDATE parent bounds (iterative refit)
  6. RETURN objectId
```

## Query Operations

### Raycast (Iterative, Stack-Safe)
```
RAYCAST(ray, maxDistance):
  1. INIT results = []
  2. INIT stack = [root]
  3. WHILE stack.length > 0:
     node = stack.pop()

     IF node.isLeaf:
        IF intersection valid: add to results
        CONTINUE

     IF !AABB.intersectRay(ray): CONTINUE

     IF node.right: stack.push(node.right)
     IF node.left: stack.push(node.left)

  4. SORT results by distance
  5. RETURN results
```

### Range Query (Sphere/AABB, Iterative)
```
QUERY_RANGE(center, radius):
  1. CREATE queryAABB from center/radius
  2. INIT stack = [root]
  3. WHILE stack.length > 0:
     node = stack.pop()

     IF node.isLeaf:
        IF intersects: collect userData
        CONTINUE

     IF !AABB.intersectAABB(queryAABB): CONTINUE

     IF node.right: stack.push(node.right)
     IF node.left: stack.push(node.left)

  4. RETURN collected_data
```

### Nearest Neighbor (Iterative, Priority Queue)
```
FIND_NEAREST(position, maxDistance):
  1. INIT candidates = []
  2. INIT stack = [root]
  3. WHILE stack.length > 0:
     node = stack.pop()
     distance = getDistanceToBounding(position, node.bounds)

     IF maxDistance AND distance > maxDistance: CONTINUE

     IF node.isLeaf:
        candidates.push({ distance, data: node.userData })
        CONTINUE

     // Prioritize closer child
     leftDist = getDistanceToBounding(position, node.left.bounds)
     rightDist = getDistanceToBounding(position, node.right.bounds)

     IF leftDist <= rightDist:
        stack.push(node.right)  // Farther first
        stack.push(node.left)   // Closer last
     ELSE:
        stack.push(node.left)
        stack.push(node.right)

  4. SORT candidates by distance
  5. RETURN candidates[0].data
```

### Refit (Iterative, Post-Order)
```
REFIT():
  1. COLLECT all nodes by depth (deepest first)
  2. FOR EACH node IN sorted_nodes:
     IF node.isLeaf: CONTINUE
     IF !node.left: CONTINUE

     // Direct bounds calculation, no temp objects
     minX = min(node.left.bounds.min.x, node.right.bounds.min.x)
     minY = min(node.left.bounds.min.y, node.right.bounds.min.y)
     minZ = min(node.left.bounds.min.z, node.right.bounds.min.z)
     maxX = max(node.left.bounds.max.x, node.right.bounds.max.x)
     maxY = max(node.left.bounds.max.y, node.right.bounds.max.y)
     maxZ = max(node.left.bounds.max.z, node.right.bounds.max.z)

     node.bounds.min.set(minX, minY, minZ)
     node.bounds.max.set(maxX, maxY, maxZ)
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
- ❌ **DO NOT** skip null checks in iterative loops
- ❌ **DO NOT** use left-handed coordinates
- ❌ **DO NOT** assume bounds are valid
- ❌ **DO NOT** use tabs for indentation
- ❌ **DO NOT** double quotes unless template literals needed
- ❌ **DO NOT** skip epsilon in comparisons
- ❌ **DO NOT** rebuild tree for small updates (use refit)
- ❌ **DO NOT** exceed maxDepth limit
- ❌ **DO NOT** ignore empty partitions in SAH
- ❌ **DO NOT** use recursive algorithms (always iterative)
- ❌ **DO NOT** create temporary AABB objects in hot paths
- ❌ **DO NOT** ignore SAH constants (TRIANGLE_INTERSECT_COST=1.25, TRAVERSAL_COST=1.0)
- ❌ **DO NOT** use fixed-size arrays for stack (use dynamic)

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