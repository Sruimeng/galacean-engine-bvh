# BVH Script 组件使用指南

本指南介绍如何使用基于 Galacean Script 机制封装的 BVH 组件，这是推荐的使用方式，可以大幅简化 BVH 的集成和使用。

## 快速开始

### 1. 安装

```bash
npm install @galacean/engine-bvh
```

### 2. 基本使用

```typescript
import { BVHManager, BVHCollider, Ray } from '@galacean/engine-bvh';
import { Vector3 } from '@galacean/engine-math';

// 1. 在场景根节点添加 BVH 管理器
const manager = rootEntity.addComponent(BVHManager);
manager.initialize();

// 2. 在需要碰撞检测的 Entity 上添加碰撞体
const collider = cubeEntity.addComponent(BVHCollider);

// 3. 执行射线检测
const ray = new Ray(
  new Vector3(0, 10, 0),  // 起点
  new Vector3(0, -1, 0)   // 方向
);
const hit = manager.raycastFirst(ray, 100);

if (hit) {
  console.log('命中:', hit.entity.name);
  console.log('距离:', hit.distance);
  console.log('命中点:', hit.point);
}
```

## 组件详解

### BVHManager - BVH 管理器

BVHManager 是核心管理组件，负责管理所有 BVH 碰撞体和执行空间查询。

#### 初始化选项

```typescript
const manager = rootEntity.addComponent(BVHManager);
manager.initialize({
  maxLeafSize: 8,           // 叶子节点最大对象数
  maxDepth: 32,             // 树的最大深度
  buildStrategy: BVHBuildStrategy.SAH,  // 构建策略
  autoUpdate: true,         // 是否自动更新
  updateInterval: 1,        // 更新间隔帧数
});
```

#### 主要方法

```typescript
// 射线检测 - 返回所有命中
const hits = manager.raycast(ray, maxDistance);

// 射线检测 - 只返回最近的命中
const hit = manager.raycastFirst(ray, maxDistance);

// 范围查询 - 查找指定范围内的所有碰撞体
const colliders = manager.queryRange(center, radius);

// 查找最近的碰撞体
const nearest = manager.findNearest(position, maxDistance);

// 包围盒相交查询
const intersecting = manager.intersectBounds(bounds);

// 强制重建 BVH 树
manager.rebuild();

// 获取统计信息
const stats = manager.getStats();
```

### BVHCollider - BVH 碰撞体

BVHCollider 是添加到 Entity 上的碰撞体组件，会自动注册到 BVHManager。

#### 基本使用

```typescript
// 自动模式 - 从 MeshRenderer 获取包围盒
const collider = entity.addComponent(BVHCollider);
```

#### 配置选项

```typescript
import { ColliderShapeType } from '@galacean/engine-bvh';

const collider = entity.addComponent(BVHCollider);
collider.configure({
  shapeType: ColliderShapeType.Box,  // 形状类型
  boxSize: new Vector3(2, 2, 2),     // 包围盒大小
  boxCenter: new Vector3(0, 1, 0),   // 包围盒中心偏移
  layer: 1,                          // 碰撞层
  userData: { name: 'myObject' },    // 自定义数据
});
```

#### 形状类型

- `ColliderShapeType.Auto` - 自动从 MeshRenderer 获取包围盒（默认）
- `ColliderShapeType.Box` - 自定义包围盒
- `ColliderShapeType.Sphere` - 自定义球体（转换为 AABB）

#### 动态更新

碰撞体会自动检测 Entity 的变换变化并更新包围盒：

```typescript
// 移动 Entity 后，碰撞体会自动更新
entity.transform.setPosition(10, 0, 0);

// 也可以手动设置包围盒
collider.setBoxSize(3, 3, 3);
collider.setBoxCenter(0, 1.5, 0);
```

### MeshBVHCollider - 精确三角形碰撞体

MeshBVHCollider 提供三角形级别的精确射线检测，适用于需要精确碰撞的场景。

```typescript
import { MeshBVHCollider } from '@galacean/engine-bvh';

// 添加精确碰撞体
const meshCollider = entity.addComponent(MeshBVHCollider);
meshCollider.configure({
  cullBackface: true,  // 剔除背面
  buildStrategy: BVHBuildStrategy.SAH,
});

// 执行精确射线检测
const hit = meshCollider.raycastFirst(ray, 100);
if (hit) {
  console.log('命中三角形索引:', hit.triangleIndex);
  console.log('重心坐标:', hit.barycentricCoords);
}
```

## 使用场景

### 场景 1：点击拾取

```typescript
// 从屏幕坐标创建射线
const camera = cameraEntity.getComponent(Camera);
const mathRay = new MathRay();
camera.screenPointToRay(new Vector3(screenX, screenY, 0), mathRay);

// 转换为 BVH Ray
const ray = new Ray(
  new Vector3(mathRay.origin.x, mathRay.origin.y, mathRay.origin.z),
  new Vector3(mathRay.direction.x, mathRay.direction.y, mathRay.direction.z)
);

// 执行射线检测
const hit = bvhManager.raycastFirst(ray, 1000);
if (hit) {
  // 高亮选中的对象
  highlightEntity(hit.entity);
}
```

### 场景 2：范围检测

```typescript
// 查找玩家周围的敌人
const playerPos = player.transform.worldPosition;
const nearbyColliders = bvhManager.queryRange(
  new Vector3(playerPos.x, playerPos.y, playerPos.z),
  10  // 半径
);

for (const collider of nearbyColliders) {
  const enemy = collider.getEntity();
  // 处理附近的敌人...
}
```

### 场景 3：碰撞检测

```typescript
// 检测与指定包围盒相交的对象
const checkBounds = new BoundingBox(
  new Vector3(-5, 0, -5),
  new Vector3(5, 10, 5)
);

const intersecting = bvhManager.intersectBounds(checkBounds);
for (const collider of intersecting) {
  console.log('相交对象:', collider.getEntity().name);
}
```

## 性能优化

### 1. 合理设置更新间隔

```typescript
manager.initialize({
  autoUpdate: true,
  updateInterval: 2,  // 每 2 帧更新一次，减少开销
});
```

### 2. 使用碰撞层过滤

```typescript
// 设置不同的碰撞层
playerCollider.layer = 1;
enemyCollider.layer = 2;
itemCollider.layer = 3;

// 查询时可以根据层过滤
const hits = manager.raycast(ray, 100);
const enemyHits = hits.filter(h => h.collider.layer === 2);
```

### 3. 静态对象优化

对于不会移动的对象，可以禁用自动更新：

```typescript
// 在所有静态对象添加完成后
manager.rebuild();  // 重建一次

// 然后禁用自动更新
manager.initialize({ autoUpdate: false });
```

## 与传统方式对比

### 传统方式（复杂）

```typescript
// 需要手动管理 BVH 树
const bvhTree = new BVHTree(8, 32, true);

// 手动获取每个对象的包围盒
const bounds = meshRenderer.bounds;
const boundingBox = new BoundingBox(
  new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
  new Vector3(bounds.max.x, bounds.max.y, bounds.max.z)
);

// 手动插入
const objectId = bvhTree.insert(boundingBox, userData);

// 手动更新（当对象移动时）
bvhTree.update(objectId, newBounds);

// 手动重建
bvhTree.rebuild();

// 手动清理
bvhTree.remove(objectId);
```

### Script 方式（简单）

```typescript
// 1. 添加管理器（一次）
const manager = rootEntity.addComponent(BVHManager);
manager.initialize();

// 2. 添加碰撞体（自动注册、自动更新、自动清理）
const collider = entity.addComponent(BVHCollider);

// 3. 直接使用
const hit = manager.raycastFirst(ray);
```

## API 参考

### BVHManager

| 方法 | 描述 |
|------|------|
| `initialize(options?)` | 初始化管理器 |
| `raycast(ray, maxDistance?)` | 射线检测，返回所有命中 |
| `raycastFirst(ray, maxDistance?)` | 射线检测，返回最近命中 |
| `queryRange(center, radius)` | 范围查询 |
| `findNearest(position, maxDistance?)` | 查找最近碰撞体 |
| `intersectBounds(bounds)` | 包围盒相交查询 |
| `rebuild()` | 重建 BVH 树 |
| `getStats()` | 获取统计信息 |

### BVHCollider

| 属性/方法 | 描述 |
|----------|------|
| `configure(options)` | 配置碰撞体 |
| `shapeType` | 形状类型 |
| `layer` | 碰撞层 |
| `userData` | 用户数据 |
| `setBoxSize(x, y, z)` | 设置包围盒大小 |
| `setBoxCenter(x, y, z)` | 设置包围盒中心 |
| `getWorldBounds()` | 获取世界空间包围盒 |

### MeshBVHCollider

| 方法 | 描述 |
|------|------|
| `configure(options)` | 配置碰撞体 |
| `build()` | 构建 MeshBVH |
| `raycast(ray, maxDistance?)` | 精确射线检测 |
| `raycastFirst(ray, maxDistance?)` | 精确射线检测（最近） |
| `getStats()` | 获取统计信息 |
