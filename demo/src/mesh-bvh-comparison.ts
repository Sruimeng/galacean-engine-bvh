/**
 * Mesh BVH 性能对比测试
 *
 * 这个 demo 展示了 BVH 加速与暴力遍历的性能对比：
 * 1. 创建大量3D对象
 * 2. 实时对比 BVH raycast 和暴力法 raycast 的性能
 * 3. 可视化展示加速效果
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
import type { BVHTree } from '../../dist/index.mjs';
import { AABB, BVHBuilder, BVHBuildStrategy, Ray } from '../../dist/index.mjs';

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

interface SceneObject {
  entity: Entity;
  renderer: MeshRenderer;
  material: BlinnPhongMaterial;
  originalColor: Color;
  id: number;
  bounds: BoundingBox;
}

interface RaycastHit {
  object: SceneObject;
  distance: number;
}

// ============ 全局状态 ============

let engine: WebGLEngine;
let cameraEntity: Entity;
let rootEntity: Entity;
let bvhTree: BVHTree | null = null;
let sceneObjects: SceneObject[] = [];
let useBVH = true;

// 存储包围盒快照
const boundingBoxSnapshot: Map<number, BoundingBox> = new Map();

// 相机控制状态
let cameraRadius = 100;
let cameraTheta = Math.PI / 4;
let cameraPhi = Math.PI / 4;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// 配置
const config = {
  objectCount: 500,
  rayCount: 100,
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

// ============ 初始化引擎 ============

async function initEngine(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  engine = await WebGLEngine.create({ canvas });
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  rootEntity = scene.createRootEntity('root');

  scene.background.solidColor.set(0.08, 0.08, 0.12, 1);

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
    cameraRadius = Math.max(20, Math.min(300, cameraRadius + e.deltaY * 0.1));
    updateCameraPosition();
  });
}

// ============ 场景对象创建 ============

function createSceneObjects(count: number): void {
  // 清除现有对象
  for (const obj of sceneObjects) {
    obj.entity.destroy();
  }
  sceneObjects = [];
  boundingBoxSnapshot.clear();

  // 创建不同类型的几何体
  const meshTypes = ['sphere', 'cube', 'cylinder'];

  for (let i = 0; i < count; i++) {
    const entity = rootEntity.createChild(`obj_${i}`);

    // 随机位置
    const x = (Math.random() - 0.5) * config.sceneSize;
    const y = (Math.random() - 0.5) * config.sceneSize;
    const z = (Math.random() - 0.5) * config.sceneSize;
    entity.transform.setPosition(x, y, z);

    // 随机大小
    const scale = 0.5 + Math.random() * 2;
    entity.transform.setScale(scale, scale, scale);

    // 随机旋转
    entity.transform.setRotation(Math.random() * 360, Math.random() * 360, Math.random() * 360);

    // 添加 MeshRenderer
    const renderer = entity.addComponent(MeshRenderer);
    const meshType = meshTypes[Math.floor(Math.random() * meshTypes.length)];

    switch (meshType) {
      case 'sphere':
        renderer.mesh = PrimitiveMesh.createSphere(engine, 0.5, 16, 16);
        break;
      case 'cube':
        renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
        break;
      case 'cylinder':
        renderer.mesh = PrimitiveMesh.createCylinder(engine, 0.5, 0.5, 1, 16);
        break;
    }

    // 创建材质
    const material = new BlinnPhongMaterial(engine);
    const hue = Math.random();
    const color = hslToRgb(hue, 0.6, 0.5);
    material.baseColor.set(color.r, color.g, color.b, 1);
    renderer.setMaterial(material);

    // 获取包围盒
    const bounds = renderer.bounds;
    const boundingBox = new BoundingBox(
      new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
      new Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
    );

    const obj: SceneObject = {
      entity,
      renderer,
      material,
      originalColor: new Color(color.r, color.g, color.b, 1),
      id: i,
      bounds: boundingBox,
    };

    sceneObjects.push(obj);
    boundingBoxSnapshot.set(i, boundingBox);
  }

  // 更新三角形数量（估算）
  const triangleCount = count * 500; // 平均每个对象约500个三角形
  const triangleCountEl = document.getElementById('triangleCount');
  if (triangleCountEl) triangleCountEl.textContent = triangleCount.toLocaleString();

  console.log(`创建了 ${count} 个场景对象`);
}

// ============ BVH 构建 ============

function buildBVH(): void {
  const startTime = performance.now();

  const insertObjects = sceneObjects.map((obj) => ({
    bounds: obj.bounds,
    userData: obj,
  }));

  bvhTree = BVHBuilder.build(insertObjects, BVHBuildStrategy.SAH);

  const buildTime = performance.now() - startTime;

  // 更新 UI
  const buildTimeEl = document.getElementById('buildTime');
  if (buildTimeEl) buildTimeEl.textContent = `${buildTime.toFixed(2)} ms`;

  const stats = bvhTree.getStats();
  const nodeCountEl = document.getElementById('nodeCount');
  if (nodeCountEl) nodeCountEl.textContent = stats.nodeCount.toLocaleString();

  console.log(`BVH 构建完成: ${buildTime.toFixed(2)}ms, ${stats.nodeCount} 节点`);
}

// ============ BVH Raycast ============

function bvhRaycast(ray: Ray, maxDistance: number): RaycastHit | null {
  if (!bvhTree) return null;

  const results = bvhTree.raycast(ray, maxDistance);
  if (results.length > 0) {
    return {
      object: results[0].object as SceneObject,
      distance: results[0].distance,
    };
  }
  return null;
}

// ============ 暴力法 Raycast ============

function bruteForceRaycast(ray: Ray, maxDistance: number): RaycastHit | null {
  let closestHit: RaycastHit | null = null;
  let closestDistance = maxDistance;

  for (const obj of sceneObjects) {
    const bounds = boundingBoxSnapshot.get(obj.id);
    if (!bounds) continue;

    const aabb = new AABB(
      new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
      new Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
    );

    const distance = aabb.intersectRayDistance(ray);
    if (distance !== null && distance < closestDistance) {
      closestDistance = distance;
      closestHit = {
        object: obj,
        distance,
      };
    }
  }

  return closestHit;
}

// ============ 执行 Raycast 测试 ============

function performRaycasts(): void {
  const startTime = performance.now();
  let hitCount = 0;

  // 重置所有对象颜色
  for (const obj of sceneObjects) {
    obj.material.baseColor.copyFrom(obj.originalColor);
  }

  // 生成随机射线并执行 raycast
  for (let i = 0; i < config.rayCount; i++) {
    const origin = new Vector3(
      (Math.random() - 0.5) * config.sceneSize * 2,
      (Math.random() - 0.5) * config.sceneSize * 2,
      (Math.random() - 0.5) * config.sceneSize * 2,
    );

    const direction = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    direction.normalize();

    const ray = new Ray(origin, direction);
    const maxDistance = config.sceneSize * 3;

    let hit: RaycastHit | null;
    if (useBVH) {
      hit = bvhRaycast(ray, maxDistance);
    } else {
      hit = bruteForceRaycast(ray, maxDistance);
    }

    if (hit) {
      hitCount++;
      // 高亮命中的对象
      hit.object.material.baseColor.set(1, 1, 0, 1);
    }
  }

  const raycastTime = performance.now() - startTime;

  // 更新 UI
  const raycastTimeEl = document.getElementById('raycastTime');
  const raycastQPSEl = document.getElementById('raycastQPS');
  const hitCountEl = document.getElementById('hitCount');
  const hitRateEl = document.getElementById('hitRate');
  const raycastTimeCard = document.getElementById('raycastTimeCard');

  if (raycastTimeEl) raycastTimeEl.textContent = raycastTime.toFixed(2);
  if (raycastQPSEl) {
    const qps = (config.rayCount / raycastTime) * 1000;
    raycastQPSEl.textContent = qps.toFixed(0);
  }
  if (hitCountEl) hitCountEl.textContent = hitCount.toString();
  if (hitRateEl) {
    const hitRate = (hitCount / config.rayCount) * 100;
    hitRateEl.textContent = `${hitRate.toFixed(1)}%`;
  }

  // 根据性能设置卡片颜色
  if (raycastTimeCard) {
    raycastTimeCard.className = 'perf-card';
    if (raycastTime > 16) {
      raycastTimeCard.classList.add('danger');
    } else if (raycastTime > 8) {
      raycastTimeCard.classList.add('warning');
    }
  }
}

// ============ 运行完整性能对比 ============

function runPerformanceComparison(): void {
  if (!bvhTree) {
    console.error('BVH 未构建');
    return;
  }

  const testCount = 1000;
  console.log(`开始性能对比测试 (${testCount} 次 raycast)...`);

  // 生成随机射线
  const rays: Ray[] = [];
  for (let i = 0; i < testCount; i++) {
    const origin = new Vector3(
      (Math.random() - 0.5) * config.sceneSize * 2,
      (Math.random() - 0.5) * config.sceneSize * 2,
      (Math.random() - 0.5) * config.sceneSize * 2,
    );
    const direction = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    direction.normalize();
    rays.push(new Ray(origin, direction));
  }

  const maxDistance = config.sceneSize * 3;

  // BVH 测试
  const bvhStart = performance.now();
  let bvhHits = 0;
  for (const ray of rays) {
    const hit = bvhRaycast(ray, maxDistance);
    if (hit) bvhHits++;
  }
  const bvhTime = performance.now() - bvhStart;

  // 暴力法测试
  const bruteStart = performance.now();
  let bruteHits = 0;
  for (const ray of rays) {
    const hit = bruteForceRaycast(ray, maxDistance);
    if (hit) bruteHits++;
  }
  const bruteTime = performance.now() - bruteStart;

  // ���算加速比
  const speedup = bruteTime / bvhTime;

  // 更新 UI
  const testRayCountEl = document.getElementById('testRayCount');
  const bvhTimeResultEl = document.getElementById('bvhTimeResult');
  const bruteTimeResultEl = document.getElementById('bruteTimeResult');
  const bvhQPSEl = document.getElementById('bvhQPS');
  const bruteQPSEl = document.getElementById('bruteQPS');
  const speedupEl = document.getElementById('speedup');
  const bvhBarEl = document.getElementById('bvhBar');
  const bruteBarEl = document.getElementById('bruteBar');
  const comparisonResultsEl = document.getElementById('comparisonResults');

  if (testRayCountEl) testRayCountEl.textContent = testCount.toString();
  if (bvhTimeResultEl) bvhTimeResultEl.textContent = `${bvhTime.toFixed(2)} ms`;
  if (bruteTimeResultEl) bruteTimeResultEl.textContent = `${bruteTime.toFixed(2)} ms`;
  if (bvhQPSEl) bvhQPSEl.textContent = ((testCount / bvhTime) * 1000).toFixed(0);
  if (bruteQPSEl) bruteQPSEl.textContent = ((testCount / bruteTime) * 1000).toFixed(0);
  if (speedupEl) speedupEl.textContent = `${speedup.toFixed(1)}x`;

  // 更新进度条
  if (bvhBarEl && bruteBarEl) {
    const maxTime = Math.max(bvhTime, bruteTime);
    bvhBarEl.style.width = `${(bvhTime / maxTime) * 100}%`;
    bruteBarEl.style.width = `${(bruteTime / maxTime) * 100}%`;
  }

  // 显示结果面板
  if (comparisonResultsEl) comparisonResultsEl.style.display = 'block';

  console.log(`性能对比结果:`);
  console.log(`  BVH: ${bvhTime.toFixed(2)}ms, ${bvhHits} 命中`);
  console.log(`  暴力法: ${bruteTime.toFixed(2)}ms, ${bruteHits} 命中`);
  console.log(`  加速比: ${speedup.toFixed(1)}x`);
}

// ============ 切换 BVH 模式 ============

function toggleBVH(): void {
  useBVH = !useBVH;

  const toggleBtn = document.getElementById('toggleBVH') as HTMLButtonElement;
  const bvhStatusEl = document.getElementById('bvhStatus');

  if (toggleBtn) {
    if (useBVH) {
      toggleBtn.textContent = '关闭 BVH (使用暴力法)';
      toggleBtn.className = 'btn-toggle';
    } else {
      toggleBtn.textContent = '开启 BVH';
      toggleBtn.className = 'btn-toggle off';
    }
  }

  if (bvhStatusEl) {
    if (useBVH) {
      bvhStatusEl.className = 'status-indicator bvh-on';
      bvhStatusEl.innerHTML = '<span class="dot"></span>BVH 加速';
    } else {
      bvhStatusEl.className = 'status-indicator bvh-off';
      bvhStatusEl.innerHTML = '<span class="dot"></span>暴力遍历';
    }
  }

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
    }

    // 自动旋转
    if (!isDragging) {
      cameraTheta += 0.002;
      updateCameraPosition();
    }

    // 执行 raycast
    performRaycasts();

    requestAnimationFrame(loop);
  };

  loop();
}

// ============ 事件监听 ============

function setupEventListeners(): void {
  const objectCountEl = document.getElementById('objectCount') as HTMLInputElement;
  const rayCountEl = document.getElementById('rayCount') as HTMLInputElement;
  const rebuildBtn = document.getElementById('rebuildBtn');
  const toggleBVHBtn = document.getElementById('toggleBVH');
  const runComparisonBtn = document.getElementById('runComparison');

  if (objectCountEl) {
    objectCountEl.addEventListener('input', (e) => {
      config.objectCount = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('objectCountValue');
      if (valueEl) valueEl.textContent = config.objectCount.toString();
    });
  }

  if (rayCountEl) {
    rayCountEl.addEventListener('input', (e) => {
      config.rayCount = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('rayCountValue');
      if (valueEl) valueEl.textContent = config.rayCount.toString();
    });
  }

  if (rebuildBtn) {
    rebuildBtn.addEventListener('click', () => {
      createSceneObjects(config.objectCount);
      buildBVH();
    });
  }

  if (toggleBVHBtn) {
    toggleBVHBtn.addEventListener('click', toggleBVH);
  }

  if (runComparisonBtn) {
    runComparisonBtn.addEventListener('click', runPerformanceComparison);
  }

  window.addEventListener('resize', () => {
    engine.canvas.resizeByClientSize();
  });
}

// ============ 主入口 ============

async function main(): Promise<void> {
  console.log('=== Mesh BVH 性能对比测试 ===');

  try {
    await initEngine();
    setupMouseControls();
    setupEventListeners();
    createSceneObjects(config.objectCount);
    buildBVH();
    engine.run();
    startAnimationLoop();

    console.log('Demo 启动成功');
  } catch (error) {
    console.error('初始化失败:', error);
    throw error;
  }
}

// 启动
main();
