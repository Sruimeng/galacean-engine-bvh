---
id: tech-stack
type: reference
related_ids: []
---

# Tech Stack Reference

> **Purpose:** Technical infrastructure and dependency mapping for Galacean Engine BVH library.

## Build Configuration Types

```typescript
interface BuildConfig {
  bundler: 'rollup' | 'vite';
  transformer: 'swc';
  target: 'ES5';
  format: 'ESM';
  output: './dist/index.mjs';
}

interface Toolchain {
  build: RollupConfig;
  typeCheck: TypeScriptConfig;
  lint: ESLintConfig;
  format: PrettierConfig;
  commit: CommitlintConfig;
  gitHooks: HuskyConfig;
}
```

## Runtime Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@galacean/engine-math` | `^1.5.16` | Core math library (GLM/Vector operations) |
| `eventemitter3` | `^5.0.1` | Event bus system |
| `zustand` | `^5.0.3` | State management |
| `immer` | `^10.1.1` | Immutable state updates |
| `react` | `^18.3.1` | UI rendering (demo only) |
| `react-dom` | `^18.3.1` | React DOM adapter (demo only) |
| `@vitejs/plugin-react` | `^4.6.0` | Vite React integration (demo only) |

**Note**: Core BVH library only depends on `@galacean/engine-math`. React/UI dependencies are for demo purposes.

## Development Toolchain

### Build & Transpilation
- **Rollup**: `^2.79.1` - Module bundler
- **SWC**: `^1.4.13` - Rust-based transformer (ES5 target)
- **Vite**: `^4.5.3` - Dev server & preview
- **TypeScript**: `^5.4.5` - Static typing
- **TypeDoc**: `^0.25.12` - API documentation

### Code Quality
- **ESLint**: `^8.57.0` - Linting (flat config)
- **Prettier**: `^3.5.3` - Code formatting
- **TypeScript ESLint**: `^8.32.1` - TS rules
- **@react-three/eslint-plugin**: `^0.1.2` - Three.js specific rules

### Git & Workflow
- **Husky**: `^7.0.4` - Git hooks
- **lint-staged**: `^11.2.6` - Pre-commit linting
- **@commitlint**: `^19.3.0` - Commit message validation
- **concurrently**: `^8.2.2` - Parallel script execution
- **rimraf**: `^4` - Clean directories

## Build Pipeline

```
Source (.ts)
    ↓
SWC (ES5 Transform + Tree Shaking)
    ↓
Rollup (Bundle)
    ↓
Output (ESM: dist/index.mjs)
    ↓
Vite (Dev Server + Demo)
```

### Rollup Configuration (rollup.config.js)
```javascript
import swc from '@rollup/plugin-swc';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.mjs',
    format: 'esm',
    sourcemap: true
  },
  plugins: [
    resolve(),
    swc({
      swcOptions: {
        jsc: {
          target: 'es5',
          parser: { syntax: 'typescript' }
        }
      }
    }),
    terser()
  ],
  external: ['@galacean/engine-math']
};
```

### Vite Configuration (vite.config.ts)
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'demo/dist',
    rollupOptions: {
      input: {
        main: './demo/index.html',
        raycasting: './demo/html/raycasting.html',
        // ... other demos
      }
    }
  },
  server: {
    port: 3000,
    open: '/demo/index.html'
  }
});
```

## Development Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `vite` | Start dev server (demo) |
| `build` | `rollup -c` | Build library (ESM) |
| `build:demo` | `vite build` | Build demo site |
| `preview` | `vite preview` | Preview built demo |
| `lint` | `eslint .` | Check code quality |
| `lint:fix` | `eslint . --fix` | Auto-fix issues |
| `check:ts` | `tsc --noEmit` | Type check only |

## Note on Config Files

**Missing**: No explicit `tsconfig.json` in root. TypeScript checking likely handled through:
- ESLint TypeScript parser
- Rollup SWC configuration
- `tsconfig.check.json` (mentioned in scripts)

## Dependency Hierarchy

```
@galacean/engine-bvh (root)
├── Runtime
│   ├── @galacean/engine-math (core computation)
│   ├── eventemitter3 (events)
│   ├── zustand + immer (state)
│   └── react + react-dom (UI)
└── Development
    ├── rollup + swc (build)
    ├── vite (dev server)
    ├── typescript + eslint (quality)
    └── husky + commitlint (git workflow)
```

## Negative Constraints

- **DO NOT** use CommonJS format - project is ESM-only
- **DO NOT** commit without passing lint-staged checks
- **DO NOT** target ES6+ in final bundle (must be ES5)
- **DO NOT** bypass SWC transformation for legacy code
- **DO NOT** modify rollup.config.js directly - use extending patterns
- **DO NOT** add runtime dependencies without security audit
- **DO NOT** ignore TypeScript errors in CI pipeline
- **DO NOT** bundle `@galacean/engine-math` - it's an external dependency
- **DO NOT** include demo dependencies in library build
- **DO NOT** use recursive algorithms in source (use iterative/stack-based)