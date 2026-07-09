import { SKILLS, SKILL_IDS, byLayer } from '../js/map/skills.js';
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
if (fails) { console.error(`${fails} 失败`); process.exit(1); }
console.log('✅ 技能地图校验通过');
