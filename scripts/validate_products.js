/**
 * 奶粉产品数据质量检查脚本
 *
 * 检测项：
 * 1. 重复注册号（同一产品不同规格/名称）
 * 2. 价格缺失（无法计算元/100g）
 * 3. 规格异常（无法解析为数字）
 * 4. 营养素缺失（数量过少）
 *
 * 使用：node scripts/validate_products.js
 */

const fs = require('fs');
const path = require('path');

const productsDir = path.join(__dirname, '..', '..', 'milk_powder_data', 'data', 'products');
const outputFile = path.join(__dirname, '..', '..', 'milk_powder_data', 'data', 'validation_report.json');

const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.json'));

const issues = {
  duplicates: [],      // 重复注册号
  noPrice: [],         // 价格缺失
  invalidWeight: [],   // 规格异常
  lowNutrients: [],    // 营养素过少
  noRegNo: []          // 无注册号
};

const seenRegNo = {};
const allProducts = [];

console.log('=== 奶粉产品数据质量检查 ===\n');
console.log(`检查目录: ${productsDir}`);
console.log(`产品数量: ${files.length}\n`);

for (const file of files) {
  const filePath = path.join(productsDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const name = data.product_name;
  const d = data.details || {};
  const nutritionCount = data.nutrition ? data.nutrition.length : 0;

  allProducts.push({ file, name, data });

  // 1. 检测重复注册号
  const regNo = d['配方注册号'];
  if (regNo && regNo !== '待查' && regNo !== '') {
    if (seenRegNo[regNo]) {
      issues.duplicates.push({
        regNo,
        files: [seenRegNo[regNo], file],
        names: [seenRegNo[regNo].replace('.json', ''), name]
      });
    } else {
      seenRegNo[regNo] = file;
    }
  } else {
    issues.noRegNo.push({ file, name });
  }

  // 2. 检测价格缺失
  const priceStr = d['参考价'] || '';
  const price = parseInt(priceStr.replace('￥', '').replace('元', '')) || 0;
  if (price === 0) {
    issues.noPrice.push({ file, name, priceStr });
  }

  // 3. 检测规格异常
  const weightStr = d['规格'] || '';
  const weight = parseInt(weightStr.replace('g', '').replace('G', '')) || 0;
  if (weight === 0 || weight < 100 || weight > 2000) {
    issues.invalidWeight.push({ file, name, weightStr, parsed: weight });
  }

  // 4. 检测营养素缺失
  if (nutritionCount < 20) {
    issues.lowNutrients.push({ file, name, count: nutritionCount });
  }
}

// 输出报告
console.log('--- 检查结果 ---\n');

if (issues.duplicates.length > 0) {
  console.log(`【重复注册号】 ${issues.duplicates.length} 组`);
  for (const dup of issues.duplicates) {
    console.log(`  ${dup.regNo}: ${dup.names[0]} vs ${dup.names[1]}`);
  }
  console.log();
}

if (issues.noPrice.length > 0) {
  console.log(`【价格缺失】 ${issues.noPrice.length} 个`);
  for (const p of issues.noPrice) {
    console.log(`  ${p.name}: 参考价=${p.priceStr || '无'}`);
  }
  console.log();
}

if (issues.invalidWeight.length > 0) {
  console.log(`【规格异常】 ${issues.invalidWeight.length} 个`);
  for (const w of issues.invalidWeight) {
    console.log(`  ${w.name}: 规格=${w.weightStr}, 解析=${w.parsed}`);
  }
  console.log();
}

if (issues.lowNutrients.length > 0) {
  console.log(`【营养素过少】 ${issues.lowNutrients.length} 个`);
  for (const n of issues.lowNutrients) {
    console.log(`  ${n.name}: ${n.count} 种营养素`);
  }
  console.log();
}

if (issues.noRegNo.length > 0) {
  console.log(`【无注册号】 ${issues.noRegNo.length} 个`);
  for (const r of issues.noRegNo) {
    console.log(`  ${r.name}`);
  }
  console.log();
}

// 统计
const totalIssues = issues.duplicates.length + issues.noPrice.length +
                   issues.invalidWeight.length + issues.lowNutrients.length;

console.log('--- 统计 ---');
console.log(`总问题数: ${totalIssues}`);
console.log(`有效产品: ${files.length - issues.duplicates.length - issues.noPrice.length}`);

// 保存 JSON 报告
const report = {
  check_date: new Date().toISOString().split('T')[0],
  total_products: files.length,
  total_issues: totalIssues,
  issues,
  summary: {
    valid_products: files.length - issues.duplicates.length - issues.noPrice.filter(p => !issues.duplicates.some(d => d.files.includes(p.file))).length,
    unique_registrations: Object.keys(seenRegNo).length
  }
};

fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf-8');
console.log(`\n报告已保存: ${outputFile}`);

// 返回退出码
if (totalIssues > 0) {
  console.log('\n⚠ 发现数据问题，建议修复后再生成报告。');
  process.exit(1);
} else {
  console.log('\n✓ 数据质量检查通过。');
  process.exit(0);
}