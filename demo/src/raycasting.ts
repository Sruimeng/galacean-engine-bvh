/**
 * BVH Raycasting Demo - Galacean Engine 3D 版本
 * 展示 BVH 加速的光线投射查询
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
import { BVHBuilder, BVHBuildStrategy, Ray } from '../../dist/index.mjs';

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
}

// ============ 全局状态 ============

let engine: WebGLEngine;
let cameraEntity: Entity;
let rootEntity: Entity;
let bvhTree: BVHTree | null = null;
let sceneObjects: SceneObject[] = [];
let isAnimating = true;

// 相机控制状态
let cameraRadius = 80;
let cameraTheta = Math.PI / 4;
let cameraPhi = Math.PI / 4;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// 配置
const config = {
  objectCount: 1000,
  rayCount: 100,
  buildStrategy: BVHBuildStrategy.SAH,
  sceneSize: 100,
};

// 性能统计
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;

// 射线可视化
let rayEntities: Entity[] = [];
let hitPointEntities: Entity[] = [];

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

// ============ 场景对象创建 ============

function createSceneObjects(count: number): void {
  // 清除现有对象
  for (const obj of sceneObjects) {
    obj.entity.destroy();
  }
  sceneObjects = [];

  // 创建新对象
  for (let i = 0; i < count; i++) {
    const entity = rootEntity.createChild(`sphere_${i}`);

    // 随机位置
    const x = (Math.random() - 0.5) * config.sceneSize;
    const y = (Math.random() - 0.5) * config.sceneSize;
    const z = (Math.random() - 0.5) * config.sceneSize;
    entity.transform.setPosition(x, y, z);

    // 随机大小
    const scale = 0.5 + Math.random() * 1.5;
    entity.transform.setScale(scale, scale, scale);

    // 添加 MeshRenderer
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createSphere(engine, 0.5, 16, 16);

    // 创建材质
    const material = new BlinnPhongMaterial(engine);
    const hue = Math.random();
    const color = hslToRgb(hue, 0.7, 0.5);
    material.baseColor.set(color.r, color.g, color.b, 1);
    renderer.setMaterial(material);

    sceneObjects.push({
      entity,
      renderer,
      material,
      originalColor: new Color(color.r, color.g, color.b, 1),
      id: i,
    });
  }

  console.log(`创建了 ${count} 个场景对象`);
}

// ============ BVH 构建 ============

function buildBVH(): void {
  const startTime = performance.now();

  const insertObjects = sceneObjects.map((obj) => {
    const bounds = obj.renderer.bounds;
    return {
      bounds: new BoundingBox(
        new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
        new Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
      ),
      userData: obj,
    };
  });

  bvhTree = BVHBuilder.build(insertObjects, config.buildStrategy);

  const buildTime = performance.now() - startTime;

  const buildTimeEl = document.getElementById('buildTime');
  if (buildTimeEl) buildTimeEl.textContent = `${buildTime.toFixed(2)} ms`;

  const stats = bvhTree.getStats();
  const nodeCountEl = document.getElementById('nodeCount');
  const treeDepthEl = document.getElementById('treeDepth');
  if (nodeCountEl) nodeCountEl.textContent = stats.nodeCount.toString();
  if (treeDepthEl) treeDepthEl.textContent = stats.maxDepth.toString();
}

// ============ 射线可视化 ============

function clearRayVisualization(): void {
  for (const entity of rayEntities) {
    entity.destroy();
  }
  rayEntities = [];

  for (const entity of hitPointEntities) {
    entity.destroy();
  }
  hitPointEntities = [];
}

function createRayVisualization(
  origin: Vector3,
  direction: Vector3,
  hit: boolean,
  hitPoint?: Vector3,
): void {
  // 创建射线线段（使用细长的立方体）
  const rayEntity = rootEntity.createChild('ray');

  const length = config.sceneSize * 1.5;
  const endPoint = new Vector3(
    origin.x + direction.x * length,
    origin.y + direction.y * length,
    origin.z + direction.z * length,
  );

  // 计算中点和方向
  const midX = (origin.x + endPoint.x) / 2;
  const midY = (origin.y + endPoint.y) / 2;
  const midZ = (origin.z + endPoint.z) / 2;

  rayEntity.transform.setPosition(midX, midY, midZ);

  // 计算旋转
  const dx = endPoint.x - origin.x;
  const dy = endPoint.y - origin.y;
  const dz = endPoint.z - origin.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // 使用 lookAt 来设置方向
  rayEntity.transform.lookAt(new GalaceanVector3(endPoint.x, endPoint.y, endPoint.z));
  rayEntity.transform.setScale(0.05, 0.05, dist);

  const renderer = rayEntity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  const material = new BlinnPhongMaterial(engine);
  if (hit) {
    material.baseColor.set(0.3, 1, 0.3, 0.5); // 绿色 - 命中
  } else {
    material.baseColor.set(1, 0.3, 0.3, 0.3); // 红色 - 未命中
  }
  renderer.setMaterial(material);

  rayEntities.push(rayEntity);

  // 如果命中，创建命中点标记
  if (hit && hitPoint) {
    const hitEntity = rootEntity.createChild('hitPoint');
    hitEntity.transform.setPosition(hitPoint.x, hitPoint.y, hitPoint.z);
    hitEntity.transform.setScale(0.5, 0.5, 0.5);

    const hitRenderer = hitEntity.addComponent(MeshRenderer);
    hitRenderer.mesh = PrimitiveMesh.createSphere(engine, 0.5, 8, 8);

    const hitMaterial = new BlinnPhongMaterial(engine);
    hitMaterial.baseColor.set(1, 1, 0, 1); // 黄色
    hitRenderer.setMaterial(hitMaterial);

    hitPointEntities.push(hitEntity);
  }
}

// ============ 执行光线投射 ============

function performRaycasts(): void {
  if (!bvhTree) return;

  // 清除之前的可视化
  clearRayVisualization();

  // 重置所有对象颜色
  for (const obj of sceneObjects) {
    obj.material.baseColor.copyFrom(obj.originalColor);
  }

  const startTime = performance.now();
  let hitCount = 0;

  for (let i = 0; i < config.rayCount; i++) {
    // 生成随机射线
    const origin = new Vector3(
      (Math.random() - 0.5) * config.sceneSize * 2,
      (Math.random() - 0.5) * config.sceneSize * 2,
      (Math.random() - 0.5) * config.sceneSize * 2,
    );

    const direction = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    direction.normalize();

    const ray = new Ray(origin, direction);
    const results = bvhTree.raycast(ray, config.sceneSize * 3);

    const hit = results.length > 0;
    if (hit) {
      hitCount++;

      // 高亮命中的对象
      const hitObject = results[0].object as SceneObject;
      if (hitObject && hitObject.material) {
        hitObject.material.baseColor.set(1, 1, 0, 1); // 黄色高亮
      }
    }

    // 只可视化前 20 条射线（避免太多）
    if (i < 20) {
      const hitPoint = hit && results[0].point ? results[0].point : undefined;
      createRayVisualization(origin, direction, hit, hitPoint);
    }
  }

  const queryTime = performance.now() - startTime;

  // 更新 UI
  const queryTimeEl = document.getElementById('queryTime');
  const hitCountEl = document.getElementById('hitCount');
  const hitRateEl = document.getElementById('hitRate');
  const hitIndicator = document.getElementById('hitIndicator');

  if (queryTimeEl) queryTimeEl.textContent = `${queryTime.toFixed(2)} ms`;
  if (hitCountEl) hitCountEl.textContent = hitCount.toString();

  const hitRate = ((hitCount / config.rayCount) * 100).toFixed(1);
  if (hitRateEl) hitRateEl.textContent = `${hitRate}%`;

  if (hitIndicator) {
    hitIndicator.className = 'hit-indicator ' + (hitCount > config.rayCount / 2 ? 'hit' : 'miss');
  }
}

// ============ 动画循环 ============

function startAnimationLoop(): void {
  let lastRaycastTime = 0;

  const loop = (time: number) => {
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
    if (isAnimating && !isDragging) {
      cameraTheta += 0.003;
      updateCameraPosition();
    }

    // 每秒执行一次 raycast
    if (isAnimating && time - lastRaycastTime > 1000) {
      performRaycasts();
      lastRaycastTime = time;
    }

    requestAnimationFrame(loop);
  };

  loop(0);
}

// ============ 事件监听 ============

function setupEventListeners(): void {
  const objectCountEl = document.getElementById('objectCount') as HTMLInputElement;
  const rayCountEl = document.getElementById('rayCount') as HTMLInputElement;
  const buildStrategyEl = document.getElementById('buildStrategy') as HTMLSelectElement;
  const rebuildBtn = document.getElementById('rebuildBtn');
  const toggleAnimBtn = document.getElementById('toggleAnimBtn');

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

  if (buildStrategyEl) {
    buildStrategyEl.addEventListener('change', (e) => {
      const strategies: Record<string, BVHBuildStrategy> = {
        sah: BVHBuildStrategy.SAH,
        median: BVHBuildStrategy.Median,
        equal: BVHBuildStrategy.Equal,
      };
      config.buildStrategy = strategies[(e.target as HTMLSelectElement).value];
    });
  }

  if (rebuildBtn) {
    rebuildBtn.addEventListener('click', () => {
      createSceneObjects(config.objectCount);
      buildBVH();
      performRaycasts();
    });
  }

  if (toggleAnimBtn) {
    toggleAnimBtn.addEventListener('click', (e) => {
      isAnimating = !isAnimating;
      (e.target as HTMLButtonElement).textContent = isAnimating ? '暂停动画' : '继续动画';
    });
  }

  window.addEventListener('resize', () => {
    engine.canvas.resizeByClientSize();
  });
}

// ============ 主入口 ============

async function main(): Promise<void> {
  console.log('=== BVH Raycasting Demo (Galacean Engine 3D) ===');

  try {
    await initEngine();
    setupMouseControls();
    setupEventListeners();
    createSceneObjects(config.objectCount);
    buildBVH();
    performRaycasts();
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
