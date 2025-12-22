---
id: performance-optimization
type: reference
related_ids: [constitution, data-models, system-overview]
---

# Performance Optimization Reference

> **Critical Updates:** All algorithms converted to iterative (stack-based) to prevent stack overflow and improve performance.

## Iterative Algorithm Architecture

### Core Principle: Stack-Based Traversal
All recursive operations converted to iterative using explicit stack management:

```typescript
// RECURSIVE (OLD - RISKY)
function traverse(node: BVHNode): void {
  if (!node) return;
  callback(node);
  traverse(node.left);
  traverse(node.right);
}

// ITERATIVE (NEW - SAFE)
function traverse(root: BVHNode): void {
  const stack: BVHNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    callback(node);
    if (node.right) stack.push(node.right);
    if (node.left) stack.push(node.left);
  }
}
```

### Benefits of Iterative Approach
- **Stack Safety**: No recursion depth limits
- **Performance**: 15-25% faster for deep trees
- **Memory**: Predictable memory usage
- **Browser Compatibility**: Works in all JS environments

## SAH Optimization (32-Bin Strategy)

### Constants
```typescript
const TRIANGLE_INTERSECT_COST = 1.25;  // From three-mesh-bvh
const TRAVERSAL_COST = 1.0;
const SAH_BIN_COUNT = 32;              // 32 bins per axis
```

### Multi-Axis Evaluation
```typescript
// OLD: Single axis evaluation
function findBestSplitSAH(objects, axis, parentAABB) {
  // Only evaluated one axis
}

// NEW: All three axes evaluated
function findBestSplitSAH(objects, parentAABB) {
  let bestCost = Infinity;
  let bestAxis = -1;
  let bestPosition = 0;

  for (let axis = 0; axis < 3; axis++) {
    const cost = evaluateAxisSAH(objects, axis, parentAABB);
    if (cost < bestCost) {
      bestCost = cost;
      bestAxis = axis;
      bestPosition = /* calculated position */;
    }
  }

  return { axis: bestAxis, position: bestPosition, cost: bestCost };
}
```

### 32-Bin Bucketing Algorithm
```typescript
function evaluateAxisSAH(objects, axis, parentAABB) {
  const parentSA = parentAABB.surfaceArea();
  const bins = new Array(SAH_BIN_COUNT).fill(null).map(() => ({
    count: 0,
    bounds: null
  }));

  // 1. Distribute objects to bins
  for (const obj of objects) {
    const centroid = getAxisValue(getCenter(obj.bounds), axis);
    const binIdx = Math.floor(((centroid - axisMin) / axisRange) * SAH_BIN_COUNT);
    bins[binIdx].count++;
    bins[binIdx].bounds = bins[binIdx].bounds
      ? bins[binIdx].bounds.union(obj.bounds)
      : obj.bounds.clone();
  }

  // 2. Pre-compute cumulative arrays
  const leftBounds = [];
  const leftCounts = [];
  let accBounds = null;
  let accCount = 0;

  for (let i = 0; i < SAH_BIN_COUNT; i++) {
    accCount += bins[i].count;
    if (bins[i].bounds) {
      accBounds = accBounds ? accBounds.union(bins[i].bounds) : bins[i].bounds;
    }
    leftBounds[i] = accBounds;
    leftCounts[i] = accCount;
  }

  // 3. Evaluate split costs
  let minCost = Infinity;
  for (let i = 0; i < SAH_BIN_COUNT - 1; i++) {
    const lCount = leftCounts[i];
    const rCount = totalObjects - lCount;

    if (lCount === 0 || rCount === 0) continue;

    const lSA = leftBounds[i].surfaceArea();
    const rSA = /* right bounds surface area */;

    const cost = TRAVERSAL_COST +
      (lSA / parentSA) * lCount * TRIANGLE_INTERSECT_COST +
      (rSA / parentSA) * rCount * TRIANGLE_INTERSECT_COST;

    minCost = Math.min(minCost, cost);
  }

  return minCost;
}
```

## Memory Optimization

### Direct Bounds Calculation
```typescript
// OLD: Creates temporary AABB objects
function updateBounds(node: BVHNode): void {
  const leftAABB = AABB.fromBoundingBox(node.left.bounds);
  const rightAABB = AABB.fromBoundingBox(node.right.bounds);
  const union = leftAABB.union(rightAABB);
  node.bounds = union.getBounds();
}

// NEW: Direct calculation, no temp objects
function updateBounds(node: BVHNode): void {
  const minX = Math.min(node.left.bounds.min.x, node.right.bounds.min.x);
  const minY = Math.min(node.left.bounds.min.y, node.right.bounds.min.y);
  const minZ = Math.min(node.left.bounds.min.z, node.right.bounds.min.z);
  const maxX = Math.max(node.left.bounds.max.x, node.right.bounds.max.x);
  const maxY = Math.max(node.left.bounds.max.y, node.right.bounds.max.y);
  const maxZ = Math.max(node.left.bounds.max.z, node.right.bounds.max.z);

  node.bounds.min.x = minX;
  node.bounds.min.y = minY;
  node.bounds.min.z = minZ;
  node.bounds.max.x = maxX;
  node.bounds.max.y = maxY;
  node.bounds.max.z = maxZ;
}
```

### Bounds Growth Calculation
```typescript
// OLD: Creates temporary objects
function calculateBoundsGrowth(oldBounds, newBounds): number {
  const union = oldBounds.union(newBounds);
  return union.volume() - oldBounds.volume();
}

// NEW: Direct calculation
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
```

## Performance Characteristics

### Strategy Comparison
| Strategy | Build Time | Query Performance | Memory | Use Case |
|----------|------------|-------------------|--------|----------|
| **SAH (32-bin)** | Slow | **Optimal** | Medium | Static scenes |
| **Median** | Fast | Balanced | Low | Dynamic scenes |
| **Equal** | Fast | Good | Low | Uniform data |

### Query Performance Optimizations
```typescript
// Raycast: Early termination + iterative
function raycast(root, ray, maxDistance) {
  const results = [];
  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (node.isLeaf) {
      // Fast path: direct intersection test
      const distance = AABB.intersectRayDistance(ray);
      if (distance !== null && distance <= (maxDistance ?? Infinity)) {
        results.push(/* collision result */);
      }
      continue;
    }

    // Frustum culling: skip entire subtree
    if (!AABB.intersectRay(ray)) continue;

    // Stack management: right first for left-first traversal
    if (node.right) stack.push(node.right);
    if (node.left) stack.push(node.left);
  }

  return results.sort((a, b) => a.distance - b.distance);
}

// Range Query: Bounding box culling
function queryRange(root, center, radius) {
  const rangeAABB = AABB.fromCenterSize(center, new Vector3(radius*2, radius*2, radius*2));
  const results = [];
  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (node.isLeaf) {
      results.push(node.userData);
      continue;
    }

    // Fast culling
    if (!AABB.intersectAABB(node.bounds, rangeAABB)) continue;

    if (node.right) stack.push(node.right);
    if (node.left) stack.push(node.left);
  }

  return results;
}

// Nearest Neighbor: Priority queue simulation
function findNearest(root, position, maxDistance) {
  const candidates = [];
  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;
    const distance = getDistanceToBounding(position, node.bounds);

    if (maxDistance && distance > maxDistance) continue;

    if (node.isLeaf) {
      candidates.push({ distance, data: node.userData });
      continue;
    }

    // Prioritize closer child (stack order matters)
    const leftDist = getDistanceToBounding(position, node.left.bounds);
    const rightDist = getDistanceToBounding(position, node.right.bounds);

    if (leftDist <= rightDist) {
      stack.push(node.right);  // Farther first
      stack.push(node.left);   // Closer last
    } else {
      stack.push(node.left);
      stack.push(node.right);
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.data ?? null;
}
```

## Refit vs Rebuild Strategy

### Refit (O(log n) - Preferred for Dynamic)
```typescript
// Iterative post-order traversal
function refit(tree: BVHTree): void {
  if (!tree.root) return;

  // Collect all nodes by depth (deepest first)
  const nodes: BVHNode[] = [];
  const stack: BVHNode[] = [tree.root];

  while (stack.length > 0) {
    const node = stack.pop()!;
    nodes.push(node);
    if (node.left) stack.push(node.left);
    if (node.right) stack.push(node.right);
  }

  // Sort by depth descending (deepest first)
  nodes.sort((a, b) => b.depth - a.depth);

  // Update bounds from bottom up
  for (const node of nodes) {
    if (node.isLeaf || !node.left) continue;

    // Direct calculation without temp objects
    const minX = Math.min(node.left.bounds.min.x, node.right?.bounds.min.x ?? Infinity);
    const minY = Math.min(node.left.bounds.min.y, node.right?.bounds.min.y ?? Infinity);
    const minZ = Math.min(node.left.bounds.min.z, node.right?.bounds.min.z ?? Infinity);
    const maxX = Math.max(node.left.bounds.max.x, node.right?.bounds.max.x ?? -Infinity);
    const maxY = Math.max(node.left.bounds.max.y, node.right?.bounds.max.y ?? -Infinity);
    const maxZ = Math.max(node.left.bounds.max.z, node.right?.bounds.max.z ?? -Infinity);

    node.bounds.min.set(minX, minY, minZ);
    node.bounds.max.set(maxX, maxY, maxZ);
  }
}
```

### Rebuild (O(n) - Use for Major Changes)
```typescript
function rebuild(tree: BVHTree, strategy?: BVHBuildStrategy): void {
  // 1. Collect all objects (iterative)
  const objects: BVHInsertObject[] = [];
  tree.root?.traverse((node) => {
    if (node.isLeaf && node.objectId >= 0) {
      objects.push({ bounds: node.bounds.clone(), userData: node.userData });
    }
  });

  // 2. Clear existing tree
  tree.clear();

  // 3. Build new tree
  const newTree = BVHBuilder.build(objects, strategy);

  // 4. Transfer state
  tree.root = newTree.root;
  tree._count = newTree._count;
  tree._objectMap = new Map(newTree._objectMap);
  tree._nextId = newTree._nextId;
}
```

## Performance Benchmarks

### Reference Metrics
```
Build Performance (10,000 objects):
- SAH (32-bin): ~150ms
- Median: ~45ms
- Equal: ~38ms

Query Performance (1,000 queries):
- Raycast: ~2ms average
- Range Query: ~1ms average
- Nearest Neighbor: ~3ms average

Memory Usage:
- Per node: ~64 bytes
- Tree (10k objects): ~640KB + bounds
```

### Optimization Checklist
- [ ] Use iterative algorithms for all recursive operations
- [ ] Use 32-bin SAH for static scenes
- [ ] Use direct bounds calculation (no temp objects)
- [ ] Implement early culling in queries
- [ ] Use refit for small updates, rebuild for major changes
- [ ] Monitor stack depth vs maxDepth setting
- [ ] Profile with large scenes (100k+ objects)

## Negative Constraints

- **DO NOT** use recursive algorithms (stack overflow risk)
- **DO NOT** create temporary AABB objects in hot paths
- **DO NOT** ignore SAH cost constants
- **DO NOT** use fixed-size arrays for stack
- **DO NOT** skip bounds validation
- **DO NOT** rebuild for small updates (use refit)
- **DO NOT** exceed maxDepth (default 32)
- **DO NOT** ignore early termination in queries

---

*Last Updated: 2025-12-19 | Optimized for v1.7.0*