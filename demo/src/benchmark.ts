/**
 * BVH Performance Benchmark Demo
 * 对比不同构建策略的性能表现
 * 
 * 注意：这个 demo 主要是数据展示，不需要 3D 渲染
 */

import { Vector3, BoundingBox } from '@galacean/engine-math';
import { BVHTree, BVHBuilder, Ray, BVHBuildStrategy } from '../../dist/index.mjs';

// ============ 类型定义 ============

interface StrategyResult {
  avg: number;
  min: number;
  max: number;
  qps?: number;
  hitRate?: number;
  avgResults?: number;
}

interface TreeStats {
  nodeCount: number;
  maxDepth: number;
  balanceFactor: number;
}

// ============ 配置 ============

const config = {
  objectCount: 10000,
  raycastCount: 1000,
  rangeQueryCount: 1000,
  iterations: 3,
  sceneSize: 100,
};

// 策略列表
const strategies = [
  { name: 'SAH', value: BVHBuildStrategy.SAH },
  { name: 'Median', value: BVHBuildStrategy.Median },
  { name: 'Equal', value: BVHBuildStrategy.Equal },
];

// 结果存储
let results: {
  build: Record<string, StrategyResult>;
  raycast: Record<string, StrategyResult>;
  range: Record<string, StrategyResult>;
  stats: Record<string, TreeStats>;
} = {
  build: {},
  raycast: {},
  range: {},
  stats: {},
};

// ============ 生成测试数据 ============

function generateTestObjects(count: number) {
  const objs = [];
  for (let i = 0; i < count; i++) {
    const size = Math.random() * 2 + 0.5;
    const x = (Math.random() - 0.5) * config.sceneSize;
    const y = (Math.random() - 0.5) * config.sceneSize;
    const z = (Math.random() - 0.5) * config.sceneSize;
    
    objs.push({
      bounds: new BoundingBox(
        new Vector3(x - size/2, y - size/2, z - size/2),
        new Vector3(x + size/2, y + size/2, z + size/2)
      ),
      userData: { id: i },
    });
  }
  return objs;
}

function generateRays(count: number) {
  const rays = [];
  for (let i = 0; i < count; i++) {
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
    rays.push(new Ray(origin, direction));
  }
  return rays;
}

function generateQueryPoints(count: number) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push(new Vector3(
      (Math.random() - 0.5) * config.sceneSize,
      (Math.random() - 0.5) * config.sceneSize,
      (Math.random() - 0.5) * config.sceneSize
    ));
  }
  return points;
}

// ============ 运行单个策略的基准测试 ============

async function runStrategyBenchmark(
  strategy: { name: string; value: BVHBuildStrategy },
  objects: any[],
  rays: Ray[],
  queryPoints: Vector3[]
) {
  const result = {
    buildTimes: [] as number[],
    raycastTimes: [] as number[],
    rangeTimes: [] as number[],
    hitCount: 0,
    rangeResultCount: 0,
    stats: null as TreeStats | null,
  };

  // 构建测试
  const buildStart = performance.now();
  const tree = BVHBuilder.build(objects, strategy.value);
  const buildTime = performance.now() - buildStart;
  result.buildTimes.push(buildTime);
  result.stats = tree.getStats();

  // 光线投射测试
  const raycastStart = performance.now();
  for (const ray of rays) {
    const hits = tree.raycast(ray, config.sceneSize * 3);
    if (hits.length > 0) result.hitCount++;
  }
  const raycastTime = performance.now() - raycastStart;
  result.raycastTimes.push(raycastTime);

  // 范围查询测试
  const rangeStart = performance.now();
  for (const point of queryPoints) {
    const found = tree.queryRange(point, config.sceneSize * 0.1);
    result.rangeResultCount += found.length;
  }
  const rangeTime = performance.now() - rangeStart;
  result.rangeTimes.push(rangeTime);

  return result;
}

// ============ 更新进度 ============

function updateProgress(percent: number, text: string): void {
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  if (progressFill) progressFill.style.width = `${percent}%`;
  if (progressText) progressText.textContent = text;
}

// ============ 更新结果表格 ============

function updateResults(): void {
  // 构建时间表格
  const buildBody = document.getElementById('buildResults');
  let buildHtml = '';
  let minBuild = Infinity, maxBuild = 0;
  
  for (const s of strategies) {
    const data = results.build[s.name];
    if (data) {
      minBuild = Math.min(minBuild, data.avg);
      maxBuild = Math.max(maxBuild, data.avg);
    }
  }
  
  for (const s of strategies) {
    const data = results.build[s.name];
    if (data) {
      const isBest = data.avg === minBuild;
      const isWorst = data.avg === maxBuild;
      buildHtml += `<tr>
        <td>${s.name}</td>
        <td class="${isBest ? 'best' : isWorst ? 'worst' : ''}">${data.avg.toFixed(2)} ms</td>
        <td>${data.min.toFixed(2)} ms</td>
        <td>${data.max.toFixed(2)} ms</td>
      </tr>`;
    }
  }
  if (buildBody) buildBody.innerHTML = buildHtml || '<tr><td colspan="4">无数据</td></tr>';

  // 光线投射表格
  const raycastBody = document.getElementById('raycastResults');
  let raycastHtml = '';
  let maxQPS = 0;
  
  for (const s of strategies) {
    const data = results.raycast[s.name];
    if (data && data.qps) {
      maxQPS = Math.max(maxQPS, data.qps);
    }
  }
  
  for (const s of strategies) {
    const data = results.raycast[s.name];
    if (data) {
      const isBest = data.qps === maxQPS;
      raycastHtml += `<tr>
        <td>${s.name}</td>
        <td>${data.avg.toFixed(2)} ms</td>
        <td class="${isBest ? 'best' : ''}">${data.qps?.toFixed(0) || '-'}</td>
        <td>${data.hitRate?.toFixed(1) || '-'}%</td>
      </tr>`;
    }
  }
  if (raycastBody) raycastBody.innerHTML = raycastHtml || '<tr><td colspan="4">无数据</td></tr>';

  // 范围查询表格
  const rangeBody = document.getElementById('rangeResults');
  let rangeHtml = '';
  
  for (const s of strategies) {
    const data = results.range[s.name];
    if (data) {
      rangeHtml += `<tr>
        <td>${s.name}</td>
        <td>${data.avg.toFixed(2)} ms</td>
        <td>${data.qps?.toFixed(0) || '-'}</td>
        <td>${data.avgResults?.toFixed(1) || '-'}</td>
      </tr>`;
    }
  }
  if (rangeBody) rangeBody.innerHTML = rangeHtml || '<tr><td colspan="4">无数据</td></tr>';

  // 树统计表格
  const statsBody = document.getElementById('treeStats');
  let statsHtml = '';
  
  for (const s of strategies) {
    const data = results.stats[s.name];
    if (data) {
      statsHtml += `<tr>
        <td>${s.name}</td>
        <td>${data.nodeCount}</td>
        <td>${data.maxDepth}</td>
        <td>${data.balanceFactor.toFixed(3)}</td>
      </tr>`;
    }
  }
  if (statsBody) statsBody.innerHTML = statsHtml || '<tr><td colspan="4">无数据</td></tr>';

  // 更新图表
  updateCharts();
}

// ============ 更新图表 ============

function updateCharts(): void {
  // 构建时间图表
  let maxBuildTime = 0;
  for (const s of strategies) {
    const data = results.build[s.name];
    if (data) maxBuildTime = Math.max(maxBuildTime, data.avg);
  }
  
  for (const s of strategies) {
    const data = results.build[s.name];
    const bar = document.getElementById(`buildBar${s.name}`);
    if (data && bar) {
      const percent = (data.avg / maxBuildTime) * 100;
      bar.style.width = `${percent}%`;
      bar.textContent = `${data.avg.toFixed(1)} ms`;
    }
  }

  // 查询性能图表
  let maxQPS = 0;
  for (const s of strategies) {
    const data = results.raycast[s.name];
    if (data && data.qps) maxQPS = Math.max(maxQPS, data.qps);
  }
  
  for (const s of strategies) {
    const data = results.raycast[s.name];
    const bar = document.getElementById(`queryBar${s.name}`);
    if (data && bar && data.qps) {
      const percent = (data.qps / maxQPS) * 100;
      bar.style.width = `${percent}%`;
      bar.textContent = `${data.qps.toFixed(0)} /s`;
    }
  }
}

// ============ 运行完整基准测试 ============

async function runBenchmark(): Promise<void> {
  const btn = document.getElementById('runBenchmark') as HTMLButtonElement;
  const progressContainer = document.getElementById('progressContainer');
  
  if (btn) btn.disabled = true;
  if (progressContainer) progressContainer.classList.add('active');
  
  // 重置结果
  results = { build: {}, raycast: {}, range: {}, stats: {} };
  
  // 读取配置
  const objectCountEl = document.getElementById('objectCount') as HTMLSelectElement;
  const raycastCountEl = document.getElementById('raycastCount') as HTMLSelectElement;
  const rangeQueryCountEl = document.getElementById('rangeQueryCount') as HTMLSelectElement;
  const iterationsEl = document.getElementById('iterations') as HTMLSelectElement;
  
  config.objectCount = parseInt(objectCountEl?.value || '10000');
  config.raycastCount = parseInt(raycastCountEl?.value || '1000');
  config.rangeQueryCount = parseInt(rangeQueryCountEl?.value || '1000');
  config.iterations = parseInt(iterationsEl?.value || '3');
  
  const totalSteps = strategies.length * config.iterations;
  let currentStep = 0;
  
  // 生成测试数据
  updateProgress(0, '生成测试数据...');
  await new Promise(r => setTimeout(r, 100));
  
  const objects = generateTestObjects(config.objectCount);
  const rays = generateRays(config.raycastCount);
  const queryPoints = generateQueryPoints(config.rangeQueryCount);
  
  // 运行每个策略的测试
  for (const strategy of strategies) {
    const strategyResults = {
      buildTimes: [] as number[],
      raycastTimes: [] as number[],
      rangeTimes: [] as number[],
      hitCount: 0,
      rangeResultCount: 0,
      stats: null as TreeStats | null,
    };
    
    for (let i = 0; i < config.iterations; i++) {
      currentStep++;
      const percent = (currentStep / totalSteps) * 100;
      updateProgress(percent, `测试 ${strategy.name} 策略 (${i + 1}/${config.iterations})...`);
      await new Promise(r => setTimeout(r, 50));
      
      const iterResult = await runStrategyBenchmark(strategy, objects, rays, queryPoints);
      
      strategyResults.buildTimes.push(...iterResult.buildTimes);
      strategyResults.raycastTimes.push(...iterResult.raycastTimes);
      strategyResults.rangeTimes.push(...iterResult.rangeTimes);
      strategyResults.hitCount += iterResult.hitCount;
      strategyResults.rangeResultCount += iterResult.rangeResultCount;
      strategyResults.stats = iterResult.stats;
    }
    
    // 计算统计数据
    const avgBuild = strategyResults.buildTimes.reduce((a, b) => a + b, 0) / strategyResults.buildTimes.length;
    const avgRaycast = strategyResults.raycastTimes.reduce((a, b) => a + b, 0) / strategyResults.raycastTimes.length;
    const avgRange = strategyResults.rangeTimes.reduce((a, b) => a + b, 0) / strategyResults.rangeTimes.length;
    
    results.build[strategy.name] = {
      avg: avgBuild,
      min: Math.min(...strategyResults.buildTimes),
      max: Math.max(...strategyResults.buildTimes),
    };
    
    results.raycast[strategy.name] = {
      avg: avgRaycast,
      min: 0,
      max: 0,
      qps: (config.raycastCount / avgRaycast) * 1000,
      hitRate: (strategyResults.hitCount / (config.raycastCount * config.iterations)) * 100,
    };
    
    results.range[strategy.name] = {
      avg: avgRange,
      min: 0,
      max: 0,
      qps: (config.rangeQueryCount / avgRange) * 1000,
      avgResults: strategyResults.rangeResultCount / (config.rangeQueryCount * config.iterations),
    };
    
    if (strategyResults.stats) {
      results.stats[strategy.name] = strategyResults.stats;
    }
    
    updateResults();
  }
  
  updateProgress(100, '测试完成！');
  if (btn) btn.disabled = false;
  
  setTimeout(() => {
    if (progressContainer) progressContainer.classList.remove('active');
  }, 2000);
}

// ============ 事件监听 ============

function setupEventListeners(): void {
  const runBtn = document.getElementById('runBenchmark');
  if (runBtn) {
    runBtn.addEventListener('click', runBenchmark);
  }
}

// ============ 主入口 ============

function main(): void {
  console.log('=== BVH Performance Benchmark ===');
  setupEventListeners();
  console.log('Benchmark Demo 准备就绪');
}

// 导出 init 函数以保持兼容性
export function init() {
  main();
}

// 启动
main();