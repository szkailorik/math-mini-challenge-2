// 口算计时页组卷：从 fluency 12 技能按掌握度加权抽 40 题，交错约束（连续同技能 ≤3），
// 确定性种子出题；盖章后按盖章的技能序列复现。纯 rng 出题，无 Math.random。
//
// 题模注册决定：INT/FRAC 两批地基题模在本模块顶部一次性 registerQModels。
// QMODELS 是单例、重复注册抛错——本期只有本模块注册这批题模，故直接在此注册；
// 若将来别的模块也要用这批题模，注册应收敛到一个 registry 入口文件（见 task-7-report）。
import { byLayer } from '../map/skills.js';
import { registerQModels, generateFromSkill } from './qmodel.js';
import { sprintWeight } from './mastery.js';
import { getMastery } from './mastery.js';
import { getStamp } from '../adaptive.js';
import { loadSprintScore } from '../store.js';
import { makeRng } from '../rng.js';
import { MODELS as INT_MODELS } from '../qbank/fluency-int.js';
import { MODELS as FRAC_MODELS } from '../qbank/fluency-frac.js';

registerQModels([...INT_MODELS, ...FRAC_MODELS]);

const SPRINT_SEED = 'v3-sprint';
const SPRINT_COUNT = 40;    // 口算页题量
const MAX_RUN = 3;          // 同技能点连续上限
const GRADE = 6;            // 学员年级本期固定 6

// 候选池：fluency 层、gradeBand 下界 ≤ 当前年级。12 技能全通过。
export const SPRINT_POOL = byLayer('fluency')
  .filter((s) => s.gradeBand[0] <= GRADE)
  .map((s) => s.id);

// 按 sprintWeight 加权抽 40 个技能 id（累积概率法，单 rng 流；
// 抽完后对"已连续 MAX_RUN 题的技能"临时降权 0 再抽下一题——确定性交错，不做 rejection-reset）。
export function computeSprintSkills(studentId, setNumber) {
  const mastery = getMastery(studentId);
  const baseWeights = SPRINT_POOL.map((id) => sprintWeight(mastery[id], setNumber));
  const rng = makeRng(SPRINT_SEED, studentId, String(setNumber), 'pick');
  const skills = [];
  for (let i = 0; i < SPRINT_COUNT; i++) {
    const n = skills.length;
    // 尾部是否已连续 MAX_RUN 题同一技能
    const eff = SPRINT_POOL.map((id, k) => {
      if (n >= MAX_RUN) {
        let same = true;
        for (let j = 1; j <= MAX_RUN; j++) if (skills[n - j] !== id) { same = false; break; }
        if (same) return 0;
      }
      return baseWeights[k];
    });
    const total = eff.reduce((a, b) => a + b, 0);
    let r = rng.next() * total;
    let chosen = SPRINT_POOL[SPRINT_POOL.length - 1];
    for (let k = 0; k < SPRINT_POOL.length; k++) {
      r -= eff[k];
      if (r < 0) { chosen = SPRINT_POOL[k]; break; }
    }
    skills.push(chosen);
  }
  return skills;
}

// 口算计时页：已盖章按盖章的技能序列复现，未盖章用当前 mastery 即时预览。
// 题目内容一律由 per-index 种子 makeRng('v3-sprint', student, set, i) 决定——
// 盖章路径与预览路径共用出题代码，故出同一套题。
export function buildSprintPage(studentId, setNumber) {
  const stamp = getStamp(studentId, setNumber);
  const skills = (stamp?.sprint?.skills && stamp.sprint.skills.length === SPRINT_COUNT)
    ? stamp.sprint.skills
    : computeSprintSkills(studentId, setNumber);

  const items = skills.map((skillId, i) =>
    generateFromSkill(makeRng(SPRINT_SEED, studentId, String(setNumber), String(i)), skillId));

  const mix = {};
  for (const id of skills) mix[id] = (mix[id] || 0) + 1;

  return { items, mix, lastScore: loadSprintScore(studentId) || null };
}
