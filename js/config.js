// 项目总配置：学员、阶段、卷面结构、分值。
export const APP_VERSION = '2.0.0';
export const PROGRAM_ID = 'mastery_v1'; // 第三阶段 · 巅峰收束段
export const STORE_PREFIX = 'MMC2';

export const STUDENTS = {
  kai:   { id: 'kai',   name: 'KAI',   label: 'KAI（进阶卷）',   level: 3, accent: '#4f46e5' },
  lorik: { id: 'lorik', name: 'Lorik', label: 'Lorik（提高卷）', level: 2, accent: '#b45309' },
};
export const STUDENT_IDS = ['kai', 'lorik'];

// 每份试卷 = 2 页 A4。大题 1/2/5（乘除法、分数）已熟练 → 降级为「核心保温」抽检；
// 主训练火力转向：复杂混合（主战场）、表征互通、单位率关系、方程与策略。
export const SECTIONS = [
  // —— 第 1 页 · 稳定与表征 ——
  { key: 'oral',   page: 1, no: '一', title: '口算冲刺',       en: 'Mental Sprint',
    hint: '限时 3 分钟 · 先写完再检查', count: 12, points: 12, domain: 'oral' },
  { key: 'keep',   page: 1, no: '二', title: '核心保温',       en: 'Core Keep-Warm',
    hint: '已过关题型抽检 · 竖式规范不丢', count: 6, points: 12, domain: 'keep' },
  { key: 'bridge', page: 1, no: '三', title: '表征互通',       en: 'Representation Bridge',
    hint: '分数·小数·百分数·比 先统一表示再比较', count: 6, points: 18, domain: 'bridge' },
  // —— 第 2 页 · 综合与迁移 ——
  { key: 'mixed',  page: 2, no: '四', title: '复杂四则混合',   en: 'Complex Mixed Ops',
    hint: '主战场 · 先看结构选方法，再动笔', count: 5, points: 25, domain: 'mixed' },
  { key: 'unit',   page: 2, no: '五', title: '单位 · 率 · 关系', en: 'Unit / Rate / Relation',
    hint: '先统一单位，再列关系', count: 4, points: 16, domain: 'unit' },
  { key: 'strategy', page: 2, no: '六', title: '方程与简算',   en: 'Equations & Strategy',
    hint: '方程找未知数位置 · 简算先找结构', count: 5, points: 17, domain: 'strategy' },
];

export const TOTAL_POINTS = SECTIONS.reduce((s, x) => s + x.points, 0); // 100
export const EXAM_MINUTES = 40;

export const DOMAIN_LABELS = {
  oral: '口算速度', keep: '核心保温', bridge: '表征互通',
  mixed: '复杂混合', unit: '单位率关系', strategy: '方程与简算',
};

// 批改四态（与纸面标记一一对应）
export const GRADES = [
  { key: 'right',    label: '✓ 对',   short: '✓' },
  { key: 'careless', label: '△ 粗心', short: '△' },
  { key: 'wrong',    label: '✗ 错',   short: '✗' },
  { key: 'explain',  label: '？需讲解', short: '？' },
];

// 晋级判定：连续 N 套达标即可进入下一阶段（在仪表盘展示）
export const PROMOTION = {
  windowSets: 6,          // 观察窗口
  minAccuracy: 0.9,       // 主战场正确率
  minSets: 10,            // 最少完成套数
};
