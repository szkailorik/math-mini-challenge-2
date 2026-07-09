import { loadProfile, saveProfile } from './store.js';
import { DOMAIN_LABELS } from './config.js';
import { TAG_TO_SKILL, FALLBACK_SKILL } from './migrate.js';

// ============ 错题录入 ============
// gradedItems: [{ id, tag, domain, prompt, answer, hint, grade }]
export function recordGrades(studentId, setNumber, gradedItems) {
  const profile = loadProfile(studentId);
  const today = new Date().toISOString().slice(0, 10);

  for (const item of gradedItems) {
    const bad = item.grade === 'wrong' || item.grade === 'careless' || item.grade === 'explain';
    const entry = profile.errorBook[item.id];
    if (bad) {
      if (entry) {
        entry.count += 1;
        entry.lastSet = setNumber;
        entry.lastDate = today;
        entry.grade = item.grade;
        if (entry.mastered) { entry.mastered = false; entry.rewrongCount = (entry.rewrongCount || 0) + 1; }
        else if (entry.lastOutcome === 'wrong-again' || entry.count >= 2) entry.rewrongCount = (entry.rewrongCount || 0);
        if (item.grade === 'explain') entry.needsExplainCount = (entry.needsExplainCount || 0) + 1;
        entry.masteryPending = false;
        entry.lastOutcome = 'wrong-again';
        if (entry.count >= 2) entry.rewrongCount = Math.max(entry.rewrongCount || 0, entry.count - 1);
      } else {
        profile.errorBook[item.id] = {
          tag: item.tag, domain: item.domain,
          skill: item.skill || TAG_TO_SKILL[item.tag] || FALLBACK_SKILL,
          prompt: item.prompt, answer: item.answer, hint: item.hint,
          grade: item.grade, count: 1,
          rewrongCount: 0,
          needsExplainCount: item.grade === 'explain' ? 1 : 0,
          firstSet: setNumber, firstDate: today,
          lastSet: setNumber, lastDate: today,
          mastered: false, masteryPending: false,
          lastOutcome: 'new',
        };
      }
    }
  }

  profile.history.push({
    set: setNumber,
    date: today,
    grades: Object.fromEntries(gradedItems.map((i) => [i.id, i.grade])),
    domains: summarizeDomains(gradedItems),
  });
  saveProfile(studentId, profile);
  return profile;
}

function summarizeDomains(items) {
  const out = {};
  for (const i of items) {
    const d = (out[i.domain] ||= { total: 0, right: 0 });
    d.total += 1;
    if (i.grade === 'right') d.right += 1;
  }
  return out;
}

// ============ 间隔复练调度（沿用旧系统验证过的节奏） ============
export function spacingState(entry, currentSet) {
  let gap = 4;
  if (entry.masteryPending) gap = 2;
  else if ((entry.rewrongCount || 0) > 0) gap = 1;
  else if (entry.count >= 4) gap = 2;
  else if (entry.count >= 2) gap = 3;
  else if (entry.grade === 'careless') gap = 5;

  const since = currentSet - entry.lastSet;
  const due = since >= gap;
  const overdue = due && since >= gap + 2;
  const priority = (entry.rewrongCount || 0) > 0 || (entry.needsExplainCount || 0) > 0;

  let label;
  if (entry.mastered) label = '已掌握';
  else if (entry.masteryPending) label = due ? '巩固确认' : `巩固等待 ${since}/${gap}`;
  else if (overdue) label = '逾期复练';
  else if (due) label = priority ? '复错优先' : '到期复练';
  else label = `冷却中 ${since}/${gap}`;

  return { gap, since, due, overdue, priority, label };
}

export function getErrorEntries(studentId, currentSet) {
  const profile = loadProfile(studentId);
  return Object.entries(profile.errorBook)
    .map(([id, e]) => ({ id, ...e, spacing: spacingState(e, currentSet) }))
    .sort((a, b) => {
      if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
      if (a.spacing.priority !== b.spacing.priority) return a.spacing.priority ? -1 : 1;
      if (a.spacing.due !== b.spacing.due) return a.spacing.due ? -1 : 1;
      return b.count - a.count;
    });
}

export function errorBookStats(studentId, currentSet) {
  const entries = getErrorEntries(studentId, currentSet);
  const active = entries.filter((e) => !e.mastered);
  return {
    active: active.length,
    due: active.filter((e) => e.spacing.due).length,
    priority: active.filter((e) => e.spacing.priority && e.spacing.due).length,
    mastered: entries.length - active.length,
  };
}

// ============ 复练批改回写 ============
// results: [{ entryId, outcome: 'mastered' | 'wrong-again' | 'explain' }]
export function recordPracticeResults(studentId, currentSet, results) {
  const profile = loadProfile(studentId);
  const today = new Date().toISOString().slice(0, 10);
  for (const r of results) {
    const e = profile.errorBook[r.entryId];
    if (!e) continue;
    e.lastSet = currentSet;
    e.lastDate = today;
    if (r.outcome === 'mastered') {
      // 重错/需讲解过的题需要两次确认
      const needsDouble = (e.rewrongCount || 0) > 0 || (e.needsExplainCount || 0) > 0 || e.count >= 3;
      if (needsDouble && !e.masteryPending) {
        e.masteryPending = true;
        e.lastOutcome = 'pending-confirm';
      } else {
        e.mastered = true;
        e.masteryPending = false;
        e.masteredDate = today;
        e.lastOutcome = 'mastered';
      }
    } else if (r.outcome === 'wrong-again') {
      e.rewrongCount = (e.rewrongCount || 0) + 1;
      e.count += 1;
      e.mastered = false;
      e.masteryPending = false;
      e.lastOutcome = 'wrong-again';
    } else if (r.outcome === 'explain') {
      e.needsExplainCount = (e.needsExplainCount || 0) + 1;
      e.masteryPending = false;
      e.lastOutcome = 'explain';
    }
  }
  saveProfile(studentId, profile);
}

// 讲解清单：需讲解 + 复错的题，按域分组
export function buildExplainList(studentId, currentSet) {
  const entries = getErrorEntries(studentId, currentSet)
    .filter((e) => !e.mastered && ((e.needsExplainCount || 0) > 0 || (e.rewrongCount || 0) > 0));
  const byDomain = {};
  for (const e of entries) (byDomain[e.domain] ||= []).push(e);
  return Object.entries(byDomain).map(([domain, list]) => ({
    domain, label: DOMAIN_LABELS[domain] || domain, entries: list,
  }));
}
