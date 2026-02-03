---
id: index
type: guide
related_ids: [constitution, tech-stack, data-models, system-overview, shared-utilities, performance-optimization]
---

# Galacean Engine BVH - Documentation Index

> **Entry Point:** This is the master index for the BVH spatial acceleration library.

## 📚 Document Matrix

| File | Type | Purpose |
|------|------|---------|
| **[constitution.md](reference/constitution.md)** | reference | **MANDATORY FIRST READ** - Rules of engagement, coordinate systems |
| **[tech-stack.md](reference/tech-stack.md)** | reference | Build tools, dependencies, pipeline configuration |
| **[data-models.md](reference/data-models.md)** | reference | Interface definitions, class structures, type contracts |
| **[system-overview.md](architecture/system-overview.md)** | architecture | System flow, component architecture, data flow diagrams |
| **[shared-utilities.md](reference/shared-utilities.md)** | reference | Math utilities, geometry types, performance tools |
| **[performance-optimization.md](reference/performance-optimization.md)** | reference | **NEW** - Iterative algorithms, SAH optimization, memory management |
| **[doc-standard.md](guides/doc-standard.md)** | guide | Documentation format specifications |

## 🚀 Navigation Guide

**CRITICAL:** Start here → **[constitution.md](reference/constitution.md)**

**Reading Order:**
1. **constitution.md** - Understand domain rules (Right-handed Y-up, epsilon precision)
2. **data-models.md** - Learn types (BVHNode, BVHTree, BoundingBox)
3. **performance-optimization.md** - **NEW** - Iterative algorithms, SAH 32-bin optimization
4. **system-overview.md** - Grasp architecture (Query/Core/Builder modules)
5. **tech-stack.md** - Review build pipeline (Rollup + Vite → ES5 ESM)
6. **shared-utilities.md** - Discover math helpers (unionBounds, getLongestAxis)

## 🎯 Quick Start

```typescript
// 1. Import core types
import { BVHTree, BVHBuildStrategy } from '@galacean/engine-bvh';

// 2. Create tree with SAH for static scenes
const tree = new BVHTree(8, 32, true);

// 3. Insert objects with bounds
objects.forEach(obj => {
  tree.insert(obj.bounds, obj.userData);
});

// 4. Query with raycast (iterative, stack-safe)
const hits = tree.raycast(cameraRay);
```

## 📖 Conventions

- **Coordinate System:** Right-handed, Y-up (from `@galacean/engine-math`)
- **Precision:** Epsilon = 1e-10 for all comparisons
- **Build Target:** ES5 via SWC (for browser compatibility)
- **Module Format:** ESM only (no CommonJS)
- **Algorithm Style:** Iterative (stack-based) for all recursive operations
- **SAH Optimization:** 32-bin bucketing, multi-axis evaluation

---

*Last Updated: 2025-12-19 | Current Version: 1.7.0*