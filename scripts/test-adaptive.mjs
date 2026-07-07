// 自适应引擎单测：压力分档、难度升降、盖章确定性、回炉选题。
// localStorage 内存垫片（浏览器外运行）。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { saveProfile } = await import('../js/store.js');
const { errorPressure, updateDifficulty, getDifficulties, levelForSet, pickFocusEntries, ensureStamp, getStamp } = await import('../js/adaptive.js');
const { mergeStamps } = await import('../js/sync.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('  ✗', msg); } else console.log('  ✓', msg); };

const entry = (over = {}) => ({
  tag: 'mixed.paren_order', domain: 'mixed', prompt: '<span>1+1</span>', answer: '2', hint: '',
  grade: 'wrong', count: 1, rewrongCount: 0, needsExplainCount: 0,
  firstSet: 1, firstDate: '2026-07-01', lastSet: 1, lastDate: '2026-07-01',
  mastered: false, masteryPending: false, ...over,
});

// ---- 压力分档 ----
saveProfile('kai', { history: [], errorBook: {} });
ok(errorPressure('kai', 10).band === 'light', '无错题 → 轻量档');

saveProfile('kai', { history: [], errorBook: { a: entry(), b: entry({ tag: 'unit.speed', domain: 'unit' }) } });
ok(errorPressure('kai', 10).band === 'standard', '2 条到期 → 标准档');

saveProfile('kai', {
  history: [],
  errorBook: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`e${i}`, entry({ rewrongCount: 1, count: 2 })])),
});
ok(errorPressure('kai', 10).band === 'intensive', '5 条复错到期 → 强化档');

// ---- 回炉选题 ----
const focus = pickFocusEntries('kai', 10);
ok(focus.items.length === 8, `强化档预算 8 题：实际 ${focus.items.length}`);
const originals = focus.items.filter((i) => i.kind === 'original').length;
ok(originals <= Math.floor(focus.items.length / 2), `原题占比 ≤50%：${originals}/${focus.items.length}`);
ok(focus.items.some((i) => i.kind === 'variant'), '含变式');

saveProfile('kai', { history: [], errorBook: {} });
ok(pickFocusEntries('kai', 10).items.length === 0, '无错题 → 不加回炉区');

// ---- 难度升降 ----
const histAcc = (rate, dom = 'mixed') => ({
  set: 1, date: '2026-07-01', grades: {},
  domains: { [dom]: { total: 10, right: Math.round(10 * rate) } },
});
let p = { history: [histAcc(1), histAcc(1), histAcc(1)], errorBook: {} };
updateDifficulty('kai', p);
ok(p.difficulty.mixed === 3.15, `KAI mixed 全对 3 套 → 3.0+0.15=${p.difficulty.mixed}`);
p.history.push(histAcc(0.6), histAcc(0.6)); // 近 3 套 = [100%,60%,60%] → 73% < 75%
updateDifficulty('kai', p);
ok(p.difficulty.mixed < 3.15, `近 3 套掉到 <75% → 降档：${p.difficulty.mixed}`);
p.history.push(histAcc(0.85), histAcc(0.85)); // 近 3 套 = [60%,85%,85%] → 76.7% 落入持平区
const held = p.difficulty.mixed;
updateDifficulty('kai', p);
ok(p.difficulty.mixed === held, `75~92% 区间持平：${p.difficulty.mixed}`);
// 上限钳制：oral 域最高 3.0
let p2 = { history: [histAcc(1, 'oral'), histAcc(1, 'oral'), histAcc(1, 'oral')], errorBook: {}, difficulty: { oral: 3.0 } };
updateDifficulty('kai', p2);
ok(p2.difficulty.oral === 3.0, `oral 域封顶 3.0：${p2.difficulty.oral}`);
// 样本不足不动
let p3 = { history: [{ set: 1, date: '', grades: {}, domains: { unit: { total: 4, right: 0 } } }], errorBook: {} };
updateDifficulty('lorik', p3);
ok(p3.difficulty.unit === 2.0, `样本 <8 题不调整：${p3.difficulty.unit}`);

// ---- levelForSet 确定性与比例 ----
ok(levelForSet(3.0, 'kai', 5, 'mixed') === 3, '整数难度 → 恒定 level');
ok(levelForSet(2.4, 'lorik', 7, 'mixed') === levelForSet(2.4, 'lorik', 7, 'mixed'), '同套同难度 → 同 level（确定性）');
let hi = 0;
for (let s = 1; s <= 200; s++) if (levelForSet(2.5, 'lorik', s, 'mixed') === 3) hi++;
ok(hi > 70 && hi < 130, `难度 2.5 → 约半数套升档（200 套中 ${hi}）`);

// ---- 盖章 ----
saveProfile('kai', { history: [], errorBook: { a: entry() } });
const s1 = ensureStamp('kai', 12);
const s2 = ensureStamp('kai', 12);
ok(JSON.stringify(s1) === JSON.stringify(s2), '重复盖章返回同一份');
saveProfile('kai', { history: [], errorBook: {} }); // 错题本清空后
ok(JSON.stringify(getStamp('kai', 12).focus) === JSON.stringify(s1.focus), '盖章后错题本变化不影响已盖章的卷');

// ---- 盖章合并（先盖者胜） ----
const m = mergeStamps(
  { 'kai|3': { at: '2026-07-05T10:00:00Z', levels: { mixed: 3 } } },
  { 'kai|3': { at: '2026-07-05T09:00:00Z', levels: { mixed: 2 } }, 'kai|4': { at: '2026-07-05T11:00:00Z', levels: { mixed: 3 } } },
);
ok(m['kai|3'].levels.mixed === 2, '同套冲突：先盖章者胜');
ok(!!m['kai|4'], '独有盖章保留');

if (fails) { console.error(`\n${fails} 个失败`); process.exit(1); }
console.log('\n✅ 自适应引擎测试全部通过');
