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
