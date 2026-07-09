// 技能地图：约 60 个原子技能点，三层（地基 fluency / 结构 procedure / 策略 strategy）。
// 纯声明，不含任何逻辑。详见 docs/superpowers/specs/2026-07-10-calc-mastery-v3-design.md 第 2 节。

const FLUENCY_REVISIT = { base: 4, max: 16 };
const OTHER_REVISIT = { base: 4, max: 16 };

// —— 地基层（fluency，12 点）——每日计时，永不毕业 ——
const FLUENCY = [
  { id: 'add20', label: '20以内加法（含进位）', gradeBand: [1, 6], speed: 35, prereqs: [] },
  { id: 'sub20', label: '20以内减法（含退位）', gradeBand: [1, 6], speed: 35, prereqs: ['add20'] },
  { id: 'mult_table', label: '表内乘法', gradeBand: [2, 6], speed: 35, prereqs: [] },
  { id: 'div_table', label: '表内除法', gradeBand: [2, 6], speed: 35, prereqs: ['mult_table'] },
  { id: 'add100', label: '百以内加减口算', gradeBand: [2, 6], speed: 25, prereqs: ['add20', 'sub20'] },
  { id: 'sub100', label: '百以内退位减口算', gradeBand: [2, 6], speed: 25, prereqs: ['sub20'] },
  { id: 'mult_pairs', label: '凑整速算对（25×4/125×8/5×2）', gradeBand: [4, 6], speed: 30, prereqs: ['mult_table'] },
  { id: 'dec_shift', label: '小数×÷10/100/1000 移位', gradeBand: [4, 6], speed: 30, prereqs: [] },
  { id: 'dec_frac_base', label: '分数↔小数↔百分数基准互化', gradeBand: [5, 6], speed: 25, prereqs: [] },
  { id: 'frac_same_denom', label: '同分母分数加减口算', gradeBand: [5, 6], speed: 25, prereqs: [] },
  { id: 'square_base', label: '常用平方数（11²–25²）', gradeBand: [5, 6], speed: 25, prereqs: ['mult_table'] },
  { id: 'estimate_flash', label: '数量级速估', gradeBand: [4, 6], speed: 20, prereqs: [] },
].map((s) => ({
  id: s.id,
  layer: 'fluency',
  label: s.label,
  gradeBand: s.gradeBand,
  prereqs: s.prereqs,
  graduation: { acc: 0.95, speed: s.speed },
  revisit: FLUENCY_REVISIT,
}));

// —— 结构层（procedure，30 点）——集中练透 + 间隔回访 ——
const PROCEDURE_RAW = [
  // 整数
  { id: 'int.add_multi', label: '多位数加法（连续进位）', gradeBand: [2, 3], prereqs: ['add100'] },
  { id: 'int.sub_borrow', label: '多位数减法（连续退位/中间有0）', gradeBand: [2, 3], prereqs: ['sub100'] },
  { id: 'int.mult_1digit', label: '乘一位数', gradeBand: [2, 3], prereqs: ['mult_table'] },
  { id: 'int.mult_2digit', label: '乘两位数', gradeBand: [3, 4], prereqs: ['int.mult_1digit'] },
  { id: 'int.div_1digit', label: '除一位数', gradeBand: [3, 3], prereqs: ['div_table'] },
  { id: 'int.div_2digit', label: '除两位数', gradeBand: [4, 4], prereqs: ['int.div_1digit'] },
  { id: 'int.remainder', label: '余数问题', gradeBand: [3, 4], prereqs: ['int.div_2digit'] },
  { id: 'int.check', label: '整数验算', gradeBand: [3, 6], prereqs: ['int.add_multi', 'int.sub_borrow'] },
  { id: 'int.mixed_addsub', label: '整数加减混合应用', gradeBand: [3, 4], prereqs: ['int.add_multi', 'int.sub_borrow'] },
  // 小数
  { id: 'dec.meaning_compare', label: '小数意义与比较', gradeBand: [4, 4], prereqs: [] },
  { id: 'dec.addsub', label: '小数加减', gradeBand: [4, 4], prereqs: ['dec.meaning_compare', 'add100'] },
  { id: 'dec.mult_point', label: '小数乘法（定位）', gradeBand: [4, 5], prereqs: ['mult_table', 'dec.meaning_compare'] },
  { id: 'dec.div_same_multiple', label: '小数除法（同倍扩大）', gradeBand: [5, 5], prereqs: ['dec.mult_point', 'div_table'] },
  { id: 'dec.div_lt1', label: '小数除法（商小于1）', gradeBand: [5, 5], prereqs: ['dec.div_same_multiple'] },
  { id: 'dec.div_repeat', label: '小数除法（循环小数）', gradeBand: [5, 6], prereqs: ['dec.div_lt1'] },
  { id: 'dec.round', label: '小数近似取舍', gradeBand: [4, 5], prereqs: ['dec.meaning_compare'] },
  { id: 'dec.mixed_addsub_mult', label: '小数加减乘混合', gradeBand: [5, 6], prereqs: ['dec.addsub', 'dec.mult_point'] },
  // 分数
  { id: 'frac.meaning_property', label: '分数意义与性质', gradeBand: [3, 5], prereqs: [] },
  { id: 'frac.common_denom', label: '通分', gradeBand: [5, 5], prereqs: ['frac.meaning_property'] },
  { id: 'frac.reduce', label: '约分（含交叉约分）', gradeBand: [4, 5], prereqs: ['frac.meaning_property'] },
  { id: 'frac.addsub_same', label: '同分母分数加减', gradeBand: [3, 4], prereqs: ['frac_same_denom', 'frac.meaning_property'] },
  { id: 'frac.addsub_diff', label: '异分母分数加减', gradeBand: [5, 5], prereqs: ['frac.common_denom'] },
  { id: 'frac.mult', label: '分数乘法', gradeBand: [5, 6], prereqs: ['frac.reduce'] },
  { id: 'frac.div', label: '分数除法', gradeBand: [6, 6], prereqs: ['frac.mult'] },
  { id: 'frac.mixed_convert', label: '带分数与假分数互化', gradeBand: [5, 5], prereqs: ['frac.meaning_property'] },
  { id: 'frac.improper', label: '假分数运算', gradeBand: [4, 5], prereqs: ['frac.mixed_convert'] },
  { id: 'frac.compare', label: '分数比较', gradeBand: [4, 5], prereqs: ['frac.common_denom'] },
  // 通用
  { id: 'gen.order_bracket', label: '运算顺序（含中括号）', gradeBand: [4, 6], prereqs: ['int.mult_2digit', 'int.div_2digit'] },
  { id: 'gen.estimate_strategy', label: '估算策略', gradeBand: [3, 6], prereqs: ['estimate_flash'] },
  { id: 'gen.check_chain', label: '验算链', gradeBand: [3, 6], prereqs: ['int.check'] },
];
const PROCEDURE = PROCEDURE_RAW.map((s) => ({
  id: s.id,
  layer: 'procedure',
  label: s.label,
  gradeBand: s.gradeBand,
  prereqs: s.prereqs,
  graduation: { acc: 0.9, speed: null },
  revisit: OTHER_REVISIT,
}));

// —— 策略层（strategy，27 点）——交错训练 + 陷阱辨别 ——
const STRATEGY_RAW = [
  // 简算 8 校内家族（分配律拆为正/逆两个技能点）+ 拓展 3 点
  { id: 'smart.round_group', label: '简算·凑整', gradeBand: [3, 6], prereqs: ['mult_pairs'] },
  { id: 'smart.add_assoc', label: '简算·加法结合律', gradeBand: [3, 5], prereqs: ['add100'] },
  { id: 'smart.mult_assoc', label: '简算·乘法结合律', gradeBand: [4, 6], prereqs: ['int.mult_1digit'] },
  { id: 'smart.dist_forward', label: '简算·乘法分配律（正用）', gradeBand: [4, 6], prereqs: ['int.mult_2digit'] },
  { id: 'smart.dist_reverse', label: '简算·乘法分配律（逆用）', gradeBand: [4, 6], prereqs: ['smart.dist_forward'] },
  { id: 'smart.sub_property', label: '简算·减法性质', gradeBand: [3, 5], prereqs: ['int.sub_borrow'] },
  { id: 'smart.div_property', label: '简算·除法性质', gradeBand: [4, 6], prereqs: ['int.div_2digit'] },
  { id: 'smart.split_compensate', label: '简算·拆数补偿', gradeBand: [4, 6], prereqs: ['smart.round_group'] },
  { id: 'smart.sign_move', label: '简算·带符号搬家', gradeBand: [5, 6], prereqs: ['int.add_multi', 'int.sub_borrow'] },
  { id: 'smart.benchmark', label: '简算拓展·基准数', gradeBand: [5, 6], prereqs: ['smart.round_group'] },
  { id: 'smart.series', label: '简算拓展·等差求和', gradeBand: [5, 6], prereqs: ['int.add_multi'] },
  { id: 'smart.telescope', label: '简算拓展·裂项', gradeBand: [5, 6], prereqs: ['frac.addsub_diff'] },
  // 方程 6 型（等式性质路线，衔接初中移项）
  { id: 'eq.x_add_sub', label: '方程·x±a=b', gradeBand: [5, 6], prereqs: [] },
  { id: 'eq.x_mult_div', label: '方程·ax=b / x÷a=b', gradeBand: [5, 6], prereqs: [] },
  { id: 'eq.x_two_step', label: '方程·ax±b=c', gradeBand: [5, 6], prereqs: ['eq.x_add_sub', 'eq.x_mult_div'] },
  { id: 'eq.x_bracket', label: '方程·a(x±b)=c', gradeBand: [6, 6], prereqs: ['eq.x_two_step', 'gen.order_bracket'] },
  { id: 'eq.special_pos', label: '方程·x在减数/除数位', gradeBand: [6, 6], prereqs: ['eq.x_add_sub', 'eq.x_mult_div'] },
  { id: 'eq.both_sides', label: '方程·两侧含x', gradeBand: [6, 6], prereqs: ['eq.x_two_step'] },
  // 混合四则：3 子技能 + 综合混算 2 点（分小混合为珠峰）
  { id: 'mix.convert_judge', label: '混合四则·互化时机判断', gradeBand: [5, 6], prereqs: ['dec_frac_base'] },
  { id: 'mix.unify_repr', label: '混合四则·统一表示策略', gradeBand: [5, 6], prereqs: ['mix.convert_judge'] },
  { id: 'mix.cross_reduce', label: '混合四则·交叉约分', gradeBand: [6, 6], prereqs: ['frac.mult'] },
  { id: 'mix.int_dec', label: '综合混算·整小混合', gradeBand: [4, 5], prereqs: ['dec.mixed_addsub_mult'] },
  { id: 'mix.dec_frac', label: '综合混算·分小混合（珠峰）', gradeBand: [6, 6], prereqs: ['mix.unify_repr', 'mix.cross_reduce'] },
  // 单位率关系（保留 v2 的 4 点）
  { id: 'rate.unit_price', label: '单位率·单价数量总价', gradeBand: [3, 4], prereqs: [] },
  { id: 'rate.speed_time', label: '单位率·速度时间路程', gradeBand: [4, 5], prereqs: [] },
  { id: 'rate.work_rate', label: '单位率·工作效率', gradeBand: [5, 6], prereqs: [] },
  { id: 'rate.ratio', label: '单位率·比与比例关系', gradeBand: [5, 6], prereqs: ['frac.meaning_property'] },
];
const STRATEGY = STRATEGY_RAW.map((s) => ({
  id: s.id,
  layer: 'strategy',
  label: s.label,
  gradeBand: s.gradeBand,
  prereqs: s.prereqs,
  graduation: { acc: 0.9, speed: null },
  revisit: OTHER_REVISIT,
}));

export const SKILLS = Object.fromEntries(
  [...FLUENCY, ...PROCEDURE, ...STRATEGY].map((s) => [s.id, s])
);

export const SKILL_IDS = Object.keys(SKILLS);

export function byLayer(layer) {
  return SKILL_IDS.map((id) => SKILLS[id]).filter((s) => s.layer === layer);
}
