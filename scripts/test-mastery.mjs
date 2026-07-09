// 掌握度状态机单测：三条转移、窗口滑动裁剪、页级速度判定、权重三档、读写幂等。
// localStorage 内存垫片（浏览器外运行），模式抄 test-adaptive.mjs。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const {
  getMastery, recordSkillResults, recordSprintTiming,
  accuracy, refreshStates, sprintWeight,
} = await import('../js/engine/mastery.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('  ✗', msg); } else console.log('  ✓', msg); };
const reset = () => mem.clear();

// ---- 核心断言（brief）：双达标才毕业、维持态一错回落 ----
reset();
recordSkillResults('kai', 1, Array.from({ length: 20 }, () => ({ skill: 'add20', correct: true })));
recordSprintTiming('kai', 1, { seconds: 150, total: 40, correct: 40 }); // 16题/分钟 < 35 → speedOk 仍 false
refreshStates('kai');
ok(getMastery('kai').add20.state === 'learning', '正确率够但速度不够 → 仍 learning');
ok(getMastery('kai').add20.speedOk === false, '速度不足 → speedOk false');

recordSprintTiming('kai', 2, { seconds: 60, total: 40, correct: 39 }); // 39题/分钟 ≥35 且 97.5%
ok(getMastery('kai').add20.speedOk === true, '页级双达标 → speedOk true');
refreshStates('kai');
ok(getMastery('kai').add20.state === 'maintain', '双达标 → maintain');

recordSkillResults('kai', 3, [{ skill: 'add20', correct: false }]);
ok(getMastery('kai').add20.state === 'learning', '维持态一错回 learning');
ok(getMastery('kai').add20.speedOk === false, '降级重置 speedOk（重新证明速度）');
ok(getMastery('kai').add20.hits.length <= 20, '窗口封顶 20');

// ---- sprintWeight 三档 ----
ok(sprintWeight({ state: 'learning' }) === 3, 'learning 权重 3');
ok(sprintWeight({ state: 'maintain', lastSet: 1 }, 5) === 2, 'maintain 距 ≥4 套 → 2');
ok(sprintWeight({ state: 'maintain', lastSet: 4 }, 5) === 1, 'maintain 距 <4 套 → 1');
ok(sprintWeight({ state: 'maintain', lastSet: 4 }) === 1, 'maintain 无 currentSet → 1');

// ---- 窗口滑动裁剪：新进旧出 ----
reset();
// 先 25 错（进 20 个 0），再 20 对（把 0 挤出）
recordSkillResults('lorik', 1, Array.from({ length: 25 }, () => ({ skill: 'sub20', correct: false })));
ok(getMastery('lorik').sub20.hits.length === 20, '25 题只留 20');
ok(getMastery('lorik').sub20.hits.every((h) => h === 0), '窗口全为最近的 0');
recordSkillResults('lorik', 2, Array.from({ length: 20 }, () => ({ skill: 'sub20', correct: true })));
ok(getMastery('lorik').sub20.hits.every((h) => h === 1), '20 个新 1 挤掉旧 0（滑动）');
ok(getMastery('lorik').sub20.streakWrong === 0, '连对清零 streakWrong');

// ---- accuracy 窗口不足返回 null ----
reset();
recordSkillResults('kai', 1, Array.from({ length: 9 }, () => ({ skill: 'add20', correct: true })));
ok(accuracy(getMastery('kai').add20) === null, '窗口 <10 → null');
recordSkillResults('kai', 2, [{ skill: 'add20', correct: false }]);
ok(accuracy(getMastery('kai').add20) === 0.9, '10 题 9 对 → 0.9');

// ---- 未知技能容错 ----
reset();
let threw = false;
try { recordSkillResults('kai', 1, [{ skill: 'no_such_skill', correct: true }, { skill: 'add20', correct: true }]); }
catch { threw = true; }
ok(!threw, '未知技能不抛错');
ok(getMastery('kai').no_such_skill === undefined, '未知技能不建条目');
ok(getMastery('kai').add20.hits.length === 1, '同批合法技能仍记录');

// ---- refreshStates 门槛：acc 够但 speedOk 缺 → 不毕业 ----
reset();
recordSkillResults('kai', 1, Array.from({ length: 20 }, () => ({ skill: 'add20', correct: true })));
refreshStates('kai');
ok(getMastery('kai').add20.state === 'learning', 'acc=1 但无 speedOk → 仍 learning');

// ---- 页级速度：多技能取 speed 线最小值 ----
reset();
// add20 speed 35, estimate_flash speed 20 → min = 20
recordSkillResults('kai', 1, [{ skill: 'add20', correct: true }, { skill: 'estimate_flash', correct: true }]);
recordSprintTiming('kai', 1, { seconds: 60, total: 40, correct: 40 }, ['add20', 'estimate_flash']); // 40/min ≥20 但 <35... 取 min 20 → 通过
ok(getMastery('kai').add20.speedOk === true && getMastery('kai').estimate_flash.speedOk === true, '取最小 speed 线判定，双技能均达标');

// ---- store 读写幂等 ----
reset();
recordSkillResults('kai', 1, [{ skill: 'add20', correct: true }]);
const snap1 = JSON.stringify(getMastery('kai'));
const snap2 = JSON.stringify(getMastery('kai'));
ok(snap1 === snap2, '重复读取一致（幂等）');

console.log(fails === 0 ? '\nPASS test-mastery' : `\nFAIL test-mastery (${fails})`);
process.exit(fails === 0 ? 0 : 1);
