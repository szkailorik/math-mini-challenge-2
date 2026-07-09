// 掌握度状态机（地基层 fluency）。纯确定性：无 Math.random / 逻辑路径无 Date。
// state: 'learning'（练透中）| 'maintain'（已毕业，间隔回访）。
// hits 只存 0/1 控制体积；窗口滑动裁剪，最多 WINDOW 题。
import { loadMastery, saveMastery } from '../store.js';
import { SKILLS } from '../map/skills.js';

const WINDOW = 20;         // 正确率窗口封顶
const MIN_SAMPLES = 10;    // accuracy 有效样本下限
const REVISIT_GAP = 4;     // maintain 距上次 ≥ 此值 → 到期回访

function blankEntry() {
  return { hits: [], speedOk: false, state: 'learning', lastSet: 0 };
}

function ensure(mastery, skillId) {
  if (!mastery[skillId]) mastery[skillId] = blankEntry();
  return mastery[skillId];
}

export function getMastery(studentId) {
  return loadMastery(studentId);
}

// 更新命中窗口与 lastSet；维持态答错 → 立即回 learning 且 speedOk 重置。
export function recordSkillResults(studentId, setNumber, results) {
  const mastery = loadMastery(studentId);
  for (const { skill, correct } of results) {
    if (!SKILLS[skill]) continue; // 未知技能容错：不建条目、不抛错
    const e = ensure(mastery, skill);
    e.hits.push(correct ? 1 : 0);
    if (e.hits.length > WINDOW) e.hits = e.hits.slice(-WINDOW); // 滑动裁剪：新进旧出
    e.lastSet = setNumber;
    if (!correct && e.state === 'maintain') { e.state = 'learning'; e.speedOk = false; }
  }
  saveMastery(studentId, mastery);
}

// 页级计时判定速度达标。涉及技能默认为本 mastery 中已有条目的 fluency 技能；
// 可传第四参 skills 精确指定（见文件末尾签名声明）。
// correct/total ≥ 0.95 且 correct/(seconds/60) ≥ 涉及技能 speed 线最小值 → 相关技能 speedOk=true。
export function recordSprintTiming(studentId, setNumber, timing, skills) {
  const { seconds, total, correct } = timing || {};
  const mastery = loadMastery(studentId);
  const pool = (skills && skills.length ? skills : Object.keys(mastery))
    .filter((id) => SKILLS[id] && SKILLS[id].layer === 'fluency' && SKILLS[id].graduation.speed != null);
  if (pool.length && seconds > 0 && total > 0) {
    const acc = correct / total;
    const rate = correct / (seconds / 60);
    const minSpeed = Math.min(...pool.map((id) => SKILLS[id].graduation.speed));
    if (acc >= 0.95 && rate >= minSpeed) {
      for (const id of pool) ensure(mastery, id).speedOk = true;
    }
  }
  saveMastery(studentId, mastery);
}

// 窗口 <MIN_SAMPLES 题返回 null；否则命中率。
export function accuracy(entry) {
  if (!entry || !Array.isArray(entry.hits) || entry.hits.length < MIN_SAMPLES) return null;
  return entry.hits.reduce((a, b) => a + b, 0) / entry.hits.length;
}

// learning 且 accuracy ≥ graduation.acc 且 speedOk → maintain。
export function refreshStates(studentId) {
  const mastery = loadMastery(studentId);
  for (const [id, e] of Object.entries(mastery)) {
    if (e.state !== 'learning') continue;
    const grad = SKILLS[id] && SKILLS[id].graduation;
    const acc = accuracy(e);
    if (grad && acc != null && acc >= grad.acc && e.speedOk) e.state = 'maintain';
  }
  saveMastery(studentId, mastery);
}

// learning=3；maintain 且距上次 ≥REVISIT_GAP 套=2；其余=1。
export function sprintWeight(entry, currentSet) {
  if (!entry || entry.state === 'learning') return 3;
  if (entry.state === 'maintain'
      && typeof currentSet === 'number'
      && currentSet - entry.lastSet >= REVISIT_GAP) return 2;
  return 1;
}
