---
id: doc-standard
type: guide
related_ids: []
---

# Documentation Standard (Doc-Standard)

> **Purpose:** Establish consistent, LLM-consumable documentation format.

## Core Rules

### 1. Frontmatter Required

All docs MUST have YAML frontmatter:

```yaml
---
id: unique-kebab-case-id
type: reference | guide | architecture | agent
related_ids: [other-doc-id]
---
```

### 2. Type-First Definitions

Define interfaces/types BEFORE explaining logic:

```typescript
// GOOD: Type first
interface BVHNode {
  bounds: AABB;
  left: BVHNode | null;
  right: BVHNode | null;
  primitives: number[];
}

// Then explain usage...
```

### 3. Pseudocode Over Prose

Use pseudocode for logic, NOT paragraphs:

```
// GOOD:
BUILD_BVH(primitives):
  1. IF primitives.length <= LEAF_SIZE -> return LeafNode
  2. FIND best split axis (SAH)
  3. PARTITION primitives
  4. RECURSE on left/right

// BAD:
"The BVH build process first checks if the number of primitives is
less than or equal to the leaf size, in which case it returns a leaf
node. Otherwise, it finds the best split axis using Surface Area
Heuristic and partitions the primitives accordingly before recursing
on both halves."
```

### 4. Negative Constraints Section

Every reference doc MUST include "DO NOTs":

```markdown
## Negative Constraints

- DO NOT use `any` type in public APIs
- DO NOT mutate input parameters
- DO NOT ignore floating-point precision
```

### 5. Density Over Length

- Max 200 lines per doc
- Use tables for comparisons
- Use bullet lists over paragraphs
- Code examples: 5-15 lines max

## File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Reference | `{topic}.md` | `constitution.md` |
| Guide | `{action}-guide.md` | `bvh-usage-guide.md` |
| Architecture | `{system}-overview.md` | `system-overview.md` |
| Agent | `strategy-{task}.md` | `strategy-raycast.md` |

## Quality Checklist

- [ ] Has frontmatter with id, type, related_ids
- [ ] Types/interfaces defined before prose
- [ ] Logic in pseudocode, not paragraphs
- [ ] Negative constraints section present
- [ ] Under 200 lines
- [ ] No "wall of text" paragraphs
