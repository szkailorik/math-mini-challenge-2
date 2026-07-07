import { PROGRAM_ID, SECTIONS, STUDENTS } from './config.js';
import { makeRng, fnv1a } from './rng.js';
import * as oral from './generators/oral.js';
import * as keep from './generators/keep.js';
import * as bridge from './generators/bridge.js';
import * as mixed from './generators/mixed.js';
import * as unit from './generators/unit.js';
import * as strategy from './generators/strategy.js';

export const GENERATORS = { oral, keep, bridge, mixed, unit, strategy };

// 题目身份：tag + 标准化题面哈希。同一套号永远生成同一批题（确定性，无需缓存）。
export function questionId(q) {
  const norm = q.prompt.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return `${q.tag}#${fnv1a(norm).toString(36)}`;
}

// levelsProvider: (setNumber) => {domain: level}。缺省用学员基础 level（兼容旧调用）。
function defaultLevels(studentId) {
  const level = STUDENTS[studentId].level;
  return Object.fromEntries(SECTIONS.map((s) => [s.domain, level]));
}

function rawSections(studentId, setNumber, levels) {
  const student = STUDENTS[studentId];
  return SECTIONS.map((sec) => {
    const rng = makeRng(PROGRAM_ID, studentId, String(setNumber), sec.key);
    const level = levels?.[sec.domain] ?? student.level;
    const questions = GENERATORS[sec.domain]
      .generate(rng, level, sec.count)
      .map((q) => ({ ...q, id: questionId(q), domain: sec.domain, level }));
    return { ...sec, questions };
  });
}

// 跨套去重：与上一套（最终版）撞题时确定性换题——同 tag 优先，避免破坏覆盖骨架。
// 上一套的最终版依赖再上一套，因此自底向上构建并缓存（确定性不变）。
const paperCache = new Map();

export function buildStudentPaper(studentId, setNumber, levelsProvider) {
  const provider = levelsProvider || (() => defaultLevels(studentId));
  const keyOf = (s) => `${studentId}|${s}|${JSON.stringify(provider(s))}`;
  const cacheKey = keyOf(setNumber);
  if (paperCache.has(cacheKey)) return paperCache.get(cacheKey);
  for (let s = 1; s < setNumber; s++) {
    if (!paperCache.has(keyOf(s))) {
      paperCache.set(keyOf(s), buildStudentPaperUncached(studentId, s, provider));
    }
  }
  const paper = buildStudentPaperUncached(studentId, setNumber, provider);
  paperCache.set(cacheKey, paper);
  return paper;
}

function buildStudentPaperUncached(studentId, setNumber, provider) {
  const student = STUDENTS[studentId];
  const levels = provider(setNumber);
  const prevIds = new Set(
    setNumber > 1
      ? buildStudentPaper(studentId, setNumber - 1, provider).sections.flatMap((s) => s.questions.map((q) => q.id))
      : []
  );
  const usedIds = new Set();

  const sections = rawSections(studentId, setNumber, levels).map((sec) => {
    const questions = sec.questions.map((q, qi) => {
      if (!prevIds.has(q.id) && !usedIds.has(q.id)) {
        usedIds.add(q.id);
        return q;
      }
      // 撞题：用独立盐重生成，找同 tag 且不撞的替代题
      for (let attempt = 0; attempt < 6; attempt++) {
        const rng = makeRng('dedup', PROGRAM_ID, studentId, String(setNumber), sec.key, String(qi), String(attempt));
        const level = levels?.[sec.domain] ?? student.level;
        const batch = GENERATORS[sec.domain].generate(rng, level, sec.count)
          .map((c) => ({ ...c, id: questionId(c), domain: sec.domain, level }));
        const alt = batch.find((c) => c.tag === q.tag && !prevIds.has(c.id) && !usedIds.has(c.id))
          || batch.find((c) => !prevIds.has(c.id) && !usedIds.has(c.id));
        if (alt) { usedIds.add(alt.id); return alt; }
      }
      usedIds.add(q.id);
      return q; // 兜底：极小概率池耗尽，保留原题
    });
    return { ...sec, questions };
  });
  return { studentId, student, setNumber, sections };
}

export function buildSet(setNumber, providers = {}) {
  return {
    setNumber,
    papers: {
      kai: buildStudentPaper('kai', setNumber, providers.kai),
      lorik: buildStudentPaper('lorik', setNumber, providers.lorik),
    },
  };
}

// 变式生成：同 tag 优先，用于错题复练（L2 同类变式）
export function buildVariant(domain, tag, level, saltA, saltB) {
  const gen = GENERATORS[domain];
  if (!gen) return null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const rng = makeRng('variant', tag, String(saltA), String(saltB), String(attempt));
    const batch = gen.generate(rng, level, 12);
    const match = batch.find((q) => q.tag === tag);
    if (match) return { ...match, id: questionId(match), domain };
  }
  // 兜底：同域任意题
  const rng = makeRng('variant-fallback', tag, String(saltA), String(saltB));
  const batch = gen.generate(rng, level, 6);
  const q = batch[0];
  return q ? { ...q, id: questionId(q), domain } : null;
}
