// 口算冲刺：整数速算 / 小数口算 / 分数口算 / 互化基准（每卷 12 题，各 3 题后打乱）
import { Frac, F, fracHTML, valueHTML, decimalHTML, percentHTML } from '../fraction.js';

const D = Frac.fromDecimal;
const rawFrac = (n, d) =>
  `<span class="frac"><span class="fn">${n}</span><span class="fd">${d}</span></span>`;

function q(tag, prompt, answer, hint) {
  return { tag, prompt, answer, hint, work: 'inline' };
}

// —— 整数速算 ——
function intQ(rng, level) {
  const v = rng.int(1, 3);
  if (v === 1) { // 凑整乘法
    const pairs = level >= 3
      ? [[25, 4], [25, 8], [125, 8], [24, 5], [15, 8], [35, 4], [45, 4], [16, 25], [75, 4], [125, 4], [24, 25], [36, 5], [125, 16]]
      : [[25, 4], [25, 8], [125, 8], [15, 4], [24, 5], [35, 2], [45, 2], [12, 5], [16, 5], [14, 5], [15, 6], [25, 2]];
    let [a, b] = rng.pick(pairs);
    if (rng.chance(0.5)) [a, b] = [b, a];
    return q('oral.int', `${a} × ${b} =`, valueHTML(F(a).mul(F(b))),
      '找凑整搭档：25×4=100、125×8=1000');
  }
  if (v === 2) { // 整除
    const d = rng.int(3, 9);
    const qt = level >= 3 ? rng.int(11, 25) * 10 : rng.int(4, 12) * 10;
    const dd = d * qt;
    return q('oral.int', `${dd} ÷ ${d} =`, valueHTML(F(dd).div(F(d))),
      '用口诀反着想，末尾的 0 别丢');
  }
  // 整十数加减
  const lo = 12, hi = level >= 3 ? 96 : 78;
  let a = rng.int(lo, hi) * 10;
  let b = rng.int(lo, hi) * 10;
  if (a === b) b += 10;
  if (rng.chance(0.5)) {
    return q('oral.int', `${a} + ${b} =`, valueHTML(F(a).add(F(b))), '先凑整百再相加');
  }
  const big = Math.max(a, b), small = Math.min(a, b);
  return q('oral.int', `${big} − ${small} =`, valueHTML(F(big).sub(F(small))), '退位时想“凑整百”');
}

// —— 小数口算 ——
function decQ(rng, level) {
  const v = rng.int(1, 3);
  if (v === 1) { // 一位小数加减
    const hi = level >= 3 ? 189 : 89;
    let ai = rng.int(11, hi); if (ai % 10 === 0) ai += 3;
    let bi = rng.int(11, hi); if (bi % 10 === 0) bi += 7;
    const a = F(ai, 10), b = F(bi, 10);
    if (rng.chance(0.5)) {
      return q('oral.decimal', `${a.toDecimalString()} + ${b.toDecimalString()} =`,
        decimalHTML(a.add(b)), '小数点对齐，相同数位相加');
    }
    const big = a.cmp(b) >= 0 ? a : b, small = a.cmp(b) >= 0 ? b : a;
    if (big.eq(small)) return decQ(rng, level);
    return q('oral.decimal', `${big.toDecimalString()} − ${small.toDecimalString()} =`,
      decimalHTML(big.sub(small)), '小数点对齐再减');
  }
  if (v === 2) { // ×10/÷100 移位
    let base;
    if (level >= 3) {
      let bi = rng.int(1001, 9999); if (bi % 1000 === 0) bi += 7;
      base = F(bi, 1000);
    } else {
      let bi = rng.int(101, 999); if (bi % 100 === 0) bi += 7;
      base = F(bi, 100);
    }
    const [opText, factor, isMul] = rng.pick([
      ['× 10', F(10), true], ['× 100', F(100), true],
      ['÷ 10', F(10), false], ['÷ 100', F(100), false],
    ]);
    const ans = isMul ? base.mul(factor) : base.div(factor);
    return q('oral.decimal', `${base.toDecimalString()} ${opText} =`, decimalHTML(ans),
      '小数点移位：乘向右，除向左，数好位数');
  }
  // 基准小数乘法
  const pairs = level >= 3
    ? [[0.125, 8], [0.125, 16], [0.375, 8], [0.625, 8], [1.25, 8], [2.5, 8], [0.75, 8], [0.25, 12]]
    : [[0.25, 4], [0.25, 8], [0.5, 6], [0.5, 14], [0.75, 4], [0.2, 5], [0.5, 8], [2.5, 4], [1.5, 4]];
  const [dv, k] = rng.pick(pairs);
  const a = D(dv);
  return q('oral.decimal', `${a.toDecimalString()} × ${k} =`, decimalHTML(a.mul(F(k))),
    '记基准：0.25×4=1、0.125×8=1');
}

// —— 分数口算 ——
function fracQ(rng, level) {
  const v = rng.int(1, 3);
  if (v === 1) { // 同分母加减
    const d = rng.pick(level >= 3 ? [7, 9, 11, 12, 13, 15] : [5, 6, 7, 8, 9, 10]);
    if (rng.chance(0.5)) {
      const n1 = rng.int(1, d - 2);
      const n2 = rng.int(1, d - n1);
      return q('oral.frac', `${rawFrac(n1, d)} + ${rawFrac(n2, d)} =`,
        fracHTML(F(n1, d).add(F(n2, d))), '同分母只加分子，结果要约分');
    }
    const n1 = rng.int(2, d - 1);
    const n2 = rng.int(1, n1 - 1);
    return q('oral.frac', `${rawFrac(n1, d)} − ${rawFrac(n2, d)} =`,
      fracHTML(F(n1, d).sub(F(n2, d))), '同分母只减分子，结果要约分');
  }
  if (v === 2) { // 单位分数 × 整数
    const d = rng.int(2, 9);
    const k = level >= 3 ? rng.pick([d * 2, d * 3, rng.int(2, 15)]) : rng.int(2, 12);
    return q('oral.frac', `${rawFrac(1, d)} × ${k} =`, fracHTML(F(1, d).mul(F(k))),
      '分子乘整数，能约先约');
  }
  // 约分
  const bases = [[1, 2], [2, 3], [3, 4], [1, 3], [2, 5], [3, 5], [5, 6], [1, 4], [4, 5], [3, 7], [5, 8]];
  const [n, d] = rng.pick(bases);
  const m = rng.int(2, level >= 3 ? 8 : 5);
  return q('oral.frac', `约分：${rawFrac(n * m, d * m)} =`, fracHTML(F(n * m, d * m)),
    '分子分母同除以最大公因数');
}

// —— 互化基准 ——
function convQ(rng, level) {
  const pool = level >= 3
    ? [[1, 8], [3, 8], [5, 8], [7, 8], [1, 4], [3, 4], [3, 5], [9, 20], [7, 20], [1, 25], [6, 25], [11, 20], [1, 2], [4, 5]]
    : [[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 10], [3, 10], [7, 10], [9, 10], [1, 20]];
  const [n, d] = rng.pick(pool);
  const fr = F(n, d);
  const dir = rng.int(1, 3);
  if (dir === 1) { // 分 → 小
    return q('oral.convert', `${fracHTML(fr)} = ___（小数）`, decimalHTML(fr),
      '基准要脱口而出：1/4=0.25、1/8=0.125');
  }
  if (dir === 2) { // 小 → 百
    return q('oral.convert', `${fr.toDecimalString()} = ___（百分数）`, percentHTML(fr),
      '小数点右移两位加 %');
  }
  // 百 → 分
  return q('oral.convert', `${percentHTML(fr)} = ___（最简分数）`, fracHTML(fr),
    '百分数写成分母 100 的分数再约分');
}

export function generate(rng, level, count) {
  const kinds = [intQ, decQ, fracQ, convQ];
  const makers = [];
  for (let i = 0; i < count; i++) makers.push(kinds[i % kinds.length]);
  const seen = new Set();
  const out = [];
  for (const make of makers) {
    let cand = make(rng, level);
    for (let t = 0; t < 500 && seen.has(cand.prompt); t++) cand = make(rng, level);
    seen.add(cand.prompt);
    out.push(cand);
  }
  return rng.shuffle(out);
}
