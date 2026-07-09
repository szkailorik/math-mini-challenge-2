import { registerQModels, qmodelsForSkill, generateFromSkill, generateVariant } from '../js/engine/qmodel.js';
import { MODELS as INT } from '../js/qbank/fluency-int.js';
import { MODELS as FRAC } from '../js/qbank/fluency-frac.js';
import { makeRng } from '../js/rng.js';
import { gcd } from '../js/fraction.js';
registerQModels(INT);
registerQModels(FRAC);
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
console.log('✅ 整数事实题模通过');

// ============ Task 5: 小数分数基准（6 技能点） ============
const FRAC_SKILLS = ['mult_pairs', 'dec_shift', 'dec_frac_base', 'frac_same_denom', 'square_base', 'estimate_flash'];
for (const skill of FRAC_SKILLS) {
  ok(qmodelsForSkill(skill).length >= 1, `${skill} 有题模`);
  for (let i = 0; i < 100; i++) {
    const seed = String(i);
    const q1 = generateFromSkill(makeRng('qf', skill, seed), skill, {});
    for (const b of BAD) ok(!(q1.prompt + q1.answer).includes(b), `${skill}#${i} 无坏串`);
    // 确定性：同种子必须生成完全一致的题
    const q2 = generateFromSkill(makeRng('qf', skill, seed), skill, {});
    ok(q1.prompt === q2.prompt && q1.answer === q2.answer, `${skill}#${i} 确定性`);
    // L3 变式必须与原题不同（不同结构，不只是数字变了）
    const v3 = generateVariant(makeRng('qv', skill, seed), q1.qmodel, { level: 'L3' });
    ok(v3.prompt !== q1.prompt, `${skill}#${i} L3 变式与原题不同`);
    for (const b of BAD) ok(!(v3.prompt + v3.answer).includes(b), `${skill}#${i} L3 无坏串`);
  }
}

// dec_shift：答案不得有浮点尾巴（0.1+0.2 类问题），且必须是精确有限小数字符串
for (let i = 0; i < 100; i++) {
  const q = generateFromSkill(makeRng('qds', String(i)), 'dec_shift', {});
  const numStr = q.answer.replace(/<[^>]+>/g, '');
  ok(/^-?\d+(\.\d+)?$/.test(numStr), `dec_shift#${i} 答案是精确小数串: ${numStr}`);
  ok(!/\d{9,}/.test(numStr), `dec_shift#${i} 无浮点长尾: ${numStr}`);
}

// frac_same_denom：结果必须是最简分数（分子分母互质）
function fracParts(html) {
  const m = html.match(/fn">(\d+)<\/span><span class="fd">(\d+)<\/span>/);
  return m ? { n: Number(m[1]), d: Number(m[2]) } : null;
}
for (let i = 0; i < 100; i++) {
  const q = generateFromSkill(makeRng('qfs', String(i)), 'frac_same_denom', {});
  const parts = fracParts(q.answer);
  ok(!parts || gcd(parts.n, parts.d) === 1, `frac_same_denom#${i} 结果最简: ${q.answer}`);
}

// square_base：正向答案 = n²
for (let i = 0; i < 100; i++) {
  const q = generateFromSkill(makeRng('qsq', String(i)), 'square_base', {});
  const [n] = q.prompt.match(/\d+/g).map(Number);
  ok(Number(q.answer) === n * n, `square_base#${i} 平方正确: ${q.prompt} = ${q.answer}`);
}

// estimate_flash：取整到正确的整百/整千，且确实是"就近"取整
for (let i = 0; i < 100; i++) {
  const q = generateFromSkill(makeRng('qe', String(i)), 'estimate_flash', {});
  const [a, b] = q.prompt.match(/\d+/g).map(Number);
  const p = a * b;
  const unit = p < 1000 ? 100 : 1000;
  const ans = Number(q.answer);
  ok(ans % unit === 0, `estimate_flash#${i} 取整到整${unit}: ${q.answer}`);
  ok(Math.abs(ans - p) <= unit, `estimate_flash#${i} 就近取整: ${p}->${q.answer}`);
}

// estimate_flash：问"几百"时答案不得跨界到 ≥1000，问"几千"时答案不得<1000（审查发现1）
for (let i = 0; i < 2000; i++) {
  const q = generateFromSkill(makeRng('qeb', String(i)), 'estimate_flash', {});
  const ans = Number(q.answer);
  if (q.prompt.includes('几百')) ok(ans < 1000, `estimate_flash#${i} 问几百答案<1000: ${q.prompt} -> ${q.answer}`);
  if (q.prompt.includes('几千')) ok(ans >= 1000, `estimate_flash#${i} 问几千答案>=1000: ${q.prompt} -> ${q.answer}`);
}

// dec_frac_base：百分数带小数（如 62.5%）走"百分数→最简分数"方向时，hint 不应给出不可行的
// "先写成分母 100 的分数" 步骤（分子非整数）（审查发现2）
for (let i = 0; i < 500; i++) {
  const seed = String(i);
  const q1 = generateFromSkill(makeRng('qdf', seed), 'dec_frac_base', {});
  const v3 = generateVariant(makeRng('qdfv', seed), q1.qmodel, { level: 'L3' });
  for (const q of [q1, v3]) {
    const isFracAnswer = /fn">/.test(q.answer);
    const hasDecimalPct = /\.\d+%/.test(q.prompt);
    if (isFracAnswer && hasDecimalPct) {
      ok(!q.hint.includes('分母 100'), `dec_frac_base#${i} 小数百分数化最简分数 hint 不含"分母 100": ${q.prompt} hint="${q.hint}"`);
    }
  }
}

if (fails) process.exit(1);
console.log('✅ 小数分数基准题模通过');
