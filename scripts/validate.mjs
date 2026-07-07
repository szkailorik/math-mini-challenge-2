// 运行时校验：跑 60 套 × 2 学员，验证生成器的确定性与数值卫生。
// 用法：npm run validate
import { SECTIONS, STUDENTS, STUDENT_IDS, TOTAL_POINTS } from '../js/config.js';
import { buildStudentPaper, questionId, buildVariant } from '../js/paper.js';

let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗', msg); };

const SETS = 60;
const BAD_STRINGS = ['NaN', 'Infinity', 'undefined', 'null', '[object'];

console.log(`校验 ${SETS} 套 × ${STUDENT_IDS.length} 学员...`);

if (TOTAL_POINTS !== 100) fail(`总分应为 100，实际 ${TOTAL_POINTS}`);

for (const sid of STUDENT_IDS) {
  const seenAcrossSets = new Map(); // id -> set，检查相邻套重复
  for (let set = 1; set <= SETS; set++) {
    const paper = buildStudentPaper(sid, set);
    const prompts = new Set();
    for (const sec of paper.sections) {
      if (sec.questions.length !== sec.count) {
        fail(`${sid} 套${set} ${sec.title}: 题量 ${sec.questions.length} ≠ ${sec.count}`);
      }
      for (const q of sec.questions) {
        const text = q.prompt + '|' + q.answer;
        for (const bad of BAD_STRINGS) {
          if (text.includes(bad)) fail(`${sid} 套${set} ${sec.title} [${q.tag}]: 含 "${bad}" → ${q.prompt.slice(0, 80)}`);
        }
        if (!q.answer || !q.answer.trim()) fail(`${sid} 套${set} [${q.tag}]: 空答案`);
        if (!q.tag || !q.tag.includes('.')) fail(`${sid} 套${set}: 非法 tag "${q.tag}"`);
        if (prompts.has(q.prompt)) fail(`${sid} 套${set} ${sec.title}: 同卷重复题 → ${q.prompt.slice(0, 60)}`);
        prompts.add(q.prompt);
        const prevSet = seenAcrossSets.get(q.id);
        if (prevSet !== undefined && set - prevSet <= 1) {
          fail(`${sid} 套${set} 与套${prevSet} 相邻重复 [${q.tag}]`);
        }
        seenAcrossSets.set(q.id, set);
      }
    }
    // 确定性：同一套再生成一次必须逐题一致
    if (set <= 5) {
      const again = buildStudentPaper(sid, set);
      const a = paper.sections.flatMap((s) => s.questions.map((q) => q.prompt)).join('\n');
      const b = again.sections.flatMap((s) => s.questions.map((q) => q.prompt)).join('\n');
      if (a !== b) fail(`${sid} 套${set}: 非确定性生成！`);
    }
  }
  console.log(`  ${STUDENTS[sid].name}: ${SETS} 套通过基本校验`);
}

// 变式生成：每个域抽查
for (const sec of SECTIONS) {
  const paper = buildStudentPaper('kai', 1);
  const q = paper.sections.find((s) => s.key === sec.key).questions[0];
  const v = buildVariant(sec.domain, q.tag, 3, q.id, 99);
  if (!v) fail(`变式生成失败: ${sec.domain}/${q.tag}`);
  else if (!v.answer) fail(`变式无答案: ${sec.domain}/${q.tag}`);
}
console.log('  变式生成通过');

// 动态难度：levelsProvider 路径（域级混合 level）
{
  const provider = (set) => ({ oral: 2, keep: 2, bridge: set % 2 ? 2 : 3, mixed: 3, unit: 2, strategy: 3 });
  for (let set = 1; set <= 20; set++) {
    const paper = buildStudentPaper('lorik', set, provider);
    for (const sec of paper.sections) {
      if (sec.questions.length !== sec.count) fail(`动态难度 套${set} ${sec.title}: 题量不对`);
      for (const q of sec.questions) {
        for (const bad of BAD_STRINGS) {
          if ((q.prompt + q.answer).includes(bad)) fail(`动态难度 套${set} [${q.tag}]: 含 "${bad}"`);
        }
      }
    }
  }
  const a = buildStudentPaper('lorik', 3, provider);
  const b = buildStudentPaper('lorik', 3, provider);
  if (JSON.stringify(a.sections.map((s) => s.questions.map((q) => q.prompt)))
    !== JSON.stringify(b.sections.map((s) => s.questions.map((q) => q.prompt)))) {
    fail('动态难度：同 provider 同套非确定性');
  }
  console.log('  动态难度路径通过');
}

// level 4（mixed/strategy 巅峰难度）
{
  const { GENERATORS } = await import('../js/paper.js');
  for (const dom of ['mixed', 'strategy']) {
    for (let i = 0; i < 40; i++) {
      const { makeRng } = await import('../js/rng.js');
      const qs = GENERATORS[dom].generate(makeRng('l4-test', dom, String(i)), 4, 5);
      if (qs.length !== 5) fail(`L4 ${dom} seed${i}: 题量 ${qs.length}`);
      const prompts = new Set();
      for (const q of qs) {
        for (const bad of BAD_STRINGS) {
          if ((q.prompt + q.answer).includes(bad)) fail(`L4 ${dom} seed${i} [${q.tag}]: 含 "${bad}" → ${q.prompt.slice(0, 60)}`);
        }
        if (!q.answer?.trim()) fail(`L4 ${dom} seed${i} [${q.tag}]: 空答案`);
        if (prompts.has(q.prompt)) fail(`L4 ${dom} seed${i}: 同卷重复`);
        prompts.add(q.prompt);
      }
    }
  }
  console.log('  level 4 生成通过');
}

// questionId 稳定性
{
  const p1 = buildStudentPaper('kai', 3);
  const p2 = buildStudentPaper('kai', 3);
  const id1 = questionId(p1.sections[0].questions[0]);
  const id2 = questionId(p2.sections[0].questions[0]);
  if (id1 !== id2) fail('questionId 不稳定');
}

if (failures) {
  console.error(`\n共 ${failures} 个问题`);
  process.exit(1);
}
console.log('\n✅ 全部校验通过');
