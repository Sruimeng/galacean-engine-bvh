---
id: system-overview
type: architecture
related_ids: [doc-standard]
---

# BVH System Overview

> **Core Architecture:** Binary Tree Structure for Spatial Acceleration

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     QUERY MODULE                             │
├─────────────────────────────────────────────────────────────┤
│ Ray      CollisionResult    AABB    BoundingSphere          │
│ └─raycast()  └─hit info     └─box    └─sphere               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                    CORE MODULE                               │
├─────────────────────────────────────────────────────────────┤
│ BVHTree ← BVHNode (Binary Tree)                             │
│ └─insert() └─bounds, left, right, isLeaf                   │
│ └─update()                                                   │
│ └─remove()                                                   │
│ └─clear()                                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   BUILDER MODULE                             │
├─────────────────────────────────────────────────────────────┤
│ BVHBuilder (Static Factory)                                 │
│ └─build(SAH|Median|Equal)                                   │
│    ├─SAH: Optimal queries, slower build                     │
│    ├─Median: Fast build, balanced                           │
│    └─Equal: Uniform distribution                            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  UTILS MODULE                                │
├─────────────────────────────────────────────────────────────┤
│ boundsVolume()     boundsSurfaceArea()                      │
│ unionBounds()      getLongestAxis()                         │
│ PerformanceTimer   Type Converters                          │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
[Input Objects] → BVHBuilder.build() → [BVHTree] → Query Methods → [Results]
     ↓                    ↓                  ↓              ↓
[Bounds+Data]     [Strategy Selection]   [BinaryTree]  [Ray/AABB/BS]
                     ↓
              [SAH/Median/Equal]
```

## Core Lifecycle Pseudocode

```
INITIALIZE_SYSTEM:
  1. CREATE BVHTree(maxLeaf=8, maxDepth=32, enableSAH=true)
  2. PREPARE objects: BoundingBox + userData[]

BUILD_PHASE:
  BVHBuilder.build(objects, strategy):
    IF objects.length <= maxLeafSize:
      FOR EACH obj: tree.insert(obj.bounds, obj.userData)
      RETURN tree

    CALCULATE unionAABB = union of all bounds
    SELECT splitAxis = longest axis of unionAABB

    SWITCH strategy:
      CASE SAH:
        splitPos = calculateSAH(objects, axis, unionAABB)
      CASE Median:
        sorted = sort by center[axis]
        splitPos = sorted[mid].center[axis]
      CASE Equal:
        splitPos = center of unionAABB[axis]

    PARTITION objects -> leftObjects[], rightObjects[]
    RECURSE build(leftObjects) + build(rightObjects)

QUERY_PHASE:
  tree.raycast(ray):
    IF node.isLeaf:
      RETURN intersection if valid
    ELSE:
      IF node.bounds intersects ray:
        RECURSE left + RECURSE right
      ELSE: prune

  tree.queryRange(center, radius):
    rangeAABB = createBoundingBox(center, radius*2)
    tree.intersectBounds(rangeAABB)

  tree.findNearest(position):
    candidates = []
    RECURSE tree:
      IF leaf: calculate distance, add to candidates
      ELSE: prioritize closer child first
    RETURN sorted[0].userData

UPDATE_PHASE:
  tree.update(objectId, newBounds):
    node = find object
    node.bounds = newBounds
    node.parent.updateBounds()  // refit up tree

  tree.rebuild(strategy):
    collect all objects
    clear tree
    recalculate with BVHBuilder
```

## Type Definitions

```typescript
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

interface BVHTree {
  root: BVHNode | null;
  maxLeafSize: number;
  maxDepth: number;
  enableSAH: boolean;

  insert(bounds: BoundingBox, userData?: any): number;
  update(objectId: number, newBounds: BoundingBox): boolean;
  remove(objectId: number): boolean;
  clear(): void;
  raycast(ray: Ray): CollisionResult[];
  queryRange(center: Vector3, radius: number): any[];
  findNearest(position: Vector3): any;
  intersectBounds(bounds: BoundingBox): any[];
  refit(): void;
  rebuild(strategy?: BVHBuildStrategy): void;
}

interface CollisionResult {
  object: any;
  distance: number;
  point?: Vector3;
  normal?: Vector3;
  node: BVHNode;
}
```

## Performance Characteristics

| Strategy | Build Time | Query Performance | Use Case |
|----------|------------|-------------------|----------|
| **SAH** | Slow | Optimal | Static scenes |
| **Median** | Fast | Balanced | Dynamic scenes |
| **Equal** | Fast | Good | Uniform distribution |

## Key Algorithm Notes

### Insert Strategy
- **FindBestLeaf**: Minimizes bounds growth
- **Split Decision**: Based on depth and object count
- **Split Method**: Midpoint of two objects' bounds

### Query Optimization
- **Early Termination**: Bounds intersection tests prune subtrees
- **Distance Sorting**: Results sorted by proximity
- **Backtracking**: Nearest-neighbor uses priority queue concept

### Update Strategy
- **Refit**: O(log n) bounds updates
- **Rebuild**: O(n) full restructuring (expensive but optimal)

## Negative Constraints

- **DO NOT** use `BVHTree` without calculating proper bounds
- **DO NOT** insert objects with invalid BoundingBox (min > max)
- **DO NOT** exceed `maxDepth` limit (stack overflow risk)
- **DO NOT** use `raycast` without normalized direction vectors
- **DO NOT** mutate input bounds after insertion (use update())
- **DO NOT** call `rebuild()` frequently (performance impact)
- **DO NOT** ignore `validate()` results during debugging
- **DO NOT** store references to internal nodes (may be invalidated)
- **DO NOT** mix strategies without understanding trade-offs
- **DO NOT** assume thread safety (single-threaded operations)