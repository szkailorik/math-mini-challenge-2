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
function buildEqBasic(rng, level) {
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
function buildEqSpecial(rng, level) {
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
function buildEqFracRatio(rng, level) {
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
function buildSmartRound(rng, level) {
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
function buildSmartDist(rng, level) {
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
function buildSmartGroup(rng, level) {
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
function buildSmartSplit(rng, level) {
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
