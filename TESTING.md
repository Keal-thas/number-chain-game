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

## 测试用例（53 个）

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
| 13 | drag cannot overwrite a locked cell | 拖拽经过锁定格时被拒绝，格子保留 `cell-locked` |
| 14 | drag can overwrite a normal (non-locked) cell | 拖拽经过普通格时正常覆盖，原格变 `cell-empty` |

### reset

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 15 | clears all filled cells | 重置后已填格恢复 `cell-empty` |
| 16 | restores initial progress | 重置后进度恢复为 `2 / 9` |

### merge

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 17 | connecting two adjacent chain endpoints reaches 100% | MERGE_CSV：链 A (1→2) + 链 B (4→3) 连接后四格全覆盖，进度 `100%` |

### value eviction

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 18 | re-dragging from fixed cell leaves chain intact; lazy eviction clears on extend | 固定格重拖不预清除；延伸新方向时旧值懒驱逐 |
| 19 | new path evicts old cell with same value | 新路径放置值 N 时，旧的值 N 格子被清空 |
| 20 | dragging from middle cell lazily evicts only the values the drag reaches | 从中间格起拖，只驱逐实际经过的值 |
| 21 | old value 6 stays when new chain only reaches 5 | 新链止步于 5，旧的值 6 不被驱逐 |

### value-only semantics

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 22 | re-dragging from fixed cell does not cascade into value-adjacent chain | 固定格重拖不会通过值相邻扩散清除其他链 |
| 23 | erasing a cell creates a value gap, non-adjacent cells survive re-drag | 擦除中间格后两侧孤立段保留，固定格重拖不清除它们 |
| 24 | erase mode ignores fixed cells | 擦除模式点击固定格无效，相邻连接保留 |

### blocked cells

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 25 | drag cannot extend into a blocked cell | 拖拽不能进入封锁格 |
| 26 | erase mode ignores blocked cells | 擦除模式点击封锁格无效 |

### messages

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 27 | clicking empty cell shows prompt | 点击空白格显示"请点击"提示 |
| 28 | shows message when descending below minimum value 1 | 降序到 0 时显示"最小值"提示 |
| 29 | shows completion message when all cells filled | 填满所有格后进度含"完成" |

### bug regression

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 30 | Bug1: dragging from middle cell preserves head-side connection | 中间格起拖保留前驱侧，尾侧由懒驱逐清除 |
| 31 | Bug2: cannot place a value already occupied by a fixed cell | 固定格值不能被非固定格复用 |
| 32 | Bug3: switching to desc then dragging endpoint yields desc step | 切换降序后从端点拖出降序步 |
| 33 | Bug4: desc drag from middle cell preserves higher-value side, evicts lower lazily | 降序中间格起拖保留高值侧 |

### generator page

文件：`tests/generator.spec.js`

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 34 | loads with form elements visible and result hidden | 四个参数输入框和生成按钮可见，result 区域隐藏 |
| 35 | generate shows preview cells and CSV | 点击生成后预览格子数 = rows×cols，CSV 首行格式正确 |
| 36 | generated CSV dimensions match params | 首行 = `rows,cols`，数据行数和列数与参数一致 |
| 37 | generated CSV has correct fixed cell count | CSV 中非零非X的值数量 = fixedCount |
| 38 | generated CSV has correct blocked cell count | CSV 中 X 的数量 = blockedCount |
| 39 | show solution reveals all path values | 点击"显示解答"后无 g-empty 格；再次点击恢复 |
| 40 | regenerate produces valid result | 重新生成后 CSV 格式正确，固定格数量匹配 |

### backbite strategies

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 41 | strategy radio buttons rendered from STRATEGIES array | radio 按钮数量 = 3，Warnsdorff 默认选中 |
| 42 | backbite_medium generates valid CSV | 生成格式正确，固定格数匹配 |
| 43 | backbite_hard generates valid CSV | 同上 |
| 44 | backbite works with blocked cells | 含封锁格时仍可生成，X 数量正确 |
| 45 | backbite works on large grid | 10×10 大格子生成成功 |

### generator → game

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 46 | URL param ?csv= auto-loads puzzle in game | `index.html?csv=...` 自动渲染谜题，固定格值正确 |

### solver

文件：`tests/solver.spec.js`

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 44 | show answer button exists after loading puzzle | 加载谜题后按钮可见，文字为"显示答案: 关" |
| 45 | clicking show answer fills empty cells with answer values | 点击后空格变为 cell-answer，数量正确（totalCells - fixed） |
| 46 | answer cells show numeric values | answer 格子显示 1–N 范围内的数字 |
| 47 | toggling answer off hides answer cells | 再次点击后 cell-answer 消失，按钮文字恢复 |
| 48 | user-filled cells are not replaced by answer display | 玩家已填格保持 cell-filled，不被 cell-answer 覆盖 |
| 49 | reset clears answer mode | 重置后 answer 模式关闭，cell-answer 消失 |
| 50 | works with blocked cells | 含封锁格的谜题能正确求解并展示答案 |
