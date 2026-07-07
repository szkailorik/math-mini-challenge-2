// 方程与简算：每卷 5 题 = 3 方程（各一类）+ 2 简算（4 类里不重复抽 2 类）。
// 答案全部由 Frac 精算，x 的解写成 `x = 值`。

import { F, Frac, fracHTML, gcd } from '../fraction.js';

const num = (s) => `<span class="num">${s}</span>`;
const dstr = (fr) => fr.toDecimalString();
const lcm = (a, b) => (a * b) / gcd(a, b);

// 值的"最自然"形式：整数→整数；两位以内有限小数→小数；否则（带）分数
function naturalHTML(fr) {
  if (fr.isInt()) return num(String(fr.n));
  if (fr.isFiniteDecimal()) {
    const s = fr.toDecimalString();
    if ((s.split('.')[1] || '').length <= 2) return num(s);
  }
  return fracHTML(fr);
}

const xEq = (fr) => `x = ${naturalHTML(fr)}`;

// 一位小数 w.t（t 非零）
function oneDec(rng, wLo, wHi) {
  return F(rng.int(wLo, wHi) * 10 + rng.int(1, 9), 10);
}

// ---------- 方程 1：两步方程 ax ± b = c ----------
// level 4：三步方程 a(x ± b) ± c = d，系数为小数或分数
function buildEqBasic4(rng) {
  for (let att = 0; att < 800; att++) {
    const useFrac = rng.chance(0.5);
    let aF, aHTML, inner, mid;
    if (useFrac) {
      aF = rng.pick([F(1, 2), F(3, 4), F(2, 3), F(2, 5), F(3, 5), F(5, 6), F(3, 8)]);
      const m = rng.int(2, 6);
      inner = F(aF.d * m); // 括号值取分母倍数，保证 a×(括号) 为整数
      mid = aF.mul(inner);
      aHTML = fracHTML(aF);
    } else {
      aF = Frac.fromDecimal(rng.pick(['0.5', '1.5', '2.5', '0.8', '1.2', '2.4', '3.5', '4.5']));
      inner = F(rng.int(3, 20));
      mid = aF.mul(inner);
      aHTML = num(dstr(aF));
    }
    const innerPlus = rng.chance(0.5); // (x + b) 或 (x − b)
    const bF = rng.chance(0.6) ? F(rng.int(1, 12)) : oneDec(rng, 1, 9);
    const xF = innerPlus ? inner.sub(bF) : inner.add(bF);
    if (xF.cmp(F(0)) <= 0) continue;
    const outerPlus = rng.chance(0.5); // ... + c 或 ... − c
    const cF = rng.chance(0.6) ? F(rng.int(1, 30)) : oneDec(rng, 1, 12);
    if (!outerPlus && mid.cmp(cF) <= 0) continue; // 中间不出现负数
    const dF = outerPlus ? mid.add(cF) : mid.sub(cF);
    if (dF.n === 0 || dF.d > 100 || xF.d > 100) continue;
    return {
      tag: 'strategy.eq_basic',
      prompt: `${aHTML}(x ${innerPlus ? '+' : '−'} ${num(dstr(bF))}) ${outerPlus ? '+' : '−'} ${num(dstr(cF))} = ${naturalHTML(dF)}`,
      answer: xEq(xF),
      hint: '把括号整体当作一个数：先移走括号外的加减，再除以系数，最后解括号里的一步。',
      work: 'lines',
    };
  }
  throw new Error('strategy.eq_basic: 构造失败');
}

function buildEqBasic(rng, level) {
  if (level === 4) return buildEqBasic4(rng);
  for (let att = 0; att < 500; att++) {
    let aF, xF, bF;
    if (level === 3) {
      aF = Frac.fromDecimal(rng.pick(['0.5', '1.5', '2.5', '1.2', '2.4', '0.8', '3.5', '1.6', '4.5']));
      xF = rng.chance(0.5) ? F(rng.int(2, 16)) : F(rng.int(2, 12) * 10 + rng.pick([2, 4, 5, 6, 8]), 10);
      bF = rng.chance(0.5) ? F(rng.int(1, 40)) : oneDec(rng, 0, 20);
    } else {
      aF = F(rng.int(2, 9));
      xF = rng.chance(0.7) ? F(rng.int(2, 15)) : F(rng.int(2, 9) * 10 + 5, 10);
      bF = rng.chance(0.7) ? F(rng.int(1, 40)) : oneDec(rng, 1, 9);
    }
    if (bF.n === 0) continue;
    const plus = rng.chance(0.5);
    const ax = aF.mul(xF);
    if (!plus && ax.cmp(bF) <= 0) continue; // 中间不出现负数
    const cF = plus ? ax.add(bF) : ax.sub(bF);
    if (cF.n === 0) continue;
    return {
      tag: 'strategy.eq_basic',
      prompt: `${num(dstr(aF))}x ${plus ? '+' : '−'} ${num(dstr(bF))} = ${num(dstr(cF))}`,
      answer: xEq(xF),
      hint: '先把加减的数移到等号另一边，再除以系数；求出 x 后代回原方程验算。',
      work: 'lines',
    };
  }
  throw new Error('strategy.eq_basic: 构造失败');
}

// ---------- 方程 2：未知数在特殊位置（易错点） ----------
// level 4：未知数在复合位置 (a−x)×b = c、a ÷ (x−b) = c、(x+a) ÷ b = c
function buildEqSpecial4(rng) {
  const form = rng.pick(['paren_minus_x', 'div_x_minus', 'plus_div']);
  let prompt, x;
  if (form === 'paren_minus_x') {
    // (a − x) × b = c → 先求括号 = c ÷ b
    x = rng.chance(0.5) ? F(rng.int(2, 15)) : oneDec(rng, 1, 9);
    const t = rng.chance(0.6) ? F(rng.int(1, 9)) : oneDec(rng, 1, 6); // a − x
    const a = x.add(t);
    const b = rng.int(2, 9);
    const c = t.mul(F(b));
    prompt = `(${num(dstr(a))} − x) × ${num(b)} = ${num(dstr(c))}`;
  } else if (form === 'div_x_minus') {
    // a ÷ (x − b) = c → 括号 = a ÷ c
    const t = F(rng.int(2, 9)); // x − b
    const c = rng.chance(0.6) ? F(rng.int(2, 12)) : oneDec(rng, 1, 6);
    const a = t.mul(c);
    const b = rng.chance(0.6) ? F(rng.int(1, 9)) : oneDec(rng, 1, 6);
    x = t.add(b);
    prompt = `${num(dstr(a))} ÷ (x − ${num(dstr(b))}) = ${num(dstr(c))}`;
  } else {
    // (x + a) ÷ b = c → 括号 = b × c
    const b = rng.int(2, 9);
    const c = rng.chance(0.6) ? F(rng.int(2, 12)) : oneDec(rng, 1, 6);
    const paren = F(b).mul(c);
    const aMax = Math.floor(paren.toNumber()) - 1;
    if (aMax < 1) return buildEqSpecial4(rng);
    const a = F(rng.int(1, aMax));
    x = paren.sub(a);
    prompt = `(x + ${num(dstr(a))}) ÷ ${num(b)} = ${num(dstr(c))}`;
  }
  if (x.cmp(F(0)) <= 0 || x.d > 100) return buildEqSpecial4(rng);
  return {
    tag: 'strategy.eq_special_pos',
    prompt,
    answer: xEq(x),
    hint: 'x 藏在括号或除数里时，先把整个括号当作一个数求出来，再解里面那一步。',
    work: 'lines',
  };
}

function buildEqSpecial(rng, level) {
  if (level === 4) return buildEqSpecial4(rng);
  const form = rng.pick(['a_minus_x', 'a_div_x', 'x_div_a']);
  let prompt, x;
  if (form === 'a_minus_x') {
    // a − x = b → x = a − b
    x = level === 3 ? oneDec(rng, 1, 12) : (rng.chance(0.5) ? F(rng.int(2, 30)) : oneDec(rng, 1, 9));
    const b = level === 3 ? oneDec(rng, 1, 12) : F(rng.int(1, 20));
    const a = x.add(b);
    prompt = `${num(dstr(a))} − x = ${num(dstr(b))}`;
  } else if (form === 'a_div_x') {
    // a ÷ x = b → x = a ÷ b
    x = rng.chance(0.6) ? F(rng.int(2, 12)) : F(rng.int(1, 6) * 10 + 5, 10);
    const b = level === 3 ? rng.pick([F(rng.int(2, 9)), F(rng.int(1, 3) * 10 + 5, 10)]) : F(rng.int(2, 9));
    const a = x.mul(b);
    prompt = `${num(dstr(a))} ÷ x = ${num(dstr(b))}`;
  } else {
    // x ÷ a = b → x = a × b
    const a = F(rng.int(2, 9));
    const b = level === 3 ? rng.pick([F(rng.int(2, 12)), F(rng.int(1, 8) * 10 + 5, 10)]) : F(rng.int(2, 12));
    x = a.mul(b);
    prompt = `x ÷ ${num(dstr(a))} = ${num(dstr(b))}`;
  }
  return {
    tag: 'strategy.eq_special_pos',
    prompt,
    answer: xEq(x),
    hint: 'x 在减数/除数位置时别照搬套路：减数 = 被减数 − 差，除数 = 被除数 ÷ 商。',
    work: 'lines',
  };
}

// ---------- 方程 3：分数系数方程（level 2）/ 比例式（level 3） ----------
// level 4：分数项比例式 x : a/b = c : d，或两边都有 x 的方程 ax + b = cx + d
function buildEqFracRatio4(rng) {
  if (rng.chance(0.5)) {
    // x : a/b = c : d → x × d = a/b × c
    for (let att = 0; att < 500; att++) {
      const b = rng.int(2, 9);
      const a = rng.int(1, b - 1);
      const c = rng.int(2, 12), d = rng.int(2, 12);
      const x = F(a, b).mul(F(c)).div(F(d));
      if (x.n === 0 || x.d > 100) continue;
      return {
        tag: 'strategy.eq_frac_ratio',
        prompt: `x : ${fracHTML(F(a, b))} = ${num(c)} : ${num(d)}`,
        answer: xEq(x),
        hint: `外项之积等于内项之积：x × ${d} = ${a}/${b} × ${c}，分数项照样适用。`,
        work: 'lines',
      };
    }
    throw new Error('strategy.eq_frac_ratio: 构造失败');
  }
  // ax + b = cx + d（a > c，解为正的干净数）
  for (let att = 0; att < 500; att++) {
    const x = rng.chance(0.6) ? F(rng.int(2, 12)) : F(rng.int(1, 9) * 10 + 5, 10);
    const a = rng.int(3, 9);
    const c = rng.int(1, a - 2);
    const b = rng.int(1, 20);
    const d = F(a - c).mul(x).add(F(b));
    if (d.n === 0 || d.d > 100) continue;
    return {
      tag: 'strategy.eq_frac_ratio',
      prompt: `${num(a)}x + ${num(b)} = ${num(c)}x + ${num(dstr(d))}`,
      answer: xEq(x),
      hint: `两边同时减去 ${c}x，把含 x 的项并到一边，就变回熟悉的两步方程。`,
      work: 'lines',
    };
  }
  throw new Error('strategy.eq_frac_ratio: 构造失败');
}

function buildEqFracRatio(rng, level) {
  if (level === 4) return buildEqFracRatio4(rng);
  if (level === 3) {
    // x : a = b : c → x = a×b ÷ c
    const wantFrac = rng.chance(0.6);
    for (let att = 0; att < 500; att++) {
      const a = rng.int(2, 15), b = rng.int(2, 15), c = rng.int(2, 15);
      const x = F(a * b, c);
      if (x.d > 100) continue;
      if ((x.d > 1) !== wantFrac && att < 400) continue; // 控制解是否为分数/小数
      return {
        tag: 'strategy.eq_frac_ratio',
        prompt: `x : ${num(a)} = ${num(b)} : ${num(c)}`,
        answer: xEq(x),
        hint: `比例的基本性质：外项之积等于内项之积，即 x × ${c} = ${a} × ${b}。`,
        work: 'lines',
      };
    }
    throw new Error('strategy.eq_frac_ratio: 构造失败');
  }
  // level 2：分数系数方程 (p/q)x = r
  for (let att = 0; att < 500; att++) {
    const coef = rng.pick([F(2, 3), F(3, 4), F(1, 2), F(2, 5), F(3, 5), F(5, 6), F(3, 8), F(4, 5)]);
    const sol = rng.chance(0.5) ? F(rng.int(2, 12)) : F(rng.int(1, 9), rng.pick([2, 3, 4, 5, 6]));
    if (sol.n === 0) continue;
    const rhs = coef.mul(sol);
    if (rhs.d > 30) continue;
    return {
      tag: 'strategy.eq_frac_ratio',
      prompt: `${fracHTML(coef)}x = ${fracHTML(rhs)}`,
      answer: xEq(sol),
      hint: '两边同时乘系数的倒数（或除以这个分数），就能把 x 单独留下。',
      work: 'lines',
    };
  }
  throw new Error('strategy.eq_frac_ratio: 构造失败');
}

// ---------- 简算 1：凑整 ----------
// level 4：9999×k + k 类大数补整，及更大的"好朋友数"
function buildSmartRound4(rng) {
  const kind = rng.pick(['near_round', 'mul_pack_big']);
  let prompt, ans, hint;
  if (kind === 'near_round') {
    // 9999×k + k = 10000×k（也出 999×k + k）
    const base = rng.pick([999, 9999, 9999]);
    const k = rng.int(3, 29);
    ans = F((base + 1) * k);
    prompt = `${num(base)} × ${num(k)} + ${num(k)}`;
    hint = `${base} 只差 1 就是 ${base + 1}：把 ${base}×${k} 与 ${k} 合并成 ${base + 1}×${k}。`;
  } else {
    // 12.5×8k、0.125×8k、125×8k 这类扩展好朋友数
    const [baseStr, partner] = rng.pick([['12.5', 8], ['125', 8], ['0.125', 8], ['1.25', 8], ['2.5', 4], ['25', 4]]);
    const k = rng.int(5, 16);
    const other = partner * k;
    ans = Frac.fromDecimal(baseStr).mul(F(other));
    prompt = `${num(baseStr)} × ${num(other)}`;
    hint = `先把 ${other} 拆出搭档数 ${partner}（${baseStr} × ${partner} 是整数），再乘剩下的 ${k}。`;
  }
  return {
    tag: 'strategy.smart_round',
    prompt: prompt + '（用简便方法计算）',
    answer: naturalHTML(ans),
    hint,
    work: 'lines',
  };
}

function buildSmartRound(rng, level) {
  if (level === 4) return buildSmartRound4(rng);
  const kind = rng.pick(['add_pair', 'mul_pack', 'over_hundred']);
  let prompt, ans;
  if (kind === 'add_pair') {
    // a + b + c，其中 a 与 c 凑成整数
    const R = rng.pick(level === 3 ? [10, 20, 30] : [10, 20]);
    const t = rng.pick([15, 25, 35, 45, 55, 65, 75, 85]);
    const wa = rng.int(2, R - 3);
    const a = F(wa * 100 + t, 100);
    const c = F(R, 1).sub(a);
    const b = oneDec(rng, 2, 9);
    ans = F(R).add(b);
    prompt = `${num(dstr(a))} + ${num(dstr(b))} + ${num(dstr(c))}`;
  } else if (kind === 'mul_pack') {
    // 25×4、125×8、2.5×4 这类"好朋友数"
    const [baseStr, partner] = rng.pick(
      level === 3
        ? [['25', 4], ['125', 8], ['0.25', 4], ['2.5', 4], ['1.25', 8]]
        : [['25', 4], ['0.25', 4], ['2.5', 4]]
    );
    const k = rng.int(3, level === 3 ? 12 : 9);
    const other = partner * k;
    ans = Frac.fromDecimal(baseStr).mul(F(other));
    prompt = `${num(baseStr)} × ${num(other)}`;
  } else {
    // 102×45 这类拆成 (100+d)×k
    const A = 100 + rng.int(1, 3);
    const k = rng.int(12, level === 3 ? 89 : 55);
    ans = F(A * k);
    prompt = `${num(A)} × ${num(k)}`;
  }
  return {
    tag: 'strategy.smart_round',
    prompt: prompt + '（用简便方法计算）',
    answer: naturalHTML(ans),
    hint: '先找能凑成整十、整百的搭档数（如 25 和 4、125 和 8），再计算。',
    work: 'lines',
  };
}

// ---------- 简算 2：分配律正/逆用 ----------
// level 4：三项分配 a×b + a×c − a，b + c − 1 凑整
function buildSmartDist4(rng) {
  const R = rng.pick([10, 100, 100]);
  const a = oneDec(rng, 1, 9);
  // b + c = R + 1，且 b、c 均为正的一位小数
  const lo = Math.ceil(R / 2), hi = R - 1;
  const b = oneDec(rng, lo, hi);
  const c = F(R + 1, 1).sub(b);
  const ans = a.mul(F(R));
  const check = a.mul(b).add(a.mul(c)).sub(a);
  if (!check.eq(ans)) throw new Error('strategy.smart_dist: 校验失败');
  return {
    tag: 'strategy.smart_dist',
    prompt: `${num(dstr(a))} × ${num(dstr(b))} + ${num(dstr(a))} × ${num(dstr(c))} − ${num(dstr(a))}（用简便方法计算）`,
    answer: naturalHTML(ans),
    hint: `最后单独的 ${dstr(a)} 也是 ${dstr(a)}×1：三项合并成 ${dstr(a)}×(${dstr(b)} + ${dstr(c)} − 1)。`,
    work: 'lines',
  };
}

function buildSmartDist(rng, level) {
  if (level === 4) return buildSmartDist4(rng);
  const kind = rng.pick(['lcm_frac', 'times101']);
  let prompt, ans;
  if (kind === 'lcm_frac') {
    // L × (1/p ± 1/q)，如 56×(1/7+1/8)
    const [p, q] = rng.pick([[2, 3], [3, 4], [2, 5], [4, 5], [5, 6], [3, 8], [7, 8], [2, 7], [3, 7]]);
    const m = rng.int(1, level === 3 ? 4 : 2);
    const L = lcm(p, q) * m;
    const minus = rng.chance(0.3); // p < q，1/p − 1/q 为正
    ans = minus ? F(L, p).sub(F(L, q)) : F(L, p).add(F(L, q));
    prompt = `${num(L)} × (${fracHTML(F(1, p))} ${minus ? '−' : '+'} ${fracHTML(F(1, q))})`;
  } else {
    // 7.6×101 − 7.6 / a×99 + a → 逆用分配律
    const a = oneDec(rng, 1, level === 3 ? 9 : 8);
    const over = rng.chance(0.5);
    ans = a.mul(F(100));
    prompt = over
      ? `${num(dstr(a))} × ${num(101)} − ${num(dstr(a))}`
      : `${num(dstr(a))} × ${num(99)} + ${num(dstr(a))}`;
  }
  return {
    tag: 'strategy.smart_dist',
    prompt: prompt + '（用简便方法计算）',
    answer: naturalHTML(ans),
    hint: '分配律要正反都会用：a×(b+c) 展开，a×b ± a×c 合并成 a×(b±c)。',
    work: 'lines',
  };
}

// ---------- 简算 3：加减组合交换（过程无负数） ----------
// level 4：六项组合 a − b + c − d + e − f，三组各自凑整
function buildSmartGroup4(rng) {
  // a+c 凑整（百分位互补）、b+d 凑整（十分位互补）、e−f 为整数
  const [p1, p2] = rng.pick([[25, 75], [75, 25], [35, 65], [65, 35], [15, 85], [45, 55], [55, 45], [85, 15]]);
  const [q1, q2] = rng.pick([[2, 8], [8, 2], [3, 7], [7, 3], [4, 6], [6, 4], [1, 9], [9, 1]]);
  const wb = rng.int(1, 6);
  const wa = wb + rng.int(1, 8); // wa > wb ⇒ a − b > 0
  const wd = rng.int(1, 6);
  const wc = wd + rng.int(1, 8); // wc > wd ⇒ 前四项累计仍为正
  const a = F(wa * 100 + p1, 100);
  const c = F(wc * 100 + p2, 100); // a + c = wa + wc + 1
  const b = F(wb * 10 + q1, 10);
  const d = F(wd * 10 + q2, 10); // b + d = wb + wd + 1
  const f = oneDec(rng, 1, 5);
  const g = rng.int(2, 9);
  const e = f.add(F(g)); // e − f = g
  const ans = F(wa + wc - wb - wd + g);
  const check = a.sub(b).add(c).sub(d).add(e).sub(f);
  if (!check.eq(ans)) throw new Error('strategy.smart_group: 校验失败');
  return {
    tag: 'strategy.smart_group',
    prompt: `${num(dstr(a))} − ${num(dstr(b))} + ${num(dstr(c))} − ${num(dstr(d))} + ${num(dstr(e))} − ${num(dstr(f))}（用简便方法计算）`,
    answer: naturalHTML(ans),
    hint: '六个数分三组"带符号搬家"：两个加数凑整、两个减数凑整、剩下一对相减是整数。',
    work: 'lines',
  };
}

function buildSmartGroup(rng, level) {
  if (level === 4) return buildSmartGroup4(rng);
  // a − b + c − d：a+c = R1、b+d = R2（R1 > R2），构造上保证每一步都不为负
  const R1 = rng.int(12, level === 3 ? 40 : 25);
  const R2 = rng.int(5, R1 - 3);
  const [p1, p2] = rng.pick([[25, 75], [75, 25], [35, 65], [65, 35], [15, 85], [45, 55], [55, 45], [85, 15]]);
  const [q1, q2] = rng.pick([[2, 8], [8, 2], [3, 7], [7, 3], [4, 6], [6, 4], [1, 9], [9, 1]]);
  const wb = rng.int(1, Math.max(1, R2 - 2));
  const wd = R2 - 1 - wb; // ≥ 0
  const wa = rng.int(wb + 1, R1 - 2); // wa > wb ⇒ a − b > 0
  const wc = R1 - 1 - wa; // ≥ 1
  const a = F(wa * 100 + p1, 100);
  const c = F(wc * 100 + p2, 100); // a + c = R1
  const b = F(wb * 10 + q1, 10);
  const d = F(wd * 10 + q2, 10); // b + d = R2
  const ans = F(R1 - R2); // 精算校验
  const check = a.sub(b).add(c).sub(d);
  if (!check.eq(ans)) throw new Error('strategy.smart_group: 校验失败');
  return {
    tag: 'strategy.smart_group',
    prompt: `${num(dstr(a))} − ${num(dstr(b))} + ${num(dstr(c))} − ${num(dstr(d))}（用简便方法计算）`,
    answer: naturalHTML(ans),
    hint: '加减混合可以"带着符号搬家"：先把能凑整的两个数结合，注意每一步都不出现负数。',
    work: 'lines',
  };
}

// ---------- 简算 4：拆分/补偿 ----------
// level 4：k×102 − k×2 类（多算的部分再减掉）
function buildSmartSplit4(rng) {
  const base = rng.chance(0.4) ? 1000 : 100;
  const s = rng.int(1, 3);
  const n2 = base + s;
  const k = base === 1000 ? rng.int(3, 25) : rng.int(12, 95);
  const ans = F(k).mul(F(base));
  const check = F(k).mul(F(n2)).sub(F(k).mul(F(s)));
  if (!check.eq(ans)) throw new Error('strategy.smart_split: 校验失败');
  // 两种呈现：k×102 − k×2（显式）或 k×102 − 2k 的乘积形式（更隐蔽）
  const hidden = rng.chance(0.5);
  const tail = hidden ? `${num(s * k)}` : `${num(k)} × ${num(s)}`;
  return {
    tag: 'strategy.smart_split',
    prompt: `${num(k)} × ${num(n2)} − ${tail}（用简便方法计算）`,
    answer: naturalHTML(ans),
    hint: `把 ${n2} 看成 ${base} + ${s}：${k}×${n2} 比 ${k}×${base} 多算了 ${k}×${s}，减掉的正好是它。`,
    work: 'lines',
  };
}

function buildSmartSplit(rng, level) {
  if (level === 4) return buildSmartSplit4(rng);
  // k × 98 = k×100 − k×2 这类"接近整百/整千"的拆分
  const base = level === 3 && rng.chance(0.4) ? 1000 : 100;
  const s = rng.int(1, 3);
  const n2 = base - s;
  const k = base === 1000 ? rng.int(3, 25) : rng.int(12, level === 3 ? 95 : 65);
  const ans = F(k).mul(F(n2));
  return {
    tag: 'strategy.smart_split',
    prompt: `${num(k)} × ${num(n2)}（用简便方法计算）`,
    answer: naturalHTML(ans),
    hint: `把 ${n2} 看成 ${base} − ${s}，用分配律展开：${k}×${base} − ${k}×${s}。`,
    work: 'lines',
  };
}

// ---------- 出题入口 ----------
export function generate(rng, level, count = 5) {
  const eqBuilders = [buildEqBasic, buildEqSpecial, buildEqFracRatio];
  const smartBuilders = {
    'strategy.smart_round': buildSmartRound,
    'strategy.smart_dist': buildSmartDist,
    'strategy.smart_group': buildSmartGroup,
    'strategy.smart_split': buildSmartSplit,
  };
  const chosen = rng.sample(Object.keys(smartBuilders), 2); // 4 类抽 2 类，不重复
  const plan = eqBuilders.concat(chosen.map((k) => smartBuilders[k]));
  const all = eqBuilders.concat(Object.values(smartBuilders));
  while (plan.length < count) plan.push(rng.pick(all));

  const seen = new Set();
  const out = [];
  for (const build of plan) {
    let q = build(rng, level);
    for (let att = 0; att < 80 && seen.has(q.prompt); att++) q = build(rng, level);
    seen.add(q.prompt);
    out.push(q);
  }
  const shuffled = rng.shuffle(out);
  return shuffled.length > count ? shuffled.slice(0, count) : shuffled;
}
