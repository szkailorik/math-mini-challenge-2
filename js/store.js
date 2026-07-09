import { STORE_PREFIX, STUDENT_IDS, APP_VERSION } from './config.js';

// 本地优先存储。错题本永久保留；历史仅用于统计，超量裁剪不影响错题本。
const MAX_HISTORY = 120;

function key(name) { return `${STORE_PREFIX}_${name}`; }

function read(name, fallback) {
  try {
    const raw = localStorage.getItem(key(name));
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function write(name, value) {
  localStorage.setItem(key(name), JSON.stringify(value));
}

export function loadProfile(studentId) {
  const p = read(`profile_${studentId}`, null) || { history: [], errorBook: {} };
  if (!Array.isArray(p.history)) p.history = [];
  if (!p.errorBook || typeof p.errorBook !== 'object') p.errorBook = {};
  return p;
}

export function saveProfile(studentId, profile) {
  if (profile.history.length > MAX_HISTORY) {
    profile.history = profile.history.slice(-MAX_HISTORY);
  }
  write(`profile_${studentId}`, profile);
}

export function loadState() {
  const s = read('state', null) || {};
  if (!Number.isInteger(s.currentSet) || s.currentSet < 1) s.currentSet = 1;
  s.version = APP_VERSION;
  return s;
}

export function saveState(state) { write('state', state); }

// 套卷盖章独立存储（不放 state 里：避免与内存中的 state 副本相互覆盖）
export function loadStamps() { return read('stamps', {}) || {}; }
export function saveStamps(stamps) { write('stamps', stamps); }

// 掌握度状态机存储（每学员一份 { [skillId]: Entry }，模式同 stamps）
export function loadMastery(studentId) { return read(`mastery_${studentId}`, {}) || {}; }
export function saveMastery(studentId, mastery) { write(`mastery_${studentId}`, mastery); }

// 口算计时页上一次成绩（每学员一份 { set, seconds, correct, total }，模式同 mastery）
export function loadSprintScore(studentId) { return read(`sprint_score_${studentId}`, null); }
export function saveSprintScore(studentId, score) { write(`sprint_score_${studentId}`, score); }

// 全量导出/导入（换设备迁移用；无需服务器）
export function exportAll() {
  const dump = { version: APP_VERSION, exportedAt: new Date().toISOString(), state: loadState() };
  for (const id of STUDENT_IDS) {
    dump[`profile_${id}`] = loadProfile(id);
    dump[`mastery_${id}`] = loadMastery(id);
    dump[`sprint_score_${id}`] = loadSprintScore(id);
  }
  return JSON.stringify(dump, null, 2);
}

export function importAll(json) {
  const dump = JSON.parse(json);
  if (!dump || typeof dump !== 'object') throw new Error('无效的备份文件');
  for (const id of STUDENT_IDS) {
    if (dump[`profile_${id}`]) write(`profile_${id}`, dump[`profile_${id}`]);
    if (dump[`mastery_${id}`]) write(`mastery_${id}`, dump[`mastery_${id}`]);
    if (dump[`sprint_score_${id}`]) write(`sprint_score_${id}`, dump[`sprint_score_${id}`]);
  }
  if (dump.state) write('state', dump.state);
}
