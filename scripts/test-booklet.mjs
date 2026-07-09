// 错题本快速出卷引擎单测：选题预设、阶梯结构、两种变式路由、确定性、指纹去重、截断。
// localStorage 内存垫片（浏览器外运行），模式抄 test-adaptive.mjs。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

// import composer 顺带完成 fluency 题模注册（其顶部 registerQModels）
await import('../js/engine/composer.js');
const { saveProfile } = await import('../js/store.js');
const { buildBooklet, fingerprint } = await import('../js/engine/booklet.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('  ✗', msg); } else console.log('  ✓', msg); };

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

// —— 构造错题本：3 条 v2 旧格式（无 qmodel）+ 2 条 v3 新格式（带 skill/qmodel）——
// v2 之一 rewrongCount=1（应出 3+1=4 个阶梯项，第4项 kind 'L3' 替代）
// currentSet=10，lastSet 拉开使其到期。
const CURRENT = 10;
const v2 = (over) => ({
  domain: 'mixed', tag: 'mixed.paren_order', prompt: '<span>1+2×3</span>', answer: '7', hint: '先乘后加',
  grade: 'wrong', count: 1, rewrongCount: 0, needsExplainCount: 0,
  firstSet: 1, firstDate: daysAgo(30), lastSet: 1, lastDate: daysAgo(30),
  mastered: false, masteryPending: false, ...over,
});
const v3 = (over) => ({
  domain: 'oral', tag: 'add20.carry', skill: 'add20', qmodel: 'add20.carry',
  prompt: '8 + 5 =', answer: '13', hint: '凑十法',
  grade: 'wrong', count: 1, rewrongCount: 0, needsExplainCount: 0,
  firstSet: 1, firstDate: daysAgo(30), lastSet: 1, lastDate: daysAgo(30),
  mastered: false, masteryPending: false, ...over,
});

const book = {
  history: [],
  errorBook: {
    m1: v2({ domain: 'mixed', tag: 'mixed.paren_order', rewrongCount: 1, count: 2 }), // v2 复错
    u1: v2({ domain: 'unit', tag: 'unit.speed', prompt: '<span>60km/h</span>', answer: '2h' }),
    s1: v2({ domain: 'strategy', tag: 'strategy.eq_basic', prompt: '<span>x+3=8</span>', answer: '5' }),
    a1: v3({ qmodel: 'add20.carry', skill: 'add20' }),
    a2: v3({ qmodel: 'sub20.borrow', skill: 'sub20', domain: 'oral', tag: 'sub20.borrow', prompt: '13 − 5 =', answer: '8', rewrongCount: 1, count: 2 }),
  },
};
saveProfile('kai', book);

// ---- due 预设：条目数与阶梯结构 ----
const due = buildBooklet('kai', CURRENT, { preset: 'due' });
ok(!due.empty, 'due: 非空');
const byEntry = (bk) => {
  const g = {};
  for (const it of bk.items) (g[it.entryId] ||= []).push(it);
  return g;
};
const g = byEntry(due);
ok(Object.keys(g).length === 5, `due: 5 条错题全到期 (实际 ${Object.keys(g).length})`);
// m1 (v2 复错) → original + L2 + L3 + L3(替代) = 4，kinds
ok(g.m1.map((i) => i.kind).join(',') === 'original,L2,L3,L3', `m1 v2复错阶梯 original,L2,L3,L3 (实际 ${g.m1.map((i) => i.kind).join(',')})`);
// u1 (v2 非复错) → original + L2 + L3 = 3
ok(g.u1.map((i) => i.kind).join(',') === 'original,L2,L3', `u1 v2 阶梯 original,L2,L3 (实际 ${g.u1.map((i) => i.kind).join(',')})`);
// a1 (v3 非复错) → original,L2,L3
ok(g.a1.map((i) => i.kind).join(',') === 'original,L2,L3', `a1 v3 阶梯 original,L2,L3`);
// a2 (v3 复错) → original,L2,L3,L4
ok(g.a2.map((i) => i.kind).join(',') === 'original,L2,L3,L4', `a2 v3复错阶梯 original,L2,L3,L4 (实际 ${g.a2.map((i) => i.kind).join(',')})`);
// L4 只在复错条目出现
const l4Entries = new Set(due.items.filter((i) => i.kind === 'L4').map((i) => i.entryId));
ok(l4Entries.size === 1 && l4Entries.has('a2'), 'L4 只在 rewrong 的 qmodel 条目 a2 出现');

// ---- v2 变式走 buildVariant 不报错、有答案、prompt 与原题不同 ----
const u1Vars = g.u1.filter((i) => i.kind !== 'original');
ok(u1Vars.every((i) => i.q.prompt && i.q.answer), 'v2 变式有 prompt/answer');
ok(u1Vars.every((i) => i.q.prompt !== book.errorBook.u1.prompt), 'v2 变式题面异于原题');

// ---- 变式不与原题指纹撞 ----
for (const [eid, its] of Object.entries(g)) {
  const origFp = fingerprint(book.errorBook[eid].prompt);
  for (const it of its.filter((x) => x.kind !== 'original')) {
    ok(fingerprint(it.q.prompt) !== origFp || it.dup, `${eid}/${it.kind} 不与原题撞（或标 dup）`);
  }
}

// ---- 同 filter 两次调用逐题一致（确定性） ----
const due2 = buildBooklet('kai', CURRENT, { preset: 'due' });
ok(JSON.stringify(due.items) === JSON.stringify(due2.items), 'due 两跑逐题一致');

// ---- fingerprints 返回结构 ----
ok(due.fingerprints.a2 && due.fingerprints.a2.length === 3, 'fingerprints.a2 含 3 个变式指纹');
ok(due.fingerprints.u1 && due.fingerprints.u1.length === 2, 'fingerprints.u1 含 2 个变式指纹');

// ---- variantHistory 冲撞 → 重试，产出的指纹不再落在 history ----
// 先记录一次干净出卷 u1 的第一个变式指纹，把它塞进 history，再出卷验证换掉了。
const cleanFp = due.fingerprints.u1[0];
const book2 = JSON.parse(JSON.stringify(book));
book2.errorBook.u1.variantHistory = [cleanFp];
saveProfile('kai', book2);
const dueH = buildBooklet('kai', CURRENT, { preset: 'due' });
const gH = byEntry(dueH);
const u1Fps = gH.u1.filter((i) => i.kind !== 'original').map((i) => fingerprint(i.q.prompt));
ok(!u1Fps.includes(cleanFp), 'history 中的指纹不再出现（重试换盐生效）');
ok(gH.u1.filter((i) => i.kind !== 'original').every((i) => !i.dup), 'u1 重试后无 dup');
saveProfile('kai', book); // 还原

// ---- week 预设：按 lastDate 距今 ≤7 天过滤 ----
const bookWeek = JSON.parse(JSON.stringify(book));
bookWeek.errorBook.u1.lastDate = daysAgo(3);   // 本周内
bookWeek.errorBook.s1.lastDate = daysAgo(20);  // 本周外
bookWeek.errorBook.m1.lastDate = daysAgo(30);
bookWeek.errorBook.a1.lastDate = daysAgo(30);
bookWeek.errorBook.a2.lastDate = daysAgo(30);
saveProfile('kai', bookWeek);
const week = buildBooklet('kai', CURRENT, { preset: 'week' });
const weekIds = new Set(week.items.map((i) => i.entryId));
ok(weekIds.has('u1') && !weekIds.has('s1'), 'week: 仅保留 lastDate ≤7 天的 u1');
saveProfile('kai', book);

// ---- skill 预设：v3 按 skill 字段，v2 无 skill 退回 domain ----
const skillBk = buildBooklet('kai', CURRENT, { preset: 'skill', skill: 'add20', domain: 'oral' });
const skIds = new Set(skillBk.items.map((i) => i.entryId));
ok(skIds.has('a1'), 'skill add20: 命中 v3 条目 a1');
ok(!skIds.has('a2'), 'skill add20: 不含 sub20 的 a2');
// v2 条目无 add20 skill，且 domain=oral 不匹配 mixed/unit/strategy → 不入选
ok(!skIds.has('m1') && !skIds.has('u1'), 'skill: v2 条目按 domain 过滤，不误入');

// skill 预设但条目无 skill 字段、无 domain 过滤 → 不崩，v2 全落空
const skillNoDom = buildBooklet('kai', CURRENT, { preset: 'skill', skill: 'add20' });
ok(new Set(skillNoDom.items.map((i) => i.entryId)).has('a1'), 'skill 无 domain: v3 仍命中');

// ---- maxEntries 截断 ----
const capped = buildBooklet('kai', CURRENT, { preset: 'due', maxEntries: 2 });
ok(new Set(capped.items.map((i) => i.entryId)).size === 2, 'maxEntries=2 截断到 2 条');

// ---- 空错题本 → empty:true ----
saveProfile('kai', { history: [], errorBook: {} });
const emptyBk = buildBooklet('kai', CURRENT, { preset: 'due' });
ok(emptyBk.empty === true && emptyBk.items.length === 0, '空错题本 empty:true');
saveProfile('kai', book);

// ---- includeMastered ----
const bookM = JSON.parse(JSON.stringify(book));
bookM.errorBook.u1.mastered = true;
saveProfile('kai', bookM);
const noMast = buildBooklet('kai', CURRENT, { preset: 'due' });
ok(!new Set(noMast.items.map((i) => i.entryId)).has('u1'), '默认排除已掌握');
const withMast = buildBooklet('kai', CURRENT, { preset: 'due', includeMastered: true });
ok(new Set(withMast.items.map((i) => i.entryId)).has('u1'), 'includeMastered:true 纳入已掌握');
saveProfile('kai', book);

if (fails) { console.error(`\n${fails} 个失败`); process.exit(1); }
console.log('\n✅ 错题本出卷引擎测试全部通过');
