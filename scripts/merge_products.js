// Merge individual product JSON files into a single combined file
const fs = require('fs');
const path = require('path');

const productsDir = path.join(__dirname, '..', '..', 'milk_powder_data', 'data', 'products');
const outputFile = path.join(__dirname, '..', '..', 'milk_powder_data', 'data', 'merged_products.json');

const files = fs.readdirSync(productsDir).filter(f => f.endsWith('.json'));

const merged = {
  collection_date: new Date().toISOString().split('T')[0],
  source: '奶粉智库 (naifenzhiku.com)',
  total_products: files.length,
  products: {}
};

for (const file of files) {
  const filePath = path.join(productsDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const name = data.product_name;
  delete data.product_name;
  merged.products[name] = data;
}

fs.writeFileSync(outputFile, JSON.stringify(merged, null, 2), 'utf-8');
console.log(`Merged ${files.length} products into ${outputFile}`);

// Also print a summary
console.log('\nProduct list:');
for (const [name, p] of Object.entries(merged.products)) {
  console.log(`  ${name} (ID: ${p.product_id}, ${p.nutrition.length} nutrients)`);
}
