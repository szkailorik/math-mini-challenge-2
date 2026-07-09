// 错题本快速出卷引擎：按 filter 选题，每条错题铺成阶梯（原题 + L2 + L3 [+ L4]），
// 变式确定性生成（rng-only），与原题及 variantHistory 指纹去重。
// 新条目（带 qmodel）走 generateVariant；v2 旧条目走 paper.buildVariant。
import { getErrorEntries } from '../errorbook.js';
import { generateVariant } from './qmodel.js';
import { buildVariant } from '../paper.js';
import { makeRng, fnv1a } from '../rng.js';
import { STUDENTS } from '../config.js';
import { TAG_TO_SKILL } from '../migrate.js';

const DEFAULT_MAX = 12;
const RETRY_LIMIT = 6;

// v2 tag → skill 映射（旧条目未迁移时的 skill 预设匹配用；无映射时退回 domain 匹配）。
// 真表来自 migrate.js（迁移后条目已带 skill 字段，此表仅兜底未迁移条目）。
const TAG_SKILL_MAP = TAG_TO_SKILL;

// 变式指纹：题面去 HTML 去空白后 fnv1a（与 questionId 同口径），转 36 进制字符串。
export function fingerprint(prompt) {
  const norm = String(prompt || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return fnv1a(norm).toString(36);
}

// —— 选题：按 preset / 自由字段过滤 ——
function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return Infinity;
  return Math.round((db - da) / 86400000);
}

function matchesSkill(entry, filter) {
  if (entry.skill) return entry.skill === filter.skill;
  const mapped = TAG_SKILL_MAP[entry.tag] || TAG_SKILL_MAP[String(entry.tag || '').split('.')[0]];
  if (mapped) return mapped === filter.skill;
  return filter.domain ? entry.domain === filter.domain : false;
}

function selectEntries(entries, filter, today) {
  const includeMastered = !!filter.includeMastered;
  let pool = entries.filter((e) => includeMastered || !e.mastered);

  switch (filter.preset) {
    case 'due':
      pool = pool.filter((e) => e.spacing.due || e.spacing.overdue);
      break;
    case 'priority':
      pool = pool.filter((e) => e.spacing.priority && e.spacing.due);
      break;
    case 'week':
      pool = pool.filter((e) => e.lastDate && daysBetween(e.lastDate, today) <= 7);
      break;
    case 'skill':
      pool = pool.filter((e) => matchesSkill(e, filter));
      break;
    default:
      // 自由字段组合
      if (filter.domain) pool = pool.filter((e) => e.domain === filter.domain);
      if (filter.skill) pool = pool.filter((e) => e.skill === filter.skill);
      if (Number.isFinite(filter.sinceDays)) {
        pool = pool.filter((e) => e.lastDate && daysBetween(e.lastDate, today) <= filter.sinceDays);
      }
      break;
  }
  return pool;
}

// —— 阶梯步骤：kind 是 item 标签，salt 是种子/变式档位标签 ——
function stepsFor(entry) {
  const rewrong = (entry.rewrongCount || 0) > 0;
  const steps = [
    { kind: 'L2', salt: 'L2' },
    { kind: 'L3', salt: 'L3' },
  ];
  if (rewrong) {
    // qmodel 条目追加真正的 L4；v2 旧条目没有 L4 档，改出第二道 L3（换盐避免与首个 L3 撞）
    if (entry.qmodel) steps.push({ kind: 'L4', salt: 'L4' });
    else steps.push({ kind: 'L3', salt: 'L3b' });
  }
  return steps;
}

// —— 单个变式：带盐重试，直到指纹不撞 seen（原题 + variantHistory + 本条已产变式）——
function makeOneVariant(entry, currentSet, salt, seen, studentId) {
  let last = null;
  for (let attempt = 0; attempt <= RETRY_LIMIT; attempt++) {
    let q;
    if (entry.qmodel) {
      const parts = ['booklet', entry.id, String(currentSet), salt];
      if (attempt > 0) parts.push(String(attempt));
      const rng = makeRng(...parts);
      q = generateVariant(rng, entry.qmodel, { bugId: entry.bugId || null, level: variantLevel(salt) });
    } else {
      const saltA = entry.id + salt + (attempt > 0 ? '#' + attempt : '');
      q = buildVariant(entry.domain, entry.tag, STUDENTS[studentId].level, saltA, currentSet);
    }
    if (!q) return null;
    const fp = fingerprint(q.prompt);
    last = { q, fp };
    if (!seen.has(fp)) return { q, fp, dup: false };
  }
  // 用尽重试仍撞：保留最后一次并标 dup（不静默丢题）
  return { q: last.q, fp: last.fp, dup: true };
}

// salt 标签 → generateVariant 档位（L3b 退回 L3）
function variantLevel(salt) {
  if (salt === 'L2') return 'L2';
  if (salt === 'L4') return 'L4';
  return 'L3';
}

const PRESET_TITLE = {
  due: '到期复练',
  priority: '复错优先',
  week: '本周错题',
  skill: '专项精练',
  null: '错题精选',
};

function titleFor(filter, studentId, currentSet) {
  const key = filter.preset || 'null';
  let base = PRESET_TITLE[key] || '错题精选';
  if (filter.preset === 'skill' && filter.skill) base = `专项 · ${filter.skill}`;
  return `${base} · ${STUDENTS[studentId].name} · 第${currentSet}套`;
}

export function buildBooklet(studentId, currentSet, filter = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const maxEntries = Number.isFinite(filter.maxEntries) ? filter.maxEntries : DEFAULT_MAX;

  const all = getErrorEntries(studentId, currentSet);
  const picked = selectEntries(all, filter, today).slice(0, maxEntries);

  const items = [];
  const fingerprints = {};

  for (const entry of picked) {
    // 原题
    items.push({
      entryId: entry.id,
      kind: 'original',
      q: { prompt: entry.prompt, answer: entry.answer, hint: entry.hint },
    });

    // 去重种子集：原题指纹 + 历史指纹
    const seen = new Set();
    seen.add(fingerprint(entry.prompt));
    for (const h of entry.variantHistory || []) seen.add(h);

    const produced = [];
    for (const step of stepsFor(entry)) {
      const v = makeOneVariant(entry, currentSet, step.salt, seen, studentId);
      if (!v) continue;
      seen.add(v.fp);
      if (!v.dup) produced.push(v.fp);
      const item = {
        entryId: entry.id,
        kind: step.kind,
        q: { prompt: v.q.prompt, answer: v.q.answer, hint: v.q.hint },
      };
      if (v.dup) item.dup = true;
      items.push(item);
    }
    if (produced.length) fingerprints[entry.id] = produced;
  }

  return {
    title: titleFor(filter, studentId, currentSet),
    items,
    empty: items.length === 0,
    fingerprints,
  };
}
