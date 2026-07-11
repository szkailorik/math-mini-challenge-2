// 一页纸日课引擎单测：TOPICS 出题、结构完整、确定性、盖章复现、毕业规则、
// mergeAttack 合并、streak 计算、口算最佳纪录更新规则。
// localStorage 内存垫片（浏览器外运行，模式抄 test-adaptive.mjs）。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { saveProfile, saveSprintScore, loadSprintBest, saveAttack, loadAttack } = await import('../js/store.js');
const {
  TOPICS, genTopicQuestions, buildOnePage, getAttackState,
  recordOnePageOutcome, mergeAttack, selectOnePagePlan,
} = await import('../js/engine/onepage.js');
const { ensureStamp, getStamp } = await import('../js/adaptive.js');
const { makeRng } = await import('../js/rng.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('  ✗', msg); } else console.log('  ✓', msg); };
const BAD = ['NaN', 'Infinity', 'undefined', 'null', '[object'];
const clean = (q) => !BAD.some((b) => (q.prompt + '|' + q.answer).includes(b)) && !!q.answer?.trim();

function reset() {
  mem.clear();
  for (const id of ['kai', 'lorik']) saveProfile(id, { history: [], errorBook: {} });
}

// ---- TOPICS 7 个 + 每主题 tag 前缀能出题 ----
console.log('TOPICS：7 个主题，tag 前缀均可产出干净题');
reset();
ok(TOPICS.length === 7, `TOPICS 数量 7：实际 ${TOPICS.length}`);
for (const topic of TOPICS) {
  let nonEmpty = 0, dirty = 0;
  for (let seed = 0; seed < 20; seed++) {
    const rng = makeRng('t', topic.key, String(seed));
    const qs = genTopicQuestions(rng, topic, topic.domain === 'keep' || topic.domain === 'unit' ? 3 : 4, 3);
    if (qs.length) nonEmpty++;
    for (const q of qs) {
      if (!topic.tagPrefixes.some((p) => q.tag.startsWith(p))) dirty++;
      if (!clean(q)) dirty++;
      if (qs.length > 3) dirty++; // 红线：绝不超量
    }
  }
  ok(nonEmpty === 20 && dirty === 0, `${topic.key}(${topic.label}): 20 种子非空且无坏串/超量`);
}

// ---- buildOnePage 结构完整 3 + 2 + 2 + 0..2 + 1 ----
console.log('buildOnePage：结构完整');
reset();
{
  const page = buildOnePage('kai', 5);
  ok(page.sprint && Array.isArray(page.sprint.items), 'sprint 复用 buildSprintPage');
  const s = page.sections;
  ok(s[0].key === 'attack' && s[0].questions.length === 3, 'attack 3 题');
  ok(s[1].key === 'review' && s[1].questions.length === 2, 'reviewA 2 题');
  ok(s[2].key === 'review' && s[2].questions.length === 2, 'reviewB 2 题');
  ok(s[3].key === 'errors' && s[3].questions.length >= 0 && s[3].questions.length <= 2, 'errors 0..2 题');
  ok(s[4].key === 'winner' && s[4].questions.length === 1, 'winner 1 题');
  const all = [s[0], s[1], s[2], s[4]].flatMap((x) => x.questions);
  ok(all.every(clean), '主题/必赢题均干净');
  ok(page.feedback && typeof page.feedback.badges === 'number' && typeof page.feedback.attackLabel === 'string',
    'feedback 含 streak/badges/attackLabel');
}

// ---- 同参两跑一致 ----
console.log('确定性：同参两跑逐题一致');
{
  const flat = (p) => p.sections.flatMap((x) => x.questions.map((q) => q.q ? q.q.prompt : q.prompt)).join('|');
  ok(flat(buildOnePage('kai', 5)) === flat(buildOnePage('kai', 5)), 'kai 套5 两跑一致');
  ok(flat(buildOnePage('lorik', 7)) === flat(buildOnePage('lorik', 7)), 'lorik 套7 两跑一致');
}

// ---- 盖章后改 attack 状态输出不变 ----
console.log('盖章复现：盖章后改 attack 状态，一页纸不变');
{
  reset();
  const before = buildOnePage('kai', 9);
  const flat = (p) => p.sections.filter((x) => x.key !== 'winner')
    .flatMap((x) => x.questions.map((q) => q.q ? q.q.prompt : q.prompt)).join('|');
  const stamp = ensureStamp('kai', 9);
  ok(stamp.onepage && stamp.onepage.attackTopic, '盖章含 onepage 计划');
  // 篡改 attack 状态（换主攻主题）
  saveAttack('kai', { topicKey: 'unitrate', streakDays: 0, graduated: ['smart', 'mixed', 'mixfd'] });
  const after = buildOnePage('kai', 9);
  ok(flat(before) === flat(after), '改 attack 后主题区题目不变（按盖章复现）');
  ok(after.sections[0].topic.key === stamp.onepage.attackTopic, 'attack 主题仍取自盖章');
}

// ---- recordOnePageOutcome 毕业规则 ----
console.log('recordOnePageOutcome：毕业/清零规则');
{
  reset();
  const first = getAttackState('kai').topicKey;
  ok(first === 'smart', `初始主攻队首 smart：实际 ${first}`);
  let r = recordOnePageOutcome('kai', 1, { attackCorrect: 3, attackTotal: 3 });
  ok(r.graduatedNow === null && r.newAttack === 'smart' && getAttackState('kai').streakDays === 1, '1 日 3/3 不毕业，streak=1');
  r = recordOnePageOutcome('kai', 2, { attackCorrect: 3, attackTotal: 3 });
  ok(r.graduatedNow === 'smart' && r.newAttack === 'mixed', '连续 2 日 3/3 毕业 smart → 换 mixed');
  ok(getAttackState('kai').graduated.includes('smart') && getAttackState('kai').streakDays === 0, '毕业后 graduated 含 smart，streak 清零');
  // 错一题清零
  recordOnePageOutcome('kai', 3, { attackCorrect: 3, attackTotal: 3 });
  ok(getAttackState('kai').streakDays === 1, '再 3/3 → streak=1');
  r = recordOnePageOutcome('kai', 4, { attackCorrect: 2, attackTotal: 3 });
  ok(getAttackState('kai').streakDays === 0 && r.graduatedNow === null, '错一题 streak 清零，不毕业');
}

// ---- recordOnePageOutcome 批阅日去重（同 set 重复批阅不重复计入）----
console.log('recordOnePageOutcome：同 set 重复批阅去重，不重复计入 streak');
{
  reset();
  // a) 同一 set 两次 3/3 只算 1 天，不毕业
  let r1 = recordOnePageOutcome('kai', 1, { attackCorrect: 3, attackTotal: 3 });
  ok(r1.graduatedNow === null && getAttackState('kai').streakDays === 1, '第一次批阅 set1 3/3 → streak=1');
  let r2 = recordOnePageOutcome('kai', 1, { attackCorrect: 3, attackTotal: 3 }); // 误点重交，同一 set
  ok(r2.graduatedNow === null && getAttackState('kai').streakDays === 1, '重复批阅同一 set1 → streak 仍为 1（不重复累加）');
  r2 = recordOnePageOutcome('kai', 1, { attackCorrect: 0, attackTotal: 3 }); // 即便重交传入错误结果，也应被去重忽略
  ok(getAttackState('kai').streakDays === 1, '重复批阅同一 set1（即便结果不同）→ streak 仍为 1，不被污染');
  let r3 = recordOnePageOutcome('kai', 1, { attackCorrect: 3, attackTotal: 3 }); // 再来一次同 set，仍不应推进到毕业
  ok(r3.graduatedNow === null && getAttackState('kai').streakDays === 1, '第三次重复批阅同一 set1 → 仍不毕业');

  // b) 不同 set 两次 3/3 才真正毕业
  let r4 = recordOnePageOutcome('kai', 2, { attackCorrect: 3, attackTotal: 3 });
  ok(r4.graduatedNow === 'smart' && r4.newAttack === 'mixed', '不同 set(2) 再 3/3 → 连续 2 天达成，毕业 smart');
  ok(getAttackState('kai').graduated.includes('smart') && getAttackState('kai').streakDays === 0, '毕业后 graduated 含 smart，streak 清零');
}

// ---- getAttackState 自愈：topicKey 落在 graduated 中时自动推进 ----
console.log('getAttackState：topicKey∈graduated 的存量数据自愈推进');
{
  reset();
  saveAttack('kai', { topicKey: 'smart', streakDays: 1, graduated: ['smart', 'mixed'] });
  const healed = getAttackState('kai');
  ok(healed.topicKey === 'mixfd', `自愈推进到队列中首个未毕业主题 mixfd：实际 ${healed.topicKey}`);
  ok(!healed.graduated.includes(healed.topicKey), '自愈后 topicKey 不在 graduated 中');
}

// ---- mergeAttack 并集/对称/幂等 ----
console.log('mergeAttack：并集/对称/幂等');
{
  const a = { topicKey: 'mixed', streakDays: 1, graduated: ['smart'] };
  const b = { topicKey: 'fracdiv', streakDays: 0, graduated: ['mixed', 'smart', 'mixfd'] };
  const m = mergeAttack(a, b);
  ok(JSON.stringify(m.graduated) === JSON.stringify(['mixed', 'mixfd', 'smart']), 'graduated 并集排序');
  ok(m.topicKey === 'fracdiv' && m.streakDays === 0, 'topicKey/streakDays 取 graduated 多的一方(b)');
  // 对称：graduated 并集与两方顺序无关
  ok(JSON.stringify(mergeAttack(a, b).graduated) === JSON.stringify(mergeAttack(b, a).graduated), 'graduated 合并对称');
  // 平局取 local
  const c = { topicKey: 'smart', streakDays: 2, graduated: ['smart'] };
  const d = { topicKey: 'mixed', streakDays: 5, graduated: ['mixed'] };
  ok(mergeAttack(c, d).topicKey === 'smart', '平局取 local');
  // 幂等
  const idem = mergeAttack(b, b);
  ok(JSON.stringify(idem) === JSON.stringify(mergeAttack(idem, idem)), '幂等：merge(x,x) 稳定');
  // lastGradedSet 合并取 max
  const e = { topicKey: 'mixed', streakDays: 1, graduated: ['smart'], lastGradedSet: 3 };
  const f = { topicKey: 'fracdiv', streakDays: 0, graduated: ['smart'], lastGradedSet: 7 };
  ok(mergeAttack(e, f).lastGradedSet === 7, 'lastGradedSet 合并取 max(3,7)=7');
  ok(mergeAttack(f, e).lastGradedSet === 7, 'lastGradedSet 合并取 max 与顺序无关');
  const g = { topicKey: 'mixed', streakDays: 1, graduated: ['smart'] }; // 无 lastGradedSet
  ok(mergeAttack(g, f).lastGradedSet === 7, '一方缺失 lastGradedSet 时取有值的一方');
  ok(mergeAttack(g, g).lastGradedSet === null, '双方均缺失 lastGradedSet → null');
}

// ---- streak 计算（连续/断档，同日多条算一天） ----
console.log('streak：连续训练天数');
{
  reset();
  saveProfile('kai', {
    history: [
      { set: 1, date: '2026-07-05', grades: {}, domains: {} },
      { set: 2, date: '2026-07-06', grades: {}, domains: {} },
      { set: 3, date: '2026-07-06', grades: {}, domains: {} }, // 同日算一天
      { set: 4, date: '2026-07-07', grades: {}, domains: {} },
    ],
    errorBook: {},
  });
  ok(buildOnePage('kai', 5).feedback.streak === 3, '连续 3 天（同日多条算一天）');
  saveProfile('lorik', {
    history: [
      { set: 1, date: '2026-07-01', grades: {}, domains: {} },
      { set: 2, date: '2026-07-05', grades: {}, domains: {} }, // 断档
      { set: 3, date: '2026-07-06', grades: {}, domains: {} },
    ],
    errorBook: {},
  });
  ok(buildOnePage('lorik', 5).feedback.streak === 2, '断档后只数最近连续段（2 天）');
}

// ---- 口算最佳纪录更新规则 ----
console.log('bestSprint：correct≥38 且更快才更新');
{
  reset();
  saveSprintScore('kai', { set: 1, seconds: 150, correct: 40, total: 40 });
  ok(loadSprintBest('kai').seconds === 150, '首次 40 对 → 记录 150s');
  saveSprintScore('kai', { set: 2, seconds: 120, correct: 39, total: 40 });
  ok(loadSprintBest('kai').seconds === 120, '39 对且更快 → 更新 120s');
  saveSprintScore('kai', { set: 3, seconds: 100, correct: 37, total: 40 });
  ok(loadSprintBest('kai').seconds === 120, 'correct<38 → 不更新');
  saveSprintScore('kai', { set: 4, seconds: 200, correct: 40, total: 40 });
  ok(loadSprintBest('kai').seconds === 120, '更慢 → 不更新');
}

if (fails) { console.error(`\n共 ${fails} 个断言失败`); process.exit(1); }
console.log('\n✅ 一页纸引擎全部通过');
