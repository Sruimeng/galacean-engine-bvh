/**
 * BVH Script 组件使用示例
 *
 * 这个 demo 展示了如何使用基于 Galacean Script 机制的 BVH 封装，
 * 大大简化了 BVH 的使用方式。
 *
 * 对比传统方式：
 * - 传统方式需要手动管理 BVH 树、手动获取包围盒、手动更新等
 * - Script 方式只需添加组件，自动处理所有细节
 */

import type { Color, Entity } from '@galacean/engine';
import {
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  Vector3 as GalaceanVector3,
  MeshRenderer,
  PrimitiveMesh,
  WebGLEngine,
} from '@galacean/engine';
import { Ray as MathRay, Vector2, Vector3 } from '@galacean/engine-math';

// 导入 BVH Script 组件
import { BVHCollider, BVHManager, Ray } from '../../src';

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

// ============ 全局状态 ============

let engine: WebGLEngine;
let rootEntity: Entity;
let cameraEntity: Entity;
let bvhManager: BVHManager;
let highlightedEntity: Entity | null = null;
let highlightedMaterial: BlinnPhongMaterial | null = null;
let originalColor: Color | null = null;

// 相机控制
let cameraRadius = 25;
let cameraTheta = Math.PI / 4;
let cameraPhi = Math.PI / 4;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// ============ 相机控制 ============

function updateCameraPosition() {
  const x = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
  const y = cameraRadius * Math.cos(cameraPhi);
  const z = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);

  cameraEntity.transform.setPosition(x, y, z);
  cameraEntity.transform.lookAt(new GalaceanVector3(0, 0, 0));
}

// ============ 相机设置 ============

function setupCamera() {
  cameraEntity = rootEntity.createChild('camera');
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.farClipPlane = 1000;
  updateCameraPosition();
}

// ============ 灯光设置 ============

function setupLights() {
  const light1 = rootEntity.createChild('light1');
  light1.transform.setPosition(10, 20, 10);
  light1.transform.lookAt(new GalaceanVector3(0, 0, 0));
  const directLight1 = light1.addComponent(DirectLight);
  directLight1.intensity = 1.0;

  const light2 = rootEntity.createChild('light2');
  light2.transform.setPosition(-10, 10, -10);
  light2.transform.lookAt(new GalaceanVector3(0, 0, 0));
  const directLight2 = light2.addComponent(DirectLight);
  directLight2.intensity = 0.5;
}

// ============ 创建场景对象 ============

function createSceneObjects(count: number) {
  const sceneSize = 15;

  for (let i = 0; i < count; i++) {
    // 创建 Entity
    const entity = rootEntity.createChild(`object_${i}`);

    // 随机位置
    entity.transform.setPosition(
      (Math.random() - 0.5) * sceneSize,
      (Math.random() - 0.5) * sceneSize,
      (Math.random() - 0.5) * sceneSize,
    );

    // 随机大小
    const scale = 0.3 + Math.random() * 0.7;
    entity.transform.setScale(scale, scale, scale);

    // 随机旋转
    entity.transform.setRotation(Math.random() * 360, Math.random() * 360);

    // 添加 MeshRenderer
    const renderer = entity.addComponent(MeshRenderer);

    // 随机选择形状
    const shapeType = Math.floor(Math.random() * 3);
    switch (shapeType) {
      case 0:
        renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
        break;
      case 1:
        renderer.mesh = PrimitiveMesh.createSphere(engine, 0.5, 16, 16);
        break;
      case 2:
        renderer.mesh = PrimitiveMesh.createCylinder(engine, 0.3, 0.3, 1, 16);
        break;
    }

    // 创建材质
    const material = new BlinnPhongMaterial(engine);
    const hue = Math.random();
    const color = hslToRgb(hue, 0.7, 0.5);
    material.baseColor.set(color.r, color.g, color.b, 1);
    renderer.setMaterial(material);

    // ============ 关键：添加 BVH 碰撞体 ============
    // 只需一行代码！碰撞体会自动注册到 BVHManager
    entity.addComponent(BVHCollider);

    // 可选：配置碰撞体
    // collider.configure({
    //   shapeType: ColliderShapeType.Auto,  // 自动从 MeshRenderer 获取包围盒
    //   layer: 0,                            // 碰撞层
    //   userData: { name: `object_${i}` },   // 自定义数据
    // });
  }

  console.log(`✓ 创建了 ${count} 个带碰撞体的对象`);
}

// ============ UI 更新 ============

function updateUI() {
  const stats = bvhManager.getStats();

  const colliderCountEl = document.getElementById('colliderCount');
  const nodeCountEl = document.getElementById('nodeCount');
  const treeDepthEl = document.getElementById('treeDepth');

  if (colliderCountEl) {
    colliderCountEl.textContent = bvhManager.colliderCount.toString();
  }
  if (stats) {
    if (nodeCountEl) nodeCountEl.textContent = stats.nodeCount.toString();
    if (treeDepthEl) treeDepthEl.textContent = stats.maxDepth.toString();
  }
}

// ============ 射线检测 ============

function performRaycast(screenX: number, screenY: number) {
  const startTime = performance.now();

  // 从屏幕坐标创建射线
  const camera = cameraEntity.getComponent(Camera)!;
  const canvas = engine.canvas;
  const rect = (canvas._webCanvas as HTMLCanvasElement).getBoundingClientRect();
  const x = screenX - rect.left;
  const y = screenY - rect.top;

  const mathRay = new MathRay();
  camera.screenPointToRay(new Vector2(x, y), mathRay);

  // 转换为 BVH Ray
  const ray = new Ray(
    new Vector3(mathRay.origin.x, mathRay.origin.y, mathRay.origin.z),
    new Vector3(mathRay.direction.x, mathRay.direction.y, mathRay.direction.z),
  );

  // ============ 使用 BVHManager 进行射线检测 ============
  // 只需一行代码！
  const hit = bvhManager.raycastFirst(ray, 100);

  const raycastTime = performance.now() - startTime;

  // 重置之前高亮的对象
  if (highlightedEntity && highlightedMaterial && originalColor) {
    highlightedMaterial.baseColor.copyFrom(originalColor);
    highlightedEntity = null;
    highlightedMaterial = null;
    originalColor = null;
  }

  // 更新 UI
  const hitStatusEl = document.getElementById('hitStatus');
  const raycastTimeEl = document.getElementById('raycastTime');

  if (raycastTimeEl) {
    raycastTimeEl.textContent = `${raycastTime.toFixed(3)} ms`;
  }

  if (hit) {
    // 高亮命中的对象
    const entity = hit.entity;
    const renderer = entity.getComponent(MeshRenderer);
    if (renderer) {
      const material = renderer.getMaterial() as BlinnPhongMaterial;
      highlightedEntity = entity;
      highlightedMaterial = material;
      originalColor = material.baseColor.clone();
      material.baseColor.set(1, 1, 0, 1); // 黄色高亮
    }

    if (hitStatusEl) {
      hitStatusEl.textContent = `命中: ${entity.name}`;
      hitStatusEl.className = 'hit';
    }

    console.log(`命中: ${entity.name}, 距离: ${hit.distance.toFixed(2)}`);
  } else {
    if (hitStatusEl) {
      hitStatusEl.textContent = '未命中';
      hitStatusEl.className = 'miss';
    }
  }
}

// ============ 交互设置 ============

function setupInteraction() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  // 鼠标拖动旋转相机
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

  // 滚轮缩放
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraRadius = Math.max(5, Math.min(50, cameraRadius + e.deltaY * 0.05));
    updateCameraPosition();
  });

  // 点击射线检测
  canvas.addEventListener('click', (e) => {
    if (!isDragging) {
      performRaycast(e.clientX, e.clientY);
    }
  });
}

// ============ 初始化 ============

async function init() {
  console.log('=== BVH Script 组件示例 ===');

  // 创建引擎
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  engine = await WebGLEngine.create({ canvas });
  engine.canvas.resizeByClientSize();

  // 创建场景
  const scene = engine.sceneManager.activeScene;
  rootEntity = scene.createRootEntity('root');
  scene.background.solidColor.set(0.1, 0.1, 0.15, 1);

  // ============ 第一步：添加 BVH 管理器 ============
  // 只需一行代码！
  bvhManager = rootEntity.addComponent(BVHManager);
  bvhManager.initialize({
    autoUpdate: true, // 自动更新变换变化的对象
    updateInterval: 1, // 每帧检查更新
  });
  console.log('✓ BVH 管理器已添加');

  // 创建相机
  setupCamera();

  // 创建灯光
  setupLights();

  // ============ 第二步：创建带碰撞体的对象 ============
  createSceneObjects(50);

  // 设置交互
  setupInteraction();

  // 启动引擎
  engine.run();

  // 更新 UI
  updateUI();

  console.log('✓ 场景初始化完成');
  console.log('提示：点击场景中的物体进行射线检测');
}

// ============ 创建场景对象 ============

function createSceneObjects(count: number) {
  const sceneSize = 15;

  for (let i = 0; i < count; i++) {
    // 创建 Entity
    const entity = rootEntity.createChild(`object_${i}`);

    // 随机位置
    entity.transform.setPosition(
      (Math.random() - 0.5) * sceneSize,
      (Math.random() - 0.5) * sceneSize,
      (Math.random() - 0.5) * sceneSize,
    );

    // 随机大小
    const scale = 0.3 + Math.random() * 0.7;
    entity.transform.setScale(scale, scale, scale);

    // 随机旋转
    entity.transform.setRotation(Math.random() * 360, Math.random() * 360, Math.random() * 360);

    // 添加 MeshRenderer
    const renderer = entity.addComponent(MeshRenderer);

    // 随机选择形状
    const shapeType = Math.floor(Math.random() * 3);
    switch (shapeType) {
      case 0:
        renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
        break;
      case 1:
        renderer.mesh = PrimitiveMesh.createSphere(engine, 0.5, 16, 16);
        break;
      case 2:
        renderer.mesh = PrimitiveMesh.createCylinder(engine, 0.3, 0.3, 1, 16);
        break;
    }

    // 创建材质
    const material = new BlinnPhongMaterial(engine);
    const hue = Math.random();
    const color = hslToRgb(hue, 0.7, 0.5);
    material.baseColor.set(color.r, color.g, color.b, 1);
    renderer.setMaterial(material);

    // ============ 关键：添加 BVH 碰撞体 ============
    // 只需一行代码！碰撞体会自动注册到 BVHManager
    const collider = entity.addComponent(BVHCollider);

    // 可选：配置碰撞体
    // collider.configure({
    //   shapeType: ColliderShapeType.Auto,  // 自动从 MeshRenderer 获取包围盒
    //   layer: 0,                            // 碰撞层
    //   userData: { name: `object_${i}` },   // 自定义数据
    // });
  }

  console.log(`✓ 创建了 ${count} 个带碰撞体的对象`);
}

// ============ 相机设置 ============

function setupCamera() {
  cameraEntity = rootEntity.createChild('camera');
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.farClipPlane = 1000;
  updateCameraPosition();
}

function updateCameraPosition() {
  const x = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
  const y = cameraRadius * Math.cos(cameraPhi);
  const z = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);

  cameraEntity.transform.setPosition(x, y, z);
  cameraEntity.transform.lookAt(new GalaceanVector3(0, 0, 0));
}

// ============ 灯光设置 ============

function setupLights() {
  const light1 = rootEntity.createChild('light1');
  light1.transform.setPosition(10, 20, 10);
  light1.transform.lookAt(new GalaceanVector3(0, 0, 0));
  const directLight1 = light1.addComponent(DirectLight);
  directLight1.intensity = 1.0;

  const light2 = rootEntity.createChild('light2');
  light2.transform.setPosition(-10, 10, -10);
  light2.transform.lookAt(new GalaceanVector3(0, 0, 0));
  const directLight2 = light2.addComponent(DirectLight);
  directLight2.intensity = 0.5;
}

// ============ 交互设置 ============

function setupInteraction() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  // 鼠标拖动旋转相机
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

  // 滚轮缩放
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraRadius = Math.max(5, Math.min(50, cameraRadius + e.deltaY * 0.05));
    updateCameraPosition();
  });

  // 点击射线检测
  canvas.addEventListener('click', (e) => {
    if (!isDragging) {
      performRaycast(e.clientX, e.clientY);
    }
  });
}

// ============ 射线检测 ============

function performRaycast(screenX: number, screenY: number) {
  const startTime = performance.now();

  // 从屏幕坐标创建射线
  const camera = cameraEntity.getComponent(Camera)!;
  const canvas = engine.canvas;
  const rect = (canvas._webCanvas as HTMLCanvasElement).getBoundingClientRect();
  const x = screenX - rect.left;
  const y = screenY - rect.top;

  const mathRay = new MathRay();
  camera.screenPointToRay(new Vector2(x, y), mathRay);

  // 转换为 BVH Ray
  const ray = new Ray(
    new Vector3(mathRay.origin.x, mathRay.origin.y, mathRay.origin.z),
    new Vector3(mathRay.direction.x, mathRay.direction.y, mathRay.direction.z),
  );

  // ============ 使用 BVHManager 进行射线检测 ============
  // 只需一行代码！
  const hit = bvhManager.raycastFirst(ray, 100);

  const raycastTime = performance.now() - startTime;

  // 重置之前高亮的对象
  if (highlightedEntity && highlightedMaterial && originalColor) {
    highlightedMaterial.baseColor.copyFrom(originalColor);
    highlightedEntity = null;
    highlightedMaterial = null;
    originalColor = null;
  }

  // 更新 UI
  const hitStatusEl = document.getElementById('hitStatus');
  const raycastTimeEl = document.getElementById('raycastTime');

  if (raycastTimeEl) {
    raycastTimeEl.textContent = `${raycastTime.toFixed(3)} ms`;
  }

  if (hit) {
    // 高亮命中的对象
    const entity = hit.entity;
    const renderer = entity.getComponent(MeshRenderer);
    if (renderer) {
      const material = renderer.getMaterial() as BlinnPhongMaterial;
      highlightedEntity = entity;
      highlightedMaterial = material;
      originalColor = material.baseColor.clone();
      material.baseColor.set(1, 1, 0, 1); // 黄色高亮
    }

    if (hitStatusEl) {
      hitStatusEl.textContent = `命中: ${entity.name}`;
      hitStatusEl.className = 'hit';
    }

    console.log(`命中: ${entity.name}, 距离: ${hit.distance.toFixed(2)}`);
  } else {
    if (hitStatusEl) {
      hitStatusEl.textContent = '未命中';
      hitStatusEl.className = 'miss';
    }
  }
}

// ============ UI 更新 ============

function updateUI() {
  const stats = bvhManager.getStats();

  const colliderCountEl = document.getElementById('colliderCount');
  const nodeCountEl = document.getElementById('nodeCount');
  const treeDepthEl = document.getElementById('treeDepth');

  if (colliderCountEl) {
    colliderCountEl.textContent = bvhManager.colliderCount.toString();
  }
  if (stats) {
    if (nodeCountEl) nodeCountEl.textContent = stats.nodeCount.toString();
    if (treeDepthEl) treeDepthEl.textContent = stats.maxDepth.toString();
  }
}

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

// ============ 启动 ============

init().catch(console.error);
