// 一页纸日课引擎：每人每天一张固定结构 A4。
// 结构（永不变）：口算冲刺(复用 sprint) + 主攻3 + 复现A×2 + 复现B×2 + 错题二过0..2 + 必赢1。
// 因果链：做题→暴露错误→纠正→隔天再测→巩固。红线：任何路径不因错误增加题量。
//
// 确定性：题目由固定种子的 makeRng 出题；难度沿用 adaptive 的 previewLevels；
// 盖章后（stamp.onepage）按盖章的主攻/复现/错题/必赢固化复现，否则实时预览。
import { GENERATORS, questionId } from '../paper.js';
import { SPRINT_POOL, buildSprintPage } from './composer.js';
import { generateFromSkill } from './qmodel.js';
import { getMastery } from './mastery.js';
import { getErrorEntries } from '../errorbook.js';
import { previewLevels, getStamp } from '../adaptive.js';
import { loadProfile, loadSprintBest, loadAttack, saveAttack } from '../store.js';
import { makeRng } from '../rng.js';

// ============ 主题体系（按失分率排序的主攻队列，签名固定，Task B UI 按此引用） ============
export const TOPICS = [
  { key: 'smart',    label: '简便运算',   domain: 'strategy', tagPrefixes: ['strategy.smart_'] },
  { key: 'mixed',    label: '复杂四则混合', domain: 'mixed',    tagPrefixes: ['mixed.'] },
  { key: 'mixfd',    label: '分数小数混合', domain: 'mixed',    tagPrefixes: ['mixed.frac_dec_mixed', 'mixed.multi_step_frac'] },
  { key: 'fracdiv',  label: '分数除法/分数两步', domain: 'keep', tagPrefixes: ['keep.frac'] },
  { key: 'bigcalc',  label: '多位笔算(小数乘除)', domain: 'keep', tagPrefixes: ['keep.mult', 'keep.div'] },
  { key: 'equation', label: '方程',       domain: 'strategy', tagPrefixes: ['strategy.eq_'] },
  { key: 'unitrate', label: '单位率',     domain: 'unit',     tagPrefixes: ['unit.'] },
];

const TOPIC_BY_KEY = Object.fromEntries(TOPICS.map((t) => [t.key, t]));

// 各生成器支持的整数 level 上界（difficulty 上限 → levelForSet 可能产出 base+1）。
const MAX_LEVEL = { oral: 3, keep: 3, bridge: 3, unit: 3, mixed: 4, strategy: 4 };

function topicLevel(topic, levels) {
  const raw = levels?.[topic.domain];
  const lvl = typeof raw === 'number' ? raw : 2;
  return Math.max(1, Math.min(MAX_LEVEL[topic.domain] ?? 3, lvl));
}

// ============ 题目生成：域生成器超采样 + tag 前缀过滤取前 count 题 ============
// 不足则换盐再采样（≤6 轮）。红线：只会返回 ≤count 题，绝不超量。
export function genTopicQuestions(rng, topic, level, count) {
  const gen = GENERATORS[topic.domain];
  if (!gen || count <= 0) return [];
  const matches = (q) => topic.tagPrefixes.some((p) => q.tag.startsWith(p));
  const batchCount = Math.max(count * 4, 12);
  const seen = new Set();
  const out = [];
  for (let round = 0; round < 6 && out.length < count; round++) {
    // 同一 rng 多轮调用天然换盐（确定性推进），无需外部盐
    const batch = gen.generate(rng, level, batchCount)
      .map((q) => ({ ...q, id: questionId(q), domain: topic.domain, level }));
    for (const q of batch) {
      if (out.length >= count) break;
      if (matches(q) && !seen.has(q.id)) { seen.add(q.id); out.push(q); }
    }
  }
  return out.slice(0, count);
}

// ============ 主攻队列轮转 ============
function pickAttackTopic(graduated) {
  const next = TOPICS.find((t) => !graduated.includes(t.key));
  return next ? next.key : TOPICS[0].key; // 队列走完从头轮（保温强度）
}

// 复现位：非主攻主题按 (setNumber + 索引) 确定性 round-robin 取 2 个。
function pickReviewTopics(attackKey, setNumber) {
  const others = TOPICS.filter((t) => t.key !== attackKey);
  return [0, 1].map((i) => others[((setNumber % others.length) + i) % others.length].key);
}

// ============ 攻坚状态（MMC2_attack_{student}） ============
export function getAttackState(studentId) {
  const raw = loadAttack(studentId) || {};
  const graduated = Array.isArray(raw.graduated)
    ? [...new Set(raw.graduated.filter((k) => TOPIC_BY_KEY[k]))]
    : [];
  let topicKey = TOPIC_BY_KEY[raw.topicKey] ? raw.topicKey : pickAttackTopic(graduated);
  const streakDays = Number.isInteger(raw.streakDays) && raw.streakDays >= 0 ? raw.streakDays : 0;
  return { topicKey, streakDays, graduated };
}

// 批阅后调用：更新 streakDays；连续 2 日 3/3 → graduated.push + 换下一主题。
export function recordOnePageOutcome(studentId, setNumber, { attackCorrect, attackTotal } = {}) {
  const state = getAttackState(studentId);
  const full = attackTotal > 0 && attackCorrect === attackTotal;
  let streakDays = full ? state.streakDays + 1 : 0;
  const graduated = [...state.graduated];
  let topicKey = state.topicKey;
  let graduatedNow = null;
  if (streakDays >= 2) {
    if (!graduated.includes(topicKey)) graduated.push(topicKey);
    graduatedNow = topicKey;
    streakDays = 0;
    topicKey = pickAttackTopic(graduated);
  }
  saveAttack(studentId, { topicKey, streakDays, graduated });
  return { graduatedNow, newAttack: topicKey };
}

// 同步：graduated 并集排序；topicKey/streakDays 取 graduated 多的一方（平局取 local）。
export function mergeAttack(local = {}, remote = {}) {
  const lg = Array.isArray(local.graduated) ? local.graduated : [];
  const rg = Array.isArray(remote.graduated) ? remote.graduated : [];
  const graduated = [...new Set([...lg, ...rg])].filter((k) => TOPIC_BY_KEY[k]).sort();
  const pick = rg.length > lg.length ? remote : local; // 平局取 local
  const other = pick === local ? remote : local;
  return {
    topicKey: TOPIC_BY_KEY[pick.topicKey] ? pick.topicKey
      : (TOPIC_BY_KEY[other.topicKey] ? other.topicKey : pickAttackTopic(graduated)),
    streakDays: Number.isInteger(pick.streakDays) && pick.streakDays >= 0 ? pick.streakDays
      : (Number.isInteger(other.streakDays) && other.streakDays >= 0 ? other.streakDays : 0),
    graduated,
  };
}

// ============ 正反馈：连续训练天数（同日多条算一天，缺一天断） ============
function computeStreak(studentId) {
  const profile = loadProfile(studentId);
  const dates = [...new Set((profile.history || []).map((h) => h.date).filter(Boolean))].sort();
  if (!dates.length) return 0;
  let streak = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    const cur = Date.parse(dates[i] + 'T00:00:00Z');
    const prev = Date.parse(dates[i - 1] + 'T00:00:00Z');
    const days = Math.round((cur - prev) / 86400000);
    if (days === 1) streak++;
    else break;
  }
  return streak;
}

// ============ 必赢位技能选择（维持态口算技能，无则基础 add100） ============
function pickWinnerSkill(studentId, setNumber) {
  const mastery = getMastery(studentId);
  const maintain = SPRINT_POOL.filter((id) => mastery[id]?.state === 'maintain');
  if (maintain.length) {
    return makeRng('onepage-winner-pick', studentId, String(setNumber)).pick(maintain);
  }
  return 'add100'; // 无维持态 → 基础必赢题
}

// 盖章/预览共用：确定当日一页纸的选择计划（可被 ensureStamp 固化）。
export function selectOnePagePlan(studentId, setNumber) {
  const state = getAttackState(studentId);
  const attackTopic = state.topicKey;
  const reviewTopics = pickReviewTopics(attackTopic, setNumber);
  const errorIds = getErrorEntries(studentId, setNumber)
    .filter((e) => !e.mastered && (e.spacing.due || e.spacing.overdue))
    .slice(0, 2)
    .map((e) => e.id);
  const winnerRef = pickWinnerSkill(studentId, setNumber);
  return { attackTopic, reviewTopics, errorIds, winnerRef };
}

function buildErrorSection(studentId, setNumber, errorIds) {
  const entries = getErrorEntries(studentId, setNumber);
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  const questions = [];
  for (const id of errorIds) {
    const e = byId[id];
    if (!e) continue; // 盖章的错题已被掌握/移除：跳过，绝不补题（红线）
    questions.push({ entryId: id, q: { prompt: e.prompt, answer: e.answer, hint: e.hint } });
  }
  return { key: 'errors', questions };
}

// ============ 一页纸主入口 ============
export function buildOnePage(studentId, setNumber) {
  const sprint = buildSprintPage(studentId, setNumber);
  const levels = previewLevels(studentId, setNumber);
  const state = getAttackState(studentId);

  // 已盖章按盖章复现，否则实时预览
  const plan = getStamp(studentId, setNumber)?.onepage || selectOnePagePlan(studentId, setNumber);

  const attackTopic = TOPIC_BY_KEY[plan.attackTopic] || TOPIC_BY_KEY[state.topicKey] || TOPICS[0];
  const attackRng = makeRng('onepage', studentId, String(setNumber), 'attack', attackTopic.key);
  const attackQs = genTopicQuestions(attackRng, attackTopic, topicLevel(attackTopic, levels), 3);

  const sections = [{ key: 'attack', topic: attackTopic, questions: attackQs }];

  const reviewKeys = Array.isArray(plan.reviewTopics) && plan.reviewTopics.length
    ? plan.reviewTopics : pickReviewTopics(attackTopic.key, setNumber);
  for (const rk of reviewKeys) {
    const topic = TOPIC_BY_KEY[rk];
    if (!topic) continue;
    const rng = makeRng('onepage', studentId, String(setNumber), 'review', topic.key);
    const questions = genTopicQuestions(rng, topic, topicLevel(topic, levels), 2);
    sections.push({ key: 'review', topic, questions });
  }

  sections.push(buildErrorSection(studentId, setNumber, plan.errorIds || []));

  const winnerRef = plan.winnerRef || pickWinnerSkill(studentId, setNumber);
  const winnerRng = makeRng('onepage', studentId, String(setNumber), 'winner', winnerRef);
  const winnerQ = generateFromSkill(winnerRng, winnerRef);
  sections.push({ key: 'winner', questions: [{ ...winnerQ, id: questionId(winnerQ) }] });

  const mastery = getMastery(studentId);
  const badges = Object.values(mastery).filter((e) => e.state === 'maintain').length + state.graduated.length;
  const best = loadSprintBest(studentId);
  const feedback = {
    streak: computeStreak(studentId),
    bestSprint: best ? { seconds: best.seconds, correct: best.correct } : null,
    badges,
    attackLabel: attackTopic.label,
  };

  return { sprint, sections, feedback };
}
