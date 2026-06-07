# 测试文档

## 运行方式

```bash
npm install          # 首次安装依赖
npx playwright install chromium  # 首次安装浏览器
npm test             # 运行全部测试
npm run test:ui      # 可视化界面（可单步调试）
```

测试会自动启动本地服务器（`python3 -m http.server 8080`），无需手动开服务器。

---

## 测试谜题

测试不使用 HTML 中预置的默认谜题，而是用更小的谜题以便精确控制坐标。

**SIMPLE_CSV（3x3，用于绝大多数测试）**
```
3,3
1,0,0
0,0,0
0,0,9
```
- 9 个格子，无封锁格
- 固定格：`1` 在 (0,0)，`9` 在 (2,2)
- 初始已填格数 = 2（固定格计入进度）

**MERGE_CSV（1x4，用于合并测试）**
```
1,4
1,0,0,4
```
- 4 个格子，无封锁格
- 固定格：`1` 在 (0,0)，`4` 在 (0,3)
- 两条链端点值相邻（2 和 3）时可触发合并

---

## 辅助函数

| 函数 | 说明 |
|------|------|
| `loadPuzzle(page, csv)` | 打开页面、填入 CSV、点击加载，等待网格渲染完成 |
| `cell(page, r, c)` | 返回 `[data-r="r"][data-c="c"]` 的 locator |
| `dragPath(page, coords)` | 按坐标数组依次模拟 pointerdown → pointermove → pointerup |

`dragPath` 逐格取中心坐标，完整模拟 Pointer Events API 的拖拽流程。

---

## 测试用例

### loading — 谜题加载

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 1 | renders correct number of cells | 3x3 谜题渲染出 9 个 `.cell` 元素 |
| 2 | fixed cells show their values | (0,0) 显示 `1`，(2,2) 显示 `9` |
| 3 | fixed cells count toward initial progress | 进度文本包含 `2 / 9` |

### drag — 拖拽

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 4 | creates ascending chain from fixed cell | 从 (0,0)=1 拖到 (0,1)，该格显示 `2` 且 class 含 `cell-filled` |
| 5 | progress updates after drag | 拖出 2 格后进度变为 `4 / 9` |
| 6 | back-drag removes last cell | 拖到 (0,1) 再拖回 (0,0) 后松手，(0,1) 恢复 `cell-empty` |
| 7 | extends chain from existing endpoint | 先拖 (0,0)→(0,1)，再从 (0,1) 拖到 (0,2)，(0,2) 显示 `3` |
| 8 | descending mode assigns values correctly | 降序模式从 (2,2)=9 拖到 (2,1)，该格显示 `8` |
| 9 | shows message when dragging into mismatched fixed cell | 路径经过值不匹配的固定格时，`#message` 显示"值不匹配" |

### erase — 擦除模式

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 10 | removes endpoint cell | 擦除链的末端格，该格变为 `cell-empty`，其余格保留 |
| 11 | splits chain at middle cell | 擦除链中间的格，该格变空，两侧各自保留为独立 `cell-filled` |

### unique path — 唯一路径

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 12 | marks chain with unique class when mode is on | 开启唯一路径模式后画线，格子 class 含 `cell-unique` |

### reset — 重置

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 13 | clears all filled cells | 重置后已填格恢复 `cell-empty` |
| 14 | restores initial progress | 重置后进度恢复为 `2 / 9` |

### merge — 链合并

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 15 | connecting two adjacent chain endpoints merges them | 用 MERGE_CSV：链 A (1→2) 和链 B (4→3) 端点相邻，拖拽连接后四格全覆盖，进度显示 `100%` |

---

## 未覆盖的场景

- 中间格截断延伸（startDrag Case 3）
- 链值边界提示（到达 1 或 totalCells 时的消息）
- 封锁格不可点击
- 完成动画 / 庆祝提示
