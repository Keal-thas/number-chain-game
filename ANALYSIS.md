# Number Chain — 完整分析文档

> 基于代码实际行为编写。测试基线：53/53 Playwright 测试通过。

---

## 一、核心数据模型

```
puzzle          {rows, cols, grid[][], totalCells}     谜题，只读
cellValue[r][c]   number | null                         非固定格的当前值
lockedCells     Set<string>                             锁定格，格式 "r,c"
active          {cells:[[r,c,val],...], step:±1, lock:bool} | null  拖拽中的临时路径
mode            'asc' | 'desc'                          全局模式
lockMode        bool                                    全局锁定开关
eraseMode       bool                                    全局擦除开关
```

**连通性由值推断**：两格"相连" = 相邻（8方向）且值差恰好为 1。不存储显式边。

---

## 二、基础逻辑

### 2.1 谜题加载

1. 解析 CSV → `puzzle`
2. 根据 `max(rows, cols)` 动态计算 `CELL`（格子直径）和 `GAP`（间距），最大区域 520px
3. 重置所有运行时状态
4. 渲染

### 2.2 getNeighbors(r, c)

返回 8 方向内所有值差为 1 的邻格。固定格与非固定格同等对待——只要值差1且相邻，即为邻居。

### 2.3 startDrag — 4 个分支

| 分支 | 条件 | 行为 |
|------|------|------|
| Case 0 | 封锁格 | 忽略 |
| Case 0 | eraseMode | 转交 handleEraseClick |
| Case 0 | myVal === null（空白格无值） | 报错 "请点击固定数字格或路径端点" |
| **Case 1** | 固定格 | 直接以该格为起点创建 active，step 取全局 mode；**不预清除任何格子** |
| **Case 2** | 非固定端点（邻居 ≤ 1） | 直接以此格为起点新建 active，step 取全局 mode，lock 取该格锁定状态 |
| **Case 3** | 非固定中间格（邻居 ≥ 2） | 以此格为起点新建 active，step 取全局 mode，lock 取全局 lockMode |

**Case 1 关键点**：固定格起拖不做任何预清除。升序侧和降序侧的旧值均通过拖拽过程中的懒驱逐（`evictValue`）按需清除。这允许固定格同时保留两侧的链，互不干扰。

### 2.4 extendDrag — 每次鼠标移入新格时

按顺序检查，任一失败则停止：

1. **回拖**：目标 = 倒数第二格 → pop 最后一个 cell，停止
2. 非相邻（8 方向内没有） → 忽略
3. 封锁格 → 忽略
4. 已在 active 中（防环） → 忽略
5. expectedVal < 1 → 报错"已到最小值 1"
6. expectedVal > totalCells → 报错"已到最大值 N"
7. 目标是固定格但值与 expectedVal 不符 → 报错"值不匹配"
8. **另一固定格已持有 expectedVal** → 报错"值 N 已被固定格占用"
9. `evictValue(expectedVal)` — 把当前持有该值的非固定格清除（lazy eviction）
10. `evictPosition(r,c)` — 清除目标格的值
11. push `[r, c, expectedVal]`

### 2.5 endDrag — 鼠标抬起

- active.cells ≥ 2：把所有 cell 写入 cellValue / lockedCells
- active.cells = 1：单格点击，不提交
- 清除 active，重绘，更新进度

### 2.6 handleEraseClick — 擦除模式

- 固定格 → 无效（return）
- 封锁格 → 无效（return）
- null 格 → 无效（return）
- 其他：清除 cellValue，移除 lockedCells

---

## 三、UI 逻辑

### 3.1 渲染架构

```
#game-area (relative)
  ├── #svg-overlay    (absolute, bottom layer)  — 绘制连线
  └── #cells-layer    (absolute, top layer)     — CSS Grid 圆形格子
```

SVG 连线由 `renderSVG` 遍历所有格子绘制：对每个有值的格 (r,c)，找值+1的相邻格，只从小值向大值画一次（避免重复）。线段用 `makeEdgeSegments` 从圆边缘到圆边缘，不穿圆心。

### 3.2 格子视觉状态

| class | 含义 |
|-------|------|
| cell-empty | 无值，细边框 |
| cell-fixed | 固定格，金黄 |
| cell-blocked | 封锁格，深灰 |
| cell-filled | 已提交路径格，深蓝 |
| cell-locked | 锁定格，深绿 |
| cell-active | 拖拽中，亮蓝 + scale(1.08) |
| cell-active-fixed | 固定格被拖拽，金黄 + scale(1.08) |

### 3.3 命中判定

1. `Math.round(x / step)` 找最近的网格坐标
2. `Math.hypot(x - cx, y - cy) > CELL/2` 排除圆外（圆形判定区，不是方形）

### 3.4 控制按钮

| 按钮 | 作用 |
|------|------|
| ▲ 升序 / ▼ 降序 | 设全局 `mode`，影响所有新拖拽的 step |
| 锁定模式 | 切换 `lockMode` |
| 擦除 | 切换 `eraseMode` |
| 重置全部 | 清空所有 cellValue / lockedCells，关闭擦除模式 |

---

## 四、完成判定

```js
filled === totalCells // → 显示 "🎉 完成！"
```

`totalCells = rows × cols - blocked_cells`，固定格始终计入 filled。

---

## 五、测试覆盖（53 tests，全通过）

| 类别 | 数量 | 覆盖内容 |
|------|------|---------|
| loading | 3 | 格子数量、固定格显示、初始进度 |
| drag | 6 | 升序建链、进度更新、回拖、延伸端点、降序建链、值不匹配 |
| erase | 2 | 删端点、拆中间格 |
| lock mode | 3 | 锁定标记、锁定格不可被拖拽覆盖、普通格可被覆盖 |
| reset | 2 | 清空、进度恢复 |
| merge | 1 | 两链端点值相邻时覆盖达 100% |
| value eviction | 4 | 懒驱逐行为（含固定格重拖保留旧链） |
| value-only semantics | 3 | 无级联、擦除间隔、固定格擦除无效 |
| blocked cells | 2 | 拖拽不进封锁格、擦除忽略封锁格 |
| messages | 3 | 空格提示、边界提示、完成消息 |
| bug regression | 4 | Bug1-4 回归 |
| generator page | 7 | 页面加载、生成结果、CSV 维度/固定格/封锁格数量、解答切换、重新生成 |
| backbite strategies | 5 | medium/hard 生成有效 CSV、blocked 格、大格子（10×10）、radio 按钮数量 |
| generator → game | 1 | ?csv= URL 参数自动加载谜题 |
| solver | 7 | 按钮显示、answer 格数量/值、toggle、用户格不覆盖、reset 清除、blocked 格 |

---

## 六、已知问题

### P1：完成判定不验证路径有效性

**现状**：`filled === totalCells` 即宣告完成。  
**问题**：多条独立链覆盖全部格子也会触发完成，不要求单一连通路径 1→N。  
**期望**：验证所有非封锁格连通成一个组件且序列从 1 连续到 totalCells。

---

### P3：锁定模式在 Case 2 端点延伸时被忽略

**现状**：
```js
// Case 2（端点延伸）取格子的锁定状态，而非全局开关
active = { ..., lock: lockedCells.has(`${r},${c}`) };
```
**问题**：打开锁定模式开关后，从普通端点延伸，新段不会标绿。

---

### P4：擦除非固定格后，值断链两侧成孤立段

**触发**：擦除链中间某格后，该格两侧的值失去连接桥梁，各自成为无固定锚点的孤立段。  
**问题**：这些孤立段无法被新拖拽从固定格"顺路"清除（值不连续，无法到达）。只能逐格手动擦或重置全部。

---

### U1：无法区分端点和中间格

所有 `cell-filled` 外观相同，无法一眼判断哪些格可延伸、哪些只能截断。

### U3：空白格悬停无反馈

`cell-empty:hover` 无高亮样式，用户不知道拖拽目标是否有效。

### U4：擦除模式无光标变化

开启擦除后光标仍是 `pointer`，无视觉警示。
