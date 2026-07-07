// 自适应引擎：错题压力 → 日常卷回炉配比；表现 → 难度升降。
// 参数移植自旧系统验证过的取值（压力分权重、16%-35% 回炉配比、原题≤45%）。
import { STUDENT_IDS, SECTIONS } from './config.js';
import { loadProfile, loadStamps, saveStamps } from './store.js';
import { getErrorEntries } from './errorbook.js';
import { makeRng, fnv1a } from './rng.js';

// ============ 错题压力（决定当日回炉量） ============
export function errorPressure(studentId, currentSet) {
  const entries = getErrorEntries(studentId, currentSet).filter((e) => !e.mastered);
  const due = entries.filter((e) => e.spacing.due && !e.spacing.priority && !e.spacing.overdue).length;
  const priorityDue = entries.filter((e) => e.spacing.due && e.spacing.priority).length;
  const overdue = entries.filter((e) => e.spacing.overdue).length;

  const history = loadProfile(studentId).history.slice(-3);
  let total = 0, mistakes = 0, wrong = 0;
  for (const h of history) {
    const grades = Object.values(h.grades || {});
    total += grades.length;
    mistakes += grades.filter((g) => g !== 'right').length;
    wrong += grades.filter((g) => g === 'wrong').length;
  }
  const mistakeRate = total ? mistakes / total : 0;
  const wrongRate = total ? wrong / total : 0;

  const score = due * 1.25 + priorityDue * 1.4 + overdue * 0.9
    + mistakeRate * 12 + wrongRate * 18;
  const band = (score >= 8 || due + overdue >= 4 || priorityDue >= 2 || wrongRate >= 0.16)
    ? 'intensive'
    : (score >= 3 || due + overdue >= 1 || mistakeRate >= 0.10 ? 'standard' : 'light');
  return { due, priorityDue, overdue, mistakeRate, wrongRate, score, band };
}

export const PRESSURE_LABELS = { light: '轻量回收', standard: '标准回收', intensive: '强化回收' };

// ============ 大题七 · 错题回炉（进日常卷） ============
// 配比对齐旧系统：回炉题 = 日常 38 题的 16%~35% → 6~8 题封顶，原题不超过回炉数一半。
const FOCUS_BUDGET = { light: 0, standard: 5, intensive: 8 };

// 选题（确定性：同一错题本状态 + 同一套号 → 同一批）。返回轻量快照。
export function pickFocusEntries(studentId, setNumber) {
  const pressure = errorPressure(studentId, setNumber);
  let budget = FOCUS_BUDGET[pressure.band];
  const entries = getErrorEntries(studentId, setNumber).filter((e) => !e.mastered);
  // 巩固等待中的题（masteryPending 到期）也要回炉确认
  const pool = entries.filter((e) => e.spacing.due || e.spacing.overdue);
  // 排序：复错/需讲解优先 → 逾期 → 到期，同级按错次多者优先
  pool.sort((a, b) => {
    const pa = a.spacing.priority ? 2 : a.spacing.overdue ? 1 : 0;
    const pb = b.spacing.priority ? 2 : b.spacing.overdue ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return b.count - a.count;
  });

  const items = [];
  for (const e of pool) {
    if (items.length >= budget) break;
    const needOriginal = e.count >= 2 || (e.rewrongCount || 0) > 0;
    if (needOriginal && items.length + 2 <= budget) {
      items.push({ entryId: e.id, kind: 'original' });
      items.push({ entryId: e.id, kind: 'variant' });
    } else {
      items.push({ entryId: e.id, kind: 'variant' });
    }
  }
  // 原题占比校验（≤50%，对齐旧系统 exactReplay ≤ errorLinked×0.5）
  const originals = items.filter((i) => i.kind === 'original').length;
  if (originals > Math.floor(items.length / 2)) {
    for (let i = items.length - 1; i >= 0 && items.filter((x) => x.kind === 'original').length > Math.floor(items.length / 2); i--) {
      if (items[i].kind === 'original') items[i].kind = 'variant';
    }
  }
  return { band: pressure.band, items };
}

// ============ 难度自适应（每域动态难度，按近 3 套正确率调整） ============
// difficulty ∈ [2.0, 3.5]。整数部分是基础 level，小数部分是"出更高一档的概率"。
// mixed/strategy 支持到 level 4（difficulty 上限 3.5 → 50% 概率 level 4），其他域封顶 3。
export const DIFF_RANGE = { min: 2.0, max: 3.5 };
const DOMAIN_MAX = { oral: 3, keep: 3, bridge: 3, unit: 3, mixed: 3.5, strategy: 3.5 };
const INITIAL = { kai: 3.0, lorik: 2.0 };

export function getDifficulties(studentId) {
  const profile = loadProfile(studentId);
  const d = profile.difficulty || {};
  const out = {};
  for (const sec of SECTIONS) {
    out[sec.domain] = clamp(
      typeof d[sec.domain] === 'number' ? d[sec.domain] : INITIAL[studentId],
      DIFF_RANGE.min, Math.min(DIFF_RANGE.max, DOMAIN_MAX[sec.domain])
    );
  }
  return out;
}

function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }

// 批改提交后调用：按该域近 3 套正确率微调难度。返回 {domain: delta} 供展示。
export function updateDifficulty(studentId, profile) {
  const recent = profile.history.slice(-3);
  const acc = {};
  for (const h of recent) {
    for (const [dom, s] of Object.entries(h.domains || {})) {
      const a = (acc[dom] ||= { total: 0, right: 0 });
      a.total += s.total; a.right += s.right;
    }
  }
  profile.difficulty = profile.difficulty || {};
  const deltas = {};
  for (const sec of SECTIONS) {
    const dom = sec.domain;
    const cur = typeof profile.difficulty[dom] === 'number' ? profile.difficulty[dom] : INITIAL[studentId];
    const s = acc[dom];
    if (!s || s.total < 8) { profile.difficulty[dom] = cur; continue; } // 样本太少不动
    const rate = s.right / s.total;
    let delta = 0;
    if (rate >= 0.92) delta = +0.15;
    else if (rate < 0.75) delta = -0.25;
    const next = clamp(cur + delta, DIFF_RANGE.min, Math.min(DIFF_RANGE.max, DOMAIN_MAX[dom]));
    if (next !== cur) deltas[dom] = next - cur;
    profile.difficulty[dom] = Math.round(next * 100) / 100;
  }
  return deltas;
}

// 难度 → 该套该域的实际 level（确定性：由套号+域哈希决定小数概率落点）
export function levelForSet(difficulty, studentId, setNumber, domain) {
  const base = Math.floor(difficulty);
  const frac = difficulty - base;
  if (frac <= 0.001) return base;
  const roll = makeRng('difficulty-roll', studentId, String(setNumber), domain).next();
  return roll < frac ? base + 1 : base;
}

// ============ 套卷参数盖章（打印/批改时固化，保证补打一致 + 跨设备一致） ============
const STAMP_KEEP_WINDOW = 40; // 只保留最近 40 套的盖章，防止无限增长

export function getStamp(studentId, setNumber) {
  return loadStamps()[`${studentId}|${setNumber}`] || null;
}

export function ensureStamp(studentId, setNumber) {
  const stamps = loadStamps();
  const key = `${studentId}|${setNumber}`;
  if (!stamps[key]) {
    stamps[key] = {
      levels: resolveLevels(studentId, setNumber),
      focus: pickFocusEntries(studentId, setNumber),
      at: new Date().toISOString(),
    };
    // 裁剪窗口外的旧盖章
    for (const k of Object.keys(stamps)) {
      const set = Number(k.split('|')[1]);
      if (set < setNumber - STAMP_KEEP_WINDOW) delete stamps[k];
    }
    saveStamps(stamps);
  }
  return stamps[key];
}

function resolveLevels(studentId, setNumber) {
  const diffs = getDifficulties(studentId);
  const out = {};
  for (const [dom, d] of Object.entries(diffs)) {
    out[dom] = levelForSet(d, studentId, setNumber, dom);
  }
  return out;
}

// 未盖章时的即时预览值（不落盘）
export function previewLevels(studentId, setNumber) {
  return getStamp(studentId, setNumber)?.levels || resolveLevels(studentId, setNumber);
}

export function previewFocus(studentId, setNumber) {
  return getStamp(studentId, setNumber)?.focus || pickFocusEntries(studentId, setNumber);
}
