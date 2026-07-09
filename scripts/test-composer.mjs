// 口算计时页组卷单测：40 题恰好、无坏串、同种子一致、learning 权重生效、
// 连续同技能 ≤3、盖章复现、lastScore 读取。
// localStorage 内存垫片（浏览器外运行），模式抄 test-adaptive.mjs。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { saveMastery } = await import('../js/store.js');
const { saveSprintScore } = await import('../js/store.js');
const { buildSprintPage, computeSprintSkills, SPRINT_POOL } = await import('../js/engine/composer.js');
const { ensureStamp } = await import('../js/adaptive.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('  ✗', msg); } else console.log('  ✓', msg); };
const reset = () => mem.clear();

const BAD_STRINGS = ['NaN', 'Infinity', 'undefined', 'null', '[object'];
const FLU = ['add20', 'sub20', 'mult_table', 'div_table', 'add100', 'sub100',
  'mult_pairs', 'dec_shift', 'dec_frac_base', 'frac_same_denom', 'square_base', 'estimate_flash'];
const entry = (state, lastSet = 0) => ({ hits: [], speedOk: state === 'maintain', state, lastSet });

// 最长连续同技能游程
function maxRun(seq) {
  let max = 1, cur = 1;
  for (let i = 1; i < seq.length; i++) {
    cur = seq[i] === seq[i - 1] ? cur + 1 : 1;
    if (cur > max) max = cur;
  }
  return seq.length ? max : 0;
}

// ---- 池子：12 个 fluency 技能全可出（gradeBand[0] ≤ 6）----
ok(SPRINT_POOL.length === 12, `候选池 12 技能：实际 ${SPRINT_POOL.length}`);
ok(SPRINT_POOL.every((id) => FLU.includes(id)), '候选池全为 fluency 技能');

// ---- 构造 mastery：add20 learning(3)，其余 maintain 未到期(1) ----
reset();
const m1 = {};
for (const id of FLU) m1[id] = entry('maintain', 20); // set=21, 21-20=1 <4 → 未到期 → 权重 1
m1.add20 = entry('learning', 0);                        // learning → 权重 3
saveMastery('kai', m1);

const page = buildSprintPage('kai', 21);

// 1) 40 题恰好
ok(page.items.length === 40, `40 题恰好：实际 ${page.items.length}`);

// 2) 无坏串（内容卫生）
let clean = true;
for (const q of page.items) {
  const text = String(q.prompt) + '|' + String(q.answer);
  for (const bad of BAD_STRINGS) if (text.includes(bad)) { clean = false; console.error('    坏串', q.tag, q.prompt); }
  if (!q.answer || !String(q.answer).trim()) clean = false;
}
ok(clean, '无坏串（NaN/Infinity/undefined/空答案）');

// 3) 连续同技能 ≤3
const seq = page.items.map((q) => q.skill);
ok(maxRun(seq) <= 3, `连续同技能 ≤3：最长游程 ${maxRun(seq)}`);

// 4) mix 计数与 items 一致
const recount = {};
for (const id of seq) recount[id] = (recount[id] || 0) + 1;
ok(JSON.stringify(recount) === JSON.stringify(page.mix), 'mix 计数与 items 一致');
ok(Object.values(page.mix).reduce((a, b) => a + b, 0) === 40, 'mix 合计 40');

// 5) learning 权重生效：add20 题数 ≥ 2× mult_table
ok((page.mix.add20 || 0) >= 2 * (page.mix.mult_table || 0),
  `learning 权重：add20 ${page.mix.add20 || 0} ≥ 2× mult_table ${page.mix.mult_table || 0}`);

// 6) 同种子两跑一致
const p2 = buildSprintPage('kai', 21);
const key = (pg) => pg.items.map((q) => `${q.skill}:${q.prompt}|${q.answer}`).join('\n');
ok(key(page) === key(p2), '同种子两跑逐题一致');

// ---- 盖章复现：盖章后改 mastery，items 技能序列不变 ----
reset();
saveMastery('kai', m1);
const stamp = ensureStamp('kai', 30);
ok(Array.isArray(stamp.sprint?.skills) && stamp.sprint.skills.length === 40,
  `盖章含 sprint.skills[40]：${stamp.sprint?.skills?.length}`);
const before = buildSprintPage('kai', 30).items.map((q) => q.skill);
// 改 mastery（全变 learning，权重全 3）
const m2 = {};
for (const id of FLU) m2[id] = entry('learning', 0);
saveMastery('kai', m2);
const after = buildSprintPage('kai', 30);
const afterSeq = after.items.map((q) => q.skill);
ok(JSON.stringify(afterSeq) === JSON.stringify(stamp.sprint.skills), '盖章后技能序列固化（复现盖章）');
ok(JSON.stringify(before) === JSON.stringify(afterSeq), '改 mastery 前后技能序列不变');

// ---- 全 maintain 均匀：computeSprintSkills 只产出池内技能 ----
reset();
const m3 = {};
for (const id of FLU) m3[id] = entry('maintain', 30); // set=31, 均未到期 → 全权重 1
saveMastery('kai', m3);
const uniformSkills = computeSprintSkills('kai', 31);
ok(uniformSkills.length === 40 && uniformSkills.every((id) => SPRINT_POOL.includes(id)),
  '全 maintain：产出 40 且均在池内');
ok(maxRun(uniformSkills) <= 3, `全 maintain：连续 ≤3（${maxRun(uniformSkills)}）`);

// ---- lastScore：无记录 null / 有记录读取 ----
reset();
ok(buildSprintPage('lorik', 5).lastScore === null, '无口算成绩 → null');
saveSprintScore('lorik', { set: 4, seconds: 180, correct: 38, total: 40 });
const ls = buildSprintPage('lorik', 5).lastScore;
ok(ls && ls.seconds === 180 && ls.correct === 38 && ls.total === 40, 'lastScore 读取上次成绩');

console.log(fails === 0 ? '\nPASS test-composer' : `\nFAIL test-composer (${fails})`);
process.exit(fails === 0 ? 0 : 1);
