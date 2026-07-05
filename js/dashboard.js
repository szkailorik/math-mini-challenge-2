import { loadProfile } from './store.js';
import { DOMAIN_LABELS, PROMOTION, STUDENTS } from './config.js';
import { errorBookStats } from './errorbook.js';

// 每域近 N 套正确率 + 晋级判定
export function studentSnapshot(studentId, currentSet) {
  const profile = loadProfile(studentId);
  const recent = profile.history.slice(-PROMOTION.windowSets);
  const domains = {};
  for (const h of recent) {
    for (const [d, s] of Object.entries(h.domains || {})) {
      const agg = (domains[d] ||= { total: 0, right: 0 });
      agg.total += s.total;
      agg.right += s.right;
    }
  }
  const domainRows = Object.entries(DOMAIN_LABELS).map(([d, label]) => {
    const s = domains[d];
    return { domain: d, label, acc: s && s.total ? s.right / s.total : null, total: s?.total || 0 };
  });

  const mixedAcc = domains.mixed && domains.mixed.total ? domains.mixed.right / domains.mixed.total : 0;
  const setsDone = profile.history.length;
  const eb = errorBookStats(studentId, currentSet);
  const ready = setsDone >= PROMOTION.minSets && mixedAcc >= PROMOTION.minAccuracy && eb.due === 0;

  return { studentId, student: STUDENTS[studentId], setsDone, domainRows, mixedAcc, errorStats: eb, ready };
}

export function renderDashboard(snapshots) {
  return snapshots.map((s) => {
    const bars = s.domainRows.map((r) => {
      const pct = r.acc === null ? 0 : Math.round(r.acc * 100);
      const cls = r.acc === null ? 'na' : r.acc >= 0.9 ? 'good' : r.acc >= 0.75 ? 'mid' : 'low';
      return `
      <div class="dash-bar-row">
        <span class="db-label">${r.label}</span>
        <div class="db-track"><div class="db-fill ${cls}" style="width:${pct}%"></div></div>
        <span class="db-val">${r.acc === null ? '—' : pct + '%'}<i>${r.total ? ` /${r.total}题` : ''}</i></span>
      </div>`;
    }).join('');
    const readyLabel = s.ready
      ? '✅ 达到晋级线：可考虑进入下一阶段'
      : `晋级条件：完成 ≥${PROMOTION.minSets} 套（现 ${s.setsDone}）· 复杂混合正确率 ≥90%（现 ${Math.round(s.mixedAcc * 100)}%）· 无到期错题（现 ${s.errorStats.due}）`;
    return `
    <div class="dash-card" style="--accent:${s.student.accent}">
      <div class="dash-head">
        <h3>${s.student.label}</h3>
        <span class="dash-sets">已完成 ${s.setsDone} 套</span>
      </div>
      <div class="dash-stats">
        <span>活跃错题 <b>${s.errorStats.active}</b></span>
        <span>到期复练 <b class="${s.errorStats.due ? 'warn' : ''}">${s.errorStats.due}</b></span>
        <span>复错优先 <b class="${s.errorStats.priority ? 'warn' : ''}">${s.errorStats.priority}</b></span>
        <span>已掌握 <b>${s.errorStats.mastered}</b></span>
      </div>
      <div class="dash-bars">${bars}</div>
      <p class="dash-ready ${s.ready ? 'ok' : ''}">${readyLabel}</p>
    </div>`;
  }).join('');
}
