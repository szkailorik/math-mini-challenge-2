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
