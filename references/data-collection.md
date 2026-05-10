# 数据采集详细指南

Phase 1: 使用 Playwright 从奶粉智库采集产品营养数据。

## 前置条件

- Playwright MCP 工具可用（`browser_navigate`, `browser_run_code_unsafe`, `browser_snapshot` 等）
- Node.js 环境
- 奶粉智库网站登录态（cookies）

## 步骤概览

```
1. 确定采集目标 → 2. 应用 Cookies → 3. 发现产品 ID → 4. 批量提取数据 → 5. 保存 JSON
```

---

## 1. 确定采集目标

询问用户：
- **品牌范围**：具体品牌，还是数据库中已有品牌？
- **段位**：1段/2段/3段？不限段位？
- **基准产品**：以哪款产品为对比基准？（默认：惠氏启赋蕴淳）
- **数据完整性**：全量营养成分还是基础信息？

---

## 2. Cookie 管理

奶粉智库需登录才能查看完整营养数值。Session cookies 保存在 `data/cookies.txt`，格式为 JSON 数组。

### 应用 Cookies

```javascript
// 在 browser_run_code_unsafe 中执行
async (page) => {
  var fs = require('fs');
  var dataDir = process.cwd().replace(/\\/g, '/') + '/milk_powder_data/data';
  var cookies = JSON.parse(fs.readFileSync(dataDir + '/cookies.txt', 'utf-8'));
  await page.context().addCookies(cookies);
  return 'cookies applied';
}
```

### 更新 Cookies（过期时）

```javascript
async (page) => {
  var cookies = await page.context().cookies();
  var dataDir = process.cwd().replace(/\\/g, '/') + '/milk_powder_data/data';
  require('fs').writeFileSync(dataDir + '/cookies.txt', JSON.stringify(cookies));
  return 'cookies saved';
}
```

### Cookie 过期检测

如果采集到的营养素全部为 `-` 或数量 < 10，提示 cookies 可能过期。

---

## 3. 产品发现

通过品牌页面获取产品 ID 列表。每个产品卡片链接格式为 `/powder/detail-<ID>.html`。

### 方式一：品牌页面提取

```javascript
await page.evaluate(function() {
  var links = document.querySelectorAll('a[href*="/powder/detail-"]');
  return Array.from(links).map(function(l) {
    var id = l.href.match(/detail-(\d+)\.html/);
    return id ? { id: id[1], name: l.textContent.trim() } : null;
  }).filter(Boolean);
});
```

### 方式二：站点搜索

```
https://www.naifenzhiku.com/search.html?keyword=<品牌名>
```

### 常用品牌页面 URL

| 品牌 | URL 路径 |
|------|---------|
| 飞鹤 | `/brand/feihe.html` |
| 君乐宝 | `/brand/junlebao.html` |
| 金领冠 | `/brand/jinlingguan.html` |
| 惠氏/启赋 | `/brand/huishi.html` |
| 爱他美 | `/brand/aitamei.html` |
| 美赞臣 | `/brand/meizanchen.html` |
| 美素佳儿 | `/brand/meisujiaer.html` |
| 合生元 | `/brand/heshengyuan.html` |

---

## 4. 单产品数据提取（核心函数）

> **CRITICAL**: 在 `browser_run_code_unsafe` 中必须使用 `var` 声明变量，使用 `for (var i = 0; i < n; i++)` 循环。**严禁**使用 `let`、`const`、`for...of`、箭头函数——这些会导致 `SyntaxError`。

```javascript
async (page) => {
  var ids = ['<product_id_1>', '<product_id_2>']; // 最多7个/批
  var results = [];
  for (var i = 0; i < ids.length; i++) {
    await page.goto('https://www.naifenzhiku.com/powder/detail-' + ids[i] + '.html');
    await page.waitForTimeout(2000);
    var data = await page.evaluate(function() {
      var r = { nutrition: [], details: {}, productName: '', prodId: '' };

      // --- 提取营养数据 ---
      var divs = document.querySelectorAll('.left');
      var col = null;
      for (var di = 0; di < divs.length; di++) {
        if (divs[di].children.length > 10) { col = divs[di]; break; }
      }
      var seen = {};
      if (col) {
        for (var ci = 0; ci < col.children.length; ci++) {
          var c = col.children[ci];
          var t = c.textContent.trim();
          if (t === '基础营养' || t === '维生素' || t === '矿物质' || t === '可选成分') continue;
          var n = t.split('\n')[0].trim();
          if (n === '维生素' || (n.indexOf('成分') > -1 && n.indexOf('单位') > -1)) continue;
          if (seen[n]) continue;
          seen[n] = true;
          var toks = t.split(/\s+/);
          if (toks.length < 3) continue;
          var pg = toks[toks.length - 2];
          var pk = toks[toks.length - 1];
          var u = toks[toks.length - 3];
          if (!/^[\d.]+$/.test(pg) || !/^[\d.]+$/.test(pk)) continue;
          if (/^[\d.]+$/.test(u)) continue;
          r.nutrition.push({ name: n, unit: u, per100g: pg });
        }
      }

      // --- 产品名称 ---
      var h2 = document.querySelector('h2');
      if (h2) r.productName = h2.textContent.trim();

      // --- 产品 ID ---
      var m = document.title.match(/detail-(\d+)/);
      if (m) r.prodId = m[1];

      // --- 详情信息 ---
      var lis = document.querySelectorAll('li');
      for (var li = 0; li < lis.length; li++) {
        var text = lis[li].textContent.trim();
        var idx = text.indexOf('：');
        if (idx === -1) idx = text.indexOf(':');
        if (idx > -1) {
          var key = text.substring(0, idx).trim();
          var val = text.substring(idx + 1).trim();
          if (key.length <= 20 && val.length > 0 && val.length < 100) {
            r.details[key] = val;
          }
        }
      }

      return r;
    });
    results.push(data);
  }
  return JSON.stringify(results);
}
```

---

## 5. 保存产品数据

每批采集完成后立即保存：

```javascript
async (page) => {
  // ... 采集代码 ...
  var fs = require('fs');
  var dataDir = process.cwd().replace(/\\/g, '/') + '/milk_powder_data/data';
  for (var i = 0; i < results.length; i++) {
    var product = results[i];
    var fileName = product.productName.replace(/[\/\\:*?"<>|]/g, '_') + '.json';
    var jsonData = {
      product_name: product.productName,
      collection_date: new Date().toISOString().split('T')[0],
      source: '奶粉智库 (naifenzhiku.com)',
      product_id: product.prodId,
      name: product.productName,
      details: product.details,
      nutrition: product.nutrition
    };
    fs.writeFileSync(dataDir + '/products/' + fileName, JSON.stringify(jsonData, null, 2), 'utf-8');
  }
  return 'saved ' + results.length + ' products';
}
```

---

## 采集策略

- 每批次最多 7 个产品（避免超时）
- 每批之间留 2-3 秒间隔
- 采集完一批立即保存
- 已知 ID 直接构造 URL：`https://www.naifenzhiku.com/powder/detail-<ID>.html`

---

## 常见陷阱

### JS 语法限制
- **必须用 `var`**：不支持 `let`/`const`
- **必须用传统 for 循环**：不支持 `for...of`
- **避免箭头函数**：用 `function() {}`
- **模板字符串谨慎**：可能解析失败

### 数据质量
- 数值验证：`/^[\d.]+$/` 确保 per100g 是有效数字
- 误识别过滤：detail key 长度 > 20 通常是新闻标题
- 分类标题跳过：`基础营养`、`维生素`、`矿物质`、`可选成分`
- 表头跳过：`成分` + `单位` 组合的行
- 单位列验证：应该是文字（mg/g/μg），不是纯数字

---

## 进度跟踪

`data/progress.json` 记录采集状态，避免重复采集：

```json
{
  "last_updated": "2026-05-10",
  "target_segment": "2段",
  "baseline_product": "惠氏启赋蕴淳",
  "brands": {
    "飞鹤": { "status": "completed", "products": 19 },
    "君乐宝": { "status": "completed", "products": 15 }
  },
  "pending": {
    "brands_to_add": [],
    "products_to_recollect": []
  }
}
```

### 状态值

| status | 含义 |
|--------|------|
| `pending` | 待采集 |
| `in_progress` | 采集中 |
| `completed` | 已完成 |

### 采集前检查

1. 读取 `progress.json`
2. 检查目标品牌的 status
3. 跳过已完成品牌，提示待采集品牌
4. 采集完成后更新 progress.json
