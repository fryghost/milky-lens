---
name: milky-lens
description: >
  奶粉透镜 - 婴幼儿配方奶粉营养数据采集与分析工具。Use when collecting infant formula 
  nutrition data, generating comparison reports (Excel/HTML), or finding formula alternatives. 
  Triggers on: 奶粉对比, 配方分析, 营养成分采集, milk powder comparison, formula analysis, 
  换奶推荐, 奶粉数据, 配方对比, MilkyLens.
---

# MilkyLens - 奶粉透镜

完整工作流：数据采集 → Excel 对比报告 → 交互式 HTML 可视化

## 前置条件

- Playwright MCP 工具可用（`browser_navigate`, `browser_run_code_unsafe`, `browser_snapshot` 等）
- Node.js 环境
- 奶粉智库网站登录态（cookies）

## 工作流概览

```
Phase 1: 数据采集          Phase 2: Excel 生成        Phase 3: HTML 报告
─────────────────         ─────────────────         ─────────────────
Playwright 浏览器     →    node scripts/        →    node scripts/
采集产品营养数据           create_excel.js           generate_report_html.js
存入 milk_powder_data/     → milk_powder_data/       → milk_powder_data/reports/
   data/products/            奶粉配方对比分析.xlsx      奶粉配方对比分析.html
```

每个 Phase 可独立运行。如果已有完整 JSON 数据，可直接跳到 Phase 2 或 3。

---

## Phase 1: 数据采集

详细步骤见 [`references/data-collection.md`](references/data-collection.md)

核心流程：
1. **确定目标**：品牌、段位、基准产品
2. **应用 Cookies**：从 `milk_powder_data/data/cookies.txt` 加载登录态
3. **发现产品 ID**：通过品牌页面或搜索
4. **批量提取**：每批最多 7 个产品
5. **保存 JSON**：存入 `milk_powder_data/data/products/`

> **CRITICAL**: Playwright JS 代码必须用 `var` 和传统 for 循环，不支持 `let`/`const`/`for...of`。

---

## 数据质量检查

生成报告前必须执行：

```bash
node scripts/validate_products.js
```

检查项：重复注册号、价格缺失、规格异常、营养素缺失。

---

## Phase 2: Excel 对比报告

详细说明见 [`references/excel-generation.md`](references/excel-generation.md)

```bash
node scripts/create_excel.js
```

输出 5 个工作表：品牌概览、营养成分对比、配方相似度分析、换奶建议、价格对比。

相似度算法详见 [`references/similarity_algorithm.md`](references/similarity_algorithm.md)。

---

## Phase 3: 交互式 HTML 报告

详细说明见 [`references/html-generation.md`](references/html-generation.md)

```bash
node scripts/generate_report_html.js
```

输出自包含单文件 HTML，含 5 个 Tab，响应式设计，Dark Mode 支持。

---

## 项目文件结构

```
workspace/
├── milk_powder_data/data/        # 数据目录（运行时数据）
│   ├── products/                 # 产品独立 JSON 文件
│   ├── cookies.txt               # 奶粉智库 session cookies
│   ├── progress.json             # 采集进度跟踪
│   └── merged_products.json      # 合并数据集
├── milk_powder_data/reports/     # 生成的报告
│   └── 奶粉配方对比分析.html      # 交互式 HTML 报告
├── milk_powder_data/奶粉配方对比分析.xlsx  # Excel 对比报告
├── milky-lens/                   # 本仓库（代码，可发布到 GitHub）
│   ├── scripts/
│   │   ├── create_excel.js       # Excel 报告生成
│   │   ├── generate_report_html.js # HTML 仪表盘生成
│   │   ├── merge_products.js     # 合并产品 JSON
│   │   └── validate_products.js  # 数据质量检查
│   ├── references/
│   ├── README.md
│   └── SKILL.md                  # 本文件
```

---

## 数据来源

所有营养数据来自 [奶粉智库 (naifenzhiku.com)](https://www.naifenzhiku.com)，一个专业的奶粉产品数据库网站。数据采集仅供个人研究对比使用。
