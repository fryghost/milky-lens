# CLAUDE.md

## Build & Test Commands

```bash
npm run validate    # Data quality check (duplicates, missing prices, etc.)
npm run excel       # Generate Excel comparison report
npm run html        # Generate interactive HTML dashboard
npm run merge       # Merge individual product JSONs into one file
npm run report      # Full pipeline: validate → excel → html
npm install         # Install dependencies (ExcelJS)
```

Scripts read product data from `../milk_powder_data/data/products/` (relative to the `scripts/` directory). Reports are written to `milk_powder_data/` (excel) and `milk_powder_data/reports/` (html).

## Architecture

```
Phase 1: Data Collection          Phase 2: Excel Report          Phase 3: HTML Dashboard
(Playwright MCP / browser)  →     (create_excel.js)        →     (generate_report_html.js)
milk_powder_data/data/products/   奶粉配方对比分析.xlsx           reports/奶粉配方对比分析.html
```

- **Data format**: Each product is a JSON file with `product_name`, `details` (brand/series/price/weight/etc.), and `nutrition` (array of `{name, unit, per100g}`).
- **Similarity algorithm**: Weighted comparison against a baseline (惠氏启赋蕴淳). Basic nutrients weight 0.3, vitamins/minerals 0.5, premium ingredients 1.0. Missing premium ingredients get a -3 penalty, extra ones get a +2 bonus.
- **Scripts share logic**: `create_excel.js` and `generate_report_html.js` both implement the similarity algorithm independently. Changes to the algorithm must be synced across both files.
- **Code/data separation**: The `milky-lens/` directory contains only code and configuration. All runtime data lives in `milk_powder_data/data/` as a sibling directory, excluded from version control.
