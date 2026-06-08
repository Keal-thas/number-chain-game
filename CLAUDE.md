# CLAUDE.md — Number Chain

## 运行方式

无构建步骤。用浏览器直接打开 `index.html`，或本地启动：

```
python -m http.server 8080
```

Claude Preview 已配置，`preview_start("number-chain-game")` 启动，port 8080。

---

## 文件结构

```
index.html   — HTML 标记（~40 行）
style.css    — 全部样式
game.js      — 全部游戏逻辑（~460 行）
DESIGN.md    — 游戏设计文档
ANALYSIS.md  — 代码实际行为分析（含已知问题）
TESTING.md   — 测试文档
memory/      — Claude 记忆文件（已加入 .gitignore）
```

---

## 测试要求

**每次修改交互相关功能后，必须用 Claude Preview 截图验证，不能只做代码分析。**

---

## 核心数据结构

```js
// 谜题（只读，加载时解析 CSV）
puzzle = { rows, cols, grid: [[{type:'fixed'|'empty'|'blocked', value}]], totalCells }

// 已提交的图（扁平，无链抽象层）
cellValue[r][c]   // number | null — 非固定格的当前值
lockedCells       // Set<string>  — 锁定格，格式 "r,c"

// 拖拽中的临时路径
active = {
  cells: [[r, c, val], ...],
  step: +1 | -1,   // 每步值的变化方向（由全局 mode 决定）
  lock: bool,
} | null
```

**连通性由值推断**：两格相连 = 相邻（8方向）且值差恰好为 1，不存储显式边。

---

## startDrag 的 Case 结构

1. **Case 1** — 固定格 → 直接以该格为起点创建 active，**不预清除任何格子**；旧值由拖拽过程中的懒驱逐按需清除
2. **Case 2** — 非固定端点（邻居 ≤ 1） → 以此格为起点延伸，lock 继承该格锁定状态
3. **Case 3** — 非固定中间格（邻居 ≥ 2） → 以此格为起点，后继侧懒驱逐
4. 都不匹配（空白格）→ 提示"请点击固定数字格或路径端点"

---

## 关键实现约定

- **圆形节点**：`border-radius: 50%`，SVG 连线只从圆边缘到圆边缘（不穿过圆心），由 `makeEdgeSegments` 实现，不要破坏此逻辑。
- **命中判定**：`Math.round` 找最近格 + `Math.hypot` 判断是否在圆半径内（圆形判定区）。
- **擦除模式**：点击按钮开启/关闭，再点击节点来删除/拆分。不是一键清空所有路径。
- **已填格起点**：已填格的端点或中间格都可以拖拽延伸，不限于固定格。
- **链值约束**：链中的值必须 ≥ 1 且 ≤ totalCells，超限时提示用户。
- **链合并**：两条独立链的端点值相邻时，拖拽可连接合并。

---

## 未实现（不要擅自实现）

- 谜题自动生成
- 存档持久化
- 唯一解校验
- 完成判定的路径有效性校验（单一连通链 1→N）
