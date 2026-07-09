import { SKILLS } from '../map/skills.js';
import { BUGS } from '../map/bugs.js';

export const QMODELS = {};

const REQUIRED = ['id', 'skill', 'tier', 'generate'];
export function defineQModel(spec) {
  for (const k of REQUIRED) if (!spec[k]) throw new Error(`QModel 缺字段 ${k}: ${spec.id || '?'}`);
  if (!SKILLS[spec.skill]) throw new Error(`QModel ${spec.id}: 未知技能点 ${spec.skill}`);
  for (const b of spec.bugs || []) if (!BUGS[b]) throw new Error(`QModel ${spec.id}: 未知 bug ${b}`);
  spec.bugs = spec.bugs || [];
  spec.traps = spec.traps || [];
  if (!spec.variant) spec.variant = function (rng) { return this.generate(rng); };
  return Object.freeze(spec);
}

export function registerQModels(list) {
  for (const m of list) {
    if (QMODELS[m.id]) throw new Error(`QModel 重复注册: ${m.id}`);
    QMODELS[m.id] = m;
  }
}

export function qmodelsForSkill(skillId) {
  return Object.values(QMODELS).filter((m) => m.skill === skillId);
}

function finalize(m, q) {
  return { work: 'inline', ...q, tag: m.id, skill: m.skill, qmodel: m.id };
}

export function generateFromSkill(rng, skillId, { tier = 'core' } = {}) {
  const pool = qmodelsForSkill(skillId);
  if (!pool.length) throw new Error(`技能点无题模: ${skillId}`);
  const tiered = pool.filter((m) => m.tier === tier);
  const m = (tiered.length ? rng.pick(tiered) : rng.pick(pool));
  return finalize(m, m.generate(rng));
}

export function generateVariant(rng, qmodelId, { bugId = null, level = 'L2' } = {}) {
  const m = QMODELS[qmodelId];
  if (!m) throw new Error(`未知题模: ${qmodelId}`);
  return finalize(m, m.variant(rng, bugId, level));
}
