// 核心保温：已过关题型抽检（每卷 6 题：小数乘法 ×2、小数除法 ×2、分数运算 ×2）
import { Frac, F, fracHTML, improperHTML, decimalHTML } from '../fraction.js';

const D = Frac.fromDecimal;

function q(tag, prompt, answer, hint) {
  return { tag, prompt, answer, hint, work: 'lines' };
}

// —— 小数乘法竖式 ——
function multQ(rng, level) {
  let a, b;
  if (level >= 3) { // 两位小数 × 一位小数，如 3.06 × 4.5
    const ai = rng.int(11, 89) * 10 + rng.int(1, 9); // 末位非 0 的三位数 → 两位小数
    a = F(ai, 100);
    let bi = rng.int(12, 88); if (bi % 10 === 0) bi += 5;
    b = F(bi, 10);
  } else { // 一位小数 × 一位小数，如 2.4 × 1.5
    let ai = rng.int(12, 68); if (ai % 10 === 0) ai += 3;
    a = F(ai, 10);
    b = D(rng.pick([1.5, 2.5, 3.5, 4.5, 1.2, 2.4, 1.8, 1.6]));
  }
  return q('keep.mult',
    `用竖式计算：${a.toDecimalString()} × ${b.toDecimalString()} =`,
    decimalHTML(a.mul(b)),
    '积的小数位数 = 两个因数小数位数之和');
}

// —— 小数除法（除数是小数，需同倍扩大）——
function divQ(rng, level, small) {
  let dv = rng.int(13, level >= 3 ? 79 : 49);
  if (dv % 10 === 0) dv += 3;
  const divisor = F(dv, 10);
  let quot;
  if (small) { // 商 < 1
    quot = F(rng.int(2, 9), 10);
  } else {
    let qi = rng.int(12, level >= 3 ? 68 : 48);
    if (qi % 10 === 0) qi += 4;
    quot = F(qi, 10);
  }
  const dividend = divisor.mul(quot); // 反推被除数，保证商干净
  return q('keep.div',
    `用竖式计算：${dividend.toDecimalString()} ÷ ${divisor.toDecimalString()} =`,
    decimalHTML(quot),
    small ? '先判断商比 1 大还是小' : '除数是小数：被除数、除数同时扩大 10 倍');
}

// —— 分数加减两步 ——
function fracChainQ(rng, level) {
  for (let t = 0; t < 400; t++) {
    const ds = rng.sample(level >= 3 ? [3, 4, 6, 8, 9, 12] : [2, 3, 4, 6, 8], 3);
    const fs = ds.map(d => F(rng.int(1, d - 1), d));
    const op1 = rng.pick(['+', '−']);
    const op2 = rng.pick(['+', '−']);
    const step1 = op1 === '+' ? fs[0].add(fs[1]) : fs[0].sub(fs[1]);
    if (step1.isNeg() || step1.n === 0) continue;
    const res = op2 === '+' ? step1.add(fs[2]) : step1.sub(fs[2]);
    if (res.isNeg() || res.n === 0) continue;
    if (res.d > 24 || res.cmp(F(3)) > 0) continue;
    return q('keep.frac',
      `${fracHTML(fs[0])} ${op1} ${fracHTML(fs[1])} ${op2} ${fracHTML(fs[2])} =`,
      fracHTML(res),
      '先通分：找三个分母的最小公倍数');
  }
  // 兜底（理论上不会走到）
  return q('keep.frac',
    `${fracHTML(F(5, 6))} − ${fracHTML(F(1, 4))} + ${fracHTML(F(1, 3))} =`,
    fracHTML(F(5, 6).sub(F(1, 4)).add(F(1, 3))),
    '先通分：找三个分母的最小公倍数');
}

// —— 分数乘除 ——
function fracMulDivQ(rng, level) {
  for (let t = 0; t < 400; t++) {
    if (level >= 3 && rng.chance(0.5)) { // 两步：a × b ÷ c
      const a = F(rng.int(1, 5), rng.pick([2, 3, 4, 6]));
      const b = F(rng.int(1, 7), rng.pick([2, 3, 4, 5, 8]));
      const c = F(rng.int(1, 7), rng.pick([2, 3, 4, 8, 9]));
      if (a.n === 0 || b.n === 0 || c.n === 0) continue;
      const res = a.mul(b).div(c);
      if (res.isNeg() || res.d > 30 || res.cmp(F(6)) > 0) continue;
      return q('keep.frac',
        `${improperHTML(a)} × ${improperHTML(b)} ÷ ${improperHTML(c)} =`,
        fracHTML(res),
        '除以一个分数等于乘它的倒数，先约分再乘');
    }
    // 一步除法（结果干净），如 3/4 ÷ 3/8 = 2
    const b = F(rng.int(1, 8), rng.pick([3, 4, 5, 8, 9, 10]));
    const r = rng.pick([F(2), F(3), F(1, 2), F(3, 2), F(2, 3), F(4, 3), F(1, 3), F(5, 2), F(4)]);
    const a = r.mul(b); // 反推被除数
    if (a.d > 12 || a.cmp(F(4)) > 0 || a.n === 0) continue;
    return q('keep.frac',
      `${improperHTML(a)} ÷ ${improperHTML(b)} =`,
      fracHTML(r),
      '除以一个分数等于乘它的倒数');
  }
  return q('keep.frac',
    `${improperHTML(F(3, 4))} ÷ ${improperHTML(F(3, 8))} =`,
    fracHTML(F(3, 4).div(F(3, 8))),
    '除以一个分数等于乘它的倒数');
}

export function generate(rng, level, count) {
  const kinds = [
    (r, l) => multQ(r, l),
    (r, l) => divQ(r, l, false),
    (r, l) => fracChainQ(r, l),
    (r, l) => multQ(r, l),
    (r, l) => divQ(r, l, true),
    (r, l) => fracMulDivQ(r, l),
  ];
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
