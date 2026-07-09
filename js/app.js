import { STUDENTS, STUDENT_IDS, GRADES, DOMAIN_LABELS } from './config.js';
import { loadState, saveState, loadProfile, saveProfile, exportAll, importAll, saveSprintScore } from './store.js';
import { buildSet, buildVariant } from './paper.js';
import {
  renderPaperSheets, renderAnswerSheet, renderPracticeSheets,
  renderPracticeAnswers, renderExplainList, renderGradingPanel,
  renderFocusSheet, renderSprintSheet, renderSprintGrading,
} from './render.js';
import {
  previewLevels, previewFocus, ensureStamp, updateDifficulty,
} from './adaptive.js';
import { buildSprintPage } from './engine/composer.js';
import { recordSkillResults, recordSprintTiming, refreshStates } from './engine/mastery.js';
import { printHTML } from './print.js';
import {
  recordGrades, getErrorEntries, errorBookStats, buildPracticePack,
  recordPracticeResults, buildExplainList,
} from './errorbook.js';
import { studentSnapshot, renderDashboard } from './dashboard.js';
import { getToken, setToken, syncNow, scheduleSync, lastSyncAt } from './sync.js';

const $ = (sel) => document.querySelector(sel);
const state = loadState();
if (state.mode !== 'daily' && state.mode !== 'realistic') state.mode = 'daily';
let activeTab = 'paper';
let gradingStudent = 'kai';
let errorStudent = 'kai';
let currentSetCache = null;
const pendingGrades = { kai: {}, lorik: {} };
const pendingPractice = { kai: {}, lorik: {} };
const pendingFocus = { kai: {}, lorik: {} }; // 批阅页第七区标记：key = entryId|kind|序号
const blankSprint = () => ({ wrong: {}, seconds: '', correct: null });
const pendingSprint = { kai: blankSprint(), lorik: blankSprint() }; // 批阅页口算区：wrong=标错索引集合

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
  updateModeButtons();
  if (activeTab === 'paper') renderPaperTab();
  else if (activeTab === 'grading') renderGradingTab();
  else if (activeTab === 'errorbook') renderErrorTab();
  else if (activeTab === 'dashboard') renderDashboardTab();
}

function updateModeButtons() {
  document.querySelectorAll('.mode-btn').forEach((b) =>
    b.classList.toggle('on', b.dataset.mode === state.mode));
}

// ================= 试卷页 =================
function renderPaperTab() {
  $('#set-number').textContent = state.currentSet;
  const set = getSet();
  const preview = STUDENT_IDS.map((id) => studentPapersHTML(set.papers[id])).join('');
  $('#paper-preview').innerHTML = preview;
}

// 学员完整卷面 HTML：（日课模式）口算计时页 + 2 页正卷 +（有到期错题时）第 3 页回炉附加页
function studentPapersHTML(paper) {
  const focus = focusQuestionsFor(paper.studentId, paper.setNumber);
  const sprintHTML = state.mode === 'daily'
    ? renderSprintSheet(paper, buildSprintPage(paper.studentId, paper.setNumber))
    : '';
  return sprintHTML + renderPaperSheets(paper) + renderFocusSheet(paper, focus.questions, focus.band);
}

function changeSet(delta) {
  state.currentSet = Math.max(1, state.currentSet + delta);
  saveState(state);
  currentSetCache = null;
  pendingGrades.kai = {}; pendingGrades.lorik = {};
  pendingFocus.kai = {}; pendingFocus.lorik = {};
  pendingSprint.kai = blankSprint(); pendingSprint.lorik = blankSprint();
  renderActive();
  afterDataChange();
}

// ================= 批阅页 =================
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
  const sprintHTML = state.mode === 'daily'
    ? renderSprintGrading(buildSprintPage(gradingStudent, state.currentSet), pendingSprint[gradingStudent])
    : '';
  $('#grading-list').innerHTML = sprintHTML + renderGradingPanel(paper, pendingGrades[gradingStudent])
    + renderFocusGrading();
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
  let sprintSubmission = null;
  if (state.mode === 'daily') {
    sprintSubmission = prepareSprintSubmission();
    if (!sprintSubmission) return; // 用时未填：中止整个提交，避免主题区/口算区数据不一致
  }
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

  // 口算区：走 mastery 契约链（与主题区 recordGrades 完全独立）
  let sprintMsg = '';
  if (sprintSubmission) {
    recordSkillResults(gradingStudent, state.currentSet, sprintSubmission.results);
    recordSprintTiming(gradingStudent, state.currentSet, sprintSubmission.timing, sprintSubmission.skills);
    refreshStates(gradingStudent);
    saveSprintScore(gradingStudent, {
      set: state.currentSet, seconds: sprintSubmission.timing.seconds,
      correct: sprintSubmission.timing.correct, total: 40,
    });
    sprintMsg = `口算 ${sprintSubmission.timing.correct}/40 · 用时 ${sprintSubmission.timing.seconds} 秒已录入。`;
    pendingSprint[gradingStudent] = blankSprint();
  }

  const wrong = items.filter((i) => i.grade !== 'right').length;
  const deltaMsg = Object.entries(deltas)
    .map(([d, v]) => `${DOMAIN_LABELS[d]}${v > 0 ? '↑' : '↓'}`).join(' ');
  alert(`${STUDENTS[gradingStudent].name} 第 ${state.currentSet} 套已录入：${items.length - wrong} 对 / ${wrong} 需关注。`
    + (focusQs.length ? `回炉 ${focusQs.length} 题已回写。` : '')
    + sprintMsg
    + (deltaMsg ? `\n难度调整：${deltaMsg}` : ''));
  pendingGrades[gradingStudent] = {};
  pendingFocus[gradingStudent] = {};
  currentSetCache = null;
  renderGradingTab();
  afterDataChange();
}

// ================= 错题本页 =================
function renderErrorTab() {
  document.querySelectorAll('#panel-errorbook .student-btn').forEach((b) =>
    b.classList.toggle('on', b.dataset.student === errorStudent));
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
    printHTML(html, `第${state.currentSet}套-双人套卷`);
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
    const html = STUDENT_IDS.map((id) => {
      const focus = focusQuestionsFor(id, state.currentSet);
      const sprint = state.mode === 'daily' ? buildSprintPage(id, state.currentSet) : null;
      return renderAnswerSheet(set.papers[id], focus.questions, sprint);
    }).join('');
    printHTML(html, `第${state.currentSet}套-答案`);
  },
  'print-eb-due': () => printPractice('due'),
  'print-eb-priority': () => printPractice('priority'),
  'print-eb-all': () => printPractice('all'),
  'print-explain': () => {
    const groups = buildExplainList(errorStudent, state.currentSet);
    if (!groups.length) { alert('当前没有「需讲解 / 复错」的题'); return; }
    printHTML(renderExplainList(STUDENTS[errorStudent].label, groups), `讲解清单-${STUDENTS[errorStudent].name}`);
  },
};

function printPractice(mode) {
  const pack = buildPracticePack(errorStudent, state.currentSet, mode);
  if (!pack.items.length) { alert('该类别下暂无错题可打印'); return; }
  printHTML(renderPracticeSheets(pack) + renderPracticeAnswers(pack), `错题复练-${STUDENTS[errorStudent].name}`);
}

// ================= 事件绑定 =================
function bind() {
  document.querySelectorAll('.tab-btn').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)));

  $('#set-prev').addEventListener('click', () => changeSet(-1));
  $('#set-next').addEventListener('click', () => changeSet(1));

  document.querySelectorAll('.mode-btn').forEach((b) =>
    b.addEventListener('click', () => {
      if (state.mode === b.dataset.mode) return;
      state.mode = b.dataset.mode;
      saveState(state);
      currentSetCache = null;
      renderActive();
    }));

  document.querySelectorAll('[data-print]').forEach((b) =>
    b.addEventListener('click', () => printActions[b.dataset.print]?.()));

  document.querySelectorAll('#panel-grading .student-btn').forEach((b) =>
    b.addEventListener('click', () => { gradingStudent = b.dataset.student; renderGradingTab(); }));
  document.querySelectorAll('#panel-errorbook .student-btn').forEach((b) =>
    b.addEventListener('click', () => { errorStudent = b.dataset.student; renderErrorTab(); }));

  $('#grading-list').addEventListener('click', (ev) => {
    const sc = ev.target.closest('.sprint-cell');
    if (sc) {
      const idx = Number(sc.dataset.sidx);
      const wrong = pendingSprint[gradingStudent].wrong;
      if (wrong[idx]) delete wrong[idx]; else wrong[idx] = true;
      renderGradingTab(); // 重渲染以刷新「标错/自动对题数」提示
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
    pendingGrades[gradingStudent] = {};
    if (state.mode === 'daily') pendingSprint[gradingStudent] = blankSprint();
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
