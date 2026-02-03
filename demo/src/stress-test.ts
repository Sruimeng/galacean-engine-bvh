/**
 * BVH Stress Test Demo
 * 测试大规模场景下的 BVH 性能极限
 *
 * 注意：这个 demo 主要是数据展示，不需要 3D 渲染
 */

import { BoundingBox, Vector3 } from '@galacean/engine-math';
import { BVHBuilder, BVHBuildStrategy, Ray } from '../../dist/index.mjs';

// ============ 配置 ============

const config = {
  objectCount: 100000,
  buildStrategy: BVHBuildStrategy.Median,
  raycastCount: 5000,
  rangeQueryCount: 1000,
  sceneSize: 1000,
};

// 策略映射
const strategies: Record<string, BVHBuildStrategy> = {
  sah: BVHBuildStrategy.SAH,
  median: BVHBuildStrategy.Median,
  equal: BVHBuildStrategy.Equal,
};

// ============ 日志 ============

function log(message: string, type: string = 'info'): void {
  const logContainer = document.getElementById('logContainer');
  if (!logContainer) return;

  const time = new Date().toLocaleTimeString();
  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  item.innerHTML = `<span class="timestamp">[${time}]</span>${message}`;
  logContainer.insertBefore(item, logContainer.firstChild);

  // 限制日志数量
  while (logContainer.children.length > 30) {
    logContainer.removeChild(logContainer.lastChild!);
  }
}

// ============ 进度更新 ============

function updateProgress(percent: number, text: string): void {
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  if (progressFill) {
    progressFill.style.width = `${percent}%`;
    progressFill.textContent = `${Math.round(percent)}%`;
  }
  if (progressText) progressText.textContent = text;
}

// ============ 生成测试对象 ============

function generateObjects(count: number, progressCallback?: (percent: number) => void) {
  const objects = [];
  const batchSize = 10000;

  for (let i = 0; i < count; i++) {
    const size = Math.random() * 5 + 1;
    const x = (Math.random() - 0.5) * config.sceneSize;
    const y = (Math.random() - 0.5) * config.sceneSize;
    const z = (Math.random() - 0.5) * config.sceneSize;

    objects.push({
      bounds: new BoundingBox(
        new Vector3(x - size / 2, y - size / 2, z - size / 2),
        new Vector3(x + size / 2, y + size / 2, z + size / 2),
      ),
      userData: { id: i },
    });

    if (i % batchSize === 0 && progressCallback) {
      progressCallback((i / count) * 100);
    }
  }

  return objects;
}

// ============ 生成随机光线 ============

function generateRays(count: number) {
  const rays = [];
  for (let i = 0; i < count; i++) {
    const origin = new Vector3(
      (Math.random() - 0.5) * config.sceneSize * 2,
      (Math.random() - 0.5) * config.sceneSize * 2,
      (Math.random() - 0.5) * config.sceneSize * 2,
    );
    const direction = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    direction.normalize();
    rays.push(new Ray(origin, direction));
  }
  return rays;
}

// ============ 生成随机查询点 ============

function generateQueryPoints(count: number) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push(
      new Vector3(
        (Math.random() - 0.5) * config.sceneSize,
        (Math.random() - 0.5) * config.sceneSize,
        (Math.random() - 0.5) * config.sceneSize,
      ),
    );
  }
  return points;
}

// ============ 运行压力测试 ============

async function runStressTest(): Promise<void> {
  const btn = document.getElementById('runTest') as HTMLButtonElement;
  const progressSection = document.getElementById('progressSection');

  if (btn) btn.disabled = true;
  if (progressSection) progressSection.style.display = 'block';

  // 读取配置
  const objectCountEl = document.getElementById('objectCount') as HTMLSelectElement;
  const buildStrategyEl = document.getElementById('buildStrategy') as HTMLSelectElement;
  const raycastCountEl = document.getElementById('raycastCount') as HTMLSelectElement;
  const rangeQueryCountEl = document.getElementById('rangeQueryCount') as HTMLSelectElement;

  config.objectCount = parseInt(objectCountEl?.value || '100000');
  config.buildStrategy = strategies[buildStrategyEl?.value || 'median'];
  config.raycastCount = parseInt(raycastCountEl?.value || '5000');
  config.rangeQueryCount = parseInt(rangeQueryCountEl?.value || '1000');

  log(`开始压力测试: ${config.objectCount.toLocaleString()} 个对象`, 'info');

  try {
    // 阶段 1: 生成对象
    updateProgress(0, '生成测试对象...');
    await new Promise((r) => setTimeout(r, 100));

    const genStart = performance.now();
    const objects = generateObjects(config.objectCount, (p) => {
      updateProgress(p * 0.3, `生成对象: ${Math.round(p)}%`);
    });
    const genTime = performance.now() - genStart;

    const genTimeEl = document.getElementById('genTime');
    if (genTimeEl) genTimeEl.textContent = genTime.toFixed(0);
    log(`对象生成完成: ${genTime.toFixed(0)}ms`, 'success');

    // 阶段 2: 构建 BVH
    updateProgress(30, '构建 BVH 树...');
    await new Promise((r) => setTimeout(r, 100));

    const buildStart = performance.now();
    const tree = BVHBuilder.build(objects, config.buildStrategy);
    const buildTime = performance.now() - buildStart;

    const buildTimeEl = document.getElementById('buildTime');
    if (buildTimeEl) buildTimeEl.textContent = buildTime.toFixed(0);
    log(`BVH 构建完成: ${buildTime.toFixed(0)}ms`, 'success');

    // 获取树统计
    const stats = tree.getStats();
    const nodeCountEl = document.getElementById('nodeCount');
    const treeDepthEl = document.getElementById('treeDepth');
    const memoryUsageEl = document.getElementById('memoryUsage');

    if (nodeCountEl) nodeCountEl.textContent = stats.nodeCount.toLocaleString();
    if (treeDepthEl) treeDepthEl.textContent = stats.maxDepth.toString();
    if (memoryUsageEl) memoryUsageEl.textContent = (stats.memoryUsage / 1024 / 1024).toFixed(2);

    log(`树结构: ${stats.nodeCount.toLocaleString()} 节点, 深度 ${stats.maxDepth}`, 'info');

    // 阶段 3: 光线投射测试
    updateProgress(50, '执行光线投射测试...');
    await new Promise((r) => setTimeout(r, 100));

    const rays = generateRays(config.raycastCount);
    let hitCount = 0;

    const raycastStart = performance.now();
    for (const ray of rays) {
      const hits = tree.raycast(ray, config.sceneSize * 3);
      if (hits.length > 0) hitCount++;
    }
    const raycastTime = performance.now() - raycastStart;

    const raycastTimeEl = document.getElementById('raycastTime');
    if (raycastTimeEl) raycastTimeEl.textContent = raycastTime.toFixed(0);
    log(
      `光线投射: ${raycastTime.toFixed(0)}ms, 命中率 ${((hitCount / config.raycastCount) * 100).toFixed(1)}%`,
      'success',
    );

    // 阶段 4: 范围查询测试
    updateProgress(75, '执行范围查询测试...');
    await new Promise((r) => setTimeout(r, 100));

    const queryPoints = generateQueryPoints(config.rangeQueryCount);
    let totalFound = 0;

    const rangeStart = performance.now();
    for (const point of queryPoints) {
      const found = tree.queryRange(point, config.sceneSize * 0.05);
      totalFound += found.length;
    }
    const rangeTime = performance.now() - rangeStart;

    const rangeTimeEl = document.getElementById('rangeTime');
    if (rangeTimeEl) rangeTimeEl.textContent = rangeTime.toFixed(0);
    log(
      `范围查询: ${rangeTime.toFixed(0)}ms, 平均找到 ${(totalFound / config.rangeQueryCount).toFixed(1)} 个`,
      'success',
    );

    // 计算总 QPS
    const totalQueries = config.raycastCount + config.rangeQueryCount;
    const totalTime = raycastTime + rangeTime;
    const totalQPS = (totalQueries / totalTime) * 1000;
    const qpsEl = document.getElementById('qps');
    if (qpsEl) qpsEl.textContent = totalQPS.toFixed(0);

    // 完成
    updateProgress(100, '测试完成！');
    log(`压力测试完成！总 QPS: ${totalQPS.toFixed(0)}`, 'success');

    // 验证树
    const validation = tree.validate();
    if (validation.valid) {
      log('树结构验证通过 ✓', 'success');
    } else {
      log(`树结构验证失败: ${validation.errors.join(', ')}`, 'error');
    }
  } catch (error) {
    log(`测试失败: ${(error as Error).message}`, 'error');
    console.error(error);
  }

  if (btn) btn.disabled = false;
}

// ============ 事件监听 ============

function setupEventListeners(): void {
  const runTestBtn = document.getElementById('runTest');
  if (runTestBtn) {
    runTestBtn.addEventListener('click', runStressTest);
  }
}

// ============ 主入口 ============

function main(): void {
  console.log('=== BVH Stress Test ===');
  setupEventListeners();
  console.log('Stress Test Demo 准备就绪');
}

// 导出 init 函数以保持兼容性
export function init() {
  main();
}

// 启动
main();
