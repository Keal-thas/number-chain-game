# Number Chain — 测试文档

## 运行方式

```bash
npm install                      # 首次安装依赖
npx playwright install chromium  # 首次安装浏览器
npm test                         # 运行全部测试
npm run test:ui                  # 可视化界面（可单步调试）
```

测试会自动启动本地服务器（`python3 -m http.server 8080`），无需手动开服务器。

---

## 测试谜题

**SIMPLE_CSV（3×3，用于绝大多数测试）**
```
3,3
1,0,0
0,0,0
0,0,9
```
- 9 个格子，无封锁格；固定格：`1` 在 (0,0)，`9` 在 (2,2)

**MERGE_CSV（1×4，用于合并 / 完成测试）**
```
1,4
1,0,0,4
```
- 4 个格子；固定格：`1` 在 (0,0)，`4` 在 (0,3)

---

## 辅助函数

| 函数 | 说明 |
|------|------|
| `loadPuzzle(page, csv)` | 打开页面、填入 CSV、点击加载，等待网格渲染完成 |
| `cell(page, r, c)` | 返回 `[data-r="r"][data-c="c"]` 的 locator |
| `dragPath(page, coords)` | 按坐标数组依次模拟 pointerdown → pointermove → pointerup |

---

## 测试用例（31 个）

### loading

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 1 | renders correct number of cells | 3×3 谜题渲染出 9 个 `.cell` 元素 |
| 2 | fixed cells show their values | (0,0) 显示 `1`，(2,2) 显示 `9` |
| 3 | fixed cells count toward initial progress | 进度文本包含 `2 / 9` |

### drag

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 4 | creates ascending chain from fixed cell | 从 (0,0)=1 拖到 (0,1)，显示 `2` 且 class 含 `cell-filled` |
| 5 | progress updates after drag | 拖出 2 格后进度变为 `4 / 9` |
| 6 | back-drag removes last cell | 拖到 (0,1) 再拖回 (0,0) 后松手，(0,1) 恢复 `cell-empty` |
| 7 | extends chain from existing endpoint | 先拖 (0,0)→(0,1)，再从 (0,1) 拖到 (0,2)，(0,2) 显示 `3` |
| 8 | descending mode assigns values correctly | 降序模式从 (2,2)=9 拖到 (2,1)，显示 `8` |
| 9 | shows message when dragging into mismatched fixed cell | 路径经过值不匹配的固定格，`#message` 含"值不匹配" |

### erase

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 10 | removes endpoint cell | 擦除链末端格，该格变 `cell-empty`，其余保留 |
| 11 | splits chain at middle cell | 擦除链中间格，该格变空，两侧各自保留为 `cell-filled` |

### lock mode

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 12 | marks chain with locked class when mode is on | 开启锁定模式后画线，格子 class 含 `cell-locked` |

### reset

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 13 | clears all filled cells | 重置后已填格恢复 `cell-empty` |
| 14 | restores initial progress | 重置后进度恢复为 `2 / 9` |

### merge

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 15 | connecting two adjacent chain endpoints reaches 100% | MERGE_CSV：链 A (1→2) + 链 B (4→3) 连接后四格全覆盖，进度 `100%` |

### value eviction

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 16 | re-dragging from fixed cell leaves chain intact; lazy eviction clears on extend | 固定格重拖不预清除；延伸新方向时旧值懒驱逐 |
| 17 | new path evicts old cell with same value | 新路径放置值 N 时，旧的值 N 格子被清空 |
| 18 | dragging from middle cell lazily evicts only the values the drag reaches | 从中间格起拖，只驱逐实际经过的值 |
| 19 | old value 6 stays when new chain only reaches 5 | 新链止步于 5，旧的值 6 不被驱逐 |

### value-only semantics

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 20 | re-dragging from fixed cell does not cascade into value-adjacent chain | 固定格重拖不会通过值相邻扩散清除其他链 |
| 21 | erasing a cell creates a value gap, non-adjacent cells survive re-drag | 擦除中间格后两侧孤立段保留，固定格重拖不清除它们 |
| 22 | erase mode ignores fixed cells | 擦除模式点击固定格无效，相邻连接保留 |

### blocked cells

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 23 | drag cannot extend into a blocked cell | 拖拽不能进入封锁格 |
| 24 | erase mode ignores blocked cells | 擦除模式点击封锁格无效 |

### messages

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 25 | clicking empty cell shows prompt | 点击空白格显示"请点击"提示 |
| 26 | shows message when descending below minimum value 1 | 降序到 0 时显示"最小值"提示 |
| 27 | shows completion message when all cells filled | 填满所有格后进度含"完成" |

### bug regression

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 28 | Bug1: dragging from middle cell preserves head-side connection | 中间格起拖保留前驱侧，尾侧由懒驱逐清除 |
| 29 | Bug2: cannot place a value already occupied by a fixed cell | 固定格值不能被非固定格复用 |
| 30 | Bug3: switching to desc then dragging endpoint yields desc step | 切换降序后从端点拖出降序步 |
| 31 | Bug4: desc drag from middle cell preserves higher-value side, evicts lower lazily | 降序中间格起拖保留高值侧 |
