import { STUDENTS, STUDENT_IDS, GRADES } from './config.js';
import { loadState, saveState, loadProfile, exportAll, importAll } from './store.js';
import { buildSet } from './paper.js';
import {
  renderPaperSheets, renderAnswerSheet, renderPracticeSheets,
  renderPracticeAnswers, renderExplainList, renderGradingPanel,
} from './render.js';
import { printHTML } from './print.js';
import {
  recordGrades, getErrorEntries, errorBookStats, buildPracticePack,
  recordPracticeResults, buildExplainList,
} from './errorbook.js';
import { studentSnapshot, renderDashboard } from './dashboard.js';
import { getToken, setToken, syncNow, scheduleSync, lastSyncAt } from './sync.js';

const $ = (sel) => document.querySelector(sel);
const state = loadState();
let activeTab = 'paper';
let gradingStudent = 'kai';
let errorStudent = 'kai';
let currentSetCache = null;
const pendingGrades = { kai: {}, lorik: {} };
const pendingPractice = { kai: {}, lorik: {} };

function getSet() {
  if (!currentSetCache || currentSetCache.setNumber !== state.currentSet) {
    currentSetCache = buildSet(state.currentSet);
  }
  return currentSetCache;
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
  const preview = STUDENT_IDS.map((id) => renderPaperSheets(set.papers[id])).join('');
  $('#paper-preview').innerHTML = preview;
}

function changeSet(delta) {
  state.currentSet = Math.max(1, state.currentSet + delta);
  saveState(state);
  currentSetCache = null;
  pendingGrades.kai = {}; pendingGrades.lorik = {};
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
  $('#grading-list').innerHTML = renderGradingPanel(paper, pendingGrades[gradingStudent]);
}

function submitGrades() {
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
  const wrong = items.filter((i) => i.grade !== 'right').length;
  alert(`${STUDENTS[gradingStudent].name} 第 ${state.currentSet} 套已录入：${items.length - wrong} 对 / ${wrong} 需关注。错题已进错题本。`);
  pendingGrades[gradingStudent] = {};
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
const printActions = {
  'print-papers': () => {
    const set = getSet();
    const html = STUDENT_IDS.map((id) => renderPaperSheets(set.papers[id])).join('');
    printHTML(html, `第${state.currentSet}套-双人四页`);
  },
  'print-papers-kai': () => printHTML(renderPaperSheets(getSet().papers.kai), `第${state.currentSet}套-KAI`),
  'print-papers-lorik': () => printHTML(renderPaperSheets(getSet().papers.lorik), `第${state.currentSet}套-Lorik`),
  'print-answers': () => {
    const set = getSet();
    const html = STUDENT_IDS.map((id) => renderAnswerSheet(set.papers[id])).join('');
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

  document.querySelectorAll('[data-print]').forEach((b) =>
    b.addEventListener('click', () => printActions[b.dataset.print]?.()));

  document.querySelectorAll('#panel-grading .student-btn').forEach((b) =>
    b.addEventListener('click', () => { gradingStudent = b.dataset.student; renderGradingTab(); }));
  document.querySelectorAll('#panel-errorbook .student-btn').forEach((b) =>
    b.addEventListener('click', () => { errorStudent = b.dataset.student; renderErrorTab(); }));

  $('#grading-list').addEventListener('click', (ev) => {
    const btn = ev.target.closest('.grade-btn');
    if (!btn) return;
    pendingGrades[gradingStudent][btn.dataset.qid] = btn.dataset.grade;
    const row = btn.closest('.grade-row');
    row.querySelectorAll('.grade-btn').forEach((b) => b.classList.toggle('on', b === btn));
  });
  $('#grade-submit').addEventListener('click', submitGrades);
  $('#grade-all-right').addEventListener('click', () => {
    pendingGrades[gradingStudent] = {};
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
