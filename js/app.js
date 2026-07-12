import { STUDENTS, STUDENT_IDS, GRADES, DOMAIN_LABELS } from './config.js';
import { loadState, saveState, loadProfile, saveProfile, exportAll, importAll, saveSprintScore } from './store.js';
import { buildSet, buildVariant } from './paper.js';
import {
  renderPaperSheets, renderAnswerSheet, renderExplainList, renderGradingPanel,
  renderFocusSheet, renderSprintGrading,
  renderOnePageSheet, renderOnePageAnswerSheet, renderOnePageThemeGrading, flattenThemeQuestions,
  renderBookletSheets, renderBookletAnswers,
} from './render.js';
import {
  previewLevels, previewFocus, ensureStamp, updateDifficulty,
} from './adaptive.js';
import { buildSprintPage } from './engine/composer.js';
import { buildBooklet } from './engine/booklet.js';
import { recordSkillResults, recordSprintTiming, refreshStates } from './engine/mastery.js';
import { SKILLS } from './map/skills.js';
import { printHTML } from './print.js';
import {
  recordGrades, getErrorEntries, errorBookStats,
  recordPracticeResults, buildExplainList,
} from './errorbook.js';
import { studentSnapshot, renderDashboard } from './dashboard.js';
import { getToken, setToken, syncNow, scheduleSync, lastSyncAt } from './sync.js';
import { migrateProfile } from './migrate.js';
import { TOPICS, buildOnePage, recordOnePageOutcome } from './engine/onepage.js';

const $ = (sel) => document.querySelector(sel);
const TOPIC_LABEL = Object.fromEntries(TOPICS.map((t) => [t.key, t.label]));

// 启动迁移：对本地两个 profile 各跑一次幂等 v2→v3 迁移（补 skill/mastery），
// 在任何同步/出卷之前，保证本地形状已是 v3（合并时不丢新字段）。
for (const id of STUDENT_IDS) saveProfile(id, migrateProfile(loadProfile(id)));

const state = loadState();
let activeTab = 'paper';
let gradingStudent = 'kai';
let errorStudent = 'kai';
// 批阅页顶部切换：'daily'（一页纸日课批阅，默认）| 'match'（比赛日整卷批阅）。内存态，不持久化。
let gradingViewMode = 'daily';
let currentSetCache = null;
const pendingGrades = { kai: {}, lorik: {} };
const pendingPractice = { kai: {}, lorik: {} };
const pendingFocus = { kai: {}, lorik: {} }; // 批阅页第七区标记：key = entryId|kind|序号
const pendingTheme = { kai: {}, lorik: {} }; // 一页纸批阅页主题区：wrong=标错索引集合
const blankSprint = () => ({ wrong: {}, seconds: '', correct: null });
const pendingSprint = { kai: blankSprint(), lorik: blankSprint() }; // 批阅页口算区：wrong=标错索引集合
let currentBooklet = null; // 错题本快速出册预览：{ filter, booklet } | null（未出册）

function levelsProvider(studentId) {
  return (setNumber) => previewLevels(studentId, setNumber);
}

function getSet() {
  if (!currentSetCache || currentSetCache.setNumber !== state.currentSet) {
    currentSetCache = buildSet(state.currentSet, {
      kai: levelsProvider('kai'),
      lorik: levelsProvider('lorik'),
    });
  }
  return currentSetCache;
}

// 大题七：把盖章/预览的回炉条目解析成可渲染的题目
function focusQuestionsFor(studentId, setNumber) {
  const focus = previewFocus(studentId, setNumber);
  const profile = loadProfile(studentId);
  const levels = previewLevels(studentId, setNumber);
  const questions = [];
  for (const item of focus.items) {
    const e = profile.errorBook[item.entryId];
    if (!e) continue; // 另一台设备的盖章可能先到，条目随同步补齐前先跳过
    if (item.kind === 'original') {
      questions.push({ entryId: item.entryId, kind: 'original', q: { prompt: e.prompt, answer: e.answer, hint: e.hint, domain: e.domain } });
    } else {
      const level = Math.min(levels[e.domain] || STUDENTS[studentId].level, 3);
      const v = buildVariant(e.domain, e.tag, level, item.entryId, setNumber);
      if (v) questions.push({ entryId: item.entryId, kind: 'variant', q: v });
    }
  }
  return { band: focus.band, questions };
}

// ================= 导航 =================
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('on', p.id === `panel-${tab}`));
  renderActive();
}

function renderActive() {
  if (activeTab === 'paper') renderPaperTab();
  else if (activeTab === 'grading') renderGradingTab();
  else if (activeTab === 'errorbook') renderErrorTab();
  else if (activeTab === 'dashboard') renderDashboardTab();
}

// ================= 试卷页 =================
function renderPaperTab() {
  $('#set-number').textContent = state.currentSet;
  const set = getSet();
  const preview = STUDENT_IDS.map((id) => studentPapersHTML(set.papers[id])).join('');
  $('#paper-preview').innerHTML = preview;
}

// 学员一页纸日课 HTML：默认且唯一日常形态（口算冲刺+主攻+复现A/B+错题二过+必赢收官）
function studentPapersHTML(paper) {
  const onepage = buildOnePage(paper.studentId, paper.setNumber);
  return renderOnePageSheet(paper, onepage);
}

function changeSet(delta) {
  state.currentSet = Math.max(1, state.currentSet + delta);
  saveState(state);
  currentSetCache = null;
  pendingGrades.kai = {}; pendingGrades.lorik = {};
  pendingFocus.kai = {}; pendingFocus.lorik = {};
  pendingTheme.kai = {}; pendingTheme.lorik = {};
  pendingSprint.kai = blankSprint(); pendingSprint.lorik = blankSprint();
  currentBooklet = null;
  renderActive();
  afterDataChange();
}

// ================= 批阅页 =================
// gradingViewMode='daily'（默认）：一页纸日课批阅（口算区+主题区10题逐题✓/✗）。
// gradingViewMode='match'：比赛日整卷批阅，走现有 v2 主题批阅（renderGradingPanel+第七区）。
function renderGradingTab() {
  const set = getSet();
  const paper = set.papers[gradingStudent];
  const profile = loadProfile(gradingStudent);
  const done = profile.history.some((h) => h.set === state.currentSet);
  $('#grading-status').textContent = done
    ? `⚠️ 第 ${state.currentSet} 套已批阅过，再次提交会追加记录`
    : `第 ${state.currentSet} 套 · ${STUDENTS[gradingStudent].label} · 默认全对，只需点错题`;
  document.querySelectorAll('#panel-grading .student-btn').forEach((b) =>
    b.classList.toggle('on', b.dataset.student === gradingStudent));
  document.querySelectorAll('.grading-mode-btn').forEach((b) =>
    b.classList.toggle('on', b.dataset.gmode === gradingViewMode));

  if (gradingViewMode === 'match') {
    $('#grading-list').innerHTML = renderGradingPanel(paper, pendingGrades[gradingStudent]) + renderFocusGrading();
    return;
  }
  const onepage = buildOnePage(gradingStudent, state.currentSet);
  const sprintHTML = renderSprintGrading(onepage.sprint, pendingSprint[gradingStudent]);
  const themeHTML = renderOnePageThemeGrading(onepage, pendingTheme[gradingStudent]);
  $('#grading-list').innerHTML = sprintHTML + themeHTML;
}

// 批阅页第七区：回炉题用错题本三态（已会/又错/需讲解），默认已会
function renderFocusGrading() {
  const { questions } = focusQuestionsFor(gradingStudent, state.currentSet);
  if (!questions.length) return '';
  const rows = questions.map((fq, i) => {
    const key = `${fq.entryId}|${fq.kind}|${i}`;
    const cur = pendingFocus[gradingStudent][key] || 'mastered';
    return `
    <div class="grade-row" data-fkey="${key}">
      <span class="ans-no">${i + 1}</span>
      <div class="grade-q">
        <div class="q-prompt">${fq.q.prompt}</div>
        <div class="grade-ans">答案：${fq.q.answer} <em>${fq.q.hint || ''}</em>
          <span class="p-kind">${fq.kind === 'original' ? '回炉' : '变式'} · ${DOMAIN_LABELS[fq.q.domain] || ''}</span></div>
      </div>
      <div class="grade-btns">
        <button class="eb-btn ok ${cur === 'mastered' ? 'on' : ''}" data-fkey="${key}" data-outcome="mastered">已会</button>
        <button class="eb-btn bad ${cur === 'wrong-again' ? 'on' : ''}" data-fkey="${key}" data-outcome="wrong-again">又错</button>
        <button class="eb-btn mid ${cur === 'explain' ? 'on' : ''}" data-fkey="${key}" data-outcome="explain">需讲解</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="grade-section focus-grading"><h3>七、错题回炉（附加）</h3>${rows}</div>`;
}

// 口算区提交前校验并打包：用时秒数必填；对题数默认=40-标错数，可手改。
// 返回 null 且已 alert 提示时，调用方应中止整个批阅提交（避免部分录入）。
function prepareSprintSubmission() {
  const secInput = $('#sprint-seconds');
  const correctInput = $('#sprint-correct');
  const seconds = Number(secInput?.value);
  if (!secInput || !seconds || seconds <= 0) {
    alert('请先填写口算区「用时（秒）」再提交');
    secInput?.focus();
    return null;
  }
  const pending = pendingSprint[gradingStudent];
  const wrongCount = Object.values(pending.wrong || {}).filter(Boolean).length;
  const autoCorrect = 40 - wrongCount;
  const correctRaw = correctInput?.value;
  const correct = correctRaw !== undefined && correctRaw !== '' ? Number(correctRaw) : autoCorrect;
  if (!Number.isFinite(correct) || correct < 0 || correct > 40) {
    alert('对题数需在 0-40 之间');
    correctInput?.focus();
    return null;
  }
  const sprint = buildSprintPage(gradingStudent, state.currentSet);
  const results = sprint.items.map((it, i) => ({ skill: it.skill, correct: !pending.wrong[i] }));
  const skills = [...new Set(sprint.items.map((it) => it.skill))]; // 本页去重技能列表（第4参硬性契约）
  return { results, skills, timing: { seconds, total: 40, correct } };
}

function submitGrades() {
  ensureStamp(gradingStudent, state.currentSet); // 没打印直接批（线上做题）也要固化参数
  if (gradingViewMode === 'match') submitMatchGrades();
  else submitOnePageGrades();
}

// 一页纸日课批阅提交链：口算→mastery；主攻+复现+收官→recordGrades；错题二过→recordPracticeResults；
// →recordOnePageOutcome 更新攻坚状态（毕业/切换主攻）。
function submitOnePageGrades() {
  const sprintSubmission = prepareSprintSubmission();
  if (!sprintSubmission) return; // 用时未填：中止整个提交，避免主题区/口算区数据不一致

  const onepage = buildOnePage(gradingStudent, state.currentSet);
  const flat = flattenThemeQuestions(onepage);
  const wrong = pendingTheme[gradingStudent];

  const gradeItems = [];
  const practiceResults = [];
  let attackCorrect = 0, attackTotal = 0;
  flat.forEach((item, i) => {
    const isWrong = !!wrong[i];
    if (item.sectionKey === 'attack') { attackTotal += 1; if (!isWrong) attackCorrect += 1; }
    if (item.sectionKey === 'errors') {
      practiceResults.push({ entryId: item.entryId, outcome: isWrong ? 'wrong-again' : 'mastered' });
    } else {
      gradeItems.push({
        id: item.q.id, tag: item.q.tag, skill: item.q.skill, domain: item.q.domain || 'oral',
        prompt: item.q.prompt, answer: item.q.answer, hint: item.q.hint,
        grade: isWrong ? 'wrong' : 'right',
      });
    }
  });

  recordGrades(gradingStudent, state.currentSet, gradeItems);
  if (practiceResults.length) recordPracticeResults(gradingStudent, state.currentSet, practiceResults);

  // 难度自适应：按近 3 套各域正确率微调
  const profile = loadProfile(gradingStudent);
  const deltas = updateDifficulty(gradingStudent, profile);
  saveProfile(gradingStudent, profile);

  // 口算区：走 mastery 契约链（与主题区 recordGrades 完全独立）
  recordSkillResults(gradingStudent, state.currentSet, sprintSubmission.results);
  recordSprintTiming(gradingStudent, state.currentSet, sprintSubmission.timing, sprintSubmission.skills);
  refreshStates(gradingStudent);
  saveSprintScore(gradingStudent, {
    set: state.currentSet, seconds: sprintSubmission.timing.seconds,
    correct: sprintSubmission.timing.correct, total: 40,
  });

  // 攻坚状态：主攻位 3 题批阅结果 → 连续 2 批阅日全对则毕业换主攻
  const outcome = recordOnePageOutcome(gradingStudent, state.currentSet, { attackCorrect, attackTotal });

  const themeWrongCount = Object.values(wrong).filter(Boolean).length;
  let msg = `${STUDENTS[gradingStudent].name} 第 ${state.currentSet} 套一页纸已录入：`
    + `主题区 ${flat.length - themeWrongCount}/${flat.length} 对 · `
    + `口算 ${sprintSubmission.timing.correct}/40 · 用时 ${sprintSubmission.timing.seconds} 秒。`;
  if (outcome.graduatedNow) {
    const oldLabel = TOPIC_LABEL[outcome.graduatedNow] || outcome.graduatedNow;
    const newLabel = TOPIC_LABEL[outcome.newAttack] || outcome.newAttack;
    msg += `\n🎉 ${oldLabel} 毕业！主攻切换为 ${newLabel}`;
  }
  const deltaMsg = Object.entries(deltas)
    .map(([d, v]) => `${DOMAIN_LABELS[d]}${v > 0 ? '↑' : '↓'}`).join(' ');
  if (deltaMsg) msg += `\n难度调整：${deltaMsg}`;
  alert(msg);

  pendingTheme[gradingStudent] = {};
  pendingSprint[gradingStudent] = blankSprint();
  currentSetCache = null;
  renderGradingTab();
  afterDataChange();
}

// 比赛日整卷批阅提交链：现有 v2 主题批阅（recordGrades + 第七区回炉），无口算/攻坚记录。
function submitMatchGrades() {
  const set = getSet();
  const paper = set.papers[gradingStudent];
  const items = [];
  for (const sec of paper.sections) {
    for (const q of sec.questions) {
      items.push({
        id: q.id, tag: q.tag, domain: q.domain,
        prompt: q.prompt, answer: q.answer, hint: q.hint,
        grade: pendingGrades[gradingStudent][q.id] || 'right',
      });
    }
  }
  recordGrades(gradingStudent, state.currentSet, items);

  // 第七区回炉结果：按错题条目聚合（任一又错→又错 > 任一需讲解→需讲解 > 全对→已会）
  const { questions: focusQs } = focusQuestionsFor(gradingStudent, state.currentSet);
  if (focusQs.length) {
    const byEntry = {};
    focusQs.forEach((fq, i) => {
      const mark = pendingFocus[gradingStudent][`${fq.entryId}|${fq.kind}|${i}`] || 'mastered';
      const rank = { 'wrong-again': 2, explain: 1, mastered: 0 };
      if (!byEntry[fq.entryId] || rank[mark] > rank[byEntry[fq.entryId]]) byEntry[fq.entryId] = mark;
    });
    recordPracticeResults(gradingStudent, state.currentSet,
      Object.entries(byEntry).map(([entryId, outcome]) => ({ entryId, outcome })));
  }

  // 难度自适应：按近 3 套各域正确率微调
  const profile = loadProfile(gradingStudent);
  const deltas = updateDifficulty(gradingStudent, profile);
  saveProfile(gradingStudent, profile);

  const wrong = items.filter((i) => i.grade !== 'right').length;
  const deltaMsg = Object.entries(deltas)
    .map(([d, v]) => `${DOMAIN_LABELS[d]}${v > 0 ? '↑' : '↓'}`).join(' ');
  alert(`${STUDENTS[gradingStudent].name} 第 ${state.currentSet} 套（比赛卷）已录入：${items.length - wrong} 对 / ${wrong} 需关注。`
    + (focusQs.length ? `回炉 ${focusQs.length} 题已回写。` : '')
    + (deltaMsg ? `\n难度调整：${deltaMsg}` : ''));
  pendingGrades[gradingStudent] = {};
  pendingFocus[gradingStudent] = {};
  currentSetCache = null;
  renderGradingTab();
  afterDataChange();
}

// ================= 错题本页 · 快速出册 =================
function populateDomainSelects() {
  const opts = Object.entries(DOMAIN_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  const freeSel = $('#free-domain');
  if (freeSel) freeSel.innerHTML = `<option value="">全部技能域</option>${opts}`;
}

// 「按技能专项」下拉：按当前学员错题本中实际出现过的 skill 填充（去重排序），
// label 用 SKILLS[id]?.label 兜底 id。空错题本时给占位项。
function populateSkillSelect(studentId) {
  const sel = $('#preset-skill-domain');
  if (!sel) return;
  const profile = loadProfile(studentId);
  const skills = [...new Set(Object.values(profile.errorBook || {})
    .map((e) => e.skill).filter(Boolean))].sort();
  sel.innerHTML = skills.length
    ? skills.map((id) => `<option value="${id}">${SKILLS[id]?.label || id}</option>`).join('')
    : '<option value="">（错题本暂无技能标注）</option>';
}

function buildAndPreviewBooklet(filter) {
  const booklet = buildBooklet(errorStudent, state.currentSet, filter);
  currentBooklet = { filter, booklet };
  renderBookletPreview();
}

function renderBookletPreview() {
  const el = $('#booklet-preview');
  if (!el) return;
  if (!currentBooklet) {
    el.innerHTML = '<p class="note booklet-hint">点击上方预设按钮，或展开「自由筛选」出一册训练题</p>';
    return;
  }
  const { booklet } = currentBooklet;
  if (booklet.empty) {
    el.innerHTML = '<div class="booklet-panel"><p class="empty">没有匹配的错题 —— 换个预设或调整筛选条件试试</p></div>';
    return;
  }
  const student = STUDENTS[errorStudent];
  el.innerHTML = `
    <div class="booklet-panel">
      <div class="booklet-panel-head">
        <h3>${booklet.title}<span class="booklet-count">共 ${booklet.items.length} 题</span></h3>
        <button class="tool-btn primary" id="booklet-print">🖨 打印这册（含答案页）</button>
      </div>
      <div class="booklet-preview-sheets">${renderBookletSheets(student, booklet)}</div>
    </div>`;
}

// 把本次出册消耗的变式指纹并入对应错题条目的 variantHistory（按 entryId 去重合并），
// 保证下次再出同 preset 的册不会重复出一模一样的变式题。只在真正打印时调用（预览不消耗）。
function commitBookletFingerprints(studentId, fingerprints) {
  if (!fingerprints || !Object.keys(fingerprints).length) return;
  const profile = loadProfile(studentId);
  for (const [entryId, fps] of Object.entries(fingerprints)) {
    const e = profile.errorBook[entryId];
    if (!e) continue;
    if (!Array.isArray(e.variantHistory)) e.variantHistory = [];
    for (const fp of fps) if (!e.variantHistory.includes(fp)) e.variantHistory.push(fp);
  }
  saveProfile(studentId, profile);
}

function printBooklet() {
  if (!currentBooklet || currentBooklet.booklet.empty) return;
  const { booklet } = currentBooklet;
  const student = STUDENTS[errorStudent];
  const html = renderBookletSheets(student, booklet) + renderBookletAnswers(booklet);
  printHTML(html, booklet.title);
  commitBookletFingerprints(errorStudent, booklet.fingerprints);
  afterDataChange();
}

// ================= 错题本页 =================
function renderErrorTab() {
  document.querySelectorAll('#panel-errorbook .student-btn').forEach((b) =>
    b.classList.toggle('on', b.dataset.student === errorStudent));
  populateSkillSelect(errorStudent);
  renderBookletPreview();
  const stats = errorBookStats(errorStudent, state.currentSet);
  $('#eb-stats').innerHTML = `
    <span>活跃错题 <b>${stats.active}</b></span>
    <span>到期复练 <b class="${stats.due ? 'warn' : ''}">${stats.due}</b></span>
    <span>复错优先 <b class="${stats.priority ? 'warn' : ''}">${stats.priority}</b></span>
    <span>已掌握 <b>${stats.mastered}</b></span>`;

  const entries = getErrorEntries(errorStudent, state.currentSet);
  if (!entries.length) {
    $('#eb-list').innerHTML = '<p class="empty">错题本是空的 —— 批阅时标记 ✗/△/？ 的题会自动进来。</p>';
    return;
  }
  $('#eb-list').innerHTML = entries.map((e) => {
    const pending = pendingPractice[errorStudent][e.id];
    return `
    <div class="eb-row ${e.mastered ? 'mastered' : ''}">
      <div class="eb-main">
        <div class="q-prompt">${e.prompt}</div>
        <div class="eb-meta">
          <span class="eb-badge ${e.spacing.due && !e.mastered ? 'due' : ''}">${e.spacing.label}</span>
          <span>答案：${e.answer}</span>
          <span>错 ${e.count} 次 · 首错第 ${e.firstSet} 套 · 最近第 ${e.lastSet} 套</span>
        </div>
      </div>
      ${e.mastered ? '' : `
      <div class="eb-actions" data-eid="${e.id}">
        <button class="eb-btn ok ${pending === 'mastered' ? 'on' : ''}" data-outcome="mastered">已会</button>
        <button class="eb-btn bad ${pending === 'wrong-again' ? 'on' : ''}" data-outcome="wrong-again">又错</button>
        <button class="eb-btn mid ${pending === 'explain' ? 'on' : ''}" data-outcome="explain">需讲解</button>
      </div>`}
    </div>`;
  }).join('');
}

function submitPractice() {
  const marks = pendingPractice[errorStudent];
  const results = Object.entries(marks).map(([entryId, outcome]) => ({ entryId, outcome }));
  if (!results.length) { alert('先在每道复练题上点「已会 / 又错 / 需讲解」'); return; }
  recordPracticeResults(errorStudent, state.currentSet, results);
  pendingPractice[errorStudent] = {};
  renderErrorTab();
  alert(`已回写 ${results.length} 条复练结果`);
  afterDataChange();
}

// ================= 仪表盘 =================
function renderDashboardTab() {
  const snaps = STUDENT_IDS.map((id) => studentSnapshot(id, state.currentSet));
  $('#dash-cards').innerHTML = renderDashboard(snaps);
  renderSyncStatus();
}

// ================= 跨设备同步 =================
function renderSyncStatus(msg) {
  const el = $('#sync-status');
  if (!el) return;
  if (msg) { el.textContent = msg; return; }
  if (!getToken()) { el.textContent = '未配置：数据仅存本机'; return; }
  const at = lastSyncAt();
  el.textContent = at ? `已启用 · 上次同步 ${new Date(at).toLocaleString()}` : '已启用 · 尚未同步过';
}

async function runSync(trigger) {
  if (!getToken()) {
    if (trigger === 'manual') alert('先粘贴 GitHub 令牌并保存');
    return;
  }
  renderSyncStatus('同步中…');
  try {
    await syncNow();
    currentSetCache = null;
    if (state.currentSet !== loadState().currentSet) Object.assign(state, loadState());
    renderSyncStatus();
    renderActive();
  } catch (e) {
    renderSyncStatus(`同步失败：${e.message}`);
  }
}

const afterDataChange = () => scheduleSync(() => renderSyncStatus());

// ================= 打印动作 =================
// 打印前盖章：难度与回炉选题固化到 state（同步到云端），保证补打与跨设备一致
function stampAndInvalidate(ids) {
  for (const id of ids) ensureStamp(id, state.currentSet);
  currentSetCache = null;
  afterDataChange();
}

const printActions = {
  'print-papers': () => {
    stampAndInvalidate(STUDENT_IDS);
    const set = getSet();
    const html = STUDENT_IDS.map((id) => studentPapersHTML(set.papers[id])).join('');
    printHTML(html, `第${state.currentSet}套-一页纸日课`);
    renderPaperTab();
  },
  'print-papers-kai': () => {
    stampAndInvalidate(['kai']);
    printHTML(studentPapersHTML(getSet().papers.kai), `第${state.currentSet}套-KAI`);
  },
  'print-papers-lorik': () => {
    stampAndInvalidate(['lorik']);
    printHTML(studentPapersHTML(getSet().papers.lorik), `第${state.currentSet}套-Lorik`);
  },
  'print-answers': () => {
    stampAndInvalidate(STUDENT_IDS);
    const set = getSet();
    const pairs = STUDENT_IDS.map((id) => ({ paper: set.papers[id], onepage: buildOnePage(id, state.currentSet) }));
    printHTML(renderOnePageAnswerSheet(pairs), `第${state.currentSet}套-答案`);
  },
  'print-explain': () => {
    const groups = buildExplainList(errorStudent, state.currentSet);
    if (!groups.length) { alert('当前没有「需讲解 / 复错」的题'); return; }
    printHTML(renderExplainList(STUDENTS[errorStudent].label, groups), `讲解清单-${STUDENTS[errorStudent].name}`);
  },
  // 比赛日：手动动作而非模式——打印完整拟真卷（现有 renderPaperSheets/renderFocusSheet 全套路径）+ 答案。
  // 批阅仍走现有 v2 主题批阅（批阅页顶部切到「比赛卷」）。
  'print-match-day': () => {
    if (!confirm('比赛日：为两人打印完整拟真卷 + 答案页？')) return;
    stampAndInvalidate(STUDENT_IDS);
    const set = getSet();
    const papersHTML = STUDENT_IDS.map((id) => {
      const focus = focusQuestionsFor(id, state.currentSet);
      return renderPaperSheets(set.papers[id]) + renderFocusSheet(set.papers[id], focus.questions, focus.band);
    }).join('');
    const answersHTML = STUDENT_IDS.map((id) => {
      const focus = focusQuestionsFor(id, state.currentSet);
      return renderAnswerSheet(set.papers[id], focus.questions, null);
    }).join('');
    printHTML(papersHTML + answersHTML, `第${state.currentSet}套-比赛日`);
    renderPaperTab();
  },
};

// ================= 事件绑定 =================
function bind() {
  document.querySelectorAll('.tab-btn').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  $('#set-prev').addEventListener('click', () => changeSet(-1));
  $('#set-next').addEventListener('click', () => changeSet(1));

  document.querySelectorAll('[data-print]').forEach((b) =>
    b.addEventListener('click', () => printActions[b.dataset.print]?.()));

  document.querySelectorAll('#panel-grading .student-btn').forEach((b) =>
    b.addEventListener('click', () => { gradingStudent = b.dataset.student; renderGradingTab(); }));
  document.querySelectorAll('.grading-mode-btn').forEach((b) =>
    b.addEventListener('click', () => { gradingViewMode = b.dataset.gmode; renderGradingTab(); }));
  document.querySelectorAll('#panel-errorbook .student-btn').forEach((b) =>
    b.addEventListener('click', () => { errorStudent = b.dataset.student; currentBooklet = null; renderErrorTab(); }));

  populateDomainSelects();
  document.querySelectorAll('.preset-btn').forEach((b) =>
    b.addEventListener('click', () => {
      const preset = b.dataset.preset;
      const filter = preset === 'skill'
        ? { preset: 'skill', skill: $('#preset-skill-domain').value || undefined }
        : { preset };
      buildAndPreviewBooklet(filter);
    }));
  $('#free-build').addEventListener('click', () => {
    const domain = $('#free-domain').value || undefined;
    const sinceRaw = $('#free-since').value;
    const sinceDays = sinceRaw !== '' ? Number(sinceRaw) : undefined;
    const includeMastered = $('#free-mastered').checked;
    buildAndPreviewBooklet({ preset: null, domain, sinceDays, includeMastered });
  });
  $('#booklet-preview').addEventListener('click', (ev) => {
    if (ev.target.closest('#booklet-print')) printBooklet();
  });

  $('#grading-list').addEventListener('click', (ev) => {
    const sc = ev.target.closest('.sprint-cell');
    if (sc) {
      const idx = Number(sc.dataset.sidx);
      const wrong = pendingSprint[gradingStudent].wrong;
      if (wrong[idx]) delete wrong[idx]; else wrong[idx] = true;
      renderGradingTab(); // 重渲染以刷新「标错/自动对题数」提示
      return;
    }
    const tt = ev.target.closest('.theme-toggle');
    if (tt) {
      const idx = Number(tt.dataset.tidx);
      const wrong = pendingTheme[gradingStudent];
      if (wrong[idx]) delete wrong[idx]; else wrong[idx] = true;
      renderGradingTab();
      return;
    }
    const fbtn = ev.target.closest('.eb-btn[data-fkey]');
    if (fbtn) {
      pendingFocus[gradingStudent][fbtn.dataset.fkey] = fbtn.dataset.outcome;
      const row = fbtn.closest('.grade-row');
      row.querySelectorAll('.eb-btn').forEach((b) => b.classList.toggle('on', b === fbtn));
      return;
    }
    const btn = ev.target.closest('.grade-btn');
    if (!btn) return;
    pendingGrades[gradingStudent][btn.dataset.qid] = btn.dataset.grade;
    const row = btn.closest('.grade-row');
    row.querySelectorAll('.grade-btn').forEach((b) => b.classList.toggle('on', b === btn));
  });
  // 口算区用时/对题数输入：随打随存，避免标错题触发的重渲染丢失已填值
  $('#grading-list').addEventListener('input', (ev) => {
    if (ev.target.id === 'sprint-seconds') pendingSprint[gradingStudent].seconds = ev.target.value;
    else if (ev.target.id === 'sprint-correct') {
      pendingSprint[gradingStudent].correct = ev.target.value === '' ? null : ev.target.value;
    }
  });
  $('#grade-submit').addEventListener('click', submitGrades);
  $('#grade-all-right').addEventListener('click', () => {
    if (gradingViewMode === 'match') {
      pendingGrades[gradingStudent] = {};
    } else {
      pendingTheme[gradingStudent] = {};
      pendingSprint[gradingStudent] = blankSprint();
    }
    renderGradingTab();
  });

  $('#eb-list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.eb-btn');
    if (!btn) return;
    const eid = btn.closest('.eb-actions').dataset.eid;
    pendingPractice[errorStudent][eid] = btn.dataset.outcome;
    renderErrorTab();
  });
  $('#eb-submit').addEventListener('click', submitPractice);

  $('#backup-export').addEventListener('click', () => {
    const blob = new Blob([exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mmc2-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#sync-save').addEventListener('click', () => {
    const t = $('#sync-token').value.trim();
    if (!t) { alert('先粘贴令牌'); return; }
    setToken(t);
    $('#sync-token').value = '';
    runSync('manual');
  });
  $('#sync-now').addEventListener('click', () => runSync('manual'));
  $('#sync-off').addEventListener('click', () => {
    if (confirm('停用同步？本机数据保留，仅不再与云端同步。')) {
      setToken('');
      renderSyncStatus();
    }
  });

  $('#backup-import').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      importAll(await file.text());
      alert('导入成功，页面将刷新');
      location.reload();
    } catch (e) { alert('导入失败：' + e.message); }
  });
}

bind();
switchTab('paper');
// 启动时自动拉取云端（已配置令牌的设备）
if (getToken()) runSync('auto');
