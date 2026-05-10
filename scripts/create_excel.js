const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const productsDir = path.join(__dirname, '..', '..', 'milk_powder_data', 'data', 'products');
const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.json'));

const products = [];
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(productsDir, file), 'utf-8'));
  products.push(data);
}

// Build a lookup map by product_name
const lookup = {};
for (const p of products) {
  lookup[p.product_name] = p;
}

// Helper: build nutrition map for a product
function nutritionMap(p) {
  const m = {};
  for (const n of p.nutrition) {
    m[n.name] = { unit: n.unit, per100g: n.per100g };
  }
  return m;
}

// Helper: get nutrient value
function nv(p, name) {
  const nm = nutritionMap(p);
  if (nm[name]) return nm[name].per100g;
  return '-';
}

// Helper: format features string from nutrition data
function formatFeatures(p) {
  const nm = nutritionMap(p);
  const features = [];
  const keys = ['DHA', 'ARA/AA', 'OPO', '乳铁蛋白', '核苷酸', 'CPP', '叶黄素',
    '低聚半乳糖', '低聚果糖', '多聚果糖', 'HMO(2\\\'-FL)', 'HMO(LNnT)',
    '胆碱', '肌醇', '牛磺酸', '左旋肉碱', '益生菌'];
  for (const k of keys) {
    if (nm[k] && nm[k].per100g !== '-') {
      features.push(`${k}(${nm[k].per100g}${nm[k].unit})`);
    }
  }
  return features.join('、') || '-';
}

// Build all-nutrient union
const allNutrientNames = new Set();
for (const p of products) {
  for (const n of p.nutrition) {
    allNutrientNames.add(n.name);
  }
}
const sortedNutrients = Array.from(allNutrientNames).sort();

// Categorize nutrients
const baseNutrients = ['能量', '蛋白质', '乳清蛋白', '脂肪', '亚油酸', 'α-亚麻酸', '碳水化合物',
  '钠', '钾', '铜', '镁', '铁', '锌', '锰', '钙', '磷', '碘', '氯', '硒'];
const vitamins = sortedNutrients.filter(n => n.startsWith('维生素') || ['烟酸(烟酰胺)', '叶酸', '泛酸', '生物素'].includes(n));
const minerals = baseNutrients.filter(n => sortedNutrients.includes(n));
const optional = sortedNutrients.filter(n =>
  !baseNutrients.includes(n) && !vitamins.includes(n) &&
  !['基础营养', '维生素', '矿物质', '可选成分'].includes(n));

// ============ Create workbook ============
const workbook = new ExcelJS.Workbook();
workbook.creator = 'Claude Code';
workbook.created = new Date();

// ============ Sheet 1: 品牌概览 ============
const sheet1 = workbook.addWorksheet('品牌概览');
sheet1.columns = [
  { header: '品牌', key: 'brand', width: 14 },
  { header: '系列', key: 'series', width: 18 },
  { header: '产地', key: 'origin', width: 10 },
  { header: '奶源', key: 'milkSource', width: 10 },
  { header: '规格(g)', key: 'weight', width: 9 },
  { header: '参考价(元)', key: 'price', width: 11 },
  { header: '元/100g', key: 'pricePer100g', width: 9 },
  { header: '版本', key: 'version', width: 12 },
  { header: '类别', key: 'category', width: 10 },
  { header: '配方注册号', key: 'regNo', width: 20 },
  { header: '营养素数', key: 'nutrientCount', width: 9 },
  { header: '特色成分', key: 'features', width: 60 }
];

const overviewRows = products.map(p => {
  const d = p.details || {};
  const weight = parseInt(d['规格']) || 0;
  const price = parseInt(d['参考价']?.replace('￥', '')) || 0;
  return {
    brand: d['品牌'] || '',
    series: d['系列'] || '',
    origin: d['产地'] || '',
    milkSource: d['奶源'] || '',
    weight: weight,
    price: price,
    pricePer100g: weight > 0 ? (price / weight * 100).toFixed(1) : '-',
    version: d['版本'] || '',
    category: d['类别'] || '',
    regNo: d['配方注册号'] || '',
    nutrientCount: p.nutrition.length,
    features: formatFeatures(p)
  };
});

sheet1.addRows(overviewRows);
sheet1.getRow(1).font = { bold: true };
sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
// Highlight baseline
const baselineRow = overviewRows.findIndex(r => r.brand === '启赋' && r.series === 'Atwo蕴淳') + 2;
if (baselineRow > 1) {
  sheet1.getRow(baselineRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0B0' } };
}

// ============ Sheet 2: 完整营养成分对比 ============
const sheet2 = workbook.addWorksheet('完整营养成分对比');

// All products for full comparison
const keyProducts = products.map(p => p.product_name);

// Build columns
const nutrientColumns = [
  { header: '营养成分', key: 'nutrient', width: 20 },
  { header: '单位', key: 'unit', width: 8 }
];
for (const name of keyProducts) {
  const shortName = name.length > 8 ? name.substring(0, 8) + '…' : name;
  nutrientColumns.push({ header: shortName, key: name, width: 12 });
}
sheet2.columns = nutrientColumns;

// Build nutrient rows
const nutrientRows = [];
// Minerals
nutrientRows.push({ nutrient: '【矿物质】', unit: '', ...Object.fromEntries(keyProducts.map(n => [n, ''])) });
for (const nut of minerals) {
  const p0 = lookup[keyProducts[0]];
  const unit = p0 ? (nutritionMap(p0)[nut]?.unit || '') : '';
  const row = { nutrient: nut, unit: unit };
  for (const name of keyProducts) {
    const p = lookup[name];
    row[name] = p ? nv(p, nut) : '-';
  }
  nutrientRows.push(row);
}
// Vitamins
nutrientRows.push({ nutrient: '【维生素】', unit: '', ...Object.fromEntries(keyProducts.map(n => [n, ''])) });
for (const nut of vitamins) {
  const p0 = lookup[keyProducts[0]];
  const unit = p0 ? (nutritionMap(p0)[nut]?.unit || '') : '';
  const row = { nutrient: nut, unit: unit };
  for (const name of keyProducts) {
    const p = lookup[name];
    row[name] = p ? nv(p, nut) : '-';
  }
  nutrientRows.push(row);
}
// Optional / special
nutrientRows.push({ nutrient: '【可选/特色成分】', unit: '', ...Object.fromEntries(keyProducts.map(n => [n, ''])) });
for (const nut of optional) {
  const p0 = lookup[keyProducts[0]];
  const unit = p0 ? (nutritionMap(p0)[nut]?.unit || '') : '';
  const row = { nutrient: nut, unit: unit };
  for (const name of keyProducts) {
    const p = lookup[name];
    row[name] = p ? nv(p, nut) : '-';
  }
  nutrientRows.push(row);
}

sheet2.addRows(nutrientRows);
sheet2.getRow(1).font = { bold: true };
sheet2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB4C6E7' } };

// Style category header rows
for (let i = 0; i < nutrientRows.length; i++) {
  if (nutrientRows[i].nutrient.startsWith('【')) {
    const r = sheet2.getRow(i + 2); // +2 for header row + 0-index
    r.font = { bold: true };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  }
}

// Color coding: compare to baseline (惠氏启赋蕴淳), red=higher, green=lower
const baselineName = '惠氏启赋蕴淳';
const baselineColIdx = keyProducts.indexOf(baselineName);
if (baselineColIdx >= 0) {
  const redFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
  const greenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };
  const yellowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0B0' } };

  for (let i = 0; i < nutrientRows.length; i++) {
    const row = nutrientRows[i];
    if (row.nutrient.startsWith('【')) continue;

    const baselineVal = parseFloat(row[baselineName]);
    if (isNaN(baselineVal) || baselineVal === 0) continue;

    const excelRow = sheet2.getRow(i + 2);
    for (let j = 0; j < keyProducts.length; j++) {
      const name = keyProducts[j];
      const val = parseFloat(row[name]);
      if (isNaN(val)) continue;

      const cell = excelRow.getCell(j + 3);
      if (val > baselineVal) {
        cell.fill = redFill;
      } else if (val < baselineVal) {
        cell.fill = greenFill;
      }
    }

    // Highlight baseline column
    const baselineCell = excelRow.getCell(baselineColIdx + 3);
    baselineCell.fill = yellowFill;
  }
}

// Freeze first 2 columns
sheet2.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

// ============ Sheet 3: 配方相似度分析 ============
const sheet3 = workbook.addWorksheet('配方相似度分析');
sheet3.columns = [
  { header: '品牌系列', key: 'name', width: 20 },
  { header: '与启赋蕴淳相似度', key: 'similarity', width: 18 },
  { header: '优势', key: 'pros', width: 55 },
  { header: '劣势', key: 'cons', width: 35 },
  { header: '换奶建议', key: 'suggestion', width: 30 }
];

// Nutrient weight tiers — 特色成分是产品差异化的核心，基础营养国标严格限制差异极小
const BASIC_NUTRIENTS = ['能量', '蛋白质', '脂肪', '碳水化合物', '亚油酸', 'α-亚麻酸'];
const PREMIUM_NUTRIENTS = [
  'DHA', 'ARA/AA', 'OPO', '乳铁蛋白', '核苷酸', 'CPP', '叶黄素',
  '低聚半乳糖', '低聚果糖', '多聚果糖', 'HMO(2\'-FL)', 'HMO(LNnT)', 'HMO',
  '胆碱', '肌醇', '牛磺酸', '左旋肉碱', '益生菌', '膳食纤维'
];

function getNutrientWeight(name) {
  if (BASIC_NUTRIENTS.includes(name)) return 0.3;
  if (PREMIUM_NUTRIENTS.includes(name)) return 1.0;
  // Vitamins
  if (name.startsWith('维生素') || ['烟酸(烟酰胺)', '叶酸', '泛酸', '生物素'].includes(name)) return 0.5;
  return 0.5; // Minerals and others
}

function calcSimilarity(p) {
  const baseline = lookup['惠氏启赋蕴淳'];
  if (!baseline || !p) return 0;
  if (p.product_name === '惠氏启赋蕴淳') return 100;

  const bm = nutritionMap(baseline);
  const pm = nutritionMap(p);

  // 1. Weighted average difference for common nutrients
  let totalWeightedDiff = 0;
  let totalWeight = 0;

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

  // 2. Penalty: baseline has premium nutrient but product doesn't
  let missingPenalty = 0;
  for (const k of PREMIUM_NUTRIENTS) {
    if (bm[k] && parseFloat(bm[k].per100g) > 0 && (!pm[k] || parseFloat(pm[k].per100g) <= 0))
      missingPenalty += 3;
  }

  // 3. Bonus: product has premium nutrient baseline lacks
  let extraBonus = 0;
  for (const k of PREMIUM_NUTRIENTS) {
    if (pm[k] && parseFloat(pm[k].per100g) > 0 && (!bm[k] || parseFloat(bm[k].per100g) <= 0))
      extraBonus += 2;
  }

  return Math.max(0, Math.min(100, 100 - weightedAvgDiff * 100 - missingPenalty + extraBonus));
}

function getStars(pct) {
  if (pct >= 80) return '★★★★★';
  if (pct >= 75) return '★★★★☆';
  if (pct >= 70) return '★★★☆☆';
  if (pct >= 65) return '★★☆☆☆';
  return '★☆☆☆☆';
}

// Compare all products (excluding baseline)
const compareProducts = products.filter(p => p.product_name !== '惠氏启赋蕴淳');

const analysisRows = compareProducts.map(p => {
  const sim = calcSimilarity(p);
  const stars = getStars(sim);
  const nm = nutritionMap(p);
  const bnm = nutritionMap(lookup['惠氏启赋蕴淳']);

  const pros = [], cons = [];
  for (const k of Object.keys(nm)) {
    if (k === '能量' || k === '蛋白质' || k === '脂肪' || k === '碳水化合物') continue;
    const pv = parseFloat(nm[k].per100g);
    const bv = bnm[k] ? parseFloat(bnm[k].per100g) : NaN;
    if (!isNaN(pv) && !isNaN(bv) && pv > bv * 1.1) pros.push(`${k}(${nm[k].per100g} vs ${bnm[k].per100g})`);
    if (!isNaN(pv) && isNaN(bv)) pros.push(`含${k}(${nm[k].per100g}${nm[k].unit})`);
  }
  if (!bnm['乳铁蛋白'] && nm['乳铁蛋白']) pros.push(`含乳铁蛋白(${nm['乳铁蛋白'].per100g}mg)`);
  if (!bnm['肌醇'] && nm['肌醇']) pros.push(`含肌醇(${nm['肌醇'].per100g}mg)`);
  if (!bnm['牛磺酸'] && nm['牛磺酸']) pros.push(`含牛磺酸(${nm['牛磺酸'].per100g}mg)`);
  if (!bnm['核苷酸'] && nm['核苷酸']) pros.push(`含核苷酸(${nm['核苷酸'].per100g}mg)`);
  if (!bnm['CPP'] && nm['CPP']) pros.push(`含CPP(${nm['CPP'].per100g}mg)`);
  if (!bnm['左旋肉碱'] && nm['左旋肉碱']) pros.push(`含左旋肉碱`);

  if (!nm['低聚半乳糖'] && bnm['低聚半乳糖']) cons.push('无低聚半乳糖');
  if (!nm['OPO'] && bnm['OPO']) cons.push('无OPO');
  if (!nm['叶黄素'] && bnm['叶黄素']) cons.push('无叶黄素');
  if (!nm['DHA'] || (parseFloat(nm['DHA']?.per100g) || 0) < 90) cons.push('DHA含量较低');
  if (!nm['硒'] || (parseFloat(nm['硒']?.per100g) || 0) < 15) cons.push('硒含量较低');

  const d = p.details || {};
  const price = parseInt(d['参考价']?.replace('￥', '')) || 0;
  const weight = parseInt(d['规格']) || 1;
  const pp100 = price / weight * 100;

  return {
    name: `${d['品牌'] || ''} ${d['系列'] || ''}`,
    similarity: `${stars} (${sim.toFixed(0)}%)`,
    pros: pros.slice(0, 5).join('；') || '配方总体接近',
    cons: cons.slice(0, 3).join('；') || '无明显劣势',
    suggestion: sim >= 80 ? '高度推荐' : sim >= 75 ? '推荐' : sim >= 70 ? '可考虑' : '一般'
  };
});

sheet3.addRows(analysisRows);
sheet3.getRow(1).font = { bold: true };
sheet3.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } };

// ============ Sheet 4: 换奶建议 ============
const sheet4 = workbook.addWorksheet('换奶建议');
sheet4.columns = [
  { header: '项目', key: 'item', width: 20 },
  { header: '内容', key: 'content', width: 85 }
];

// Compute top recommendations for Sheet 4
const allSims = compareProducts.map(p => ({ p, sim: calcSimilarity(p) }));
allSims.sort((a, b) => b.sim - a.sim);

// Top similarity picks (excluding same-brand alternatives for variety)
const topSim = allSims.slice(0, 10);
const topValue = allSims.filter(x => {
  const d = x.p.details || {};
  const w = parseInt(d['规格']) || 1;
  const pr = parseInt(d['参考价']?.replace('￥', '')) || 999;
  return (pr / w * 100) < 35 && x.sim >= 65;
}).sort((a, b) => {
  const da = a.p.details || {}, db = b.p.details || {};
  const wa = parseInt(da['规格']) || 1, wb = parseInt(db['规格']) || 1;
  const pa = parseInt(da['参考价']?.replace('￥', '')) || 0, pb = parseInt(db['参考价']?.replace('￥', '')) || 0;
  return (pa / wa) - (pb / wb);
});
const topNutrients = allSims.filter(x => x.p.nutrition.length >= 42).sort((a, b) => b.p.nutrition.length - a.p.nutrition.length);
const imported = allSims.filter(x => {
  const d = x.p.details || {};
  return (d['版本'] || '').includes('进口') && x.sim >= 65;
}).sort((a, b) => b.sim - a.sim);

function fmtPrice(p) {
  const d = p.details || {};
  const w = parseInt(d['规格']) || 1;
  const pr = parseInt(d['参考价']?.replace('￥', '')) || 0;
  return `约${pr}元/${w}g（约${(pr/w*100).toFixed(1)}元/100g）`;
}

function fmtPros(p) {
  const nm = nutritionMap(p);
  const bnm = nutritionMap(lookup['惠氏启赋蕴淳']);
  const pros = [];
  for (const k of Object.keys(nm)) {
    if (k === '能量' || k === '蛋白质' || k === '脂肪' || k === '碳水化合物') continue;
    const pv = parseFloat(nm[k].per100g);
    const bv = bnm[k] ? parseFloat(bnm[k].per100g) : NaN;
    if (!isNaN(pv) && !isNaN(bv) && pv > bv * 1.2) pros.push(`${k}(${nm[k].per100g} vs ${bnm[k].per100g})`);
    if (!isNaN(pv) && isNaN(bv)) pros.push(`含${k}(${nm[k].per100g}${nm[k].unit})`);
  }
  return pros.slice(0, 4).join('；') || '配方总体接近';
}

const suggestions = [
  { item: '当前奶粉', content: '惠氏启赋蕴淳 2段' },
  { item: '换奶阶段', content: '2段（6-12个月）' },
  { item: '对比产品总数', content: `${products.length}款2段奶粉` },
  { item: '', content: '' },
];

// Top 3 most similar
suggestions.push({ item: '【配方最相似 TOP3】', content: '' });
for (let i = 0; i < Math.min(3, topSim.length); i++) {
  const x = topSim[i];
  const d = x.p.details || {};
  const name = `${d['品牌'] || ''} ${d['系列'] || ''}`;
  suggestions.push({ item: `TOP${i+1}`, content: `${name} — 相似度 ${x.sim.toFixed(0)}%` });
  suggestions.push({ item: ' 优势', content: fmtPros(x.p) });
  suggestions.push({ item: ' 价格', content: fmtPrice(x.p) });
}
suggestions.push({ item: '', content: '' });

// Best value
suggestions.push({ item: '【高性价比之选（相似度≥65%且<35元/100g）】', content: '' });
if (topValue.length > 0) {
  for (let i = 0; i < Math.min(3, topValue.length); i++) {
    const x = topValue[i];
    const d = x.p.details || {};
    const name = `${d['品牌'] || ''} ${d['系列'] || ''}`;
    suggestions.push({ item: `推荐${i+1}`, content: `${name} — 相似度 ${x.sim.toFixed(0)}%, ${fmtPrice(x.p)}` });
    suggestions.push({ item: ' 亮点', content: fmtPros(x.p) });
  }
} else {
  suggestions.push({ item: '说明', content: '暂无同时满足高相似度和低价的产品' });
}
suggestions.push({ item: '', content: '' });

// Most comprehensive formula
suggestions.push({ item: '【配方最全面（营养素数≥42）】', content: '' });
for (let i = 0; i < Math.min(3, topNutrients.length); i++) {
  const x = topNutrients[i];
  const d = x.p.details || {};
  const name = `${d['品牌'] || ''} ${d['系列'] || ''}`;
  suggestions.push({ item: `推荐${i+1}`, content: `${name} — ${x.p.nutrition.length}种营养素, 相似度 ${x.sim.toFixed(0)}%` });
  suggestions.push({ item: ' 亮点', content: fmtPros(x.p) });
  suggestions.push({ item: ' 价格', content: fmtPrice(x.p) });
}
suggestions.push({ item: '', content: '' });

// Imported
suggestions.push({ item: '【进口配方推荐】', content: '' });
if (imported.length > 0) {
  for (let i = 0; i < Math.min(3, imported.length); i++) {
    const x = imported[i];
    const d = x.p.details || {};
    const name = `${d['品牌'] || ''} ${d['系列'] || ''}`;
    suggestions.push({ item: `推荐${i+1}`, content: `${name} (${d['产地'] || ''}) — 相似度 ${x.sim.toFixed(0)}%, ${fmtPrice(x.p)}` });
    suggestions.push({ item: ' 亮点', content: fmtPros(x.p) });
  }
} else {
  suggestions.push({ item: '说明', content: '暂无高相似度的进口产品' });
}
suggestions.push({ item: '', content: '' });

// Same brand alternative
const sameBrand = allSims.filter(x => {
  const d = x.p.details || {};
  return d['品牌'] === '惠氏' || d['品牌'] === '启赋';
}).sort((a, b) => b.sim - a.sim);
suggestions.push({ item: '【同品牌平替】', content: '' });
if (sameBrand.length > 0) {
  for (let i = 0; i < Math.min(2, sameBrand.length); i++) {
    const x = sameBrand[i];
    const d = x.p.details || {};
    const name = `${d['品牌'] || ''} ${d['系列'] || ''}`;
    suggestions.push({ item: `推荐${i+1}`, content: `${name} — 相似度 ${x.sim.toFixed(0)}%, ${fmtPrice(x.p)}` });
    suggestions.push({ item: ' 亮点', content: fmtPros(x.p) });
  }
} else {
  suggestions.push({ item: '说明', content: '暂无同品牌其他产品' });
}
suggestions.push({ item: '', content: '' });

suggestions.push(
  { item: '【换奶注意事项】', content: '' },
  { item: '转奶方法', content: '混合转奶法：新奶粉从1/4开始，每3-5天增加1/4，约2周完成转换' },
  { item: '观察要点', content: '注意宝宝是否有腹泻、便秘、皮疹等不适反应' },
  { item: '时机选择', content: '避免在宝宝生病、打疫苗期间换奶' },
  { item: '', content: '' },
  { item: '【数据来源】', content: '' },
  { item: '营养数据', content: `奶粉智库(naifenzhiku.com) - 专业奶粉数据库，共${products.length}款2段奶粉完整营养成分` },
  { item: '数据日期', content: '2026年5月' }
);

sheet4.addRows(suggestions);
sheet4.getRow(1).font = { bold: true };
sheet4.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
// Highlight section header rows dynamically
for (let i = 0; i < suggestions.length; i++) {
  if (suggestions[i].item.startsWith('【')) {
    const r = sheet4.getRow(i + 2);
    r.font = { bold: true };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  }
}

// ============ Sheet 5: 价格对比 ============
const sheet5 = workbook.addWorksheet('价格对比');
sheet5.columns = [
  { header: '品牌系列', key: 'name', width: 22 },
  { header: '品牌', key: 'brand', width: 12 },
  { header: '规格(g)', key: 'weight', width: 9 },
  { header: '参考价(元)', key: 'price', width: 11 },
  { header: '元/100g', key: 'pricePer100g', width: 9 },
  { header: '月均费用估算', key: 'monthlyCost', width: 14 },
  { header: '性价比评级', key: 'rating', width: 12 }
];

const priceRows = products.map(p => {
  const d = p.details || {};
  const weight = parseInt(d['规格']) || 0;
  const price = parseInt(d['参考价']?.replace('￥', '')) || 0;
  const pp100 = weight > 0 ? (price / weight * 100) : 0;
  const monthlyCost = pp100 > 0 ? (pp100 * 30) : 0; // 3000g(3kg)/month
  let rating;
  if (pp100 <= 30) rating = '★★★★★';
  else if (pp100 <= 38) rating = '★★★★☆';
  else if (pp100 <= 45) rating = '★★★☆☆';
  else if (pp100 <= 55) rating = '★★☆☆☆';
  else rating = '★☆☆☆☆';

  return {
    name: `${d['品牌'] || ''} ${d['系列'] || ''}`,
    brand: d['品牌'] || '',
    weight: weight,
    price: price,
    pricePer100g: pp100.toFixed(1),
    monthlyCost: `~${Math.round(monthlyCost)}元`,
    rating: rating
  };
});
priceRows.sort((a, b) => parseFloat(a.pricePer100g) - parseFloat(b.pricePer100g));

sheet5.addRows(priceRows);
sheet5.getRow(1).font = { bold: true };
sheet5.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

// Highlight baseline
const bRow = priceRows.findIndex(r => r.brand === '启赋' && r.name.includes('蕴淳')) + 2;
if (bRow > 1) {
  sheet5.getRow(bRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0B0' } };
}

sheet5.addRow([]);
sheet5.addRow(['注：月均费用按宝宝每月约3000g(3kg)奶粉消耗量估算']);

// Save
const outputPath = path.join(__dirname, '..', '..', 'milk_powder_data', '奶粉配方对比分析.xlsx');
workbook.xlsx.writeFile(outputPath)
  .then(() => {
    console.log(`Excel文件已创建: ${outputPath}`);
    console.log('\n包含5个工作表:');
    console.log(`1. 品牌概览 - ${products.length}款奶粉基本信息`);
    console.log(`2. 完整营养成分对比 - ${sortedNutrients.length}种营养成分 × ${keyProducts.length}款产品`);
    console.log(`3. 配方相似度分析 - ${compareProducts.length}款产品与启赋蕴淳对比`);
    console.log('4. 换奶建议 - 详细推荐理由');
    console.log('5. 价格对比 - 性价比分析（按价格排序）');
  })
  .catch(err => {
    console.error('创建Excel文件时出错:', err);
  });
