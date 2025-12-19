/**
 * Galacean Engine BVH 集成演示
 * 
 * 这个 demo 展示了如何将 BVH 库与 Galacean Engine 真正集成：
 * 1. 使用 Galacean Engine 渲染 3D 场景
 * 2. 从 Entity/MeshRenderer 获取包围盒
 * 3. 使用 BVH 进行高效的光线投射
 * 4. 验证 BVH 与引擎的兼容性
 */

import {
  WebGLEngine,
  Camera,
  MeshRenderer,
  PrimitiveMesh,
  Entity,
  Vector3 as GalaceanVector3,
  Color,
  DirectLight,
  BlinnPhongMaterial,
} from '@galacean/engine';
import { Vector3, BoundingBox, Ray as MathRay } from '@galacean/engine-math';
import { BVHTree, BVHBuilder, Ray, AABB, BVHBuildStrategy } from '../../dist/index.mjs';

// ============ 类型定义 ============

interface SceneObject {
  entity: Entity;
  renderer: MeshRenderer;
  material: BlinnPhongMaterial;
  originalColor: Color;
  id: number;
}

interface RaycastHit {
  object: SceneObject;
  distance: number;
  point: Vector3;
}

// ============ 全局状态 ============

let engine: WebGLEngine;
let cameraEntity: Entity;
let rootEntity: Entity;
let bvhTree: BVHTree | null = null;
let sceneObjects: SceneObject[] = [];
let highlightedObject: SceneObject | null = null;
let continuousRaycast = false;

// 存储 BVH 构建时的包围盒快照（用于验证）
let boundingBoxSnapshot: Map<number, BoundingBox> = new Map();

// 相机控制状态
let cameraRadius = 35;
let cameraTheta = Math.PI / 4;
let cameraPhi = Math.PI / 4;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// 配置
const config = {
  cubeCount: 100,
  buildStrategy: BVHBuildStrategy.SAH,
  sceneSize: 20,
};

// 性能统计
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;

// ============ 初始化引擎 ============

async function initEngine(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  
  // 创建 WebGL 引擎
  engine = await WebGLEngine.create({ canvas });
  engine.canvas.resizeByClientSize();
  
  // 创建根实体
  const scene = engine.sceneManager.activeScene;
  rootEntity = scene.createRootEntity('root');
  
  // 设置场景背景色
  scene.background.solidColor.set(0.1, 0.1, 0.15, 1);
  
  // 创建相机
  cameraEntity = rootEntity.createChild('camera');
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.farClipPlane = 1000;
  updateCameraPosition();
  
  // 创建方向光
  const lightEntity = rootEntity.createChild('light');
  lightEntity.transform.setPosition(10, 20, 10);
  lightEntity.transform.lookAt(new GalaceanVector3(0, 0, 0));
  const directLight = lightEntity.addComponent(DirectLight);
  directLight.intensity = 1.0;
  
  // 创建第二个方向光（补光）
  const lightEntity2 = rootEntity.createChild('light2');
  lightEntity2.transform.setPosition(-10, 10, -10);
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
    cameraRadius = Math.max(10, Math.min(100, cameraRadius + e.deltaY * 0.05));
    updateCameraPosition();
  });
  
  canvas.addEventListener('click', (e) => {
    if (!isDragging) {
      performRaycast(e.clientX, e.clientY);
    }
  });
}

// ============ 场景对象创建 ============

function createSceneObjects(count: number): void {
  // 清除现有对象
  for (const obj of sceneObjects) {
    obj.entity.destroy();
  }
  sceneObjects = [];
  highlightedObject = null;
  
  // 创建新对象
  for (let i = 0; i < count; i++) {
    const entity = rootEntity.createChild(`cube_${i}`);
    
    // 随机位置
    const x = (Math.random() - 0.5) * config.sceneSize;
    const y = (Math.random() - 0.5) * config.sceneSize;
    const z = (Math.random() - 0.5) * config.sceneSize;
    entity.transform.setPosition(x, y, z);
    
    // 随机大小
    const scale = 0.3 + Math.random() * 0.7;
    entity.transform.setScale(scale, scale, scale);
    
    // 随机旋转
    entity.transform.setRotation(
      Math.random() * 360,
      Math.random() * 360,
      Math.random() * 360
    );
    
    // 添加 MeshRenderer
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
    
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
  updateStats();
}

// ============ BVH 构建 ============

function buildBVH(): void {
  const startTime = performance.now();
  
  // 清空包围盒快照
  boundingBoxSnapshot.clear();
  
  // 从场景对象构建 BVH
  const insertObjects = sceneObjects.map(obj => {
    // 获取世界空间包围盒
    const bounds = obj.renderer.bounds;
    const boundingBox = new BoundingBox(
      new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
      new Vector3(bounds.max.x, bounds.max.y, bounds.max.z)
    );
    
    // 存储包围盒快照用于验证
    boundingBoxSnapshot.set(obj.id, boundingBox);
    
    return {
      bounds: boundingBox,
      userData: obj,
    };
  });
  
  bvhTree = BVHBuilder.build(insertObjects, config.buildStrategy);
  
  const buildTime = performance.now() - startTime;
  
  // 更新 UI
  const buildTimeEl = document.getElementById('buildTime');
  if (buildTimeEl) buildTimeEl.textContent = `${buildTime.toFixed(2)} ms`;
  
  const stats = bvhTree.getStats();
  const nodeCountEl = document.getElementById('nodeCount');
  const treeDepthEl = document.getElementById('treeDepth');
  if (nodeCountEl) nodeCountEl.textContent = stats.nodeCount.toString();
  if (treeDepthEl) treeDepthEl.textContent = stats.maxDepth.toString();
  
  // 验证 BVH 结构
  const validation = bvhTree.validate();
  if (!validation.valid) {
    console.error('BVH 验证失败:', validation.errors);
  } else {
    console.log('BVH 构建成功，验证通过');
  }
}

// ============ Raycast 实现 ============

function performRaycast(screenX: number, screenY: number): void {
  if (!bvhTree) return;
  
  const startTime = performance.now();
  
  // 从屏幕坐标创建射线
  const camera = cameraEntity.getComponent(Camera)!;
  const canvas = engine.canvas;
  
  // 获取 canvas 的实际位置
  const rect = (canvas._webCanvas as HTMLCanvasElement).getBoundingClientRect();
  const x = screenX - rect.left;
  const y = screenY - rect.top;
  
  const ray = new MathRay();
  camera.screenPointToRay(new GalaceanVector3(x, y, 0), ray);
  
  // 转换为 BVH 的 Ray 类型
  const bvhRay = new Ray(
    new Vector3(ray.origin.x, ray.origin.y, ray.origin.z),
    new Vector3(ray.direction.x, ray.direction.y, ray.direction.z)
  );
  
  // 使用 BVH 进行光线投射
  const results = bvhTree.raycast(bvhRay, 1000);
  
  const raycastTime = performance.now() - startTime;
  
  // 更新 UI
  const raycastTimeEl = document.getElementById('raycastTime');
  if (raycastTimeEl) raycastTimeEl.textContent = `${raycastTime.toFixed(3)} ms`;
  
  // 重置之前高亮的对象
  if (highlightedObject) {
    highlightedObject.material.baseColor.copyFrom(highlightedObject.originalColor);
    highlightedObject = null;
  }
  
  // 处理命中结果
  const hitStatusEl = document.getElementById('hitStatus');
  const hitIndicator = document.getElementById('hitIndicator');
  
  if (results.length > 0) {
    const hit = results[0];
    // 注意：CollisionResult 的 userData 存储在 object 属性中
    const hitObject = hit.object as SceneObject | undefined;
    
    // 安全检查 - 确保 hitObject 存在且有效
    if (hitObject && hitObject.material && typeof hitObject.id === 'number') {
      // 高亮命中的对象
      hitObject.material.baseColor.set(1, 1, 0, 1); // 黄色高亮
      highlightedObject = hitObject;
      
      if (hitStatusEl) hitStatusEl.textContent = `命中 #${hitObject.id}`;
      if (hitIndicator) {
        hitIndicator.className = 'hit-indicator hit';
      }
      
      console.log(`Raycast 命中: 对象 #${hitObject.id}, 距离: ${hit.distance.toFixed(2)}`);
    } else {
      // userData 无效
      if (hitStatusEl) hitStatusEl.textContent = '命中(无效数据)';
      if (hitIndicator) {
        hitIndicator.className = 'hit-indicator miss';
      }
      console.warn('Raycast 命中但 userData 无效:', hit);
    }
  } else {
    if (hitStatusEl) hitStatusEl.textContent = '未命中';
    if (hitIndicator) {
      hitIndicator.className = 'hit-indicator miss';
    }
  }
}

// ============ 暴力 Raycast（用于对比验证） ============

/**
 * 使用 BVH 构建时的包围盒快照进行暴力法 raycast
 * 这确保了与 BVH 比较时使用相同的包围盒数据
 */
function bruteForceRaycast(ray: Ray): RaycastHit | null {
  let closestHit: RaycastHit | null = null;
  let closestDistance = Infinity;
  
  for (const obj of sceneObjects) {
    // 使用 BVH 构建时存储的包围盒快照，而不是实时包围盒
    const bounds = boundingBoxSnapshot.get(obj.id);
    if (!bounds) continue;
    
    const aabb = new AABB(
      new Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
      new Vector3(bounds.max.x, bounds.max.y, bounds.max.z)
    );
    
    const distance = aabb.intersectRayDistance(ray);
    if (distance !== null && distance < closestDistance) {
      closestDistance = distance;
      closestHit = {
        object: obj,
        distance,
        point: ray.getPoint(distance),
      };
    }
  }
  
  return closestHit;
}

// ============ 验证 BVH 正确性 ============

function validateBVHCorrectness(): void {
  if (!bvhTree) {
    console.error('BVH 未构建');
    return;
  }
  
  console.log('开始验证 BVH 正确性...');
  
  let passed = 0;
  let failed = 0;
  const testCount = 100;
  
  for (let i = 0; i < testCount; i++) {
    // 生成随机射线
    const origin = new Vector3(
      (Math.random() - 0.5) * config.sceneSize * 2,
      (Math.random() - 0.5) * config.sceneSize * 2,
      (Math.random() - 0.5) * config.sceneSize * 2
    );
    const direction = new Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5
    );
    direction.normalize();
    
    const ray = new Ray(origin, direction);
    
    // BVH raycast
    const bvhResults = bvhTree.raycast(ray, 1000);
    const bvhHit = bvhResults.length > 0 ? bvhResults[0] : null;
    
    // 暴力 raycast
    const bruteHit = bruteForceRaycast(ray);
    
    // 比较结果 - 安全地获取 ID
    // 注意：CollisionResult 的 userData 存储在 object 属性中
    let bvhHitId = -1;
    let bvhHitDist = -1;
    if (bvhHit && bvhHit.object) {
      const userData = bvhHit.object as SceneObject;
      if (userData && typeof userData.id === 'number') {
        bvhHitId = userData.id;
        bvhHitDist = bvhHit.distance;
      }
    }
    const bruteHitId = bruteHit ? bruteHit.object.id : -1;
    const bruteHitDist = bruteHit ? bruteHit.distance : -1;
    
    // 比较距离而不是 ID（因为可能有多个对象在同一距离）
    // 允许小的浮点误差
    const distanceMatch = Math.abs(bvhHitDist - bruteHitDist) < 0.001;
    
    if (bvhHitId === bruteHitId || (bvhHitId !== -1 && bruteHitId !== -1 && distanceMatch)) {
      passed++;
    } else {
      failed++;
      console.warn(`测试 ${i} 失败: BVH 命中 #${bvhHitId} (dist=${bvhHitDist.toFixed(4)}), 暴力法命中 #${bruteHitId} (dist=${bruteHitDist.toFixed(4)})`);
      
      // 详细调试信息
      if (bruteHitId !== -1) {
        const bruteBounds = boundingBoxSnapshot.get(bruteHitId);
        if (bruteBounds) {
          const bruteAABB = new AABB(
            new Vector3(bruteBounds.min.x, bruteBounds.min.y, bruteBounds.min.z),
            new Vector3(bruteBounds.max.x, bruteBounds.max.y, bruteBounds.max.z)
          );
          const directDist = bruteAABB.intersectRayDistance(ray);
          console.log(`  暴力法对象 #${bruteHitId} 直接测试距离: ${directDist}`);
        }
      }
    }
  }
  
  console.log(`验证完成: ${passed}/${testCount} 通过, ${failed} 失败`);
  
  if (failed === 0) {
    console.log('✅ BVH 实现正确！所有测试通过。');
  } else {
    console.error('❌ BVH 实现存在问题，请检查。');
  }
}

// ============ UI 更新 ============

function updateStats(): void {
  const fpsEl = document.getElementById('fps');
  const objectCountEl = document.getElementById('objectCount');
  
  if (fpsEl) fpsEl.textContent = fps.toString();
  if (objectCountEl) objectCountEl.textContent = sceneObjects.length.toString();
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
      updateStats();
    }
    
    // 自动旋转（如果没有拖动）
    if (!isDragging) {
      cameraTheta += 0.002;
      updateCameraPosition();
    }
    
    // 连续 raycast 模式
    if (continuousRaycast && bvhTree) {
      const canvas = engine.canvas;
      const rect = (canvas._webCanvas as HTMLCanvasElement).getBoundingClientRect();
      performRaycast(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    
    requestAnimationFrame(loop);
  };
  
  loop();
}

// ============ 事件监听 ============

function setupEventListeners(): void {
  const cubeCountEl = document.getElementById('cubeCount') as HTMLInputElement;
  const buildStrategyEl = document.getElementById('buildStrategy') as HTMLSelectElement;
  const rebuildBtn = document.getElementById('rebuildBtn');
  const toggleRaycastBtn = document.getElementById('toggleRaycast');
  
  if (cubeCountEl) {
    cubeCountEl.addEventListener('input', (e) => {
      config.cubeCount = parseInt((e.target as HTMLInputElement).value);
      const valueEl = document.getElementById('cubeCountValue');
      if (valueEl) valueEl.textContent = config.cubeCount.toString();
    });
  }
  
  if (buildStrategyEl) {
    buildStrategyEl.addEventListener('change', (e) => {
      const strategies: Record<string, BVHBuildStrategy> = {
        'sah': BVHBuildStrategy.SAH,
        'median': BVHBuildStrategy.Median,
        'equal': BVHBuildStrategy.Equal,
      };
      config.buildStrategy = strategies[(e.target as HTMLSelectElement).value];
    });
  }
  
  if (rebuildBtn) {
    rebuildBtn.addEventListener('click', () => {
      createSceneObjects(config.cubeCount);
      buildBVH();
      validateBVHCorrectness();
    });
  }
  
  if (toggleRaycastBtn) {
    toggleRaycastBtn.addEventListener('click', (e) => {
      continuousRaycast = !continuousRaycast;
      (e.target as HTMLButtonElement).textContent = continuousRaycast ? '关闭连续 Raycast' : '开启连续 Raycast';
    });
  }
  
  // 窗口大小变化
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
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  return { r, g, b };
}

// ============ 主入口 ============

async function main(): Promise<void> {
  console.log('=== Galacean Engine BVH 集成演示 ===');
  
  try {
    // 初始化引擎
    await initEngine();
    
    // 设置鼠标控制
    setupMouseControls();
    
    // 设置事件监听
    setupEventListeners();
    
    // 创建场景对象
    createSceneObjects(config.cubeCount);
    
    // 构建 BVH
    buildBVH();
    
    // 验证 BVH 正确性
    validateBVHCorrectness();
    
    // 启动引擎
    engine.run();
    
    // 启动动画循环
    startAnimationLoop();
    
    console.log('引擎启动成功');
  } catch (error) {
    console.error('初始化失败:', error);
    throw error;
  }
}

// 启动
main();