/**
 * GLB Mesh BVH 性能对比测试
 * 
 * 这个 demo 展示了三角形级别的 BVH 加速与暴力遍历的性能对比：
 * 1. 加载 GLB 模型
 * 2. 从 Mesh 中提取顶点和索引数据
 * 3. 构建三角形级别的 BVH
 * 4. 对比 BVH raycast 和暴力法 raycast 的性能
 * 
 * 参考 three-mesh-bvh 的测试方式
 */

import type { Entity, GLTFResource } from '@galacean/engine';
import {
  AssetType,
  BlinnPhongMaterial,
  Camera,
  Color,
  DirectLight,
  Vector3 as GalaceanVector3,
  MeshRenderer,
  PrimitiveMesh,
  WebGLEngine,
  ModelMesh,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  VertexElement,
  VertexElementFormat,
} from '@galacean/engine';
import { Vector3 } from '@galacean/engine-math';
import { MeshBVH, Ray, BVHBuildStrategy } from '../../dist/index.mjs';
import type { MeshRaycastHit } from '../../dist/index.mjs';

// ============ 全局状态 ============

let engine: WebGLEngine;
let cameraEntity: Entity;
let rootEntity: Entity;
let meshBVH: MeshBVH | null = null;
let currentMesh: ModelMesh | null = null;
let modelEntity: Entity | null = null;

// 相机控制状态
let cameraRadius = 5;
let cameraTheta = Math.PI / 4;
let cameraPhi = Math.PI / 3;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

// 配置
const config = {
  rayCount: 1000,
  buildStrategy: BVHBuildStrategy.SAH,
};

// 性能统计
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;

// 测试结果
interface TestResult {
  bvhTime: number;
  bruteTime: number;
  bvhHits: number;
  bruteHits: number;
  speedup: number;
  triangleCount: number;
}

let lastTestResult: TestResult | null = null;

// ============ 初始化引擎 ============

async function initEngine(): Promise<void> {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  engine = await WebGLEngine.create({ canvas });
  engine.canvas.resizeByClientSize();

  const scene = engine.sceneManager.activeScene;
  rootEntity = scene.createRootEntity('root');

  scene.background.solidColor.set(0.1, 0.1, 0.15, 1);

  // 创建相机
  cameraEntity = rootEntity.createChild('camera');
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 60;
  camera.farClipPlane = 1000;
  camera.nearClipPlane = 0.01;
  updateCameraPosition();

  // 创建方向光
  const lightEntity = rootEntity.createChild('light');
  lightEntity.transform.setPosition(10, 20, 10);
  lightEntity.transform.lookAt(new GalaceanVector3(0, 0, 0));
  const directLight = lightEntity.addComponent(DirectLight);
  directLight.intensity = 1.0;

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
    cameraRadius = Math.max(0.5, Math.min(50, cameraRadius + e.deltaY * 0.01));
    updateCameraPosition();
  });
}

// ============ 加载 GLB 模型 ============

async function loadGLBModel(url: string): Promise<void> {
  const statusEl = document.getElementById('loadStatus');
  if (statusEl) statusEl.textContent = '加载中...';

  try {
    // 清除现有模型
    if (modelEntity) {
      modelEntity.destroy();
      modelEntity = null;
    }
    meshBVH = null;
    currentMesh = null;

    // 加载 GLB
    const gltfResource = await engine.resourceManager.load<GLTFResource>({
      url,
      type: AssetType.GLTF,
    });

    // 获取默认场景根实体
    const gltfRoot = gltfResource.defaultSceneRoot;
    if (!gltfRoot) {
      throw new Error('GLB 文件没有默认场景');
    }

    // 添加到场景
    modelEntity = gltfRoot;
    rootEntity.addChild(modelEntity);

    // 查找第一个 MeshRenderer 并提取几何数据
    const meshRenderer = findFirstMeshRenderer(modelEntity);
    if (!meshRenderer || !meshRenderer.mesh) {
      throw new Error('GLB 文件中没有找到 Mesh');
    }

    currentMesh = meshRenderer.mesh as ModelMesh;

    // 自动调整相机距离
    const bounds = meshRenderer.bounds;
    const size = new GalaceanVector3();
    bounds.getExtent(size);
    const maxSize = Math.max(size.x, size.y, size.z) * 2;
    cameraRadius = maxSize * 2;
    updateCameraPosition();

    // 更新 UI
    if (statusEl) statusEl.textContent = '加载成功';
    
    const meshInfoEl = document.getElementById('meshInfo');
    if (meshInfoEl) {
      const vertexCount = currentMesh.vertexCount;
      // 估算三角形数量
      let triangleCount = 0;
      const subMeshCount = currentMesh.subMeshCount;
      for (let i = 0; i < subMeshCount; i++) {
        const subMesh = currentMesh.getSubMesh(i);
        triangleCount += Math.floor(subMesh.count / 3);
      }
      meshInfoEl.textContent = `顶点: ${vertexCount.toLocaleString()}, 三角形: ${triangleCount.toLocaleString()}`;
    }

    console.log('GLB 模型加载成功');
  } catch (error) {
    console.error('加载 GLB 失败:', error);
    if (statusEl) statusEl.textContent = `加载失败: ${error}`;
  }
}

/**
 * 递归查找第一个 MeshRenderer
 */
function findFirstMeshRenderer(entity: Entity): MeshRenderer | null {
  const renderer = entity.getComponent(MeshRenderer);
  if (renderer && renderer.mesh) {
    return renderer;
  }

  for (let i = 0; i < entity.childCount; i++) {
    const child = entity.getChild(i);
    const found = findFirstMeshRenderer(child);
    if (found) return found;
  }

  return null;
}

// ============ 从 Mesh 提取几何数据 ============

interface GeometryData {
  positions: Float32Array;
  indices: Uint16Array | Uint32Array | null;
}

function extractGeometryData(mesh: ModelMesh): GeometryData | null {
  try {
    // 获取顶点位置数据
    const positions = mesh.getPositions();
    if (!positions || positions.length === 0) {
      console.error('无法获取顶点位置数据');
      return null;
    }

    // 转换为 Float32Array
    const positionArray = new Float32Array(positions.length * 3);
    for (let i = 0; i < positions.length; i++) {
      positionArray[i * 3] = positions[i].x;
      positionArray[i * 3 + 1] = positions[i].y;
      positionArray[i * 3 + 2] = positions[i].z;
    }

    // 获取索引数据
    const indices = mesh.getIndices();
    let indexArray: Uint16Array | Uint32Array | null = null;
    if (indices && indices.length > 0) {
      // 根据顶点数量选择索引类型
      if (positions.length > 65535) {
        indexArray = new Uint32Array(indices);
      } else {
        indexArray = new Uint16Array(indices);
      }
    }

    return {
      positions: positionArray,
      indices: indexArray,
    };
  } catch (error) {
    console.error('提取几何数据失败:', error);
    return null;
  }
}

// ============ 构建 BVH ============

function buildMeshBVH(): void {
  // 优先使用保存的几何数据（示例几何体）
  let geometryData: GeometryData | null = currentGeometryData;

  // 如果没有保存的几何数据，尝试从 Mesh 提取（GLB 模型）
  if (!geometryData && currentMesh) {
    geometryData = extractGeometryData(currentMesh);
  }

  if (!geometryData) {
    console.error('没有可用的几何数据');
    const buildTimeEl = document.getElementById('buildTime');
    if (buildTimeEl) buildTimeEl.textContent = '没有几何数据';
    return;
  }

  const buildTimeEl = document.getElementById('buildTime');
  const triangleCountEl = document.getElementById('triangleCount');
  const nodeCountEl = document.getElementById('nodeCount');
  const treeDepthEl = document.getElementById('treeDepth');

  // 构建 BVH
  const startTime = performance.now();

  meshBVH = new MeshBVH(10, 40, config.buildStrategy);
  meshBVH.buildFromGeometry(geometryData.positions, geometryData.indices || undefined);

  const buildTime = performance.now() - startTime;

  // 更新 UI
  if (buildTimeEl) buildTimeEl.textContent = `${buildTime.toFixed(2)} ms`;

  const stats = meshBVH.getStats();
  if (triangleCountEl) triangleCountEl.textContent = stats.triangleCount.toLocaleString();
  if (nodeCountEl) nodeCountEl.textContent = stats.nodeCount.toLocaleString();
  if (treeDepthEl) treeDepthEl.textContent = stats.maxDepth.toString();

  console.log(`MeshBVH 构建完成: ${buildTime.toFixed(2)}ms`);
  console.log(`  三角形数: ${stats.triangleCount}`);
  console.log(`  节点数: ${stats.nodeCount}`);
  console.log(`  最大深度: ${stats.maxDepth}`);
  console.log(`  平均每叶子三角形数: ${stats.avgTrianglesPerLeaf.toFixed(1)}`);
}

// ============ 运行性能对比测试 ============

function runPerformanceTest(): void {
  if (!meshBVH) {
    console.error('BVH 未构建');
    return;
  }

  const testCount = config.rayCount;
  console.log(`开始性能对比测试 (${testCount} 次 raycast)...`);

  // 获取模型包围盒
  const bounds = meshBVH.getBounds();
  if (!bounds) {
    console.error('无法获取包围盒');
    return;
  }

  // 计算包围盒中心和大小
  const center = new Vector3();
  Vector3.add(bounds.min, bounds.max, center);
  center.scale(0.5);

  const size = new Vector3();
  Vector3.subtract(bounds.max, bounds.min, size);
  const maxSize = Math.max(size.x, size.y, size.z);

  // 生成随机射线（从包围盒外部射向中心区域）
  const rays: Ray[] = [];
  for (let i = 0; i < testCount; i++) {
    // 随机方向
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    // 从包围盒外部的球面上发射
    const radius = maxSize * 2;
    const origin = new Vector3(
      center.x + radius * Math.sin(phi) * Math.cos(theta),
      center.y + radius * Math.cos(phi),
      center.z + radius * Math.sin(phi) * Math.sin(theta)
    );

    // 方向指向中心附近的随机点
    const target = new Vector3(
      center.x + (Math.random() - 0.5) * maxSize * 0.5,
      center.y + (Math.random() - 0.5) * maxSize * 0.5,
      center.z + (Math.random() - 0.5) * maxSize * 0.5
    );

    const direction = new Vector3();
    Vector3.subtract(target, origin, direction);
    direction.normalize();

    rays.push(new Ray(origin, direction));
  }

  const maxDistance = maxSize * 4;

  // BVH 测试
  const bvhStart = performance.now();
  let bvhHits = 0;
  for (const ray of rays) {
    const hit = meshBVH.raycastFirst(ray, maxDistance);
    if (hit) bvhHits++;
  }
  const bvhTime = performance.now() - bvhStart;

  // 暴力法测试
  const bruteStart = performance.now();
  let bruteHits = 0;
  for (const ray of rays) {
    const hit = meshBVH.raycastBruteForce(ray, maxDistance);
    if (hit) bruteHits++;
  }
  const bruteTime = performance.now() - bruteStart;

  // 计算加速比
  const speedup = bruteTime / bvhTime;

  // 保存结果
  lastTestResult = {
    bvhTime,
    bruteTime,
    bvhHits,
    bruteHits,
    speedup,
    triangleCount: meshBVH.triangleCount,
  };

  // 更新 UI
  updateTestResults();

  console.log(`性能对比结果:`);
  console.log(`  BVH: ${bvhTime.toFixed(2)}ms, ${bvhHits} 命中`);
  console.log(`  暴力法: ${bruteTime.toFixed(2)}ms, ${bruteHits} 命中`);
  console.log(`  加速比: ${speedup.toFixed(1)}x`);
}

function updateTestResults(): void {
  if (!lastTestResult) return;

  const bvhTimeEl = document.getElementById('bvhTime');
  const bruteTimeEl = document.getElementById('bruteTime');
  const speedupEl = document.getElementById('speedup');
  const bvhQPSEl = document.getElementById('bvhQPS');
  const bruteQPSEl = document.getElementById('bruteQPS');
  const bvhBarEl = document.getElementById('bvhBar');
  const bruteBarEl = document.getElementById('bruteBar');
  const hitRateEl = document.getElementById('hitRate');
  const resultsPanel = document.getElementById('resultsPanel');

  if (bvhTimeEl) bvhTimeEl.textContent = `${lastTestResult.bvhTime.toFixed(2)} ms`;
  if (bruteTimeEl) bruteTimeEl.textContent = `${lastTestResult.bruteTime.toFixed(2)} ms`;
  if (speedupEl) speedupEl.textContent = `${lastTestResult.speedup.toFixed(1)}x`;

  const bvhQPS = (config.rayCount / lastTestResult.bvhTime) * 1000;
  const bruteQPS = (config.rayCount / lastTestResult.bruteTime) * 1000;
  if (bvhQPSEl) bvhQPSEl.textContent = bvhQPS.toFixed(0);
  if (bruteQPSEl) bruteQPSEl.textContent = bruteQPS.toFixed(0);

  // 更新进度条
  if (bvhBarEl && bruteBarEl) {
    const maxTime = Math.max(lastTestResult.bvhTime, lastTestResult.bruteTime);
    bvhBarEl.style.width = `${(lastTestResult.bvhTime / maxTime) * 100}%`;
    bruteBarEl.style.width = `${(lastTestResult.bruteTime / maxTime) * 100}%`;
  }

  // 命中率
  if (hitRateEl) {
    const hitRate = (lastTestResult.bvhHits / config.rayCount) * 100;
    hitRateEl.textContent = `${hitRate.toFixed(1)}%`;
  }

  // 显示结果面板
  if (resultsPanel) resultsPanel.style.display = 'block';
}

// ============ 验证正确性 ============

function validateCorrectness(): void {
  if (!meshBVH) {
    console.error('BVH 未构建');
    return;
  }

  console.log('开始验证 BVH 正确性...');

  const bounds = meshBVH.getBounds();
  if (!bounds) {
    console.error('无法获取包围盒');
    return;
  }

  const center = new Vector3();
  Vector3.add(bounds.min, bounds.max, center);
  center.scale(0.5);

  const size = new Vector3();
  Vector3.subtract(bounds.max, bounds.min, size);
  const maxSize = Math.max(size.x, size.y, size.z);

  let passed = 0;
  let failed = 0;
  const testCount = 100;

  for (let i = 0; i < testCount; i++) {
    // 生成随机射线
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = maxSize * 2;

    const origin = new Vector3(
      center.x + radius * Math.sin(phi) * Math.cos(theta),
      center.y + radius * Math.cos(phi),
      center.z + radius * Math.sin(phi) * Math.sin(theta)
    );

    const target = new Vector3(
      center.x + (Math.random() - 0.5) * maxSize * 0.5,
      center.y + (Math.random() - 0.5) * maxSize * 0.5,
      center.z + (Math.random() - 0.5) * maxSize * 0.5
    );

    const direction = new Vector3();
    Vector3.subtract(target, origin, direction);
    direction.normalize();

    const ray = new Ray(origin, direction);
    const maxDistance = maxSize * 4;

    // BVH raycast
    const bvhHit = meshBVH.raycastFirst(ray, maxDistance);

    // 暴力 raycast
    const bruteHit = meshBVH.raycastBruteForce(ray, maxDistance);

    // 比较结果
    const bvhDist = bvhHit ? bvhHit.distance : -1;
    const bruteDist = bruteHit ? bruteHit.distance : -1;

    // 允许小的浮点误差
    const distanceMatch = Math.abs(bvhDist - bruteDist) < 0.0001;

    if (distanceMatch) {
      passed++;
    } else {
      failed++;
      console.warn(
        `测试 ${i} 失败: BVH dist=${bvhDist.toFixed(6)}, 暴力法 dist=${bruteDist.toFixed(6)}`
      );
    }
  }

  console.log(`验证完成: ${passed}/${testCount} 通过, ${failed} 失败`);

  const validationEl = document.getElementById('validationResult');
  if (validationEl) {
    if (failed === 0) {
      validationEl.textContent = `✅ 验证通过 (${passed}/${testCount})`;
      validationEl.className = 'validation-pass';
    } else {
      validationEl.textContent = `❌ 验证失败 (${passed}/${testCount})`;
      validationEl.className = 'validation-fail';
    }
  }
}

// ============ 创建示例几何体 ============

// 存储当前几何体的原始数据（用于 BVH 构建）
let currentGeometryData: GeometryData | null = null;

/**
 * 生成球体几何数据
 */
function generateSphereGeometry(radius: number, widthSegments: number, heightSegments: number): GeometryData {
  const positions: number[] = [];
  const indices: number[] = [];

  // 生成顶点
  for (let y = 0; y <= heightSegments; y++) {
    const v = y / heightSegments;
    const phi = v * Math.PI;

    for (let x = 0; x <= widthSegments; x++) {
      const u = x / widthSegments;
      const theta = u * Math.PI * 2;

      const px = radius * Math.sin(phi) * Math.cos(theta);
      const py = radius * Math.cos(phi);
      const pz = radius * Math.sin(phi) * Math.sin(theta);

      positions.push(px, py, pz);
    }
  }

  // 生成索引
  for (let y = 0; y < heightSegments; y++) {
    for (let x = 0; x < widthSegments; x++) {
      const a = y * (widthSegments + 1) + x;
      const b = a + widthSegments + 1;
      const c = a + 1;
      const d = b + 1;

      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
}

/**
 * 生成立方体几何数据
 */
function generateCubeGeometry(width: number, height: number, depth: number): GeometryData {
  const hw = width / 2;
  const hh = height / 2;
  const hd = depth / 2;

  const positions = new Float32Array([
    // Front face
    -hw, -hh, hd,  hw, -hh, hd,  hw, hh, hd,  -hw, hh, hd,
    // Back face
    hw, -hh, -hd,  -hw, -hh, -hd,  -hw, hh, -hd,  hw, hh, -hd,
    // Top face
    -hw, hh, hd,  hw, hh, hd,  hw, hh, -hd,  -hw, hh, -hd,
    // Bottom face
    -hw, -hh, -hd,  hw, -hh, -hd,  hw, -hh, hd,  -hw, -hh, hd,
    // Right face
    hw, -hh, hd,  hw, -hh, -hd,  hw, hh, -hd,  hw, hh, hd,
    // Left face
    -hw, -hh, -hd,  -hw, -hh, hd,  -hw, hh, hd,  -hw, hh, -hd,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,       // Front
    4, 5, 6, 4, 6, 7,       // Back
    8, 9, 10, 8, 10, 11,    // Top
    12, 13, 14, 12, 14, 15, // Bottom
    16, 17, 18, 16, 18, 19, // Right
    20, 21, 22, 20, 22, 23, // Left
  ]);

  return { positions, indices };
}

/**
 * 生成圆环几何数据
 */
function generateTorusGeometry(radius: number, tube: number, radialSegments: number, tubularSegments: number): GeometryData {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= radialSegments; j++) {
    for (let i = 0; i <= tubularSegments; i++) {
      const u = (i / tubularSegments) * Math.PI * 2;
      const v = (j / radialSegments) * Math.PI * 2;

      const x = (radius + tube * Math.cos(v)) * Math.cos(u);
      const y = tube * Math.sin(v);
      const z = (radius + tube * Math.cos(v)) * Math.sin(u);

      positions.push(x, y, z);
    }
  }

  for (let j = 1; j <= radialSegments; j++) {
    for (let i = 1; i <= tubularSegments; i++) {
      const a = (tubularSegments + 1) * j + i - 1;
      const b = (tubularSegments + 1) * (j - 1) + i - 1;
      const c = (tubularSegments + 1) * (j - 1) + i;
      const d = (tubularSegments + 1) * j + i;

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
}

/**
 * 生成圆柱体几何数据
 */
function generateCylinderGeometry(radiusTop: number, radiusBottom: number, height: number, radialSegments: number): GeometryData {
  const positions: number[] = [];
  const indices: number[] = [];
  const halfHeight = height / 2;

  // 侧面顶点
  for (let y = 0; y <= 1; y++) {
    const radius = y === 0 ? radiusBottom : radiusTop;
    const posY = y * height - halfHeight;

    for (let x = 0; x <= radialSegments; x++) {
      const u = x / radialSegments;
      const theta = u * Math.PI * 2;

      positions.push(
        radius * Math.cos(theta),
        posY,
        radius * Math.sin(theta)
      );
    }
  }

  // 侧面索引
  for (let x = 0; x < radialSegments; x++) {
    const a = x;
    const b = x + radialSegments + 1;
    const c = x + 1;
    const d = x + radialSegments + 2;

    indices.push(a, b, c);
    indices.push(b, d, c);
  }

  // 顶面中心点
  const topCenterIndex = positions.length / 3;
  positions.push(0, halfHeight, 0);

  // 顶面边缘顶点
  for (let x = 0; x <= radialSegments; x++) {
    const u = x / radialSegments;
    const theta = u * Math.PI * 2;
    positions.push(
      radiusTop * Math.cos(theta),
      halfHeight,
      radiusTop * Math.sin(theta)
    );
  }

  // 顶面索引
  for (let x = 0; x < radialSegments; x++) {
    indices.push(topCenterIndex, topCenterIndex + x + 1, topCenterIndex + x + 2);
  }

  // 底面中心点
  const bottomCenterIndex = positions.length / 3;
  positions.push(0, -halfHeight, 0);

  // 底面边缘顶点
  for (let x = 0; x <= radialSegments; x++) {
    const u = x / radialSegments;
    const theta = u * Math.PI * 2;
    positions.push(
      radiusBottom * Math.cos(theta),
      -halfHeight,
      radiusBottom * Math.sin(theta)
    );
  }

  // 底面索引
  for (let x = 0; x < radialSegments; x++) {
    indices.push(bottomCenterIndex, bottomCenterIndex + x + 2, bottomCenterIndex + x + 1);
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
}

/**
 * 生成圆锥几何数据
 */
function generateConeGeometry(radius: number, height: number, radialSegments: number): GeometryData {
  return generateCylinderGeometry(0, radius, height, radialSegments);
}

function createSampleGeometry(type: string): void {
  // 清除现有模型
  if (modelEntity) {
    modelEntity.destroy();
    modelEntity = null;
  }
  meshBVH = null;
  currentMesh = null;
  currentGeometryData = null;

  // 生成几何数据
  let geometryData: GeometryData;
  switch (type) {
    case 'sphere':
      geometryData = generateSphereGeometry(1, 64, 64);
      break;
    case 'torus':
      geometryData = generateTorusGeometry(0.5, 0.2, 32, 64);
      break;
    case 'cylinder':
      geometryData = generateCylinderGeometry(0.5, 0.5, 2, 64);
      break;
    case 'cone':
      geometryData = generateConeGeometry(0.5, 2, 64);
      break;
    default:
      geometryData = generateCubeGeometry(1, 1, 1);
  }

  // 保存几何数据用于 BVH 构建
  currentGeometryData = geometryData;

  // 创建新的实体
  modelEntity = rootEntity.createChild('sample');
  const renderer = modelEntity.addComponent(MeshRenderer);
  const material = new BlinnPhongMaterial(engine);
  material.baseColor.set(0.6, 0.6, 0.8, 1);
  renderer.setMaterial(material);

  // 使用 PrimitiveMesh 创建用于渲染的 Mesh
  let mesh: ModelMesh;
  switch (type) {
    case 'sphere':
      mesh = PrimitiveMesh.createSphere(engine, 1, 64, 64) as ModelMesh;
      break;
    case 'torus':
      mesh = PrimitiveMesh.createTorus(engine, 0.5, 0.2, 64, 32) as ModelMesh;
      break;
    case 'cylinder':
      mesh = PrimitiveMesh.createCylinder(engine, 0.5, 0.5, 2, 64, 1) as ModelMesh;
      break;
    case 'cone':
      mesh = PrimitiveMesh.createCone(engine, 0.5, 2, 64) as ModelMesh;
      break;
    default:
      mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1) as ModelMesh;
  }

  renderer.mesh = mesh;
  currentMesh = mesh;

  // 调整相机
  cameraRadius = 5;
  updateCameraPosition();

  // 更新 UI
  const statusEl = document.getElementById('loadStatus');
  if (statusEl) statusEl.textContent = `已创建 ${type}`;

  // 计算三角形数量
  const triangleCount = geometryData.indices
    ? Math.floor(geometryData.indices.length / 3)
    : Math.floor(geometryData.positions.length / 9);

  const meshInfoEl = document.getElementById('meshInfo');
  if (meshInfoEl) {
    const vertexCount = Math.floor(geometryData.positions.length / 3);
    meshInfoEl.textContent = `顶点: ${vertexCount.toLocaleString()}, 三角形: ${triangleCount.toLocaleString()}`;
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
    if (!isDragging && modelEntity) {
      modelEntity.transform.rotate(0, 0.2, 0);
    }

    requestAnimationFrame(loop);
  };

  loop();
}

// ============ 事件监听 ============

function setupEventListeners(): void {
  // GLB URL 输入
  const glbUrlInput = document.getElementById('glbUrl') as HTMLInputElement;
  const loadGlbBtn = document.getElementById('loadGlbBtn');
  
  if (loadGlbBtn && glbUrlInput) {
    loadGlbBtn.addEventListener('click', () => {
      const url = glbUrlInput.value.trim();
      if (url) {
        loadGLBModel(url);
      }
    });
  }

  // 示例几何体按钮
  const sampleBtns = document.querySelectorAll('.sample-btn');
  sampleBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = (e.target as HTMLElement).dataset.type;
      if (type) {
        createSampleGeometry(type);
      }
    });
  });

  // 构建策略选择
  const strategySelect = document.getElementById('buildStrategy') as HTMLSelectElement;
  if (strategySelect) {
    strategySelect.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      const strategies: Record<string, BVHBuildStrategy> = {
        sah: BVHBuildStrategy.SAH,
        median: BVHBuildStrategy.Median,
        equal: BVHBuildStrategy.Equal,
      };
      config.buildStrategy = strategies[value] || BVHBuildStrategy.SAH;
    });
  }

  // 射线数量
  const rayCountInput = document.getElementById('rayCount') as HTMLInputElement;
  if (rayCountInput) {
    rayCountInput.addEventListener('input', (e) => {
      config.rayCount = parseInt((e.target as HTMLInputElement).value) || 1000;
      const valueEl = document.getElementById('rayCountValue');
      if (valueEl) valueEl.textContent = config.rayCount.toString();
    });
  }

  // 构建 BVH 按钮
  const buildBvhBtn = document.getElementById('buildBvhBtn');
  if (buildBvhBtn) {
    buildBvhBtn.addEventListener('click', buildMeshBVH);
  }

  // 运行测试按钮
  const runTestBtn = document.getElementById('runTestBtn');
  if (runTestBtn) {
    runTestBtn.addEventListener('click', runPerformanceTest);
  }

  // 验证正确性按钮
  const validateBtn = document.getElementById('validateBtn');
  if (validateBtn) {
    validateBtn.addEventListener('click', validateCorrectness);
  }

  // 窗口大小变化
  window.addEventListener('resize', () => {
    engine.canvas.resizeByClientSize();
  });
}

// ============ 主入口 ============

async function main(): Promise<void> {
  console.log('=== GLB Mesh BVH 性能对比测试 ===');

  try {
    await initEngine();
    setupMouseControls();
    setupEventListeners();

    // 创建默认的示例几何体
    createSampleGeometry('sphere');

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