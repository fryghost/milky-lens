const fs = require('fs');
const path = require('path');

// ============ Load Data ============
const productsDir = path.join(__dirname, '..', '..', 'milk_powder_data', 'data', 'products');
const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.json'));
const products = [];
for (const file of files) {
  products.push(JSON.parse(fs.readFileSync(path.join(productsDir, file), 'utf-8')));
}

const lookup = {};
for (const p of products) {
  lookup[p.product_name] = p;
}

function nutritionMap(p) {
  const m = {};
  for (const n of p.nutrition) {
    m[n.name] = { unit: n.unit, per100g: n.per100g };
  }
  return m;
}

// ============ Compute Similarity ============
const BASIC_NUTRIENTS = ['能量', '蛋白质', '脂肪', '碳水化合物', '亚油酸', 'α-亚麻酸'];
const PREMIUM_NUTRIENTS = [
  'DHA', 'ARA/AA', 'OPO', '乳铁蛋白', '核苷酸', 'CPP', '叶黄素',
  '低聚半乳糖', '低聚果糖', '多聚果糖', 'HMO(2\'-FL)', 'HMO(LNnT)', 'HMO',
  '胆碱', '肌醇', '牛磺酸', '左旋肉碱', '益生菌', '膳食纤维'
];

function getNutrientWeight(name) {
  if (BASIC_NUTRIENTS.includes(name)) return 0.3;
  if (PREMIUM_NUTRIENTS.includes(name)) return 1.0;
  if (name.startsWith('维生素') || ['烟酸(烟酰胺)', '叶酸', '泛酸', '生物素'].includes(name)) return 0.5;
  return 0.5;
}

const BASELINE_NAME = '惠氏启赋蕴淳';
const baseline = lookup[BASELINE_NAME];

function calcSimilarity(p) {
  if (!baseline || !p) return 0;
  if (p.product_name === BASELINE_NAME) return 100;
  const bm = nutritionMap(baseline);
  const pm = nutritionMap(p);
  let totalWeightedDiff = 0, totalWeight = 0;
  for (const k of Object.keys(bm)) {
    if (!pm[k]) continue;
    const bv = parseFloat(bm[k].per100g);
    const pv = parseFloat(pm[k].per100g);
    if (isNaN(bv) || isNaN(pv) || bv === 0) continue;
    const weight = getNutrientWeight(k);
    totalWeightedDiff += (Math.abs(pv - bv) / bv) * weight;
    totalWeight += weight;
  }
  const weightedAvgDiff = totalWeight > 0 ? totalWeightedDiff / totalWeight : 0;
  let missingPenalty = 0;
  for (const k of PREMIUM_NUTRIENTS) {
    if (bm[k] && parseFloat(bm[k].per100g) > 0 && (!pm[k] || parseFloat(pm[k].per100g) <= 0))
      missingPenalty += 3;
  }
  let extraBonus = 0;
  for (const k of PREMIUM_NUTRIENTS) {
    if (pm[k] && parseFloat(pm[k].per100g) > 0 && (!bm[k] || parseFloat(bm[k].per100g) <= 0))
      extraBonus += 2;
  }
  return Math.max(0, Math.min(100, 100 - weightedAvgDiff * 100 - missingPenalty + extraBonus));
}

// ============ Build Product Data Array ============
const productData = products.map(p => {
  const d = p.details || {};
  const weight = parseInt(d['规格']) || 0;
  const price = parseInt(d['参考价']?.replace('￥', '')) || 0;
  const pp100 = weight > 0 ? (price / weight * 100) : 0;
  const sim = calcSimilarity(p);
  const nm = nutritionMap(p);
  const bnm = baseline ? nutritionMap(baseline) : {};

  // Pros/Cons
  const pros = [], cons = [];
  if (p.product_name !== BASELINE_NAME) {
    for (const k of Object.keys(nm)) {
      if (['能量', '蛋白质', '脂肪', '碳水化合物'].includes(k)) continue;
      const pv = parseFloat(nm[k].per100g);
      const bv = bnm[k] ? parseFloat(bnm[k].per100g) : NaN;
      if (!isNaN(pv) && !isNaN(bv) && pv > bv * 1.1) pros.push(`${k}(${nm[k].per100g} vs ${bnm[k].per100g})`);
      if (!isNaN(pv) && isNaN(bv)) pros.push(`含${k}(${nm[k].per100g}${nm[k].unit})`);
    }
    if (!bnm['乳铁蛋白'] && nm['乳铁蛋白']) pros.push(`含乳铁蛋白(${nm['乳铁蛋白'].per100g}mg)`);
    if (!bnm['肌醇'] && nm['肌醇']) pros.push(`含肌醇(${nm['肌醇'].per100g}mg)`);
    if (!bnm['牛磺酸'] && nm['牛磺酸']) pros.push(`含牛磺酸(${nm['牛磺酸'].per100g}mg)`);
    if (!bnm['核苷酸'] && nm['核苷酸']) pros.push(`含核苷酸(${nm['核苷酸'].per100g}mg)`);
    if (!bnm['左旋肉碱'] && nm['左旋肉碱']) pros.push(`含左旋肉碱`);
    if (!nm['低聚半乳糖'] && bnm['低聚半乳糖']) cons.push('无低聚半乳糖');
    if (!nm['OPO'] && bnm['OPO']) cons.push('无OPO');
    if (!nm['叶黄素'] && bnm['叶黄素']) cons.push('无叶黄素');
    if (!nm['DHA'] || (parseFloat(nm['DHA']?.per100g) || 0) < 90) cons.push('DHA含量较低');
    if (!nm['硒'] || (parseFloat(nm['硒']?.per100g) || 0) < 15) cons.push('硒含量较低');
  }

  return {
    product_name: p.product_name,
    brand: d['品牌'] || '',
    series: d['系列'] || '',
    origin: d['产地'] || '',
    milkSource: d['奶源'] || '',
    weight: weight,
    price: price,
    pp100: pp100.toFixed(1),
    monthlyCost: Math.round(pp100 * 30),
    version: d['版本'] || '',
    category: d['类别'] || '',
    regNo: d['配方注册号'] || '',
    nutrientCount: p.nutrition.length,
    similarity: sim,
    stars: sim >= 80 ? 5 : sim >= 75 ? 4 : sim >= 70 ? 3 : sim >= 65 ? 2 : 1,
    suggestion: sim >= 80 ? '高度推荐' : sim >= 75 ? '推荐' : sim >= 70 ? '可考虑' : '一般',
    pros: pros.slice(0, 5),
    cons: cons.slice(0, 3),
    nutrition: p.nutrition,
    isBaseline: p.product_name === BASELINE_NAME
  };
});

// Sort products for display
const bySimilarity = [...productData].sort((a, b) => b.similarity - a.similarity);
const byPrice = [...productData].sort((a, b) => parseFloat(a.pp100) - parseFloat(b.pp100));
const byNutrients = [...productData].sort((a, b) => b.nutrientCount - a.nutrientCount);

// All nutrient names union
const allNutrients = new Set();
for (const p of products) {
  for (const n of p.nutrition) allNutrients.add(n.name);
}
const sortedNutrients = Array.from(allNutrients).sort();

// Brand stats
const brandCount = {};
for (const p of productData) {
  brandCount[p.brand] = (brandCount[p.brand] || 0) + 1;
}

// Price range
const prices = productData.map(p => parseFloat(p.pp100)).filter(p => p > 0);
const priceMin = Math.min(...prices).toFixed(1);
const priceMax = Math.max(...prices).toFixed(1);
const priceAvg = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(1);

// ============ Generate HTML ============
const dataJSON = JSON.stringify({
  products: productData,
  baselineName: BASELINE_NAME,
  sortedNutrients: sortedNutrients,
  brandCount: brandCount,
  stats: {
    total: productData.length,
    priceMin, priceMax, priceAvg,
    topSim: bySimilarity[0],
    topValue: byPrice[0]
  }
});

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>奶粉配方对比分析（2段 · 2026年5月） — 以惠氏启赋蕴淳为基准</title>
<style>
/* ========== Clay Design System ========== */
:root {
  --ink: #0a0a0a;
  --body: #3a3a3a;
  --body-strong: #1a1a1a;
  --muted: #6a6a6a;
  --muted-soft: #9a9a9a;
  --hairline: #e5e5e5;
  --hairline-soft: #f0f0f0;
  --canvas: #fffaf0;
  --surface-soft: #faf5e8;
  --surface-card: #f5f0e0;
  --surface-strong: #ebe6d6;
  --on-dark: #ffffff;
  --brand-pink: #d4816e;
  --brand-teal: #1a3a3a;
  --brand-lavender: #b8a4ed;
  --brand-peach: #ffb084;
  --brand-ochre: #e8b94a;
  --brand-mint: #a4d4c5;
  --brand-coral: #ff6b5a;
  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;
  --baseline: #f5f0e0;
  --higher: #ffe0e3;
  --lower: #c8f0d5;
  --radius-xs: 6px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-pill: 9999px;
  --transition: 180ms ease;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--canvas);
  color: var(--body);
  line-height: 1.55;
  font-size: 14px;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

/* ========== Header ========== */
.header {
  background: var(--canvas);
  border-bottom: 1px solid var(--hairline);
  padding: 0 32px;
  height: 64px;
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
}

.header-inner {
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.header h1 {
  font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 20px;
  font-weight: 500;
  letter-spacing: -0.3px;
  color: var(--ink);
}

.header-stats {
  display: flex;
  gap: 24px;
  font-size: 13px;
  color: var(--muted);
}

.header-stat { text-align: center; }
.header-stat-value { font-size: 18px; font-weight: 600; color: var(--ink); }
.header-stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }

/* ========== Tab Navigation ========== */
.tab-nav {
  background: var(--canvas);
  border-bottom: 1px solid var(--hairline);
  position: sticky;
  top: 64px;
  z-index: 99;
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
}

.tab-btn {
  padding: 8px 20px;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  border-radius: var(--radius-pill);
  transition: all var(--transition);
  font-family: inherit;
  white-space: nowrap;
  height: 36px;
}
.tab-btn:hover { color: var(--ink); background: var(--surface-card); }
.tab-btn.active {
  color: var(--ink);
  background: var(--surface-card);
  font-weight: 600;
}

/* ========== Main Content ========== */
.main {
  max-width: 1280px;
  margin: 0 auto;
  padding: 32px;
}

@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

/* ========== KPI Cards ========== */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.kpi-card {
  border-radius: var(--radius-xl);
  padding: 28px 24px;
  color: var(--ink);
}
.kpi-card:nth-child(1) { background: var(--brand-pink); color: var(--on-dark); }
.kpi-card:nth-child(2) { background: var(--brand-teal); color: var(--on-dark); }
.kpi-card:nth-child(3) { background: var(--brand-lavender); }
.kpi-card:nth-child(4) { background: var(--brand-peach); }

.kpi-card .kpi-label { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px; opacity: 0.75; }
.kpi-card .kpi-value { font-size: 36px; font-weight: 500; line-height: 1.1; letter-spacing: -1px; margin-bottom: 4px; }
.kpi-card .kpi-sub { font-size: 13px; opacity: 0.7; }

/* ========== Section Headers ========== */
.section-title {
  font-size: 22px;
  font-weight: 500;
  letter-spacing: -0.3px;
  color: var(--ink);
  margin-bottom: 20px;
}

/* ========== Tables ========== */
.table-container {
  background: var(--canvas);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-bottom: 24px;
}

.table-toolbar {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--hairline);
  flex-wrap: wrap;
  align-items: center;
  background: var(--surface-soft);
}

.table-toolbar input, .table-toolbar select {
  padding: 10px 14px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: inherit;
  background: var(--canvas);
  color: var(--ink);
  height: 40px;
}
.table-toolbar input:focus, .table-toolbar select:focus {
  outline: none;
  border-color: var(--ink);
}

.search-input { min-width: 200px; }

.table-wrapper {
  overflow-x: auto;
  max-height: 65vh;
  overflow-y: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

thead { position: sticky; top: 0; z-index: 10; }

th {
  background: var(--surface-strong);
  color: var(--ink);
  padding: 10px 14px;
  text-align: left;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  border-bottom: 2px solid var(--hairline);
}
th:hover { background: var(--surface-card); }

th .sort-arrow { margin-left: 4px; font-size: 10px; color: var(--muted); }

td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--hairline-soft);
  white-space: nowrap;
  color: var(--body);
}

tr:hover td { background: var(--surface-soft); }

.baseline-row td { background: var(--baseline) !important; font-weight: 600; color: var(--ink); }

.stars { color: var(--brand-ochre); letter-spacing: 1px; font-size: 13px; }

.sim-high { color: var(--brand-teal); font-weight: 700; }
.sim-mid { color: var(--brand-ochre); font-weight: 600; }
.sim-low { color: var(--brand-coral); font-weight: 600; }
.btn-compare {
  padding: 6px 14px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  background: var(--canvas);
  color: var(--ink);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  font-weight: 600;
  white-space: nowrap;
  transition: all var(--transition);
  height: 32px;
}
.btn-compare:hover { background: var(--ink); color: var(--on-dark); border-color: var(--ink); }

.tag {
  display: inline-block;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
}

.tag-rec { background: var(--brand-mint); color: #0a3a2a; }
.tag-ok { background: var(--brand-peach); color: #5a3020; }
.tag-gen { background: var(--surface-card); color: var(--muted); }

/* ========== Comparison Panel ========== */
.compare-selector {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  align-items: flex-start;
}

/* ===== Searchable Dropdown ===== */
.ss-wrap { position: relative; min-width: 200px; }
.ss-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: inherit;
  background: var(--canvas);
  color: var(--ink);
  box-sizing: border-box;
  cursor: pointer;
  height: 40px;
}
.ss-input:focus { outline: none; border-color: var(--ink); }
.ss-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 280px;
  overflow-y: auto;
  background: var(--canvas);
  border: 1px solid var(--ink);
  border-radius: var(--radius-md);
  z-index: 100;
}
.ss-dropdown.open { display: block; }
.ss-option {
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 1px solid var(--hairline-soft);
}
.ss-option:last-child { border-bottom: none; }
.ss-option:hover { background: var(--surface-card); color: var(--ink); }
.ss-option.selected { background: var(--surface-soft); font-weight: 600; }
.ss-no-result {
  padding: 12px 14px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition);
  font-family: inherit;
  height: 40px;
}
.btn-primary { background: var(--ink); color: var(--on-dark); }
.btn-primary:hover { background: #2a2a2a; }
.btn-secondary { background: var(--canvas); color: var(--ink); border: 1px solid var(--hairline); }
.btn-secondary:hover { background: var(--surface-soft); }
.btn-sm { padding: 6px 14px; font-size: 13px; height: 32px; }

.compare-table td { min-width: 90px; }
.compare-table td.higher { background: var(--higher); font-weight: 600; color: #b03040; }
.compare-table td.lower { background: var(--lower); font-weight: 600; color: #1a6030; }
.compare-table td.baseline-col { background: var(--baseline); font-weight: 600; }

/* ========== Brand Chart ========== */
.brand-chart {
  display: flex; gap: 16px; align-items: flex-end; height: 160px;
  padding: 24px 20px 12px; flex-wrap: wrap;
}

.brand-bar-container { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 56px; }

.brand-bar {
  width: 44px;
  background: var(--ink);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  transition: height 400ms ease;
  opacity: 0.85;
}

.brand-bar-label { font-size: 11px; color: var(--muted); text-align: center; font-weight: 500; }
.brand-bar-count { font-size: 12px; font-weight: 600; color: var(--ink); }

/* ========== Similarity bars ========== */
.sim-bar-bg {
  width: 80px; height: 6px; background: var(--hairline); border-radius: 3px;
  display: inline-block; vertical-align: middle; margin-left: 8px;
}
.sim-bar-fill { height: 100%; border-radius: 3px; }
.sim-bar-fill.high { background: var(--brand-teal); }
.sim-bar-fill.mid { background: var(--brand-ochre); }
.sim-bar-fill.low { background: var(--brand-coral); }

/* ========== Recommendation cards ========== */
.rec-card-header {
  padding: 16px 24px;
  background: var(--surface-soft);
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0;
  border-bottom: 1px solid var(--hairline);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  color: var(--ink);
}

.rec-card-body {
  padding: 8px 0;
}

.rec-card-note {
  padding: 16px 24px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.8;
}

/* ========== Footer ========== */
.footer {
  background: var(--surface-soft);
  padding: 48px 32px;
  text-align: center;
  color: var(--muted);
  font-size: 13px;
  line-height: 2;
  border-top: 1px solid var(--hairline);
  margin-top: 48px;
}
.footer strong { color: var(--body); }

/* ========== Responsive ========== */
@media (max-width: 768px) {
  .header { padding: 0 16px; height: 56px; }
  .header h1 { font-size: 17px; }
  .header-stats { gap: 12px; }
  .header-stat-value { font-size: 16px; }
  .tab-btn { padding: 6px 14px; font-size: 12px; }
  .main { padding: 20px 16px; }
  .kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .kpi-card { padding: 20px 16px; }
  .kpi-card .kpi-value { font-size: 28px; }
}
@media (max-width: 480px) {
  .kpi-grid { grid-template-columns: 1fr; }
  .tab-btn { padding: 6px 12px; font-size: 11px; }
  .header h1 { font-size: 15px; }
}
</style>
</head>
<body>

<header class="header">
  <div class="header-inner">
    <h1>奶粉配方对比分析 <span style="font-weight:400;color:var(--muted)">2段 · 2026年5月</span></h1>
    <div class="header-stats">
      <div class="header-stat"><div class="header-stat-value">${productData.length}</div><div class="header-stat-label">款2段奶粉</div></div>
      <div class="header-stat"><div class="header-stat-value">${Object.keys(brandCount).length}</div><div class="header-stat-label">个品牌</div></div>
      <div class="header-stat"><div class="header-stat-value">${sortedNutrients.length}</div><div class="header-stat-label">种营养成分</div></div>
      <div class="header-stat"><div class="header-stat-value">¥${priceMin}-${priceMax}</div><div class="header-stat-label">元/100g 价格区间</div></div>
    </div>
  </div>
</header>

<nav class="tab-nav" id="tabNav">
  <button class="tab-btn active" data-tab="overview">总览</button>
  <button class="tab-btn" data-tab="similarity">相似度分析</button>
  <button class="tab-btn" data-tab="price">价格对比</button>
  <button class="tab-btn" data-tab="nutrition">营养对比</button>
  <button class="tab-btn" data-tab="recommend">换奶推荐</button>
</nav>

<main class="main" id="main"></main>

<footer class="footer">
  <p>数据来源：<strong>奶粉智库 (naifenzhiku.com)</strong> — 专业婴幼儿配方奶粉数据库</p>
  <p>共 <strong>${productData.length}</strong> 款2段奶粉完整营养成分对比 · 数据日期：2026年5月</p>
  <p style="margin-top:8px;font-size:12px;color:var(--muted-soft)">仅供个人学习研究参考，不构成医疗或营养建议。婴幼儿配方奶粉选择请咨询专业医生。</p>
</footer>

<script>
const DATA = ${dataJSON};

// ========== Tab Navigation ==========
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTab(btn.dataset.tab);
  });
});

function renderTab(tab) {
  const main = document.getElementById('main');
  switch(tab) {
    case 'overview': renderOverview(main); break;
    case 'similarity': renderSimilarity(main); break;
    case 'price': renderPrice(main); break;
    case 'nutrition': renderNutrition(main); break;
    case 'recommend': renderRecommend(main); break;
  }
}

// ========== Overview ==========
function renderOverview(main) {
  const stats = DATA.stats;
  const brandsSorted = Object.entries(DATA.brandCount).sort((a, b) => b[1] - a[1]);
  const maxBrand = brandsSorted[0]?.[1] || 1;
  const topSim = DATA.products.filter(p => !p.isBaseline).sort((a,b) => b.similarity - a.similarity).slice(0, 5);
  const topValue = DATA.products.filter(p => parseFloat(p.pp100) > 0).sort((a,b) => parseFloat(a.pp100) - parseFloat(b.pp100)).slice(0, 5);
  const topNutrients = [...DATA.products].sort((a,b) => b.nutrientCount - a.nutrientCount).slice(0, 5);

  main.innerHTML = \`
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">产品总数</div>
        <div class="kpi-value">\${stats.total}</div>
        <div class="kpi-sub">款2段婴幼儿配方奶粉</div>
      </div>
      <div class="kpi-card accent">
        <div class="kpi-label">品牌数量</div>
        <div class="kpi-value">\${brandsSorted.length}</div>
        <div class="kpi-sub">覆盖主流国产及进口品牌</div>
      </div>
      <div class="kpi-card success">
        <div class="kpi-label">价格区间（元/100g）</div>
        <div class="kpi-value">¥\${stats.priceMin} - ¥\${stats.priceMax}</div>
        <div class="kpi-sub">均值 ¥\${stats.priceAvg}/100g</div>
      </div>
      <div class="kpi-card warning">
        <div class="kpi-label">对比基准</div>
        <div class="kpi-value">惠氏启赋蕴淳</div>
        <div class="kpi-sub">2段 6-12个月</div>
      </div>
    </div>

    <div class="section-title">品牌产品分布</div>
    <div class="table-container">
      <div class="brand-chart">
        \${brandsSorted.map(([brand, count]) => \`
          <div class="brand-bar-container">
            <div class="brand-bar-count">\${count}</div>
            <div class="brand-bar" style="height: \${count / maxBrand * 130}px" title="\${brand}: \${count}款"></div>
            <div class="brand-bar-label">\${brand}</div>
          </div>
        \`).join('')}
      </div>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 24px; margin-top: 24px;">
      <div>
        <div class="section-title">配方最相似 TOP5</div>
        <div class="table-container">
          <table>
            <thead><tr><th>排名</th><th>品牌系列</th><th>相似度</th></tr></thead>
            <tbody>
              \${topSim.map((p, i) => \`
                <tr>
                  <td>#\${i+1}</td>
                  <td>\${p.brand} \${p.series}</td>
                  <td><span class="sim-high">\${p.similarity.toFixed(0)}%</span></td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="section-title">性价比最高 TOP5</div>
        <div class="table-container">
          <table>
            <thead><tr><th>排名</th><th>品牌系列</th><th>元/100g</th><th>月均费用</th></tr></thead>
            <tbody>
              \${topValue.map((p, i) => \`
                <tr>
                  <td>#\${i+1}</td>
                  <td>\${p.brand} \${p.series}</td>
                  <td>¥\${p.pp100}</td>
                  <td>~¥\${p.monthlyCost}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  \`;
}

// ========== Similarity ==========
function renderSimilarity(main) {
  const products = DATA.products.filter(p => !p.isBaseline).sort((a,b) => b.similarity - a.similarity);
  const brands = [...new Set(products.map(p => p.brand))].sort();

  main.innerHTML = \`
    <div class="kpi-grid">
      <div class="kpi-card success">
        <div class="kpi-label">最高相似度</div>
        <div class="kpi-value">\${products[0]?.similarity.toFixed(0) || '-'}%</div>
        <div class="kpi-sub">\${products[0]?.brand} \${products[0]?.series}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">平均相似度</div>
        <div class="kpi-value">\${(products.reduce((s,p) => s + p.similarity, 0) / products.length).toFixed(0)}%</div>
        <div class="kpi-sub">\${products.length}款产品与启赋蕴淳对比</div>
      </div>
      <div class="kpi-card warning">
        <div class="kpi-label">高度推荐 (≥80%)</div>
        <div class="kpi-value">\${products.filter(p => p.similarity >= 80).length}</div>
        <div class="kpi-sub">款产品</div>
      </div>
      <div class="kpi-card accent">
        <div class="kpi-label">推荐 (≥75%)</div>
        <div class="kpi-value">\${products.filter(p => p.similarity >= 75).length}</div>
        <div class="kpi-sub">款产品</div>
      </div>
    </div>
    <div class="table-container">
      <div class="table-toolbar">
        <input class="search-input" id="simSearch" placeholder="🔍 搜索品牌/系列..." oninput="filterSimTable()">
        <select id="simBrand" onchange="filterSimTable()">
          <option value="">全部品牌</option>
          \${brands.map(b => \`<option value="\${b}">\${b}</option>\`).join('')}
        </select>
        <select id="simThreshold" onchange="filterSimTable()">
          <option value="0">全部相似度</option>
          <option value="80">≥80% 高度推荐</option>
          <option value="75">≥75% 推荐</option>
          <option value="70">≥70% 可考虑</option>
          <option value="65">≥65%</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th onclick="sortSimTable('rank')" class="sorted-asc">排名 <span class="sort-arrow"></span></th>
              <th onclick="sortSimTable('brand')">品牌 <span class="sort-arrow"></span></th>
              <th onclick="sortSimTable('series')">系列 <span class="sort-arrow"></span></th>
              <th onclick="sortSimTable('similarity')">相似度 <span class="sort-arrow"></span></th>
              <th onclick="sortSimTable('stars')">评级 <span class="sort-arrow"></span></th>
              <th>优势</th>
              <th>劣势</th>
              <th onclick="sortSimTable('suggestion')">换奶建议 <span class="sort-arrow"></span></th>
              <th onclick="sortSimTable('pp100')">元/100g <span class="sort-arrow"></span></th>
            </tr>
          </thead>
          <tbody id="simTableBody"></tbody>
        </table>
      </div>
    </div>
  \`;

  // Build sorted product list
  window._simProducts = products.map((p, i) => ({ ...p, rank: i + 1 }));
  window._simSort = { field: 'rank', asc: true };
  simRenderTable();
}

function simRenderTable() {
  const tbody = document.getElementById('simTableBody');
  if (!tbody) return;
  const search = (document.getElementById('simSearch')?.value || '').toLowerCase();
  const brand = document.getElementById('simBrand')?.value || '';
  const threshold = parseFloat(document.getElementById('simThreshold')?.value || '0');

  let list = window._simProducts.filter(p => {
    if (search && !p.brand.toLowerCase().includes(search) && !p.series.toLowerCase().includes(search) && !p.product_name.toLowerCase().includes(search)) return false;
    if (brand && p.brand !== brand) return false;
    if (threshold && p.similarity < threshold) return false;
    return true;
  });

  const { field, asc } = window._simSort;
  list.sort((a, b) => {
    let va = a[field], vb = b[field];
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return asc ? -1 : 1;
    if (va > vb) return asc ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = list.map((p, i) => {
    const simClass = p.similarity >= 80 ? 'sim-high' : p.similarity >= 75 ? 'sim-mid' : 'sim-low';
    const tagClass = p.similarity >= 80 ? 'tag-rec' : p.similarity >= 75 ? 'tag-ok' : 'tag-gen';
    const stars = '★'.repeat(p.stars) + '☆'.repeat(5 - p.stars);
    return \`
    <tr>
      <td>\${i + 1}</td>
      <td>\${p.brand}</td>
      <td>\${p.series}</td>
      <td>
        <span class="\${simClass}">\${p.similarity.toFixed(0)}%</span>
        <span class="sim-bar-bg"><span class="sim-bar-fill \${p.similarity >= 80 ? 'high' : p.similarity >= 75 ? 'mid' : 'low'}" style="width:\${p.similarity}%"></span></span>
      </td>
      <td class="stars">\${stars}</td>
      <td style="max-width:300px;white-space:normal;font-size:12px">\${p.pros.join('；') || '-'}</td>
      <td style="max-width:200px;white-space:normal;font-size:12px">\${p.cons.join('；') || '-'}</td>
      <td><span class="tag \${tagClass}">\${p.suggestion}</span></td>
      <td>¥\${p.pp100}</td>
    </tr>\`;
  }).join('');
}

function filterSimTable() { simRenderTable(); }

function sortSimTable(field) {
  if (window._simSort.field === field) {
    window._simSort.asc = !window._simSort.asc;
  } else {
    window._simSort = { field, asc: field === 'rank' || field === 'pp100' };
  }
  document.querySelectorAll('#simTableBody th').forEach(th => th.classList.remove('sorted-asc', 'sorted-desc'));
  simRenderTable();
}

// ========== Price ==========
function renderPrice(main) {
  const products = DATA.products.filter(p => parseFloat(p.pp100) > 0).sort((a,b) => parseFloat(a.pp100) - parseFloat(b.pp100));
  const brands = [...new Set(products.map(p => p.brand))].sort();

  main.innerHTML = \`
    <div class="kpi-grid">
      <div class="kpi-card success">
        <div class="kpi-label">最低价格</div>
        <div class="kpi-value">¥\${products[0]?.pp100}</div>
        <div class="kpi-sub">/100g — \${products[0]?.brand} \${products[0]?.series}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">最高价格</div>
        <div class="kpi-value">¥\${products[products.length-1]?.pp100}</div>
        <div class="kpi-sub">/100g — \${products[products.length-1]?.brand} \${products[products.length-1]?.series}</div>
      </div>
      <div class="kpi-card warning">
        <div class="kpi-label">中位价格</div>
        <div class="kpi-value">¥\${products[Math.floor(products.length/2)]?.pp100}</div>
        <div class="kpi-sub">/100g</div>
      </div>
      <div class="kpi-card accent">
        <div class="kpi-label">月均费用范围</div>
        <div class="kpi-value">¥\${products[0]?.monthlyCost} - ¥\${products[products.length-1]?.monthlyCost}</div>
        <div class="kpi-sub">按3kg/月消耗估算</div>
      </div>
    </div>
    <div class="table-container">
      <div class="table-toolbar">
        <input class="search-input" id="priceSearch" placeholder="🔍 搜索品牌/系列..." oninput="filterPriceTable()">
        <select id="priceBrand" onchange="filterPriceTable()">
          <option value="">全部品牌</option>
          \${brands.map(b => \`<option value="\${b}">\${b}</option>\`).join('')}
        </select>
        <select id="priceRange" onchange="filterPriceTable()">
          <option value="">全部价位</option>
          <option value="30">≤30元/100g (★★★★★)</option>
          <option value="38">≤38元/100g (★★★★☆)</option>
          <option value="45">≤45元/100g (★★★☆☆)</option>
          <option value="55">≤55元/100g (★★☆☆☆)</option>
        </select>
      </div>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th onclick="sortPriceTable('rank')" class="sorted-asc">排名 <span class="sort-arrow"></span></th>
              <th onclick="sortPriceTable('brand')">品牌 <span class="sort-arrow"></span></th>
              <th onclick="sortPriceTable('series')">系列 <span class="sort-arrow"></span></th>
              <th onclick="sortPriceTable('weight')">规格(g) <span class="sort-arrow"></span></th>
              <th onclick="sortPriceTable('price')">参考价(元) <span class="sort-arrow"></span></th>
              <th onclick="sortPriceTable('pp100')">元/100g <span class="sort-arrow"></span></th>
              <th onclick="sortPriceTable('monthlyCost')">月均费用 <span class="sort-arrow"></span></th>
              <th>性价比评级</th>
              <th onclick="sortPriceTable('similarity')">相似度 <span class="sort-arrow"></span></th>
            </tr>
          </thead>
          <tbody id="priceTableBody"></tbody>
        </table>
      </div>
    </div>
  \`;

  window._priceProducts = products.map((p, i) => ({ ...p, rank: i + 1 }));
  window._priceSort = { field: 'rank', asc: true };
  priceRenderTable();
}

function priceRenderTable() {
  const tbody = document.getElementById('priceTableBody');
  if (!tbody) return;
  const search = (document.getElementById('priceSearch')?.value || '').toLowerCase();
  const brand = document.getElementById('priceBrand')?.value || '';
  const range = parseFloat(document.getElementById('priceRange')?.value || '0');

  let list = window._priceProducts.filter(p => {
    if (search && !p.brand.toLowerCase().includes(search) && !p.series.toLowerCase().includes(search)) return false;
    if (brand && p.brand !== brand) return false;
    if (range && parseFloat(p.pp100) > range) return false;
    return true;
  });

  const { field, asc } = window._priceSort;
  list.sort((a, b) => {
    let va = a[field], vb = b[field];
    if (field === 'pp100') { va = parseFloat(va); vb = parseFloat(vb); }
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return asc ? -1 : 1;
    if (va > vb) return asc ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = list.map((p, i) => {
    let priceRating = parseFloat(p.pp100) <= 30 ? '★★★★★' : parseFloat(p.pp100) <= 38 ? '★★★★☆' : parseFloat(p.pp100) <= 45 ? '★★★☆☆' : parseFloat(p.pp100) <= 55 ? '★★☆☆☆' : '★☆☆☆☆';
    const simClass = p.similarity >= 80 ? 'sim-high' : p.similarity >= 75 ? 'sim-mid' : 'sim-low';
    const rowClass = p.isBaseline ? 'baseline-row' : '';
    return \`
    <tr class="\${rowClass}">
      <td>\${i + 1}</td>
      <td>\${p.brand}</td>
      <td>\${p.series}</td>
      <td>\${p.weight}g</td>
      <td>¥\${p.price}</td>
      <td><strong>¥\${p.pp100}</strong></td>
      <td>~¥\${p.monthlyCost}</td>
      <td class="stars">\${priceRating}</td>
      <td><span class="\${simClass}">\${p.similarity.toFixed(0)}%</span></td>
    </tr>\`;
  }).join('');
}

function filterPriceTable() { priceRenderTable(); }

function sortPriceTable(field) {
  if (window._priceSort.field === field) {
    window._priceSort.asc = !window._priceSort.asc;
  } else {
    window._priceSort = { field, asc: field === 'rank' || field === 'pp100' || field === 'monthlyCost' };
  }
  priceRenderTable();
}

// ========== Nutrition Compare ==========
function renderNutrition(main) {
  const products = DATA.products;
  const baseline = products.find(p => p.isBaseline);
  const bName = DATA.baselineName;

  // Nutrient categories
  const baseNutrients = ['能量', '蛋白质', '脂肪', '碳水化合物', '亚油酸', 'α-亚麻酸'];
  const vitaminNames = DATA.sortedNutrients.filter(n => n.startsWith('维生素') || ['烟酸(烟酰胺)', '叶酸', '泛酸', '生物素', '维生素K', '维生素K₁'].includes(n));
  const mineralNames = ['钠', '钾', '铜', '镁', '铁', '锌', '锰', '钙', '磷', '碘', '氯', '硒'];
  const premiumNames = ['DHA', 'ARA/AA', 'OPO', '乳铁蛋白', '核苷酸', 'CPP', '叶黄素',
    '低聚半乳糖', '低聚果糖', '多聚果糖', 'HMO(2\\'-FL)', 'HMO(LNnT)', 'HMO',
    '胆碱', '肌醇', '牛磺酸', '左旋肉碱', '益生菌', '膳食纤维'];

  // Build nutrient category lookup
  const allCatNutrients = new Set([...baseNutrients, ...vitaminNames, ...mineralNames, ...premiumNames]);
  const otherNutrients = DATA.sortedNutrients.filter(n => !allCatNutrients.has(n) && !['基础营养', '维生素', '矿物质', '可选成分'].includes(n));

  const nutrientCats = {
    '基础营养': baseNutrients.filter(n => DATA.sortedNutrients.includes(n)),
    '矿物质': mineralNames.filter(n => DATA.sortedNutrients.includes(n)),
    '维生素': vitaminNames.filter(n => DATA.sortedNutrients.includes(n)),
    '特色成分': premiumNames.filter(n => DATA.sortedNutrients.includes(n))
  };
  if (otherNutrients.length > 0) nutrientCats['其他'] = otherNutrients;

  main.innerHTML = \`
    <div class="table-container" style="padding:20px">
      <p style="margin-bottom:16px;color:var(--muted)">选择最多5款产品并排对比，数值以启赋蕴淳为基准进行颜色标记：<span style="background:var(--higher);padding:2px 8px;border-radius:4px">红色=更高</span> <span style="background:var(--lower);padding:2px 8px;border-radius:4px">绿色=更低</span> <span style="background:var(--baseline);padding:2px 8px;border-radius:4px">黄色=基准</span></p>
      <div class="compare-selector" id="compareSelector">
        \${[1,2,3,4,5].map(n => \`
        <div class="ss-wrap">
          <input type="text" class="ss-input" id="ssInput\${n}" placeholder="选择产品\${n}..."
                 autocomplete="off" onfocus="ssOpen(this)" oninput="ssFilter(this)" onblur="ssBlur(this)"
                 data-target="compareSelect\${n}">
          <input type="hidden" id="compareSelect\${n}" value="\${n === 1 ? bName : ''}">
          <div class="ss-dropdown" id="compareDrop\${n}">
            \${products.map(p => \`<div class="ss-option" data-value="\${p.product_name}" onmousedown="ssSelect(this,'\${n}')">\${p.brand} \${p.series}</div>\`).join('')}
          </div>
        </div>\`).join('')}
      </div>
      <div id="compareResult"></div>
    </div>
  \`;

  // Store helper data
  window._compareBaseline = baseline;
  window._compareProducts = products;
  window._compareLookup = {};
  products.forEach(p => { window._compareLookup[p.product_name] = p; });

  // Render initial: baseline only
  ssInitBaseline();
  updateCompare();
}

function updateCompare() {
  const names = [];
  for (let i = 1; i <= 5; i++) {
    const sel = document.getElementById('compareSelect' + i);
    if (sel && sel.value) names.push(sel.value);
  }
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length === 0) {
    document.getElementById('compareResult').innerHTML = '<p style="color:var(--muted);padding:24px">请选择至少一款产品开始对比</p>';
    return;
  }

  const products = uniqueNames.map(n => window._compareLookup[n]).filter(Boolean);
  const baseline = window._compareBaseline;
  const baselineName = '${BASELINE_NAME}';

  // Build nutrition map per product
  const nmaps = products.map(p => {
    const m = {};
    if (p.nutrition) p.nutrition.forEach(n => { m[n.name] = { unit: n.unit, per100g: n.per100g }; });
    return m;
  });

  // Collect all nutrients from selected products
  const allNuts = new Set();
  nmaps.forEach(m => Object.keys(m).forEach(k => allNuts.add(k)));

  // Build compare table HTML
  let html = '<div class="table-wrapper"><table class="compare-table"><thead><tr><th>营养成分</th><th>单位</th>';
  products.forEach((p, i) => {
    const isB = p.product_name === baselineName;
    html += \`<th style="\${isB ? 'background:var(--brand-ochre);' : ''}">\${p.brand}<br>\${p.series}\${isB ? ' 🏠' : ''}</th>\`;
  });
  html += '</tr></thead><tbody>';

  // Helper: parse numeric value
  function pv(nm, name) {
    if (!nm[name]) return NaN;
    const v = parseFloat(nm[name].per100g);
    return isNaN(v) ? NaN : v;
  }

  function renderSection(title, nutrients) {
    const filtered = nutrients.filter(n => allNuts.has(n));
    if (filtered.length === 0) return '';
    let s = \`<tr><td colspan="\${products.length + 2}" style="background:var(--surface-soft);font-weight:700;padding:8px 12px;font-size:14px">\${title}</td></tr>\`;
    filtered.forEach(nut => {
      s += '<tr><td style="font-weight:500">' + nut + '</td>';
      // Unit column
      let unit = '';
      for (const nm of nmaps) {
        if (nm[nut]) { unit = nm[nut].unit; break; }
      }
      s += '<td style="color:var(--muted);font-size:12px">' + unit + '</td>';

      // Values
      const baseVal = baseline ? pv(nmaps[products.findIndex(pp => pp.product_name === baselineName)] || {}, nut) : NaN;
      nmaps.forEach((nm, i) => {
        const val = pv(nm, nut);
        const isB = products[i].product_name === baselineName;
        let cls = '';
        if (isB && !isNaN(baseVal)) {
          cls = 'baseline-col';
        } else if (!isNaN(val) && !isNaN(baseVal)) {
          cls = val > baseVal ? 'higher' : val < baseVal ? 'lower' : '';
        }
        s += \`<td class="\${cls}">\${isNaN(val) ? '-' : nm[nut].per100g}</td>\`;
      });
      s += '</tr>';
    });
    return s;
  }

  // Render by category
  const cats = {
    '【基础营养】': ['能量', '蛋白质', '脂肪', '碳水化合物', '亚油酸', 'α-亚麻酸'],
    '【矿物质】': ['钠', '钾', '铜', '镁', '铁', '锌', '锰', '钙', '磷', '碘', '氯', '硒'],
    '【维生素】': [...allNuts].filter(n => n.startsWith('维生素') || ['烟酸(烟酰胺)', '叶酸', '泛酸', '生物素', '维生素K', '维生素K₁'].includes(n)),
    '【特色成分】': ['DHA', 'ARA/AA', 'OPO', '乳铁蛋白', '核苷酸', 'CPP', '叶黄素', '低聚半乳糖', '低聚果糖', '多聚果糖', 'HMO(2\\'-FL)', 'HMO(LNnT)', 'HMO', '胆碱', '肌醇', '牛磺酸', '左旋肉碱', '益生菌', '膳食纤维'],
    '【其他】': [...allNuts].filter(n => {
      const allKnown = new Set(['能量', '蛋白质', '脂肪', '碳水化合物', '亚油酸', 'α-亚麻酸', '钠', '钾', '铜', '镁', '铁', '锌', '锰', '钙', '磷', '碘', '氯', '硒', 'DHA', 'ARA/AA', 'OPO', '乳铁蛋白', '核苷酸', 'CPP', '叶黄素', '低聚半乳糖', '低聚果糖', '多聚果糖', 'HMO(2\\'-FL)', 'HMO(LNnT)', 'HMO', '胆碱', '肌醇', '牛磺酸', '左旋肉碱', '益生菌', '膳食纤维']);
      return !n.startsWith('维生素') && !['烟酸(烟酰胺)', '叶酸', '泛酸', '生物素', '维生素K', '维生素K₁'].includes(n) && !allKnown.has(n) && !['基础营养', '维生素', '矿物质', '可选成分'].includes(n);
    })
  };

  for (const [title, nutrients] of Object.entries(cats)) {
    html += renderSection(title, nutrients);
  }

  html += '</tbody></table></div>';
  document.getElementById('compareResult').innerHTML = html;
}

// ========== Recommend ==========
function renderRecommend(main) {
  const all = DATA.products.filter(p => !p.isBaseline);
  const bySim = [...all].sort((a,b) => b.similarity - a.similarity);
  const topSim = bySim.slice(0, 3);
  const topValue = all.filter(p => parseFloat(p.pp100) < 35 && p.similarity >= 65)
    .sort((a,b) => parseFloat(a.pp100) - parseFloat(b.pp100)).slice(0, 3);
  const topNut = [...all].sort((a,b) => b.nutrientCount - a.nutrientCount).slice(0, 3);
  const imported = all.filter(p => p.version.includes('进口') && p.similarity >= 65)
    .sort((a,b) => b.similarity - a.similarity).slice(0, 3);
  const sameBrand = all.filter(p => p.brand === '惠氏' || p.brand === '启赋')
    .sort((a,b) => b.similarity - a.similarity).slice(0, 2);

  function recCard(title, items, fields) {
    return \`
    <div class="table-container" style="margin-bottom:20px">
      <div class="rec-card-header">\${title}</div>
      \${items.length === 0 ? '<div style="padding:16px 24px;color:var(--muted)">暂无符合条件的产品</div>' : \`
      <table>
        <thead><tr>\${fields.map(f => '<th>' + f + '</th>').join('')}<th>操作</th></tr></thead>
        <tbody>
          \${items.map((p, i) => \`
          <tr>
            \${fields.map(f => {
              if (f === '排名') return '<td>#' + (i+1) + '</td>';
              if (f === '品牌系列') return '<td><strong>' + p.brand + ' ' + p.series + '</strong></td>';
              if (f === '相似度') return '<td><span class="sim-high">' + p.similarity.toFixed(0) + '%</span></td>';
              if (f === '价格') return '<td>¥' + p.pp100 + '/100g (~¥' + p.monthlyCost + '/月)</td>';
              if (f === '亮点') return '<td style="max-width:300px;white-space:normal;font-size:12px">' + (p.pros.slice(0, 4).join('；') || '配方总体接近') + '</td>';
              if (f === '营养素') return '<td>' + p.nutrientCount + '种</td>';
              if (f === '产地') return '<td>' + p.origin + '</td>';
              return '<td>-</td>';
            }).join('')}
            <td><button class="btn-compare" onclick="switchToCompare('\${p.product_name}')">直接对比</button></td>
          </tr>\`).join('')}
        </tbody>
      </table>\`}
    </div>\`;
  }

  main.innerHTML = \`
    <p style="margin-bottom:24px;color:var(--muted);font-size:14px">以<strong style="color:var(--ink)">惠氏启赋蕴淳 2段</strong>为基准，综合相似度、价格、营养全面性等维度推荐最佳替代方案。月均费用按3kg/月估算。</p>

    \${recCard('配方最相似 TOP3', topSim, ['排名', '品牌系列', '相似度', '亮点', '价格'])}
    \${recCard('高性价比之选（相似度≥65%且<35元/100g）', topValue, ['排名', '品牌系列', '相似度', '价格', '亮点'])}
    \${recCard('配方最全面 TOP3（营养素数）', topNut, ['排名', '品牌系列', '营养素', '相似度', '价格'])}
    \${recCard('进口配方推荐', imported, ['排名', '品牌系列', '产地', '相似度', '价格', '亮点'])}
    \${recCard('同品牌平替（惠氏/启赋）', sameBrand, ['排名', '品牌系列', '相似度', '价格', '亮点'])}

    <div class="table-container">
      <div class="rec-card-header">换奶注意事项</div>
      <div class="rec-card-note">
        <p><strong>转奶方法：</strong>混合转奶法 — 新奶粉从1/4开始，每3-5天增加1/4，约2周完成转换</p>
        <p><strong>观察要点：</strong>注意宝宝是否有腹泻、便秘、皮疹等不适反应</p>
        <p><strong>时机选择：</strong>避免在宝宝生病、打疫苗期间换奶</p>
      </div>
    </div>
  \`;
}

// ========== Compare Helper ==========
// ========== Searchable Dropdown ==========
function ssOpen(input) {
  ssCloseAll(input);
  const drop = document.getElementById(input.dataset.target.replace('Select', 'Drop'));
  if (drop) { drop.classList.add('open'); ssFilter(input); }
}
function ssBlur(input) {
  setTimeout(() => {
    if (!document.querySelector('.ss-option:hover')) {
      document.querySelectorAll('.ss-dropdown').forEach(d => d.classList.remove('open'));
    }
  }, 150);
}
function ssFilter(input) {
  const drop = document.getElementById(input.dataset.target.replace('Select', 'Drop'));
  if (!drop) return;
  const q = input.value.toLowerCase();
  let visible = 0;
  drop.querySelectorAll('.ss-option').forEach(opt => {
    const match = opt.textContent.toLowerCase().includes(q);
    opt.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  drop.querySelectorAll('.ss-no-result').forEach(e => e.remove());
  if (visible === 0) {
    const no = document.createElement('div');
    no.className = 'ss-no-result';
    no.textContent = '无匹配产品';
    drop.appendChild(no);
  }
}
function ssSelect(opt, n) {
  const hidden = document.getElementById('compareSelect' + n);
  const input = document.getElementById('ssInput' + n);
  if (hidden && input) {
    hidden.value = opt.dataset.value;
    input.value = opt.textContent.trim();
    document.getElementById('compareDrop' + n).classList.remove('open');
    updateCompare();
  }
}
function ssCloseAll(except) {
  document.querySelectorAll('.ss-dropdown').forEach(d => {
    if (d.id !== (except ? except.dataset.target.replace('Select', 'Drop') : null)) {
      d.classList.remove('open');
    }
  });
}
// Init: set baseline display text on first input
function ssInitBaseline() {
  const h1 = document.getElementById('compareSelect1');
  const inp = document.getElementById('ssInput1');
  if (h1 && inp && h1.value) {
    const opt = document.querySelector('#compareDrop1 .ss-option[data-value="' + h1.value.replace(/"/g, '\\"') + '"]');
    if (opt) inp.value = opt.textContent.trim();
  }
}

function switchToCompare(productName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const nutritionBtn = document.querySelector('[data-tab="nutrition"]');
  if (nutritionBtn) nutritionBtn.classList.add('active');
  renderTab('nutrition');
  setTimeout(() => {
    const sel2 = document.getElementById('compareSelect2');
    const inp2 = document.getElementById('ssInput2');
    if (sel2 && inp2) {
      sel2.value = productName;
      const opt = document.querySelector('#compareDrop2 .ss-option[data-value="' + productName.replace(/"/g, '\\"') + '"]');
      if (opt) inp2.value = opt.textContent.trim();
    }
    updateCompare();
  }, 150);
}

// ========== Init ==========
document.addEventListener('click', function(e) {
  if (!e.target.closest('.ss-wrap')) {
    document.querySelectorAll('.ss-dropdown').forEach(d => d.classList.remove('open'));
  }
});
renderTab('overview');
</script>
</body>
</html>`;

const outputPath = path.join(__dirname, '..', '..', 'milk_powder_data', 'reports', '奶粉配方对比分析.html');
fs.writeFileSync(outputPath, html, 'utf-8');
console.log('HTML report generated: ' + outputPath);
