import { SKILLS, SKILL_IDS, byLayer } from '../js/map/skills.js';
import { BUGS, BUG_IDS } from '../js/map/bugs.js';
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
// bug 错因库校验
ok(BUG_IDS.length >= 35, `bug 库 ≥35 条：${BUG_IDS.length}`);
const bugFamilies = new Set();
const seenBugIds = new Set();
for (const b of Object.values(BUGS)) {
  ok(b.label && b.diagnose && b.explain, `${b.id}: 三段文案齐`);
  ok(['knowledge', 'skill', 'strategy'].includes(b.family), `${b.id}: family 合法`);
  ok(!seenBugIds.has(b.id), `${b.id}: id 不重复`);
  seenBugIds.add(b.id);
  bugFamilies.add(b.family);
}
ok(bugFamilies.size === 3, `bug 库三类 family 均有覆盖：${[...bugFamilies].join(',')}`);

if (fails) { console.error(`${fails} 失败`); process.exit(1); }
console.log('✅ 技能地图校验通过');
