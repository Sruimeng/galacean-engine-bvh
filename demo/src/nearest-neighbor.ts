/**
 * BVH Nearest Neighbor Demo - Galacean Engine 3D 版本
 * 展示 BVH 加速的最近邻搜索
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
  isNearest: boolean;
  nearestTo: number;
}

interface QueryPoint {
  entity: Entity;
  material: BlinnPhongMaterial;
  position: Vector3;
  velocity: Vector3;
  color: Color;
  nearestObject: SceneObject | null;
  distance: number;
  rangeEntity: Entity;
}

// ============ 全局状态 ============

let engine: WebGLEngine;
let cameraEntity: Entity;
let rootEntity: Entity;
let bvhTree: BVHTree | null = null;
let sceneObjects: SceneObject[] = [];
let queryPoints: QueryPoint[] = [];

// 相机控制状态
let cameraRadius = 80;
let cameraTheta = Math.PI / 4;
let cameraPhi = Math.PI / 4;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// 配置
const config = {
  objectCount: 500,
  maxDistance: 50,
  queryCount: 5,
  sceneSize: 100,
};

// 性能统计
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;

// 连接线实体
let connectionEntities: Entity[] = [];

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

    // 添加 MeshRenderer
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

    // 创建材质 - 蓝色系
    const material = new BlinnPhongMaterial(engine);
    const hue = 0.55 + Math.random() * 0.1; // 蓝色范围
    const color = hslToRgb(hue, 0.5, 0.4);
    material.baseColor.set(color.r, color.g, color.b, 1);
    renderer.setMaterial(material);

    sceneObjects.push({
      entity,
      renderer,
      material,
      originalColor: new Color(color.r, color.g, color.b, 1),
      id: i,
      isNearest: false,
      nearestTo: -1,
    });
  }

  console.log(`创建了 ${count} 个场景对象`);
}

// ============ 查询点创建 ============

function createQueryPoints(count: number): void {
  // 清除现有查询点
  for (const point of queryPoints) {
    point.entity.destroy();
    point.rangeEntity.destroy();
  }
  queryPoints = [];

  const colors = [
    new Color(1, 0.8, 0, 1), // 金色
    new Color(1, 0.4, 0.4, 1), // 红色
    new Color(0.4, 1, 0.4, 1), // 绿色
    new Color(0.4, 0.8, 1, 1), // 青色
    new Color(1, 0.4, 1, 1), // 粉色
  ];

  for (let i = 0; i < count; i++) {
    // 创建查询点实体
    const entity = rootEntity.createChild(`queryPoint_${i}`);

    const x = (Math.random() - 0.5) * config.sceneSize * 0.8;
    const y = (Math.random() - 0.5) * config.sceneSize * 0.8;
    const z = (Math.random() - 0.5) * config.sceneSize * 0.8;
    entity.transform.setPosition(x, y, z);
    entity.transform.setScale(1.5, 1.5, 1.5);

    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createSphere(engine, 0.5, 16, 16);

    const material = new BlinnPhongMaterial(engine);
    const color = colors[i % colors.length];
    material.baseColor.copyFrom(color);
    renderer.setMaterial(material);

    // 创建搜索范围可视化（半透明球体）
    const rangeEntity = rootEntity.createChild(`range_${i}`);
    rangeEntity.transform.setPosition(x, y, z);
    rangeEntity.transform.setScale(config.maxDistance, config.maxDistance, config.maxDistance);

    const rangeRenderer = rangeEntity.addComponent(MeshRenderer);
    rangeRenderer.mesh = PrimitiveMesh.createSphere(engine, 1, 16, 16);

    const rangeMaterial = new BlinnPhongMaterial(engine);
    rangeMaterial.baseColor.set(color.r, color.g, color.b, 0.1);
    rangeRenderer.setMaterial(rangeMaterial);

    queryPoints.push({
      entity,
      material,
      position: new Vector3(x, y, z),
      velocity: new Vector3(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
      ),
      color,
      nearestObject: null,
      distance: Infinity,
      rangeEntity,
    });
  }
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

// ============ 更新查询点位置 ============

function updateQueryPoints(): void {
  const halfScene = config.sceneSize * 0.4;

  for (const point of queryPoints) {
    // 更新位置
    point.position.x += point.velocity.x;
    point.position.y += point.velocity.y;
    point.position.z += point.velocity.z;

    // 边界反弹
    if (Math.abs(point.position.x) > halfScene) point.velocity.x *= -1;
    if (Math.abs(point.position.y) > halfScene) point.velocity.y *= -1;
    if (Math.abs(point.position.z) > halfScene) point.velocity.z *= -1;

    // 更新实体位置
    point.entity.transform.setPosition(point.position.x, point.position.y, point.position.z);
    point.rangeEntity.transform.setPosition(point.position.x, point.position.y, point.position.z);
  }
}

// ============ 清除连接线 ============

function clearConnections(): void {
  for (const entity of connectionEntities) {
    entity.destroy();
  }
  connectionEntities = [];
}

// ============ 创建连接线 ============

function createConnection(from: Vector3, to: Vector3, color: Color): void {
  const entity = rootEntity.createChild('connection');

  // 计算中点
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const midZ = (from.z + to.z) / 2;

  // 计算距离
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  entity.transform.setPosition(midX, midY, midZ);
  entity.transform.lookAt(new GalaceanVector3(to.x, to.y, to.z));
  entity.transform.setScale(0.1, 0.1, dist);

  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);

  const material = new BlinnPhongMaterial(engine);
  material.baseColor.copyFrom(color);
  renderer.setMaterial(material);

  connectionEntities.push(entity);
}

// ============ 执行最近邻搜索 ============

function performNearestSearch(): void {
  if (!bvhTree) return;

  const startTime = performance.now();

  // 清除连接线
  clearConnections();

  // 重置所有对象状态
  for (const obj of sceneObjects) {
    obj.isNearest = false;
    obj.nearestTo = -1;
    obj.material.baseColor.copyFrom(obj.originalColor);
  }

  let foundCount = 0;
  let totalDistance = 0;
  let minDistance = Infinity;

  // 对每个查询点执行搜索
  for (let i = 0; i < queryPoints.length; i++) {
    const point = queryPoints[i];
    const nearest = bvhTree.findNearest(point.position, config.maxDistance);

    if (nearest) {
      point.nearestObject = nearest as SceneObject;

      // 计算距离
      const bounds = point.nearestObject.renderer.bounds;
      const center = new Vector3(
        (bounds.min.x + bounds.max.x) / 2,
        (bounds.min.y + bounds.max.y) / 2,
        (bounds.min.z + bounds.max.z) / 2,
      );
      point.distance = Vector3.distance(point.position, center);

      // 高亮最近的对象
      const highlightColor = hslToRgb(0.1, 0.9, 0.6); // 橙色高亮
      point.nearestObject.material.baseColor.set(
        highlightColor.r,
        highlightColor.g,
        highlightColor.b,
        1,
      );
      point.nearestObject.isNearest = true;
      point.nearestObject.nearestTo = i;

      // 创建连接线
      createConnection(point.position, center, point.color);

      foundCount++;
      totalDistance += point.distance;
      minDistance = Math.min(minDistance, point.distance);
    } else {
      point.nearestObject = null;
      point.distance = Infinity;
    }
  }

  const queryTime = performance.now() - startTime;

  // 更新 UI
  const queryTimeEl = document.getElementById('queryTime');
  const foundCountEl = document.getElementById('foundCount');
  const avgDistanceEl = document.getElementById('avgDistance');
  const minDistanceEl = document.getElementById('minDistance');

  if (queryTimeEl) queryTimeEl.textContent = `${queryTime.toFixed(3)} ms`;
  if (foundCountEl) foundCountEl.textContent = `${foundCount}/${queryPoints.length}`;
  if (avgDistanceEl)
    avgDistanceEl.textContent = foundCount > 0 ? (totalDistance / foundCount).toFixed(2) : '-';
  if (minDistanceEl)
    minDistanceEl.textContent = minDistance < Infinity ? minDistance.toFixed(2) : '-';
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

    // 更新查询点位置
    updateQueryPoints();

    // 执行最近邻搜索
    performNearestSearch();

    requestAnimationFrame(loop);
  };

  loop();
}

// ============ 事件监听 ============

function setupEventListeners(): void {
  const objectCountEl = document.getElementById('objectCount') as HTMLInputElement;
  const maxDistanceEl = document.getElementById('maxDistance') as HTMLInputElement;
  const queryCountEl = document.getElementById('queryCount') as HTMLInputElement;
  const rebuildBtn = document.getElementById('rebuildBtn');

  if (objectCountEl) {
    objectCountEl.addEventListener('input', (e) => {
      config.objectCount = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('objectCountValue');
      if (valueEl) valueEl.textContent = config.objectCount.toString();
    });
  }

  if (maxDistanceEl) {
    maxDistanceEl.addEventListener('input', (e) => {
      config.maxDistance = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('maxDistanceValue');
      if (valueEl) valueEl.textContent = config.maxDistance.toString();

      // 更新范围可视化
      for (const point of queryPoints) {
        point.rangeEntity.transform.setScale(
          config.maxDistance,
          config.maxDistance,
          config.maxDistance,
        );
      }
    });
  }

  if (queryCountEl) {
    queryCountEl.addEventListener('input', (e) => {
      config.queryCount = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('queryCountValue');
      if (valueEl) valueEl.textContent = config.queryCount.toString();
    });
  }

  if (rebuildBtn) {
    rebuildBtn.addEventListener('click', () => {
      createSceneObjects(config.objectCount);
      createQueryPoints(config.queryCount);
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
  console.log('=== BVH Nearest Neighbor Demo (Galacean Engine 3D) ===');

  try {
    await initEngine();
    setupMouseControls();
    setupEventListeners();
    createSceneObjects(config.objectCount);
    createQueryPoints(config.queryCount);
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
