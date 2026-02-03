/**
 * BVH Dynamic Objects Demo - Galacean Engine 3D 版本
 * 展示 BVH 的动态操作能力
 */

import type { Entity } from '@galacean/engine';
import {
  BlinnPhongMaterial,
  Camera,
  Color,
  DirectLight,
  Vector3 as GalaceanVector3,
  MeshRenderer,
  PrimitiveMesh,
  WebGLEngine,
} from '@galacean/engine';
import { BoundingBox, Vector3 } from '@galacean/engine-math';
import { BVHBuilder, BVHBuildStrategy, BVHTree } from '../../dist/index.mjs';

// ============ 工具函数 ============

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return { r, g, b };
}

// ============ 类型定义 ============

interface DynamicObject {
  id: number;
  bvhId: number;
  entity: Entity;
  renderer: MeshRenderer;
  material: BlinnPhongMaterial;
  position: Vector3;
  velocity: Vector3;
  size: number;
  color: Color;
}

// ============ 全局状态 ============

let engine: WebGLEngine;
let cameraEntity: Entity;
let rootEntity: Entity;
let bvhTree: BVHTree | null = null;
let objects: DynamicObject[] = [];
const objectIdMap = new Map<number, DynamicObject>();
let nextObjectId = 0;

// 相机控制状态
let cameraRadius = 80;
let cameraTheta = Math.PI / 4;
let cameraPhi = Math.PI / 4;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// 配置
const config = {
  initialCount: 100,
  batchSize: 10,
  moveSpeed: 30,
  sceneSize: 80,
};

// 性能统计
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;

// ============ 相机控制 ============

function updateCameraPosition(): void {
  const x = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
  const y = cameraRadius * Math.cos(cameraPhi);
  const z = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);

  cameraEntity.transform.setPosition(x, y, z);
  cameraEntity.transform.lookAt(new GalaceanVector3(0, 0, 0));
}

// ============ 更新统计信息 ============

function updateStats(): void {
  const objectCountEl = document.getElementById('objectCount');
  if (objectCountEl) objectCountEl.textContent = objects.length.toString();

  if (bvhTree) {
    const stats = bvhTree.getStats();
    const nodeCountEl = document.getElementById('nodeCount');
    const treeDepthEl = document.getElementById('treeDepth');
    const balanceFactorEl = document.getElementById('balanceFactor');
    const treeValidEl = document.getElementById('treeValid');

    if (nodeCountEl) nodeCountEl.textContent = stats.nodeCount.toString();
    if (treeDepthEl) treeDepthEl.textContent = stats.maxDepth.toString();
    if (balanceFactorEl) balanceFactorEl.textContent = stats.balanceFactor.toFixed(3);

    const validation = bvhTree.validate();
    if (treeValidEl) {
      treeValidEl.textContent = validation.valid ? '✓ 有效' : '✗ 无效';
      treeValidEl.style.color = validation.valid ? '#4caf50' : '#f44336';
    }
  }
}

// ============ 初始化引擎 ============

async function initEngine(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  engine = await WebGLEngine.create({ canvas });
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  rootEntity = scene.createRootEntity('root');

  scene.background.solidColor.set(0.1, 0.1, 0.18, 1);

  // 创建相机
  cameraEntity = rootEntity.createChild('camera');
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.farClipPlane = 1000;
  updateCameraPosition();

  // 创建方向光
  const lightEntity = rootEntity.createChild('light');
  lightEntity.transform.setPosition(50, 100, 50);
  lightEntity.transform.lookAt(new GalaceanVector3(0, 0, 0));
  const directLight = lightEntity.addComponent(DirectLight);
  directLight.intensity = 1.0;

  const lightEntity2 = rootEntity.createChild('light2');
  lightEntity2.transform.setPosition(-50, 50, -50);
  lightEntity2.transform.lookAt(new GalaceanVector3(0, 0, 0));
  const directLight2 = lightEntity2.addComponent(DirectLight);
  directLight2.intensity = 0.5;

  console.log('Galacean Engine 初始化完成');
}

function setupMouseControls(): void {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    }
  });

  canvas.addEventListener('mouseup', () => {
    isDragging = false;
  });

  canvas.addEventListener('mouseleave', () => {
    isDragging = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isDragging) {
      const deltaX = e.clientX - lastMouseX;
      const deltaY = e.clientY - lastMouseY;

      cameraTheta -= deltaX * 0.01;
      cameraPhi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraPhi - deltaY * 0.01));

      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      updateCameraPosition();
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraRadius = Math.max(20, Math.min(200, cameraRadius + e.deltaY * 0.1));
    updateCameraPosition();
  });
}

// ============ 日志 ============

function addLog(message: string, type: string): void {
  const logContainer = document.getElementById('logContainer');
  if (!logContainer) return;

  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  const time = new Date().toLocaleTimeString();
  item.innerHTML = `${message}<span class="time">${time}</span>`;
  logContainer.insertBefore(item, logContainer.firstChild);

  // 限制日志数量
  while (logContainer.children.length > 20) {
    logContainer.removeChild(logContainer.lastChild!);
  }
}

// ============ 创建对象 ============

function createObject(): DynamicObject {
  const size = Math.random() * 3 + 1;
  const x = (Math.random() - 0.5) * config.sceneSize;
  const y = (Math.random() - 0.5) * config.sceneSize;
  const z = (Math.random() - 0.5) * config.sceneSize;

  // 创建实体
  const entity = rootEntity.createChild(`obj_${nextObjectId}`);
  entity.transform.setPosition(x, y, z);
  entity.transform.setScale(size, size, size);

  // 添加 MeshRenderer
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createSphere(engine, 0.5, 16, 16);

  // 创建材质
  const material = new BlinnPhongMaterial(engine);
  const hue = Math.random();
  const rgb = hslToRgb(hue, 0.7, 0.5);
  const color = new Color(rgb.r, rgb.g, rgb.b, 1);
  material.baseColor.copyFrom(color);
  renderer.setMaterial(material);

  const obj: DynamicObject = {
    id: nextObjectId++,
    bvhId: -1,
    entity,
    renderer,
    material,
    position: new Vector3(x, y, z),
    velocity: new Vector3(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
    ),
    size,
    color,
  };

  return obj;
}

// ============ 获取对象包围盒 ============

function getObjectBounds(obj: DynamicObject): BoundingBox {
  const halfSize = obj.size / 2;
  return new BoundingBox(
    new Vector3(obj.position.x - halfSize, obj.position.y - halfSize, obj.position.z - halfSize),
    new Vector3(obj.position.x + halfSize, obj.position.y + halfSize, obj.position.z + halfSize),
  );
}

// ============ 初始化场景 ============

function initScene(): void {
  // 清除现有对象
  for (const obj of objects) {
    obj.entity.destroy();
  }
  objects = [];
  objectIdMap.clear();

  // 创建 BVH 树
  bvhTree = new BVHTree(8, 32, true);

  // 创建初始对象
  for (let i = 0; i < config.initialCount; i++) {
    const obj = createObject();
    objects.push(obj);
    obj.bvhId = bvhTree.insert(getObjectBounds(obj), obj);
    objectIdMap.set(obj.bvhId, obj);
  }

  updateStats();
  addLog(`初始化 ${config.initialCount} 个对象`, 'add');
}

// ============ 添加对象 ============

function addObjects(count: number): void {
  if (!bvhTree) return;

  const startTime = performance.now();

  for (let i = 0; i < count; i++) {
    const obj = createObject();
    objects.push(obj);
    obj.bvhId = bvhTree.insert(getObjectBounds(obj), obj);
    objectIdMap.set(obj.bvhId, obj);
  }

  const elapsed = performance.now() - startTime;
  updateStats();
  addLog(`添加 ${count} 个对象 (${elapsed.toFixed(2)}ms)`, 'add');
}

// ============ 删除对象 ============

function removeObjects(count: number): void {
  if (!bvhTree || objects.length === 0) return;

  const startTime = performance.now();
  const toRemove = Math.min(count, objects.length);

  for (let i = 0; i < toRemove; i++) {
    const idx = Math.floor(Math.random() * objects.length);
    const obj = objects[idx];

    // 从 BVH 中移除
    bvhTree.remove(obj.bvhId);
    objectIdMap.delete(obj.bvhId);

    // 销毁实体
    obj.entity.destroy();

    // 从数组中移除
    objects.splice(idx, 1);
  }

  const elapsed = performance.now() - startTime;
  updateStats();
  addLog(`删除 ${toRemove} 个对象 (${elapsed.toFixed(2)}ms)`, 'remove');
}

// ============ 更新所有对象位置 ============

function updateAllPositions(): { updateCount: number; elapsed: number } {
  if (!bvhTree) return { updateCount: 0, elapsed: 0 };

  const startTime = performance.now();
  let updateCount = 0;

  for (const obj of objects) {
    // 更新位置
    obj.position.x += obj.velocity.x * config.moveSpeed * 0.01;
    obj.position.y += obj.velocity.y * config.moveSpeed * 0.01;
    obj.position.z += obj.velocity.z * config.moveSpeed * 0.01;

    // 边界反弹
    const halfScene = config.sceneSize / 2;
    if (Math.abs(obj.position.x) > halfScene) obj.velocity.x *= -1;
    if (Math.abs(obj.position.y) > halfScene) obj.velocity.y *= -1;
    if (Math.abs(obj.position.z) > halfScene) obj.velocity.z *= -1;

    // 更新实体位置
    obj.entity.transform.setPosition(obj.position.x, obj.position.y, obj.position.z);

    // 更新 BVH
    if (bvhTree.update(obj.bvhId, getObjectBounds(obj))) {
      updateCount++;
    }
  }

  const elapsed = performance.now() - startTime;
  return { updateCount, elapsed };
}

// ============ 重建树 ============

function rebuildTree(): void {
  const startTime = performance.now();

  const insertObjects = objects.map((obj) => ({
    bounds: getObjectBounds(obj),
    userData: obj,
  }));

  bvhTree = BVHBuilder.build(insertObjects, BVHBuildStrategy.SAH);

  // 更新对象的 BVH ID
  objectIdMap.clear();
  bvhTree.root?.traverse((node: any) => {
    if (node.isLeaf && node.userData) {
      node.userData.bvhId = node.objectId;
      objectIdMap.set(node.objectId, node.userData);
    }
  });

  const elapsed = performance.now() - startTime;
  updateStats();
  addLog(`重建树 (${elapsed.toFixed(2)}ms)`, 'rebuild');
}

// ============ 动画循环 ============

function startAnimationLoop(): void {
  const loop = () => {
    // 更新 FPS
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
      fps = frameCount;
      frameCount = 0;
      lastTime = now;
      const fpsEl = document.getElementById('fps');
      if (fpsEl) fpsEl.textContent = fps.toString();
      updateStats();
    }

    // 自动旋转
    if (!isDragging) {
      cameraTheta += 0.002;
      updateCameraPosition();
    }

    // 自动更新位置
    if (config.moveSpeed > 0) {
      updateAllPositions();
    }

    requestAnimationFrame(loop);
  };

  loop();
}

// ============ 事件监听 ============

function setupEventListeners(): void {
  const initialCountEl = document.getElementById('initialCount') as HTMLInputElement;
  const batchSizeEl = document.getElementById('batchSize') as HTMLInputElement;
  const moveSpeedEl = document.getElementById('moveSpeed') as HTMLInputElement;
  const addBtn = document.getElementById('addBtn');
  const removeBtn = document.getElementById('removeBtn');
  const updateBtn = document.getElementById('updateBtn');
  const rebuildBtn = document.getElementById('rebuildBtn');

  if (initialCountEl) {
    initialCountEl.addEventListener('input', (e) => {
      config.initialCount = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('initialCountValue');
      if (valueEl) valueEl.textContent = config.initialCount.toString();
    });
  }

  if (batchSizeEl) {
    batchSizeEl.addEventListener('input', (e) => {
      config.batchSize = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('batchSizeValue');
      if (valueEl) valueEl.textContent = config.batchSize.toString();
    });
  }

  if (moveSpeedEl) {
    moveSpeedEl.addEventListener('input', (e) => {
      config.moveSpeed = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('moveSpeedValue');
      if (valueEl) valueEl.textContent = config.moveSpeed.toString();
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      addObjects(config.batchSize);
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      removeObjects(config.batchSize);
    });
  }

  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      const result = updateAllPositions();
      addLog(`更新 ${result.updateCount} 个对象 (${result.elapsed.toFixed(2)}ms)`, 'update');
    });
  }

  if (rebuildBtn) {
    rebuildBtn.addEventListener('click', () => {
      rebuildTree();
    });
  }

  window.addEventListener('resize', () => {
    engine.canvas.resizeByClientSize();
  });
}

// ============ 主入口 ============

async function main(): Promise<void> {
  console.log('=== BVH Dynamic Objects Demo (Galacean Engine 3D) ===');

  try {
    await initEngine();
    setupMouseControls();
    setupEventListeners();
    initScene();
    engine.run();
    startAnimationLoop();

    console.log('Demo 启动成功');
  } catch (error) {
    console.error('初始化失败:', error);
    throw error;
  }
}

// 导出 init 函数以保持兼容性
export function init() {
  main();
}

// 启动
main();
