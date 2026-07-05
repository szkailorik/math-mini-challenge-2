# 生成器接口约定（所有 js/generators/*.js 必须遵守）

每个生成器模块导出一个函数：

```js
// rng: js/rng.js 的 makeRng 实例（唯一随机源，禁止 Math.random / Date）
// level: 2 (Lorik 提高卷) 或 3 (KAI 进阶卷)
// count: 需要的题目数量
// 返回 Question[]，长度必须等于 count
export function generate(rng, level, count) { ... }
```

## Question 对象

```js
{
  tag: 'mixed.struct_paren',   // 域.知识点，稳定命名（错题本按 tag 聚合）
  prompt: '<HTML>',            // 题面。分数用 fraction.js 的 fracHTML 渲染
  answer: '<HTML>',            // 最终答案（紧凑，供家长对照）
  hint: '一句检查提示',          // 家长批阅时的口头检查点（规则/方法/检验提醒三选一风格）
  work: 'inline'|'lines'|'block' // 答题留白：行内括号 / 2-3行竖式 / 大块演算区
}
```

## 硬性要求

1. **答案必须由 `Frac` 类算出**，禁止手写字符串答案（除判断/比较题外）。
2. **确定性**：同一 rng 序列 → 同一批题。禁止 `Math.random()`、`Date`。
3. **覆盖骨架**：每次调用必须覆盖模块说明中列出的固定结构（不是纯随机抽），
   剩余名额再随机。用 `rng.shuffle` 打乱顺序。
4. **数值卫生**：结果不出现无限小数（除非题型明确考循环小数）；分数答案分母 ≤ 100；
   中间步骤不出现负数（本阶段不学负数）。
5. **level 差异**：level 3 数值范围更大 / 步骤更多 / 含反向与边界变式；level 2 保持标准结构。
6. **同卷不重复**：一次 generate 内的题目两两不同（题面字符串不等）。
