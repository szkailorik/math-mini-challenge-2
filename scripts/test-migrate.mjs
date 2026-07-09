// v2→v3 迁移单测：错题条目补 skill、幂等（字节级）、
// migrateDump 版本化与 schema:3 原样返回、TAG_TO_SKILL 目标值硬校验 ∈ SKILL_IDS。
// localStorage 内存垫片（浏览器外运行），模式抄 test-booklet.mjs。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { migrateProfile, migrateDump, TAG_TO_SKILL } = await import('../js/migrate.js');
const { SKILL_IDS } = await import('../js/map/skills.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('  ✗', msg); } else console.log('  ✓', msg); };

// —— 手写 v2 profile：3 条已知 tag + 1 条未知 tag，无 skill、无 mastery ——
const entry = (tag, over = {}) => ({
  domain: 'mixed', tag, prompt: `<span>${tag}</span>`, answer: '?', hint: 'h',
  grade: 'wrong', count: 1, rewrongCount: 0, needsExplainCount: 0,
  firstSet: 1, firstDate: '2026-01-01', lastSet: 1, lastDate: '2026-01-01',
  mastered: false, masteryPending: false, ...over,
});
const sample = () => ({
  history: [{ set: 1, date: '2026-01-01', grades: { m1: 'wrong' } }],
  difficulty: { mixed: 3 }, // v2 主题页字段，迁移不得改动
  errorBook: {
    m1: entry('mixed.paren_order'),
    s1: entry('strategy.eq_basic', { domain: 'strategy' }),
    b1: entry('bridge.chain', { domain: 'bridge' }),
    x1: entry('weird.unknown_tag_xyz'),
  },
});

console.log('migrateProfile：补 skill / mastery');
{
  const p = migrateProfile(sample());
  ok(p.errorBook.m1.skill === 'gen.order_bracket', 'mixed.paren_order → gen.order_bracket');
  ok(p.errorBook.s1.skill === 'eq.x_add_sub', 'strategy.eq_basic → eq.x_add_sub');
  ok(p.errorBook.b1.skill === 'mix.convert_judge', 'bridge.chain → mix.convert_judge');
  ok(p.errorBook.x1.skill === 'mix.complex', '未知 tag → mix.complex 兜底');
  ok(Object.values(p.errorBook).every((e) => typeof e.skill === 'string'), '每条错题都有 skill');
  ok(!('mastery' in p), 'migrateProfile 不再写入幽灵字段 profile.mastery');
  ok(p.difficulty && p.difficulty.mixed === 3, 'difficulty 原样保留');
}

console.log('migrateProfile：幂等（字节级）');
{
  const once = migrateProfile(sample());
  const s1 = JSON.stringify(once);
  const twice = migrateProfile(once);
  ok(JSON.stringify(twice) === s1, '二次迁移 JSON 全等（键序稳定）');
  // 已有 skill 的条目不被覆盖
  const withSkill = sample();
  withSkill.errorBook.m1.skill = 'custom.preset';
  ok(migrateProfile(withSkill).errorBook.m1.skill === 'custom.preset', '已有 skill 不覆盖');
}

console.log('migrateDump：版本化与幂等');
{
  const dump = {
    savedAt: '2026-01-01T00:00:00Z',
    state: { currentSet: 3 },
    profile_kai: sample(),
    profile_lorik: sample(),
  };
  const m = migrateDump(dump);
  ok(m.schemaVersion === 3, 'schemaVersion 置 3');
  ok(m.profile_kai.errorBook.m1.skill === 'gen.order_bracket', 'dump 内 profile_kai 已迁移');
  ok(m.profile_lorik.errorBook.x1.skill === 'mix.complex', 'dump 内 profile_lorik 已迁移');

  const d3 = { schemaVersion: 3, profile_kai: { errorBook: {}, history: [], mastery: {} } };
  const r = migrateDump(d3);
  ok(r === d3, 'schemaVersion:3 原样返回（同引用）');

  // migrateDump 幂等字节级
  const b1 = JSON.stringify(migrateDump(dump));
  const b2 = JSON.stringify(migrateDump(migrateDump(dump)));
  ok(b1 === b2, 'migrateDump 幂等字节级');
}

console.log('硬校验：TAG_TO_SKILL 所有目标值 ∈ SKILL_IDS');
{
  const idset = new Set(SKILL_IDS);
  const bad = Object.entries(TAG_TO_SKILL).filter(([, v]) => !idset.has(v));
  ok(bad.length === 0, `全部目标 skillId 真实存在${bad.length ? '，越界：' + JSON.stringify(bad) : ''}`);
  ok(Object.keys(TAG_TO_SKILL).length >= 20, `映射表非空（${Object.keys(TAG_TO_SKILL).length} 条）`);
}

console.log(fails === 0 ? '\n✅ test-migrate 全部通过' : `\n❌ ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
