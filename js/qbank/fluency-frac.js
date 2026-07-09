// 地基层题模 · 小数分数基准（6 技能点）
// 凡答案含分数/小数一律走 Frac 精确计算，禁止直接用 JS 浮点拼接字符串。
// 出题参数严格按 .superpowers/sdd/task-5-brief.md 的参数表。
import { defineQModel } from '../engine/qmodel.js';
import { Frac, F, fracHTML, decimalHTML, percentHTML } from '../fraction.js';

// ============ mult_pairs.core：凑整速算对 ============
// 固定池：11 组"凑成整十/整百/整千"的速算对，乘积均为整数。
// 30% 概率追加一个随机 k∈[2,9]，出 "k×a×b" 三因数形。
const MULT_POOL = [
  [25, 4], [125, 8], [5, 2], [50, 2], [25, 8], [125, 4],
  [75, 4], [250, 4], [2.5, 4], [12.5, 8], [0.25, 4],
];

const multPairsCore = defineQModel({
  id: 'mult_pairs.core',
  skill: 'mult_pairs',
  tier: 'core',
  bugs: [],
  traps: [],
  generate(rng) {
    const [a, b] = rng.pick(MULT_POOL);
    const ab = Frac.fromDecimal(a).mul(Frac.fromDecimal(b));
    if (rng.chance(0.3)) {
      const k = rng.int(2, 9);
      const total = ab.mul(F(k));
      return { prompt: `${k} × ${a} × ${b} =`, answer: String(total.n), hint: '先凑成整十/整百再乘', work: 'inline' };
    }
    return { prompt: `${a} × ${b} =`, answer: String(ab.n), hint: '先凑成整十/整百再乘', work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const [a, b] = rng.pick(MULT_POOL);
      const ab = Frac.fromDecimal(a).mul(Frac.fromDecimal(b)).n;
      if (rng.chance(0.5)) return { prompt: `( ) × ${b} = ${ab}`, answer: String(a), hint: '先凑成整十/整百再乘', work: 'inline' };
      return { prompt: `${a} × ( ) = ${ab}`, answer: String(b), hint: '先凑成整十/整百再乘', work: 'inline' };
    }
    return this.generate(rng);
  },
});

// ============ dec_shift.core：小数 ×÷10/100/1000 移位 ============
// base 为两位小数（用整数分转 Frac，避免浮点），op 覆盖 ×10/×100/×1000/÷10/÷100。
// 陷阱：÷100 时可能产生 4 位以上小数（如 0.03÷100=0.0003），Frac 精算保证不失真。
const SHIFT_OPS = ['×10', '×100', '×1000', '÷10', '÷100'];
function opLabel(op) { return op[0] === '×' ? `× ${op.slice(1)}` : `÷ ${op.slice(1)}`; }
function genShift(rng) {
  const c = rng.int(3, 987); // base = c/100 ∈ [0.03, 9.87]，两位小数
  const baseFr = new Frac(c, 100);
  const baseStr = (c / 100).toFixed(2);
  const op = rng.pick(SHIFT_OPS);
  let resultFr;
  if (op === '×10') resultFr = baseFr.mul(F(10));
  else if (op === '×100') resultFr = baseFr.mul(F(100));
  else if (op === '×1000') resultFr = baseFr.mul(F(1000));
  else if (op === '÷10') resultFr = baseFr.div(F(10));
  else resultFr = baseFr.div(F(100));
  return { baseFr, baseStr, op, resultFr };
}

const decShiftCore = defineQModel({
  id: 'dec_shift.core',
  skill: 'dec_shift',
  tier: 'core',
  bugs: ['dec.shift_direction'],
  traps: [],
  generate(rng) {
    const { baseStr, op, resultFr } = genShift(rng);
    return { prompt: `${baseStr} ${opLabel(op)} =`, answer: decimalHTML(resultFr), hint: '乘大右移，除大左移，小数点按位数移动', work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const { baseFr, op, resultFr } = genShift(rng);
      return { prompt: `( ) ${opLabel(op)} = ${decimalHTML(resultFr)}`, answer: decimalHTML(baseFr), hint: '乘大右移，除大左移，小数点按位数移动', work: 'inline' };
    }
    return this.generate(rng);
  },
});

// ============ dec_frac_base.core：分数↔小数↔百分数基准互化 ============
// 基准池 14 个（分母只含 2、5 因子，保证都能化成有限小数），三方向随机：分→小、小→百、百→最简分数。
const DFB_POOL = [
  [1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5],
  [1, 8], [3, 8], [5, 8], [7, 8], [1, 20], [1, 25], [1, 50],
];
const DFB_DIRS = [
  { from: 'frac', to: 'dec', hint: '分数化小数：分子除以分母' },
  { from: 'dec', to: 'pct', hint: '小数化百分数：小数点向右移两位，添百分号' },
  { from: 'pct', to: 'frac', hint: '百分数化最简分数：先写成分母 100 的分数，再约分到最简' },
];
function dfbReprs(fr) {
  return { frac: fracHTML(fr), dec: decimalHTML(fr), pct: percentHTML(fr) };
}

const decFracBaseCore = defineQModel({
  id: 'dec_frac_base.core',
  skill: 'dec_frac_base',
  tier: 'core',
  bugs: ['frac.reduce_incomplete', 'dec.zero_significance'],
  traps: [],
  generate(rng) {
    const [n, d] = rng.pick(DFB_POOL);
    const fr = F(n, d);
    const dir = rng.pick(DFB_DIRS);
    const R = dfbReprs(fr);
    return { prompt: `${R[dir.from]} =`, answer: R[dir.to], hint: dir.hint, work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const [n, d] = rng.pick(DFB_POOL);
      const fr = F(n, d);
      const dir = rng.pick(DFB_DIRS);
      const R = dfbReprs(fr);
      // 反向填空：给出目标形式，倒推出发形式，考的是"互化"而不是单向记忆
      return { prompt: `( ) = ${R[dir.to]}`, answer: R[dir.from], hint: dir.hint, work: 'inline' };
    }
    return this.generate(rng);
  },
});

// ============ frac_same_denom.core：同分母分数加减 ============
// d∈[5,12]，两个分子∈[1,d-1]；减法保证 n1≥n2（结果非负）；结果一律给最简分数（Frac 自动约分）。
function genFracSame(rng) {
  const d = rng.int(5, 12);
  let n1 = rng.int(1, d - 1);
  let n2 = rng.int(1, d - 1);
  const isAdd = rng.chance(0.5);
  if (!isAdd && n1 < n2) [n1, n2] = [n2, n1];
  return { d, n1, n2, isAdd };
}

const fracSameDenomCore = defineQModel({
  id: 'frac_same_denom.core',
  skill: 'frac_same_denom',
  tier: 'core',
  bugs: ['frac.reduce_incomplete'],
  traps: [],
  generate(rng) {
    const { d, n1, n2, isAdd } = genFracSame(rng);
    const f1 = F(n1, d), f2 = F(n2, d);
    const result = isAdd ? f1.add(f2) : f1.sub(f2);
    const opSym = isAdd ? '+' : '−';
    return { prompt: `${fracHTML(f1)} ${opSym} ${fracHTML(f2)} =`, answer: fracHTML(result), hint: '同分母分数加减：分母不变，分子相加减，结果要约成最简分数', work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const { d, n1, n2, isAdd } = genFracSame(rng);
      const f1 = F(n1, d), f2 = F(n2, d);
      const result = isAdd ? f1.add(f2) : f1.sub(f2);
      const opSym = isAdd ? '+' : '−';
      if (rng.chance(0.5)) {
        return { prompt: `( ) ${opSym} ${fracHTML(f2)} = ${fracHTML(result)}`, answer: fracHTML(f1), hint: '同分母分数加减：分母不变，分子相加减', work: 'inline' };
      }
      return { prompt: `${fracHTML(f1)} ${opSym} ( ) = ${fracHTML(result)}`, answer: fracHTML(f2), hint: '同分母分数加减：分母不变，分子相加减', work: 'inline' };
    }
    return this.generate(rng);
  },
});

// ============ square_base.core：常用平方数 11²–25² ============
function genSquare(rng) { return rng.int(11, 25); }

const squareBaseCore = defineQModel({
  id: 'square_base.core',
  skill: 'square_base',
  tier: 'core',
  bugs: [],
  traps: [],
  generate(rng) {
    const n = genSquare(rng);
    return { prompt: `${n}² =`, answer: String(n * n), hint: '记住常用平方数', work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const n = genSquare(rng);
      return { prompt: `( )² = ${n * n}`, answer: String(n), hint: '记住常用平方数，反过来想哪个数的平方是它', work: 'inline' };
    }
    return this.generate(rng);
  },
});

// ============ estimate_flash.core：数量级速估 ============
// a∈[18,98], b∈[19,52]；真积 p<1000 取整百，否则取整千；rejection-sample 保证真积距离
// "两侧整百/整千的中点" ≥ 单位的 8%，避免中点歧义（50 次内找不到就放宽接受当前组合，
// 概率极低，仅作为死循环兜底）。
function genEstimate(rng) {
  let a, b, p, unit, floor, mid, dist, tries = 0;
  do {
    a = rng.int(18, 98);
    b = rng.int(19, 52);
    p = a * b;
    unit = p < 1000 ? 100 : 1000;
    floor = Math.floor(p / unit) * unit;
    mid = floor + unit / 2;
    dist = Math.abs(p - mid);
    tries++;
  } while (dist / unit < 0.08 && tries < 50);
  const nearest = p - floor < unit / 2 ? floor : floor + unit;
  return { a, b, p, unit, nearest };
}

const estimateFlashCore = defineQModel({
  id: 'estimate_flash.core',
  skill: 'estimate_flash',
  tier: 'core',
  bugs: [],
  traps: [],
  generate(rng) {
    const { a, b, unit, nearest } = genEstimate(rng);
    const word = unit === 100 ? '百' : '千';
    return { prompt: `${a} × ${b} 大约是几${word}？`, answer: String(nearest), hint: `先估算积的位数，再取最接近的整${word}`, work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      // 结构变式：不再问"最接近的整百/整千"，改问"两个因数先各自看成整十数再口算"
      const a = rng.int(18, 98), b = rng.int(19, 52);
      const ra = Math.round(a / 10) * 10;
      const rb = Math.round(b / 10) * 10;
      return { prompt: `${a} × ${b} ≈ ${ra} × ${rb} =（先把两个因数看成整十数再口算）`, answer: String(ra * rb), hint: '先把每个因数看成最接近的整十数，再口算乘法', work: 'inline' };
    }
    return this.generate(rng);
  },
});

export const MODELS = [
  multPairsCore, decShiftCore, decFracBaseCore, fracSameDenomCore, squareBaseCore, estimateFlashCore,
];
