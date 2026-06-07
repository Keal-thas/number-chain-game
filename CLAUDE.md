# CLAUDE.md — Number Chain

## 运行方式

无构建步骤。用浏览器直接打开 `index.html`，或本地启动：

```
python -m http.server 8080
```

Claude Preview 已配置，`preview_start("number-chain-game")` 启动，port 8080。

## 文件结构

```
index.html   — HTML 标记（~40 行）
style.css    — 全部样式
game.js      — 全部游戏逻辑（~515 行）
DESIGN.md    — 游戏设计文档
memory/      — Claude 记忆文件（已加入 .gitignore）
```

## 测试要求

**每次修改交互相关功能后，必须用 Claude Preview 截图验证，不能只做代码分析。**

## 核心数据结构

```js
// 谜题（只读，加载时解析 CSV）
puzzle = { rows, cols, grid: [[{type:'fixed'|'empty'|'blocked', value}]], totalCells }

// 已完成的链
chains = [{ cells: [[r, c, val], ...], ascending: bool, unique: bool }]

// 拖拽中的临时链
active = {
  cells: [[r, c, val], ...],
  step: +1 | -1,          // 每步值的变化方向
  unique: bool,
  chainIdx: number,        // 要延伸的链索引，-1 表示新链
  fromStart: bool,         // 是否从链的起点向前延伸
  chainToReplace: number,  // 固定格重拖时暂存要删除的链索引
  mergeChainIdx: number,   // 拖到另一条链端点时，要合并的链索引
  mergeAtStart: bool,      // 连接到另一条链的起点（true）还是终点（false）
} | null
```

值直接存在每个 cell 的第三位 `[r, c, val]`，无需额外计算。

## startDrag 的 Case 结构

1. **Case 1** — 是某条链的端点（first 或 last）→ 延伸；固定格则用当前 mode 清链重画
2. **Case 2** — 固定格且不在任何链中 → 开新链
3. **Case 3** — 在链的中间 → trim 到该点，从该点继续
4. 都不匹配 → 提示"请点击固定数字格或路径端点"

## 关键实现约定

- **圆形节点**：`border-radius: 50%`，SVG 连线只从圆边缘到圆边缘（不穿过圆心），由 `makeEdgeSegments` 实现，不要破坏此逻辑。
- **命中判定**：`Math.round` 找最近格 + `Math.hypot` 判断是否在圆半径内（圆形判定区）。
- **擦除模式**：点击按钮开启/关闭，再点击节点来删除/拆分。不是一键清空所有路径。
- **已填格起点**：已填格的端点或中间格都可以拖拽延伸，不限于固定格。
- **链值约束**：链中的值必须 ≥ 1 且 ≤ totalCells，超限时提示用户。
- **链合并**：两条独立链的端点值相邻时，拖拽可连接合并。

## 未实现（不要擅自实现）

- 谜题自动生成
- 存档持久化
- 唯一解校验
- 自动化测试（方案已讨论，等用户指示）
