/**
 * BVH Range Query Demo - Galacean Engine 3D 版本
 * 展示 BVH 加速的范围查询
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
import { BVHBuilder, BVHBuildStrategy } from '../../dist/index.mjs';

// ============ 类型定义 ============

interface SceneObject {
  entity: Entity;
  renderer: MeshRenderer;
  material: BlinnPhongMaterial;
  originalColor: Color;
  id: number;
  inRange: boolean;
}

// ============ 全局状态 ============

let engine: WebGLEngine;
let cameraEntity: Entity;
let rootEntity: Entity;
let bvhTree: BVHTree | null = null;
let sceneObjects: SceneObject[] = [];

// 查询中心点
const queryCenter = new Vector3(0, 0, 0);
let queryCenterEntity: Entity;
let queryRangeEntity: Entity;

// 相机控制状态
let cameraRadius = 80;
let cameraTheta = Math.PI / 4;
let cameraPhi = Math.PI / 4;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let mouseX = 0.5;
let mouseY = 0.5;

// 配置
const config = {
  objectCount: 1000,
  queryRadius: 20,
  moveSpeed: 50,
  sceneSize: 100,
};

// 性能统计
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;

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

  // 创建查询中心点
  queryCenterEntity = rootEntity.createChild('queryCenter');
  queryCenterEntity.transform.setScale(2, 2, 2);
  const centerRenderer = queryCenterEntity.addComponent(MeshRenderer);
  centerRenderer.mesh = PrimitiveMesh.createSphere(engine, 0.5, 16, 16);
  const centerMaterial = new BlinnPhongMaterial(engine);
  centerMaterial.baseColor.set(1, 0.9, 0.2, 1); // 黄色
  centerRenderer.setMaterial(centerMaterial);

  // 创建查询范围可视化（半透明球体）
  queryRangeEntity = rootEntity.createChild('queryRange');
  const rangeRenderer = queryRangeEntity.addComponent(MeshRenderer);
  rangeRenderer.mesh = PrimitiveMesh.createSphere(engine, 1, 32, 32);
  const rangeMaterial = new BlinnPhongMaterial(engine);
  rangeMaterial.baseColor.set(0.5, 0.8, 0.5, 0.15); // 半透明绿色
  rangeRenderer.setMaterial(rangeMaterial);
  updateQueryRangeSize();

  console.log('Galacean Engine 初始化完成');
}

// ============ 相机控制 ============

function updateCameraPosition(): void {
  const x = cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
  const y = cameraRadius * Math.cos(cameraPhi);
  const z = cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);

  cameraEntity.transform.setPosition(x, y, z);
  cameraEntity.transform.lookAt(new GalaceanVector3(0, 0, 0));
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
    // 更新鼠标位置（用于控制查询中心）
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) / rect.width;
    mouseY = (e.clientY - rect.top) / rect.height;

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
    const entity = rootEntity.createChild(`cube_${i}`);

    // 随机位置
    const x = (Math.random() - 0.5) * config.sceneSize;
    const y = (Math.random() - 0.5) * config.sceneSize;
    const z = (Math.random() - 0.5) * config.sceneSize;
    entity.transform.setPosition(x, y, z);

    // 随机大小
    const scale = 0.5 + Math.random() * 1.0;
    entity.transform.setScale(scale, scale, scale);

    // 随机旋转
    entity.transform.setRotation(Math.random() * 360, Math.random() * 360, Math.random() * 360);

    // 添加 MeshRenderer
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

    // 创建材质 - 蓝色系
    const material = new BlinnPhongMaterial(engine);
    const hue = 0.55 + Math.random() * 0.1; // 蓝色范围
    const color = hslToRgb(hue, 0.6, 0.4);
    material.baseColor.set(color.r, color.g, color.b, 1);
    renderer.setMaterial(material);

    sceneObjects.push({
      entity,
      renderer,
      material,
      originalColor: new Color(color.r, color.g, color.b, 1),
      id: i,
      inRange: false,
    });
  }

  const totalCountEl = document.getElementById('totalCount');
  if (totalCountEl) totalCountEl.textContent = count.toString();

  console.log(`创建了 ${count} 个场景对象`);
}

// ============ BVH 构建 ============

function buildBVH(): void {
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

  bvhTree = BVHBuilder.build(insertObjects, BVHBuildStrategy.SAH);
}

// ============ 更新查询范围大小 ============

function updateQueryRangeSize(): void {
  const scale = config.queryRadius * 2;
  queryRangeEntity.transform.setScale(scale, scale, scale);
}

// ============ 更新查询中心位置 ============

function updateQueryCenter(time: number): void {
  // 根据鼠标位置和时间更新查询中心
  const targetX = (mouseX - 0.5) * config.sceneSize;
  const targetY = -(mouseY - 0.5) * config.sceneSize;
  const speed = config.moveSpeed / 1000;

  queryCenter.x += (targetX - queryCenter.x) * speed;
  queryCenter.y += (targetY - queryCenter.y) * speed;
  queryCenter.z = Math.sin(time * 0.001) * config.sceneSize * 0.3;

  queryCenterEntity.transform.setPosition(queryCenter.x, queryCenter.y, queryCenter.z);
  queryRangeEntity.transform.setPosition(queryCenter.x, queryCenter.y, queryCenter.z);
}

// ============ 执行范围查询 ============

function performRangeQuery(): number {
  if (!bvhTree) return 0;

  const startTime = performance.now();

  // 重置所有对象状态
  for (const obj of sceneObjects) {
    obj.inRange = false;
    obj.material.baseColor.copyFrom(obj.originalColor);
  }

  // 执行查询
  const results = bvhTree.queryRange(queryCenter, config.queryRadius);

  // 标记范围内的对象
  for (const userData of results) {
    const obj = userData as SceneObject;
    if (obj && typeof obj.id === 'number') {
      obj.inRange = true;
      // 高亮为绿色
      const highlightColor = hslToRgb(0.35, 0.8, 0.6);
      obj.material.baseColor.set(highlightColor.r, highlightColor.g, highlightColor.b, 1);
    }
  }

  const queryTime = performance.now() - startTime;

  // 更新 UI
  const queryTimeEl = document.getElementById('queryTime');
  const foundCountEl = document.getElementById('foundCount');
  const foundRateEl = document.getElementById('foundRate');

  if (queryTimeEl) queryTimeEl.textContent = `${queryTime.toFixed(3)} ms`;
  if (foundCountEl) foundCountEl.textContent = results.length.toString();
  if (foundRateEl) foundRateEl.textContent = results.length.toString();

  return results.length;
}

// ============ 动画循环 ============

function startAnimationLoop(): void {
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
    if (!isDragging) {
      cameraTheta += 0.002;
      updateCameraPosition();
    }

    // 更新查询中心位置
    updateQueryCenter(time);

    // 执行范围查询
    performRangeQuery();

    requestAnimationFrame(loop);
  };

  loop(0);
}

// ============ 事件监听 ============

function setupEventListeners(): void {
  const objectCountEl = document.getElementById('objectCount') as HTMLInputElement;
  const queryRadiusEl = document.getElementById('queryRadius') as HTMLInputElement;
  const moveSpeedEl = document.getElementById('moveSpeed') as HTMLInputElement;
  const rebuildBtn = document.getElementById('rebuildBtn');

  if (objectCountEl) {
    objectCountEl.addEventListener('input', (e) => {
      config.objectCount = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('objectCountValue');
      if (valueEl) valueEl.textContent = config.objectCount.toString();
    });
  }

  if (queryRadiusEl) {
    queryRadiusEl.addEventListener('input', (e) => {
      config.queryRadius = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('queryRadiusValue');
      if (valueEl) valueEl.textContent = config.queryRadius.toString();
      updateQueryRangeSize();
    });
  }

  if (moveSpeedEl) {
    moveSpeedEl.addEventListener('input', (e) => {
      config.moveSpeed = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('moveSpeedValue');
      if (valueEl) valueEl.textContent = config.moveSpeed.toString();
    });
  }

  if (rebuildBtn) {
    rebuildBtn.addEventListener('click', () => {
      createSceneObjects(config.objectCount);
      buildBVH();
    });
  }

  window.addEventListener('resize', () => {
    engine.canvas.resizeByClientSize();
  });
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

// ============ 主入口 ============

async function main(): Promise<void> {
  console.log('=== BVH Range Query Demo (Galacean Engine 3D) ===');

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

// 导出 init 函数以保持兼容性
export function init() {
  main();
}

// 启动
main();
