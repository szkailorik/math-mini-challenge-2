// 跨设备同步：GitHub 私有 Gist 存储 + 自动合并。
// 与旧系统 GistSync 不同：不做"以谁为准"的冲突对比，而是逐字段合并——
// 错题本按题目指纹索引、计数只增不减、历史按套号追加，天然可合并。
import { STUDENT_IDS, STORE_PREFIX } from './config.js';
import { loadProfile, saveProfile, loadState, saveState, loadStamps, saveStamps, loadMastery, saveMastery } from './store.js';
import { migrateDump } from './migrate.js';

const GIST_FILE = 'mmc2-data.json';
const GIST_DESC = 'math-mini-challenge-2 训练数据（自动同步，勿手动编辑）';
const API = 'https://api.github.com/gists';

function lsKey(name) { return `${STORE_PREFIX}_sync_${name}`; }
export function getToken() { return localStorage.getItem(lsKey('token')) || ''; }
export function setToken(t) {
  if (t) localStorage.setItem(lsKey('token'), t.trim());
  else { localStorage.removeItem(lsKey('token')); localStorage.removeItem(lsKey('gistId')); }
}
function getGistId() { return localStorage.getItem(lsKey('gistId')) || ''; }
function setGistId(id) { localStorage.setItem(lsKey('gistId'), id); }
export function lastSyncAt() { return localStorage.getItem(lsKey('lastAt')) || ''; }

function headers() {
  return {
    Authorization: `token ${getToken()}`,
    Accept: 'application/vnd.github+json',
  };
}

// ============ 合并策略 ============
// 计数类取最大；状态类取 lastDate/lastSet 较新的一方；历史按内容指纹并集。

function newer(a, b) {
  if ((a.lastSet || 0) !== (b.lastSet || 0)) return (a.lastSet || 0) > (b.lastSet || 0) ? a : b;
  return String(a.lastDate || '') >= String(b.lastDate || '') ? a : b;
}

function mergeEntry(a, b) {
  const base = { ...newer(a, b) };
  base.count = Math.max(a.count || 0, b.count || 0);
  base.rewrongCount = Math.max(a.rewrongCount || 0, b.rewrongCount || 0);
  base.needsExplainCount = Math.max(a.needsExplainCount || 0, b.needsExplainCount || 0);
  base.firstSet = Math.min(a.firstSet ?? Infinity, b.firstSet ?? Infinity);
  base.firstDate = [a.firstDate, b.firstDate].filter(Boolean).sort()[0] || base.firstDate;
  // v3 skill 字段：newer 一方缺失时从另一方补回，避免合并丢失技能归类
  const skill = base.skill ?? a.skill ?? b.skill;
  if (skill != null) base.skill = skill;
  return base;
}

function historyKey(h) {
  return `${h.set}|${h.date}|${JSON.stringify(h.grades || {})}`;
}

export function mergeProfile(local, remote) {
  const merged = { ...local.errorBook };
  for (const [uid, re] of Object.entries(remote.errorBook || {})) {
    merged[uid] = merged[uid] ? mergeEntry(merged[uid], re) : re;
  }
  // 键排序：保证任意方向合并结果字节一致（云端 diff 稳定）
  const errorBook = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
  const seen = new Set();
  const history = [...(local.history || []), ...(remote.history || [])]
    .filter((h) => { const k = historyKey(h); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => x.set - y.set || String(x.date).localeCompare(String(y.date)));
  return { history, errorBook };
}

function buildDump() {
  const dump = { schemaVersion: 3, savedAt: new Date().toISOString(), state: loadState(), stamps: loadStamps() };
  for (const id of STUDENT_IDS) {
    dump[`profile_${id}`] = loadProfile(id);
    dump[`mastery_${id}`] = loadMastery(id);
  }
  return dump;
}

// 掌握度合并：按 skillId 逐条比 lastSet，较新一方胜（相等取 local）；单方独有直接保留。
// 键排序输出，风格同 mergeProfile（保证任意方向合并结果字节一致）。
export function mergeMastery(local = {}, remote = {}) {
  const merged = {};
  for (const skillId of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[skillId];
    const r = remote[skillId];
    if (l && r) {
      merged[skillId] = (r.lastSet || 0) > (l.lastSet || 0) ? r : l;
    } else {
      merged[skillId] = l || r;
    }
  }
  return Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
}

// 学员画像里的动态难度：各域取「更接近初始值修改次数多」无从判断，
// 直接取较新历史一方的值（difficulty 随批改更新，历史更长者更准）。
export function mergeDifficulty(local, remote) {
  const ll = (local.history || []).length, rl = (remote.history || []).length;
  return rl > ll ? (remote.difficulty || local.difficulty) : (local.difficulty || remote.difficulty);
}

// 套卷盖章合并：同一套先盖章者胜（保证两台设备打出同一份卷）
export function mergeStamps(local = {}, remote = {}) {
  const out = { ...local };
  for (const [key, rs] of Object.entries(remote)) {
    if (!out[key] || String(rs.at || '') < String(out[key].at || '')) out[key] = rs;
  }
  return out;
}

function applyMerged(remoteDump) {
  for (const id of STUDENT_IDS) {
    const remote = remoteDump[`profile_${id}`];
    if (remote) {
      const local = loadProfile(id);
      const merged = mergeProfile(local, remote);
      merged.difficulty = mergeDifficulty(local, remote);
      saveProfile(id, merged);
    }
    saveMastery(id, mergeMastery(loadMastery(id), remoteDump[`mastery_${id}`] || {}));
  }
  const state = loadState();
  if (remoteDump.state?.currentSet > state.currentSet) {
    state.currentSet = remoteDump.state.currentSet;
    saveState(state);
  }
  // 兼容旧字段位置 remoteDump.state.stamps
  saveStamps(mergeStamps(loadStamps(), remoteDump.stamps || remoteDump.state?.stamps));
}

// ============ Gist 读写 ============

async function findOrCreateGist() {
  let id = getGistId();
  if (id) return id;
  // 找已有的同步 gist（换新设备粘贴 token 后自动接上）
  const res = await fetch(`${API}?per_page=100`, { headers: headers() });
  if (!res.ok) throw new Error(`无法访问 Gist（HTTP ${res.status}）：请检查令牌是否有 gist 权限`);
  const gists = await res.json();
  const found = gists.find((g) => g.files && g.files[GIST_FILE]);
  if (found) { setGistId(found.id); return found.id; }
  // 没有则创建私有 gist
  const create = await fetch(API, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: JSON.stringify(buildDump()) } } }),
  });
  if (!create.ok) throw new Error(`创建云端存储失败（HTTP ${create.status}）`);
  const g = await create.json();
  setGistId(g.id);
  return g.id;
}

// 同步 = 拉取远端 → 本地合并 → 推送合并结果。任何一台设备随时可跑，结果一致。
export async function syncNow() {
  if (!getToken()) return { ok: false, reason: 'no-token' };
  const id = await findOrCreateGist();
  const res = await fetch(`${API}/${id}`, { headers: headers() });
  if (res.ok) {
    const gist = await res.json();
    const file = gist.files?.[GIST_FILE];
    if (file) {
      try {
        // 大文件 gist API 会截断，需从 raw_url 取全文
        const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
        // 拉取到的远端可能是 v2 或无版本 dump：先过 migrateDump 再合并
        applyMerged(migrateDump(JSON.parse(content)));
      } catch { /* 云端内容损坏：以本地为准直接覆盖 */ }
    }
  } else if (res.status === 404) {
    localStorage.removeItem(lsKey('gistId'));
    return syncNow();
  } else {
    throw new Error(`拉取失败（HTTP ${res.status}）`);
  }
  const push = await fetch(`${API}/${id}`, {
    method: 'PATCH', headers: headers(),
    body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(buildDump()) } } }),
  });
  if (!push.ok) throw new Error(`推送失败（HTTP ${push.status}）`);
  localStorage.setItem(lsKey('lastAt'), new Date().toISOString());
  return { ok: true };
}

// 批改后自动同步（防抖，静默失败——下次手动同步会补上）
let timer = null;
export function scheduleSync(onDone) {
  if (!getToken()) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    syncNow().then(() => onDone?.(true)).catch(() => onDone?.(false));
  }, 2500);
}
