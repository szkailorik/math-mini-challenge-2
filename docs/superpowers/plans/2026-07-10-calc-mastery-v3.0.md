# 计算能力大师系统 v3.0 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 v3 的第一期：技能地图骨架、地基层 12 技能点题模、每日口算计时页、错题本两次点击出训练册、v2 数据自动迁移。

**Architecture:** 声明式技能地图（skills/bugs）+ 题模注册表（QModel 引擎）驱动生成；掌握度模型管理地基层 学习/维持 状态；口算页与错题训练册走既有的种子化 rng + 盖章 + 打印沙箱管线。主题页本期沿用 v2 六域生成器过渡。

**Tech Stack:** 纯静态 ES Modules（零构建）、Node 22+ 跑校验脚本、GitHub Pages 部署。复用 v2 的 fraction.js/rng.js/print.js/sync.js/store.js。

**设计文档:** `docs/superpowers/specs/2026-07-10-calc-mastery-v3-design.md`（本计划的需求来源，冲突时以设计文档为准）

## Global Constraints

- 禁止 `Math.random()` / `Date.now()` 出题路径：一切随机走传入的 rng（`js/rng.js` 的 makeRng）
- 所有数值答案由 `js/fraction.js` 的 Frac 精算，禁止手写字符串答案
- 题面/答案不得出现 `NaN` `Infinity` `undefined` `null` `[object`
- localStorage 前缀 `MMC2` 不变；新增 key 一律经 `js/store.js` 读写
- v2 现有行为回归线：`npm run validate` 必须始终全绿（旧的 60 套校验 + 自适应单测都不许破坏）
- 每个任务收尾必须：跑本任务测试 + 跑 `npm run validate` + git commit（消息末尾带 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`）
- Node 测试脚本用 `scripts/` 下 `.mjs`，浏览器 API（localStorage）用内存垫片（模式见 `scripts/test-adaptive.mjs` 开头）

## 模型档位总览（用户要求标注）

| 任务类型 | 建议模型 | 理由 |
|---|---|---|
| 引擎/调度/迁移（任务 3、6、7、9、11） | **Fable 5（本会话主模型）或 Opus 4.8** | 接口设计、状态机、合并语义，错了会污染全局 |
| 题模内容批量编写（任务 4、5） | **Sonnet 5** | 接口清晰+参数表齐全+自测脚本兜底，机械性强、量大 |
| 声明式清单（任务 1、2） | **Sonnet 5** | 照设计文档抄录成代码，校验脚本把关 |
| UI 渲染与接线（任务 8、10） | **Sonnet 5** | 模式照抄 v2 现有代码 |
| 端到端验收（任务 12） | **Fable 5（主会话亲自做）** | 跨模块集成判断，不外包 |
| 任务间代码审查 | **Fable 5（主会话）** | subagent-driven 模式的审查环节 |

---

### Task 1: 技能地图声明 + 完整性校验

**模型：Sonnet 5**

**Files:**
- Create: `js/map/skills.js`
- Create: `scripts/test-map.mjs`
- Modify: `package.json`（validate 链追加 test-map）

**Interfaces:**
- Produces: `SKILLS: {[id]: Skill}`、`SKILL_IDS: string[]`、`byLayer(layer) -> Skill[]`
- Skill 形状：`{ id, layer: 'fluency'|'procedure'|'strategy', label, gradeBand: [lo, hi], prereqs: string[], graduation: { acc: number, speed: number|null }, revisit: { base: number, max: number } }`

- [ ] **Step 1: 写失败测试** `scripts/test-map.mjs`：

```js
import { SKILLS, SKILL_IDS, byLayer } from '../js/map/skills.js';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };

ok(SKILL_IDS.length >= 55 && SKILL_IDS.length <= 70, `技能点总数约60：${SKILL_IDS.length}`);
ok(byLayer('fluency').length === 12, `地基层 12 点：${byLayer('fluency').length}`);
ok(byLayer('procedure').length >= 28, `结构层 ≥28 点`);
ok(byLayer('strategy').length >= 16, `策略层 ≥16 点`);
for (const s of Object.values(SKILLS)) {
  ok(s.id && s.label && s.gradeBand?.length === 2, `${s.id}: 基本字段齐`);
  ok(['fluency','procedure','strategy'].includes(s.layer), `${s.id}: layer 合法`);
  ok(s.graduation && s.graduation.acc >= 0.8 && s.graduation.acc <= 1, `${s.id}: 毕业线 acc`);
  ok(s.layer !== 'fluency' || s.graduation.speed > 0, `${s.id}: 地基层必有 speed 线`);
  for (const p of s.prereqs) ok(SKILLS[p], `${s.id}: 前置 ${p} 存在`);
}
// 依赖无环（DFS）
const seen = {}, onstack = {};
let cyclic = false;
const dfs = (id) => {
  if (onstack[id]) { cyclic = true; return; }
  if (seen[id]) return;
  seen[id] = onstack[id] = true;
  for (const p of SKILLS[id].prereqs) dfs(p);
  onstack[id] = false;
};
SKILL_IDS.forEach(dfs);
ok(!cyclic, '依赖图无环');
if (fails) { console.error(`${fails} 失败`); process.exit(1); }
console.log('✅ 技能地图校验通过');
```

- [ ] **Step 2: 跑测试确认失败**（模块不存在）：`cd math-mini-challenge-2 && node scripts/test-map.mjs` → `ERR_MODULE_NOT_FOUND`

- [ ] **Step 3: 写 `js/map/skills.js`**。60 个技能点按设计文档第 2 节完整声明。地基层 12 点（id、速度线=题/分钟）照下表逐条写：

| id | label | gradeBand | speed | prereqs |
|---|---|---|---|---|
| add20 | 20以内加法（含进位） | [1,6] | 35 | [] |
| sub20 | 20以内减法（含退位） | [1,6] | 35 | [add20] |
| mult_table | 表内乘法 | [2,6] | 35 | [] |
| div_table | 表内除法 | [2,6] | 35 | [mult_table] |
| add100 | 百以内加减口算 | [2,6] | 25 | [add20, sub20] |
| sub100 | 百以内退位减口算 | [2,6] | 25 | [sub20] |
| mult_pairs | 凑整速算对（25×4/125×8/5×2） | [4,6] | 30 | [mult_table] |
| dec_shift | 小数×÷10/100/1000 移位 | [4,6] | 30 | [] |
| dec_frac_base | 分数↔小数↔百分数基准互化 | [5,6] | 25 | [] |
| frac_same_denom | 同分母分数加减口算 | [5,6] | 25 | [] |
| square_base | 常用平方数（11²–25²） | [5,6] | 25 | [mult_table] |
| estimate_flash | 数量级速估 | [4,6] | 20 | [] |

地基层统一 `graduation: { acc: 0.95, speed: 上表 }`、`revisit: { base: 4, max: 16 }`。
结构层 30 点、策略层 18 点：按设计文档第 2 节清单逐条声明（id 用 `int.sub_borrow`、`dec.mult_point`、`frac.reduce`、`smart.dist_reverse`、`eq.special_pos`、`mix.convert_judge` 这种 `域.技能` 命名；`graduation: { acc: 0.9, speed: null }`；prereqs 按数学依赖，如 `dec.mult_point` 依赖 `mult_table`、`frac.addsub_diff` 依赖 `frac.common_denom`）。策略层简算拓展 3 点（`smart.benchmark`、`smart.series`、`smart.telescope`）标 `gradeBand: [5,6]`。

- [ ] **Step 4: 跑测试通过**：`node scripts/test-map.mjs` → `✅`

- [ ] **Step 5: package.json validate 链追加** `&& node scripts/test-map.mjs`，跑 `npm run validate` 全绿

- [ ] **Step 6: Commit** `feat(v3): skill map with integrity checks`

---

### Task 2: bug 错因库

**模型：Sonnet 5**

**Files:**
- Create: `js/map/bugs.js`
- Modify: `scripts/test-map.mjs`（追加 bugs 校验）

**Interfaces:**
- Produces: `BUGS: {[id]: { id, label, diagnose, explain, family: 'knowledge'|'skill'|'strategy' }}`、`BUG_IDS`

- [ ] **Step 1: test-map.mjs 追加失败测试**：

```js
import { BUGS, BUG_IDS } from '../js/map/bugs.js';
ok(BUG_IDS.length >= 35, `bug 库 ≥35 条：${BUG_IDS.length}`);
for (const b of Object.values(BUGS)) {
  ok(b.label && b.diagnose && b.explain, `${b.id}: 三段文案齐`);
  ok(['knowledge','skill','strategy'].includes(b.family), `${b.id}: family 合法`);
}
```

- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 写 `js/map/bugs.js`**，40 条按设计文档第 3 节 bug 示例 + 调研报告第四节高频清单展开。每条形如：

```js
'dec.point_mult': {
  id: 'dec.point_mult', family: 'knowledge',
  label: '积的小数位数错',
  diagnose: '乘完忘了数两个因数一共几位小数',
  explain: '先按整数乘，再数两个因数的小数位数之和，从右往左点回去；用估算验证数量级',
},
```

覆盖域：整数（进/退位链、乘法部分积错位、试商）、小数（点定位乘/除、移位方向）、分数（通分、约分漏约、带分数转换、除法未取倒数）、顺序（同级左到右、括号）、简算（分配漏乘、除法误分配、假简算、拆数补偿号错）、方程（移项不变号、两边除以字母、特殊位置变形）、口算（进位遗忘、口诀窜行）。

- [ ] **Step 4: 跑测试通过；Step 5: Commit** `feat(v3): bug taxonomy`

---

### Task 3: QModel 题模引擎

**模型：Fable 5 / Opus 4.8**

**Files:**
- Create: `js/engine/qmodel.js`
- Create: `scripts/test-qmodel.mjs`
- Modify: `package.json`（validate 链追加）

**Interfaces:**
- Consumes: `SKILLS`（Task 1）、`BUGS`（Task 2）、`makeRng`（js/rng.js）
- Produces:
  - `defineQModel(spec) -> spec`（校验必填字段，冻结返回）
  - `registerQModels(list)` / `QMODELS: {[id]: spec}` / `qmodelsForSkill(skillId) -> spec[]`
  - `generateFromSkill(rng, skillId, {tier='core'}) -> Question`
  - `generateVariant(rng, qmodelId, {bugId=null, level='L2'}) -> Question`
  - Question 形状（与 v2 渲染/错题本兼容）：`{ tag: qmodelId, skill, qmodel: qmodelId, prompt, answer, hint, work: 'inline'|'lines'|'block', isTrap?: boolean }`

- [ ] **Step 1: 写失败测试** `scripts/test-qmodel.mjs`（含一个内联测试题模）：

```js
import { defineQModel, registerQModels, qmodelsForSkill, generateFromSkill, generateVariant } from '../js/engine/qmodel.js';
import { makeRng } from '../js/rng.js';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };

const testModel = defineQModel({
  id: 'add20.basic', skill: 'add20', tier: 'core',
  bugs: ['oral.carry_forget'], traps: [],
  generate(rng) {
    const a = rng.int(3, 9), b = rng.int(11 - a, 9); // 保证进位
    return { prompt: `${a} + ${b} =`, answer: String(a + b), hint: '凑十法', work: 'inline' };
  },
  variant(rng, bugId, level) { return this.generate(rng); },
});
registerQModels([testModel]);

ok(qmodelsForSkill('add20').length === 1, 'qmodelsForSkill 命中');
const q = generateFromSkill(makeRng('t', '1'), 'add20', {});
ok(q.tag === 'add20.basic' && q.skill === 'add20' && q.qmodel === 'add20.basic', 'Question 元字段自动补全');
ok(q.prompt && q.answer, '题面答案非空');
const q2 = generateFromSkill(makeRng('t', '1'), 'add20', {});
ok(q.prompt === q2.prompt, '同 rng 确定性');
const v = generateVariant(makeRng('t', '2'), 'add20.basic', { level: 'L2' });
ok(v.tag === 'add20.basic', '变式可生成');
let threw = false;
try { defineQModel({ id: 'x' }); } catch { threw = true; }
ok(threw, '缺字段的题模被拒绝');
try { generateFromSkill(makeRng('t','3'), 'no_such_skill', {}); threw = false; } catch { threw = true; }
ok(threw, '未注册技能点报错');
if (fails) process.exit(1);
console.log('✅ QModel 引擎通过');
```

- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现 `js/engine/qmodel.js`**：

```js
import { SKILLS } from '../map/skills.js';
import { BUGS } from '../map/bugs.js';

export const QMODELS = {};

const REQUIRED = ['id', 'skill', 'tier', 'generate'];
export function defineQModel(spec) {
  for (const k of REQUIRED) if (!spec[k]) throw new Error(`QModel 缺字段 ${k}: ${spec.id || '?'}`);
  if (!SKILLS[spec.skill]) throw new Error(`QModel ${spec.id}: 未知技能点 ${spec.skill}`);
  for (const b of spec.bugs || []) if (!BUGS[b]) throw new Error(`QModel ${spec.id}: 未知 bug ${b}`);
  spec.bugs = spec.bugs || [];
  spec.traps = spec.traps || [];
  if (!spec.variant) spec.variant = function (rng) { return this.generate(rng); };
  return Object.freeze(spec);
}

export function registerQModels(list) {
  for (const m of list) {
    if (QMODELS[m.id]) throw new Error(`QModel 重复注册: ${m.id}`);
    QMODELS[m.id] = m;
  }
}

export function qmodelsForSkill(skillId) {
  return Object.values(QMODELS).filter((m) => m.skill === skillId);
}

function finalize(m, q) {
  return { work: 'inline', ...q, tag: m.id, skill: m.skill, qmodel: m.id };
}

export function generateFromSkill(rng, skillId, { tier = 'core' } = {}) {
  const pool = qmodelsForSkill(skillId);
  if (!pool.length) throw new Error(`技能点无题模: ${skillId}`);
  const tiered = pool.filter((m) => m.tier === tier);
  const m = (tiered.length ? rng.pick(tiered) : rng.pick(pool));
  return finalize(m, m.generate(rng));
}

export function generateVariant(rng, qmodelId, { bugId = null, level = 'L2' } = {}) {
  const m = QMODELS[qmodelId];
  if (!m) throw new Error(`未知题模: ${qmodelId}`);
  return finalize(m, m.variant(rng, bugId, level));
}
```

- [ ] **Step 4: 跑测试通过；Step 5: validate 链追加 test-qmodel；Step 6: Commit** `feat(v3): qmodel engine`

---

### Task 4: 地基层题模 · 整数事实（6 技能点）

**模型：Sonnet 5**（接口与参数表齐全，自测兜底）

**Files:**
- Create: `js/qbank/fluency-int.js`
- Create: `scripts/test-qbank-fluency.mjs`

**Interfaces:**
- Consumes: `defineQModel`（Task 3）、`rng`、Frac 不需要（纯整数）
- Produces: `export const MODELS = [...]`（每技能点 1-2 个题模，id 如 `add20.carry`、`add100.mixed`）

每个题模的**精确参数表**（生成必须严格按此，不留发挥空间）：

| 题模 id | skill | 出题规格 | 答案 |
|---|---|---|---|
| add20.carry | add20 | a∈[3,9], b∈[11−a,9]（必进位），`a + b =` | a+b |
| sub20.borrow | sub20 | 差d∈[3,9], b∈[d+11−9≤…]：a=d+b, a∈[11,18], b∈[a−9,9]（必退位），`a − b =` | d |
| mult_table.core | mult_table | a,b∈[2,9]，`a × b =`；30% 概率出"( )里填几：a×( )=ab" | ab / b |
| div_table.core | div_table | b,q∈[2,9], a=b×q，`a ÷ b =` | q |
| add100.mixed | add100 | 50% 两位+两位不进位、30% 进位、20% 整十±两位，`a + b =` | a+b |
| sub100.borrow | sub100 | a∈[31,99], b∈[12,a−10] 且个位 b>a（必退位），`a − b =` | a−b |
| add20.variant L2 | — | 换数同规格 | — |
| add20.variant L3 | — | 改为"( )+b=s 填空"（未知位置变化）；其余题模 L3 同理反转未知位 | — |

- [ ] **Step 1: 写失败测试** `scripts/test-qbank-fluency.mjs`（本任务先只测整数部分，Task 5 追加）：

```js
import { registerQModels, qmodelsForSkill, generateFromSkill, generateVariant } from '../js/engine/qmodel.js';
import { MODELS as INT } from '../js/qbank/fluency-int.js';
import { makeRng } from '../js/rng.js';
registerQModels(INT);
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };
const BAD = ['NaN', 'Infinity', 'undefined', 'null'];
const INT_SKILLS = ['add20', 'sub20', 'mult_table', 'div_table', 'add100', 'sub100'];
for (const skill of INT_SKILLS) {
  ok(qmodelsForSkill(skill).length >= 1, `${skill} 有题模`);
  for (let i = 0; i < 100; i++) {
    const q = generateFromSkill(makeRng('qf', skill, String(i)), skill, {});
    for (const b of BAD) ok(!(q.prompt + q.answer).includes(b), `${skill}#${i} 无坏串`);
    ok(/^\d+$/.test(q.answer.replace(/<[^>]+>/g, '').trim()), `${skill}#${i} 整数答案`);
    const v3 = generateVariant(makeRng('qv', skill, String(i)), q.qmodel, { level: 'L3' });
    ok(v3.prompt !== q.prompt, `${skill}#${i} L3 变式与原题不同`);
  }
}
// 进位/退位约束抽查
for (let i = 0; i < 50; i++) {
  const q = generateFromSkill(makeRng('qc', String(i)), 'add20', {});
  const [a, b] = q.prompt.match(/\d+/g).map(Number);
  ok(a % 10 + b % 10 >= 10 || a + b >= 10, `add20#${i} 必进位: ${q.prompt}`);
}
if (fails) process.exit(1);
console.log('✅ 整数事实题模通过');
```

- [ ] **Step 2: 确认失败；Step 3: 按参数表实现 6 技能点题模（每个 defineQModel，L3 变式=未知位置反转）；Step 4: 测试通过；Step 5: Commit** `feat(v3): integer fact qmodels`

---

### Task 5: 地基层题模 · 小数分数基准（6 技能点）

**模型：Sonnet 5**

**Files:**
- Create: `js/qbank/fluency-frac.js`
- Modify: `scripts/test-qbank-fluency.mjs`（追加 6 技能点，同样每点 100 种子无坏串+确定性+变式）
- Modify: `package.json`（validate 链追加 test-qbank-fluency）

**Interfaces:** 同 Task 4，`export const MODELS`。答案凡含分数/小数一律 Frac 计算、用 `valueHTML/percentHTML/fracHTML` 渲染。

精确参数表：

| 题模 id | skill | 出题规格 |
|---|---|---|
| mult_pairs.core | mult_pairs | 从固定池抽：{25×4, 125×8, 5×2, 50×2, 25×8, 125×4, 75×4, 250×4, 2.5×4, 12.5×8, 0.25×4}，30% 出"k×25×4"三因数形 |
| dec_shift.core | dec_shift | base∈{0.03..9.87 两位小数}，op∈{×10,×100,×1000,÷10,÷100}，Frac.fromDecimal 精算 |
| dec_frac_base.core | dec_frac_base | 基准池：1/2,1/4,3/4,1/5,2/5,3/5,4/5,1/8,3/8,5/8,7/8,1/20,1/25,1/50 × 三方向（分→小、小→百、百→最简分数）随机 |
| frac_same_denom.core | frac_same_denom | 分母 d∈[5,12]，两分数加减，结果非负、可显示未约分形并要求最简 |
| square_base.core | square_base | n∈[11,25]，`n² =`；L3 变式出反向 `( )²=441` |
| estimate_flash.core | estimate_flash | `a×b 大约是几百/几千`（a∈[18,98], b∈[19,52]），答案取最近整百/整千（构造时避开中点歧义：真积距两侧界限 ≥8%） |

- [ ] **Steps 1-5 同 Task 4 节奏**（失败→实现→通过→validate 全绿→Commit `feat(v3): decimal/fraction base qmodels`）

---

### Task 6: 掌握度模型（地基层状态机）

**模型：Fable 5 / Opus 4.8**

**Files:**
- Create: `js/engine/mastery.js`
- Create: `scripts/test-mastery.mjs`
- Modify: `js/store.js`（新增 `loadMastery/saveMastery`，模式照 loadStamps）
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `getMastery(studentId) -> { [skillId]: Entry }`，Entry：`{ hits: (0|1)[] ≤20, speedOk: boolean, state: 'learning'|'maintain', lastSet: number, streakWrong: number }`
  - `recordSkillResults(studentId, setNumber, results: [{skill, correct: boolean}])` — 更新窗口；维持态答错 → 立即回 learning
  - `recordSprintTiming(studentId, setNumber, { seconds, total, correct })` — 页级计时：`correct/total ≥ 0.95 && correct/(seconds/60) ≥ 页内技能speed线最小值` → 本页涉及技能 `speedOk = true`
  - `accuracy(entry) -> number|null`（窗口 <10 题返回 null）
  - `refreshStates(studentId)` — acc≥graduation.acc 且 speedOk → maintain
  - `sprintWeight(entry) -> 3|2|1`（learning 3；maintain 且 lastSet 距今 ≥4 套 2；其余 1）

- [ ] **Step 1: 失败测试**（localStorage 垫片，模式抄 test-adaptive.mjs）：

```js
// 核心断言（完整脚本含垫片头）
recordSkillResults('kai', 1, Array.from({length: 20}, () => ({ skill: 'add20', correct: true })));
recordSprintTiming('kai', 1, { seconds: 150, total: 40, correct: 40 }); // 16题/分钟 < 35 → speedOk 仍 false
refreshStates('kai');
ok(getMastery('kai').add20.state === 'learning', '正确率够但速度不够 → 仍 learning');
recordSprintTiming('kai', 2, { seconds: 60, total: 40, correct: 39 }); // 39题/分钟 ≥35 且 97.5%
refreshStates('kai');
ok(getMastery('kai').add20.state === 'maintain', '双达标 → maintain');
recordSkillResults('kai', 3, [{ skill: 'add20', correct: false }]);
ok(getMastery('kai').add20.state === 'learning', '维持态一错回 learning');
ok(getMastery('kai').add20.hits.length <= 20, '窗口封顶 20');
ok(sprintWeight({ state: 'learning' }) === 3, 'learning 权重 3');
```

- [ ] **Step 2: 确认失败；Step 3: 实现（注意：hits 只存 0/1 数组控制体积；speedOk 页级判定取本页出现技能的 speed 线最小值）；Step 4: 通过；Step 5: validate 链追加；Step 6: Commit** `feat(v3): fluency mastery model`

---

### Task 7: 口算计时页组卷

**模型：Fable 5 / Opus 4.8**

**Files:**
- Create: `js/engine/composer.js`
- Create: `scripts/test-composer.mjs`
- Modify: `js/adaptive.js`（ensureStamp 的盖章对象增加 `sprint: { qmodelSeeds: string[] }` 字段）
- Modify: `package.json`

**Interfaces:**
- Consumes: `getMastery/sprintWeight`（Task 6）、`generateFromSkill`（Task 3）、`byLayer`（Task 1）、`makeRng`
- Produces: `buildSprintPage(studentId, setNumber) -> { items: Question[40], mix: {[skillId]: count}, lastScore: {seconds, correct, total}|null }`
  - 抽样：按 `sprintWeight` 加权、gradeBand 过滤（学员年级配置暂固定 6）、同技能点连续不超过 3 题（交错）
  - 确定性：种子 `makeRng('v3-sprint', studentId, String(setNumber), i)`；盖章后固化

- [ ] **Step 1: 失败测试**：40 题恰好、无坏串、同种子两跑一致、learning 技能占比 > maintain（构造 mastery：add20 learning，mult_table maintain 未到期 → add20 题数 ≥ 2× mult_table）、连续同技能 ≤3
- [ ] **Step 2-6: 常规 TDD 节奏**；Commit `feat(v3): sprint page composer`

---

### Task 8: 口算页渲染 + 批阅 + 主界面接线

**模型：Sonnet 5**（照 v2 render/app 模式）

**Files:**
- Modify: `js/render.js`（新增 `renderSprintSheet(paper, sprint)`：40 题四列网格、页眉计时格「开始__ 结束__ 用时__ 对__/40」、右上角上次成绩框）
- Modify: `js/app.js`（试卷页顶部新增「日课模式/拟真模式」切换（本期日课=口算页+v2 六域两页+回炉页）；批阅页新增口算区：只点错题 + 录入用时秒数与对题数 → `recordSkillResults` + `recordSprintTiming` + `refreshStates`）
- Modify: `css/theme.css` `css/print.css`（口算网格紧凑样式，打印一页放得下 40 题）
- Modify: `index.html`（模式切换按钮、批阅页计时录入框）

**Interfaces:**
- Consumes: `buildSprintPage`（Task 7）、mastery 记录函数（Task 6）
- Produces: 无新 JS 接口（纯 UI 层）

- [ ] **Step 1: 手工验收清单先写进任务**（UI 无单测，浏览器验收）：日课模式打印 = 每人 3-4 页（口算+两页主题+按需回炉）；口算页 40 题一页放下（内容底 ≤276mm）；批阅提交后 mastery 更新、第二天口算页组成变化
- [ ] **Step 2: 实现；Step 3: `npm run validate` 全绿（确保没破坏既有）；Step 4: preview 浏览器过验收清单（preview_* 工具）；Step 5: Commit** `feat(v3): sprint sheet UI & grading`

---

### Task 9: 错题本快速出卷引擎

**模型：Fable 5 / Opus 4.8**

**Files:**
- Create: `js/engine/booklet.js`
- Create: `scripts/test-booklet.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `getErrorEntries`（js/errorbook.js）、`generateVariant`（Task 3，新条目）、`buildVariant`（js/paper.js，兼容 v2 旧条目）、`makeRng`
- Produces: `buildBooklet(studentId, currentSet, filter) -> { title, items: BookletItem[], empty: boolean }`
  - filter：`{ preset: 'due'|'priority'|'week'|'skill'|null, skill?, domain?, bugId?, sinceDays?, includeMastered?: boolean, maxEntries?: number(默认12) }`
  - BookletItem：`{ entryId, kind: 'original'|'L2'|'L3'|'L4', q: Question }`
  - 阶梯规则：每条错题 = 原题 + L2 + L3；`rewrongCount>0` 追加 L4（若该题模支持，否则再出一道 L3）
  - 变式路由：条目有 `qmodel` 字段 → `generateVariant`；否则（v2 旧条目）→ `buildVariant(domain, tag, …)` 作 L2/L3，且 L2/L3 保证与原题及 `variantHistory` 不重复（指纹比对，冲撞换种子重试 6 次）
  - 出卷后调用方负责把新变式指纹追加进条目 `variantHistory[]`（引擎返回 `fingerprints` 数组）

- [ ] **Step 1: 失败测试**：构造含 3 条 v2 旧格式 + 2 条 v3 新格式（带 qmodel）的错题本 → due 预设出卷条目数 = 5×3=15±L4、v2 条目变式走 buildVariant 不报错、`week` 预设按 `lastDate ≥ 今天−7天` 过滤、`skill` 预设按 skill 字段过滤、同 filter 两跑确定性一致、variantHistory 里的指纹不再出现
- [ ] **Step 2-6: 常规 TDD**；Commit `feat(v3): error booklet engine`

---

### Task 10: 错题本出卷 UI（双通道）

**模型：Sonnet 5**

**Files:**
- Modify: `index.html`（错题本页顶部：4 个预设大按钮 + 折叠的自由筛选器：技能域下拉/时间窗/含已掌握勾选）
- Modify: `js/app.js`（预设点击 → buildBooklet → 预览区渲染 → 打印按钮；出卷后回写 variantHistory）
- Modify: `js/render.js`（`renderBookletSheets(student, booklet)`：训练册排版=每条错题一组（原题+变式缩进排），组不跨页；`renderBookletAnswers`）
- Modify: `css/theme.css` `css/print.css`

**Interfaces:** Consumes `buildBooklet`（Task 9）。交互指标：预设按钮点击 → 预览出现 ≤1 秒 → 打印按钮，全程两次点击。

- [ ] **Step 1: 手工验收清单**：四个预设各出一册且排版正确；筛选组合生效；空结果显示友好提示；答案页对齐；组不跨页（打印预览查）
- [ ] **Step 2-5: 实现→validate→浏览器验收→Commit** `feat(v3): booklet quick-print UI`

---

### Task 11: v2→v3 数据迁移 + 同步版本化

**模型：Fable 5 / Opus 4.8**

**Files:**
- Create: `js/migrate.js`
- Create: `scripts/test-migrate.mjs`
- Modify: `js/sync.js`（dump 加 `schemaVersion: 3`；拉取到无版本/低版本 dump 先过 `migrateDump`）
- Modify: `js/app.js`（启动时对本地 profile 跑一次幂等迁移）
- Modify: `package.json`

**Interfaces:**
- Produces: `migrateProfile(profile) -> profile`（幂等）、`migrateDump(dump) -> dump`、`TAG_TO_SKILL: {[v2tag]: skillId}`
- 映射表（完整列出，实现照抄）：`oral.int→add100`、`oral.decimal→dec_shift`、`oral.frac→frac_same_denom`、`oral.convert→dec_frac_base`、`keep.mult→dec.mult_point`、`keep.div→dec.div_point`、`keep.frac→frac.addsub_diff`、`bridge.*→mix.convert_judge`（chain/compare/baseline/repeating）与 `bridge.percent_of→unit.percent`、`bridge.ratio_simplify→unit.ratio`、`mixed.*→mix.complex`（smart_structure→smart.dist_reverse、estimate_check→mix.estimate）、`strategy.eq_*→eq.` 对应三型、`strategy.smart_*→smart.` 对应家族、`unit.*→unit.` 同名
- 迁移动作：错题条目补 `skill`（查表，查不到落 `mix.complex` 并 console.warn）；profile 补 `mastery: {}`；旧 `difficulty` 保留不动（v2 主题页仍在用）

- [ ] **Step 1: 失败测试**：拿一份手写 v2 profile 样例（3 条错题不同 tag）→ migrateProfile 后每条有 skill、二次迁移无变化（幂等）、migrateDump 对 schemaVersion:3 直接原样返回
- [ ] **Step 2-6: 常规 TDD**；Commit `feat(v3): v2→v3 migration & schema versioning`

---

### Task 12: 集成验收 + 部署

**模型：Fable 5（主会话亲自执行，不外包）**

**Files:** 无新建；README.md 更新 v3.0 功能说明

- [ ] **Step 1:** `npm run validate` 全绿（此时链上有 8 个脚本）
- [ ] **Step 2:** preview 浏览器端到端：清数据 → 日课模式打印（口算页出现，A4 高度 ≤276mm）→ 批阅（口算区录时+主题区标错）→ mastery 变化 → 错题本四预设出册 → 打印册与答案 → Gist 同步字段含 schemaVersion
- [ ] **Step 3:** 老用户路径：注入一份 v2 格式 localStorage → 刷新 → 自动迁移不丢数据
- [ ] **Step 4:** README 更新 + Commit + push → CI 绿 → 线上冒烟（curl 所有新 js 文件 200）
- [ ] **Step 5:** 汇报用户：功能清单 + 试用引导

---

## Self-Review 记录

- 覆盖检查：设计文档 v3.0 范围五项 — 地图（T1/T2）、地基题模（T4/T5）、口算页（T6/T7/T8）、快速出卷（T9/T10）、迁移（T11）✓；引擎前置（T3）✓；验收（T12）✓
- 占位符检查：无 TBD；T4/T5 用精确参数表替代逐题模代码（实现空间被参数表+自测锁死）✓
- 类型一致性：Question 形状在 T3 定义、T4/T5/T7/T9 引用一致；Entry 形状 T6 定义、T7 引用一致；filter 形状 T9 定义、T10 引用一致 ✓
