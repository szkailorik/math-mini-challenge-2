import { TOTAL_POINTS, EXAM_MINUTES, GRADES, DOMAIN_LABELS } from './config.js';

// ================= 试卷渲染（拟真考试版面，A4） =================

function pointsPerQuestion(sec) {
  const per = sec.points / sec.count;
  return Number.isInteger(per) ? `每题 ${per} 分` : `共 ${sec.points} 分`;
}

function examHeader(paper) {
  const s = paper.student;
  return `
  <header class="exam-head">
    <div class="exam-title-row">
      <div class="exam-badge">${s.name}</div>
      <div class="exam-title">
        <h1>数学 · 巅峰收束段训练卷</h1>
        <p class="exam-sub">Mastery Stage · 第 ${paper.setNumber} 套 · ${s.label}</p>
      </div>
      <div class="exam-meta">
        <span>满分 ${TOTAL_POINTS} 分</span>
        <span>建议 ${EXAM_MINUTES} 分钟</span>
      </div>
    </div>
    <div class="exam-fields">
      <span>姓名：<i></i></span><span>日期：<i></i></span>
      <span>开始：<i></i></span><span>用时：<i></i></span>
      <span class="score-box">得分：<i></i></span>
    </div>
  </header>`;
}

function pageHeaderSlim(paper, page) {
  return `
  <header class="exam-head slim">
    <span class="slim-name">${paper.student.name} · 第 ${paper.setNumber} 套</span>
    <span class="slim-page">第 ${page} 页 · 综合与迁移</span>
  </header>`;
}

function sectionHTML(sec, startIndex) {
  const cls = sec.domain === 'mixed' ? 'q-list block'
    : sec.domain === 'oral' ? 'q-list oral'
    : 'q-list lines';
  const qs = sec.questions.map((q, i) => `
    <div class="q ${q.work || 'lines'}">
      <span class="q-no">${startIndex + i + 1}.</span>
      <div class="q-body">
        <div class="q-prompt">${q.prompt}</div>
        ${q.work === 'block' ? '<div class="q-space"></div>' : ''}
      </div>
    </div>`).join('');
  return `
  <section class="exam-section">
    <div class="sec-head">
      <span class="sec-no">${sec.no}、${sec.title}</span>
      <span class="sec-en">${sec.en}</span>
      <span class="sec-points">${pointsPerQuestion(sec)} · 共 ${sec.points} 分</span>
    </div>
    <p class="sec-hint">${sec.hint}</p>
    <div class="${cls}">${qs}</div>
  </section>`;
}

export function renderPaperSheets(paper) {
  let idx = 0;
  const pages = [1, 2].map((page) => {
    const secs = paper.sections.filter((s) => s.page === page);
    const body = secs.map((sec) => {
      const html = sectionHTML(sec, idx);
      idx += sec.questions.length;
      return html;
    }).join('');
    const head = page === 1 ? examHeader(paper) : pageHeaderSlim(paper, page);
    return `
    <article class="sheet exam-sheet" data-student="${paper.studentId}" data-page="${page}">
      ${head}
      ${body}
      <footer class="sheet-foot">
        <span>math-mini-challenge · 巅峰收束段</span>
        <span>${paper.student.name} · 第 ${paper.setNumber} 套 · P${page}/2</span>
      </footer>
    </article>`;
  });
  return pages.join('');
}

// ================= 口算计时页（日课模式 · 40 题四列网格） =================

export function renderSprintSheet(paper, sprint) {
  const items = sprint.items.map((it, i) => `
    <div class="sprint-item">
      <span class="sp-no">${i + 1}</span>
      <span class="sp-prompt">${it.prompt}</span>
      <span class="sp-blank"></span>
    </div>`).join('');
  const lastScoreBox = sprint.lastScore
    ? `<div class="sprint-last">上次 ${sprint.lastScore.seconds} 秒 · 对 ${sprint.lastScore.correct}/${sprint.lastScore.total}</div>`
    : `<div class="sprint-last empty">首次挑战</div>`;
  return `
  <article class="sheet exam-sheet sprint-sheet" data-student="${paper.studentId}" data-page="sprint">
    <header class="exam-head sprint-head">
      <div class="exam-title-row">
        <div class="exam-badge">${paper.student.name}</div>
        <div class="exam-title">
          <h1>口算计时页</h1>
          <p class="exam-sub">Mental Sprint · 第 ${paper.setNumber} 套 · ${paper.student.label}</p>
        </div>
        ${lastScoreBox}
      </div>
      <div class="exam-fields sprint-fields">
        <span>限时 3 分钟</span>
        <span>开始：<i></i>:<i></i></span>
        <span>结束：<i></i>:<i></i></span>
        <span>用时：<i class="wide"></i></span>
        <span class="score-box">对：<i></i>/40</span>
      </div>
    </header>
    <div class="sprint-grid">${items}</div>
    <footer class="sheet-foot">
      <span>math-mini-challenge · 口算地基</span>
      <span>${paper.student.name} · 第 ${paper.setNumber} 套 · 计时页</span>
    </footer>
  </article>`;
}

export function renderSprintAnswers(sprint) {
  const rows = sprint.items.map((it, i) => `
    <div class="ans-row sprint-ans-row">
      <span class="ans-no">${i + 1}</span>
      <span class="ans-val">${it.answer}</span>
    </div>`).join('');
  return `
    <div class="ans-section sprint-ans-section">
      <div class="ans-sec-title">口算区 · 40 题</div>
      <div class="sprint-ans-grid">${rows}</div>
    </div>`;
}

// ================= 答案页（家长批阅用，紧凑双栏） =================

export function renderAnswerSheet(paper, focusQuestions = [], sprint = null) {
  let idx = 0;
  const secs = paper.sections.map((sec) => {
    const rows = sec.questions.map((q, i) => `
      <div class="ans-row">
        <span class="ans-no">${idx + i + 1}</span>
        <span class="ans-val">${q.answer}</span>
        <span class="ans-hint">${q.hint || ''}</span>
        <span class="ans-mark">□✓ □△ □✗ □？</span>
      </div>`).join('');
    idx += sec.questions.length;
    return `
    <div class="ans-section">
      <div class="ans-sec-title">${sec.no}、${sec.title} <em>（${pointsPerQuestion(sec)}）</em></div>
      ${rows}
    </div>`;
  }).join('');
  return `
  <article class="sheet ans-sheet">
    <header class="ans-head">
      <h2>参考答案与批阅页 · ${paper.student.label}</h2>
      <p>第 ${paper.setNumber} 套 · 批阅标记：✓ 对 / △ 粗心 / ✗ 错 / ？需讲解 —— 批完回到系统「批阅」页录入</p>
    </header>
    <div class="ans-columns">${sprint ? renderSprintAnswers(sprint) : ''}${secs}${renderFocusAnswers(focusQuestions)}</div>
  </article>`;
}

// ================= 大题七 · 错题回炉（日常卷附加页） =================

const BAND_LABELS = { standard: '标准回收', intensive: '强化回收' };

export function renderFocusSheet(paper, focusQuestions, band) {
  if (!focusQuestions.length) return '';
  const qs = focusQuestions.map((fq, i) => `
    <div class="q lines practice-q ${fq.kind}">
      <span class="q-no">${i + 1}.</span>
      <div class="q-body">
        <div class="q-prompt">${fq.q.prompt}</div>
        <div class="practice-meta">
          <span class="p-kind">${fq.kind === 'original' ? '回炉' : '变式'}</span>
          <span class="p-domain">${DOMAIN_LABELS[fq.q.domain] || fq.q.domain}</span>
          <span class="p-mark">□已会 □又错 □需讲解</span>
        </div>
      </div>
    </div>`).join('');
  return `
  <article class="sheet exam-sheet focus-sheet" data-student="${paper.studentId}" data-page="3">
    <header class="exam-head slim">
      <span class="slim-name">${paper.student.name} · 第 ${paper.setNumber} 套</span>
      <span class="slim-page">附加页 · 错题回炉（${BAND_LABELS[band] || '回收'} · 不计分）</span>
    </header>
    <section class="exam-section">
      <div class="sec-head">
        <span class="sec-no">七、错题回炉</span>
        <span class="sec-en">Error Recycle</span>
        <span class="sec-points">共 ${focusQuestions.length} 题 · 附加不计分</span>
      </div>
      <p class="sec-hint">到期错题自动排入：回炉查记忆，变式查真会。做完勾选 □，批阅时一并录入</p>
      <div class="q-list lines">${qs}</div>
    </section>
    <footer class="sheet-foot">
      <span>math-mini-challenge · 错题闭环</span>
      <span>${paper.student.name} · 第 ${paper.setNumber} 套 · 附加页</span>
    </footer>
  </article>`;
}

export function renderFocusAnswers(focusQuestions) {
  if (!focusQuestions.length) return '';
  const rows = focusQuestions.map((fq, i) => `
    <div class="ans-row">
      <span class="ans-no">${i + 1}</span>
      <span class="ans-val">${fq.q.answer}</span>
      <span class="ans-hint">${fq.q.hint || ''}</span>
      <span class="ans-mark">□会 □错 □讲</span>
    </div>`).join('');
  return `
    <div class="ans-section">
      <div class="ans-sec-title">七、错题回炉 <em>（附加不计分）</em></div>
      ${rows}
    </div>`;
}

// ================= 错题复练卷 =================

export function renderPracticeSheets(pack) {
  const modeLabel = { due: '到期复练', priority: '复错优先', all: '全部错题' }[pack.mode] || '复练';
  if (!pack.items.length) return '';
  const qs = pack.items.map((item, i) => `
    <div class="q lines practice-q ${item.kind}">
      <span class="q-no">${i + 1}.</span>
      <div class="q-body">
        <div class="q-prompt">${item.q.prompt}</div>
        <div class="practice-meta">
          <span class="p-kind">${item.kind === 'original' ? '回炉' : '变式'}</span>
          <span class="p-domain">${DOMAIN_LABELS[item.entry.domain] || item.entry.domain}</span>
          <span class="p-mark">□已会 □又错 □需讲解</span>
        </div>
      </div>
    </div>`).join('');
  return `
  <article class="sheet practice-sheet">
    <header class="exam-head">
      <div class="exam-title-row">
        <div class="exam-badge">${pack.student.name}</div>
        <div class="exam-title">
          <h1>错题复练卷 · ${modeLabel}</h1>
          <p class="exam-sub">${pack.student.label} · 生成于第 ${pack.currentSet} 套 · 原题回炉 + 同类变式</p>
        </div>
      </div>
      <div class="exam-fields"><span>日期：<i></i></span><span>用时：<i></i></span></div>
    </header>
    <div class="q-list lines">${qs}</div>
    <footer class="sheet-foot"><span>做完由家长按 □ 勾选，再回系统「错题本」录入</span></footer>
  </article>`;
}

export function renderPracticeAnswers(pack) {
  const rows = pack.items.map((item, i) => `
    <div class="ans-row">
      <span class="ans-no">${i + 1}</span>
      <span class="ans-val">${item.q.answer}</span>
      <span class="ans-hint">${item.q.hint || ''}</span>
    </div>`).join('');
  return `
  <article class="sheet ans-sheet">
    <header class="ans-head">
      <h2>错题复练卷 · 参考答案 · ${pack.student.label}</h2>
    </header>
    <div class="ans-columns"><div class="ans-section">${rows}</div></div>
  </article>`;
}

// ================= 讲解清单（家长辅导用） =================

export function renderExplainList(studentLabel, groups) {
  if (!groups.length) return '';
  const body = groups.map((g) => `
    <div class="explain-group">
      <h3>${g.label}</h3>
      ${g.entries.map((e) => `
        <div class="explain-item">
          <div class="e-q">${e.prompt}</div>
          <div class="e-a">答案：${e.answer}</div>
          <div class="e-h">讲解要点：${e.hint || '让孩子先复述做法，再指出出错的一步'}</div>
          <div class="e-mark">错 ${e.count} 次${e.rewrongCount ? ` · 复错 ${e.rewrongCount}` : ''}${e.needsExplainCount ? ' · 曾标记需讲解' : ''} —— 讲后：□已讲清 □已重做 □仍不会</div>
        </div>`).join('')}
    </div>`).join('');
  return `
  <article class="sheet explain-sheet">
    <header class="ans-head">
      <h2>讲解清单 · ${studentLabel}</h2>
      <p>只列「需讲解」与「复错」题。讲解顺序：先让孩子说思路 → 指出关键一步 → 马上做旁边的变式确认</p>
    </header>
    ${body}
  </article>`;
}

// ================= 批阅界面（屏幕） =================

// 口算区批阅（日课模式）：默认全对，只点错题 + 录入用时秒数与对题数（自动=40-标错数，可手改）。
export function renderSprintGrading(sprint, pending = {}) {
  const wrong = pending.wrong || {};
  const items = sprint.items.map((it, i) => {
    const isWrong = !!wrong[i];
    return `
    <button class="sprint-cell ${isWrong ? 'wrong' : ''}" type="button" data-sidx="${i}">
      <span class="sc-no">${i + 1}</span>
      <span class="sc-prompt">${it.prompt} ${it.answer}</span>
      <span class="sc-mark">${isWrong ? '✗' : '✓'}</span>
    </button>`;
  }).join('');
  const wrongCount = Object.values(wrong).filter(Boolean).length;
  const autoCorrect = 40 - wrongCount;
  const correctVal = (pending.correct !== null && pending.correct !== undefined && pending.correct !== '')
    ? pending.correct : autoCorrect;
  return `
  <div class="grade-section sprint-grading">
    <h3>口算区 · 40 题（默认全对，点错的题）</h3>
    <div class="sprint-grade-grid">${items}</div>
    <div class="sprint-timing-row">
      <label>用时（秒）<input type="number" id="sprint-seconds" min="1" value="${pending.seconds || ''}" placeholder="必填"></label>
      <label>对题数<input type="number" id="sprint-correct" min="0" max="40" value="${correctVal}"></label>
      <span class="sprint-auto-hint">标错 ${wrongCount} 题 · 自动对题数 ${autoCorrect}（可手改）</span>
    </div>
  </div>`;
}

export function renderGradingPanel(paper, existing = {}) {
  let idx = 0;
  const secs = paper.sections.map((sec) => {
    const rows = sec.questions.map((q, i) => {
      const n = idx + i + 1;
      const current = existing[q.id] || 'right';
      const btns = GRADES.map((g) => `
        <button class="grade-btn ${g.key} ${current === g.key ? 'on' : ''}"
          data-qid="${q.id}" data-grade="${g.key}">${g.label}</button>`).join('');
      return `
      <div class="grade-row" data-qid="${q.id}">
        <span class="ans-no">${n}</span>
        <div class="grade-q">
          <div class="q-prompt">${q.prompt}</div>
          <div class="grade-ans">答案：${q.answer} <em>${q.hint || ''}</em></div>
        </div>
        <div class="grade-btns">${btns}</div>
      </div>`;
    }).join('');
    idx += sec.questions.length;
    return `<div class="grade-section"><h3>${sec.no}、${sec.title}</h3>${rows}</div>`;
  }).join('');
  return secs;
}
