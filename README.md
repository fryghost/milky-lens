# MilkyLens - 奶粉透镜

婴幼儿配方奶粉营养数据采集与分析工具，帮助家长科学对比奶粉配方，做出明智的换奶决策。

## 功能特性

- **数据采集**：从奶粉智库采集产品营养数据（需登录态）
- **Excel 对比报告**：5 个工作表，含相似度分析、换奶建议、价格对比
- **交互式 HTML 仪表盘**：自包含单文件，响应式设计，Dark Mode 支持
- **配方相似度算法**：加权计算，综合考虑基础营养、维生素、矿物质、特色成分

## 快速开始

### 前置条件

- Node.js 18+
- Playwright MCP 工具（用于数据采集）
- 奶粉智库网站登录态（cookies）

### 安装

```bash
git clone https://github.com/fryghost/milky-lens.git
cd milky-lens
npm install
```

### 数据目录设置

milky-lens 将代码与数据分离。采集的产品数据存放在仓库外部的 `milk_powder_data/data/` 目录：

```bash
# 在 milky-lens 的父目录创建数据目录
mkdir -p ../milk_powder_data/data/products
```

已经有采集好的数据？直接将 `products/` 等目录放入 `milk_powder_data/data/` 即可。

### 使用

**已有数据，生成报告：**
```bash
npm run excel   # 生成 Excel 报告
npm run html    # 生成 HTML 仪表盘
npm run report  # 一键执行：验证 → Excel → HTML
```

**数据质量检查：**
```bash
npm run validate
```

**合并产品数据：**
```bash
npm run merge
```

**采集新数据：** 参考 [SKILL.md 数据采集指南](https://github.com/fryghost/milky-lens/blob/master/SKILL.md) 或已安装 skill 的 `references/data-collection.md`

## 项目结构

```
workspace/
├── milky-lens/                     # 本仓库（代码，可发布到 GitHub）
│   ├── scripts/
│   │   ├── create_excel.js         # Excel 报告生成
│   │   ├── generate_report_html.js # HTML 仪表盘生成
│   │   ├── merge_products.js       # 合并产品 JSON
│   │   └── validate_products.js    # 数据质量检查
│   ├── package.json
│   └── README.md
└── milk_powder_data/               # 运行时数据与报告（不入仓库）
    ├── data/
    │   ├── products/               # 产品独立 JSON 文件
    │   ├── cookies.txt             # 奶粉智库 session cookies
    │   ├── progress.json           # 采集进度跟踪
    │   └── merged_products.json    # 合并数据集
    ├── reports/
    │   └── 奶粉配方对比分析.html    # 交互式 HTML 报告
    └── 奶粉配方对比分析.xlsx        # Excel 对比报告
```

## 相似度算法

采用加权相似度计算，权重设计依据中国婴幼儿配方奶粉国标（GB 10767-2021）：

| 类别 | 权重 | 设计理由 |
|------|------|---------|
| 基础营养 | 0.3 | 国标严格限定，各产品差异极小 |
| 维生素 | 0.5 | 国标有范围要求，有一定差异 |
| 矿物质 | 0.5 | 同上 |
| 特色成分 | 1.0 | 产品差异化核心，换奶决策关键 |

详细算法见 `references/similarity_algorithm.md`。

---

## ⚠️ 重要声明

### 数据来源

本工具所有营养数据均来自 **[奶粉智库 (naifenzhiku.com)](https://www.naifenzhiku.com)** —— 一个专业的婴幼儿配方奶粉产品数据库网站。

**特别感谢奶粉智库提供的数据服务，让家长能够科学对比奶粉配方。**

### 使用限制

1. **仅供个人学习研究使用**：本工具为开源项目，仅供个人学习和研究使用，**严禁用于任何商业目的**，包括但不限于：
   - 商业数据分析服务
   - 付费咨询或推荐服务
   - 企业内部商业决策支持
   - 任何形式的盈利性应用

2. **非官方工具**：本工具与奶粉智库无任何官方关联，未获得奶粉智库授权。数据采集通过公开网页接口实现。

3. **数据准确性免责**：
   - 数据可能存在滞后、错误或不完整
   - 产品信息以官方渠道为准
   - 不保证数据的实时性和准确性
   - 使用者需自行验证数据准确性

4. **健康决策免责**：
   - 本工具提供的数据分析仅供参考
   - 婴幼儿配方奶粉的选择应咨询专业医生或营养师
   - 不构成任何医疗或营养建议
   - 作者不对任何因使用本工具导致的损失承担责任

### 法律风险提示

- 数据采集可能涉及网站服务条款限制
- 大规模采集可能对网站造成负担，请合理控制频率
- 商业使用可能侵犯数据来源方的合法权益
- 使用者需自行承担法律风险

### 建议行为

- 采集前查看奶粉智库的服务条款
- 控制采集频率，避免对网站造成压力
- 仅采集个人研究所需数据
- 数据仅用于个人学习，不对外传播

---

## License

MIT License - **仅供个人学习和研究使用，禁止商业用途。**

见 [LICENSE](LICENSE) 文件。

---

## 致谢

- **奶粉智库** - 提供专业的奶粉产品数据库
- **所有奶粉品牌** - 为中国宝宝提供优质配方奶粉