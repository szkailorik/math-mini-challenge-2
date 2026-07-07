// 复杂四则混合运算（主战场）：每卷 5 题，5 类固定结构各一题，顺序打乱。
// 构造思路：先随机生成"友好"的中间值再反推题面，答案全部由 Frac 精确计算。

import { F, Frac, fracHTML, gcd } from '../fraction.js';

const num = (s) => `<span class="num">${s}</span>`;
const dstr = (fr) => fr.toDecimalString();
const lcm = (a, b) => (a * b) / gcd(a, b);

// 答案的"最自然"形式：整数→整数；两位以内有限小数→小数；否则（带）分数
function naturalHTML(fr) {
  if (fr.isInt()) return num(String(fr.n));
  if (fr.isFiniteDecimal()) {
    const s = fr.toDecimalString();
    if ((s.split('.')[1] || '').length <= 2) return num(s);
  }
  return fracHTML(fr);
}

// 一位小数：w.t（t 非零，保证真的是小数）
function oneDec(rng, wLo, wHi) {
  return F(rng.int(wLo, wHi) * 10 + rng.int(1, 9), 10);
}

// ---------- 1. 小括号 + 中括号的三/四步混合 ----------
// level 4：双层括号 {[(a+b)×c−d]÷e}×f 或小数三层嵌套，四步以上
function buildParenOrder4(rng) {
  for (let att = 0; att < 800; att++) {
    const kind = rng.pick(['brace_sum', 'brace_dec']);
    let prompt, ans;
    if (kind === 'brace_sum') {
      // {[(a+b)×c−d]÷e}×f，a+b 为整数 s
      const s = rng.int(5, 14);
      const w = rng.int(1, s - 1);
      const t = rng.int(1, 9);
      const a = F(w * 10 + t, 10);
      const b = F(s, 1).sub(a);
      const c = rng.int(3, 12);
      const p = s * c;
      const e = rng.int(2, 9);
      const qMax = Math.min(Math.floor((p - 1) / e), 12);
      if (qMax < 2) continue;
      const q = rng.int(2, qMax);
      const d = p - e * q;
      if (d < 1) continue;
      const f = rng.int(2, 9);
      prompt = `{[(${num(dstr(a))} + ${num(dstr(b))}) × ${num(c)} − ${num(d)}] ÷ ${num(e)}} × ${num(f)}`;
      ans = a.add(b).mul(F(c)).sub(F(d)).div(F(e)).mul(F(f));
    } else {
      // {[(a−b)×c+d]÷e}×f，a−b 为一位小数差
      const c = rng.pick([2, 4, 5, 6, 8, 12]);
      const p = rng.int(2, 30);
      const t = F(p, c); // a − b
      if (t.isInt() || !t.isFiniteDecimal() || t.d > 10) continue;
      const b = oneDec(rng, 1, 9);
      const a = b.add(t);
      if (!a.isFiniteDecimal() || a.d > 10) continue;
      const e = rng.int(2, 9);
      const q = rng.int(2, 12);
      const d = e * q - p;
      if (d < 1 || d > 60) continue;
      const f = rng.int(2, 9);
      prompt = `{[(${num(dstr(a))} − ${num(dstr(b))}) × ${num(c)} + ${num(d)}] ÷ ${num(e)}} × ${num(f)}`;
      ans = a.sub(b).mul(F(c)).add(F(d)).div(F(e)).mul(F(f));
    }
    if (ans.isNeg() || ans.n === 0 || ans.d > 100) continue;
    return {
      tag: 'mixed.paren_order',
      prompt,
      answer: naturalHTML(ans),
      hint: '三层括号由内向外：小括号 → 中括号 → 大括号，每层算完再往外走。',
      work: 'block',
    };
  }
  throw new Error('mixed.paren_order: 构造失败');
}

function buildParenOrder(rng, level) {
  if (level === 4) return buildParenOrder4(rng);
  for (let att = 0; att < 500; att++) {
    const s = rng.int(5, level === 3 ? 12 : 9); // a+b 的整数和
    const w = rng.int(1, s - 1);
    const t = rng.int(1, 9);
    const a = F(w * 10 + t, 10);
    const b = F(s, 1).sub(a); // 与 a 凑成整数 s，两个一位小数
    const c = rng.int(3, level === 3 ? 9 : 6);
    const p = s * c;
    const e = rng.int(2, 9);
    const qMax = Math.min(Math.floor((p - 1) / e), level === 3 ? 15 : 9);
    if (qMax < 2) continue;
    const q = rng.int(2, qMax);
    const d = p - e * q;
    if (d < 1) continue;

    let prompt = `[(${num(dstr(a))} + ${num(dstr(b))}) × ${num(c)} − ${num(d)}] ÷ ${num(e)}`;
    let ans = a.add(b).mul(F(c)).sub(F(d)).div(F(e));
    if (level === 3 && rng.chance(0.5)) { // level 3 可出现第四步
      const f = rng.int(2, 20);
      prompt += ` + ${num(f)}`;
      ans = ans.add(F(f));
    }
    if (ans.isNeg() || ans.d > 100) continue;
    return {
      tag: 'mixed.paren_order',
      prompt,
      answer: naturalHTML(ans),
      hint: '先算小括号、再算中括号，同一级从左往右，最后才做括号外的运算。',
      work: 'block',
    };
  }
  throw new Error('mixed.paren_order: 构造失败');
}

// ---------- 2. 分数与小数混合运算 ----------
// level 4：三项及以上、必含除法，如 (0.6 + 3/8) ÷ 3/4 − 0.35
function buildFracDec4(rng) {
  const decs = ['0.5', '0.25', '0.75', '0.4', '0.6', '0.8', '1.5', '2.5', '1.25', '0.35', '0.65', '0.125', '0.375', '1.2', '3.5'];
  const fracDens = [2, 3, 4, 5, 6, 8, 10, 12];
  for (let att = 0; att < 1200; att++) {
    const d1Str = rng.pick(decs);
    const d1 = Frac.fromDecimal(d1Str);
    const d2Str = rng.pick(decs);
    const d2 = Frac.fromDecimal(d2Str);
    const den1 = rng.pick(fracDens);
    const f1 = F(rng.int(1, den1 - 1), den1);
    const den2 = rng.pick(fracDens);
    const f2 = F(rng.int(1, den2 - 1), den2);
    if (f1.isInt() || f2.isInt()) continue;

    const kind = rng.pick(['sum_div_sub', 'div_plus_mul', 'sub_div_add']);
    let prompt, ans;
    if (kind === 'sum_div_sub') {
      // (d1 + f1) ÷ f2 − d2
      const T = d1.add(f1).div(f2);
      if (T.isNeg() || T.d > 100) continue;
      ans = T.sub(d2);
      prompt = `(${num(d1Str)} + ${fracHTML(f1)}) ÷ ${fracHTML(f2)} − ${num(d2Str)}`;
    } else if (kind === 'div_plus_mul') {
      // f1 ÷ d1 + d2 × f2
      const r1 = f1.div(d1);
      if (r1.d > 100) continue;
      ans = r1.add(d2.mul(f2));
      prompt = `${fracHTML(f1)} ÷ ${num(d1Str)} + ${num(d2Str)} × ${fracHTML(f2)}`;
    } else {
      // d1 − f1 ÷ f2 + d2（大数开头，中途不为负）
      const bigStr = rng.pick(['3.5', '4.5', '5.4', '6', '7.2', '8']);
      const big = Frac.fromDecimal(bigStr);
      const r = f1.div(f2);
      if (r.d > 100 || big.cmp(r) <= 0) continue;
      ans = big.sub(r).add(d2);
      prompt = `${num(bigStr)} − ${fracHTML(f1)} ÷ ${fracHTML(f2)} + ${num(d2Str)}`;
    }
    if (ans.isNeg() || ans.n === 0 || ans.d > 100) continue;
    return {
      tag: 'mixed.frac_dec_mixed',
      prompt,
      answer: naturalHTML(ans),
      hint: '除以分数先变乘倒数；分数小数混算时选好统一形式，再按先乘除后加减。',
      work: 'block',
    };
  }
  throw new Error('mixed.frac_dec_mixed: 构造失败');
}

function buildFracDec(rng, level) {
  if (level === 4) return buildFracDec4(rng);
  const decs = level === 3
    ? ['0.5', '0.2', '0.25', '0.4', '0.75', '1.5', '0.8', '2.5', '1.25', '0.125', '3.5']
    : ['0.5', '0.2', '0.25', '0.4', '0.75', '1.5', '0.8'];
  for (let att = 0; att < 500; att++) {
    const d1Str = rng.pick(decs);
    const d1 = Frac.fromDecimal(d1Str);
    const den1 = rng.pick([2, 3, 4, 5, 6, 8, 10]);
    const f1 = F(rng.int(1, den1 - 1), den1);
    const den2 = rng.pick([2, 4, 5, 8, 10, 3, 6]);
    const f2 = F(rng.int(1, den2 - 1), den2);
    if (f1.isInt() || f2.isInt()) continue;

    const kind = rng.pick(['f_plus_dxf', 'd_minus_fxd', 'fxd_plus_d']);
    let prompt, ans;
    if (kind === 'f_plus_dxf') {
      // 如 3/4 + 0.5 × 2/5
      ans = f1.add(d1.mul(f2));
      prompt = `${fracHTML(f1)} + ${num(d1Str)} × ${fracHTML(f2)}`;
    } else if (kind === 'd_minus_fxd') {
      const bigStr = level === 3 ? rng.pick(['4.5', '6', '5.4', '8', '7.2']) : rng.pick(['2', '3', '2.5', '4']);
      const big = Frac.fromDecimal(bigStr);
      ans = big.sub(f2.mul(d1));
      prompt = `${num(bigStr)} − ${fracHTML(f2)} × ${num(d1Str)}`;
    } else {
      const d2Str = rng.pick(decs);
      ans = f1.mul(d1).add(Frac.fromDecimal(d2Str));
      prompt = `${fracHTML(f1)} × ${num(d1Str)} + ${num(d2Str)}`;
    }
    if (ans.isNeg() || ans.n === 0 || ans.d > 100) continue;
    return {
      tag: 'mixed.frac_dec_mixed',
      prompt,
      answer: naturalHTML(ans),
      hint: '先把分数和小数统一成同一种表示，再按先乘除、后加减的顺序算。',
      work: 'block',
    };
  }
  throw new Error('mixed.frac_dec_mixed: 构造失败');
}

// ---------- 3. 分数三步连算（含括号，保证交叉约分机会） ----------
// level 4：四步连算，带分数参与，强制两处交叉约分
function buildMultiStepFrac4(rng) {
  const diffs = [F(1, 2), F(1, 3), F(2, 3), F(1, 4), F(3, 4), F(1, 6), F(5, 6), F(3, 8), F(2, 5), F(3, 5)];
  const muls = [F(5, 8), F(3, 4), F(2, 3), F(5, 6), F(4, 5), F(3, 5), F(7, 8), F(2, 5), F(3, 10), F(5, 9), F(4, 9), F(7, 10), F(9, 10), F(5, 12)];
  for (let att = 0; att < 1500; att++) {
    const diff = rng.pick(diffs);
    const denB = rng.pick([2, 3, 4, 5, 6, 8, 12]);
    const B = F(rng.int(1, denB - 1), denB);
    if (B.isInt()) continue;
    const A = B.add(diff).add(F(rng.int(1, 2))); // 保证 A 是带分数
    if (A.isInt() || A.d > 12 || A.cmp(F(1)) <= 0) continue;
    const diffAB = A.sub(B);

    const C = rng.pick(muls);
    const s1 = diffAB.div(C);
    if (s1.d > 12 || s1.n > 30) continue;
    const D = rng.pick(muls);
    const s2 = s1.mul(D);
    // 强制两处交叉约分
    const cross1 = gcd(diffAB.n, C.n) > 1 || gcd(diffAB.d, C.d) > 1;
    const cross2 = gcd(s1.n, D.d) > 1 || gcd(s1.d, D.n) > 1;
    if (!cross1 || !cross2) continue;
    if (s2.n === 0 || s2.d > 30) continue;

    // 第四步：再乘 / 加 / 减一个分数
    const E = rng.pick(muls);
    const tail = rng.pick(['mul', 'add', 'sub']);
    let ans, tailStr;
    if (tail === 'mul') { ans = s2.mul(E); tailStr = ` × ${fracHTML(E)}`; }
    else if (tail === 'add') { ans = s2.add(E); tailStr = ` + ${fracHTML(E)}`; }
    else { ans = s2.sub(E); tailStr = ` − ${fracHTML(E)}`; }
    if (ans.isNeg() || ans.n === 0 || ans.d > 30 || ans.cmp(F(10)) > 0) continue;

    return {
      tag: 'mixed.multi_step_frac',
      prompt: `(${fracHTML(A)} − ${fracHTML(B)}) ÷ ${fracHTML(C)} × ${fracHTML(D)}${tailStr}`,
      answer: fracHTML(ans),
      hint: '带分数先化假分数；除法变乘倒数后一路交叉约分，别急着通分。',
      work: 'block',
    };
  }
  throw new Error('mixed.multi_step_frac: 构造失败');
}

function buildMultiStepFrac(rng, level) {
  if (level === 4) return buildMultiStepFrac4(rng);
  const diffs = [F(1, 2), F(1, 3), F(2, 3), F(1, 4), F(3, 4), F(1, 6), F(5, 6), F(3, 8), F(2, 5), F(3, 5)];
  const muls = [F(5, 8), F(3, 4), F(2, 3), F(5, 6), F(4, 5), F(3, 5), F(7, 8), F(2, 5), F(3, 10), F(5, 9), F(4, 9), F(7, 10), F(9, 10), F(5, 12)];
  for (let att = 0; att < 800; att++) {
    const diff = rng.pick(diffs); // A − B 的干净差
    const denB = rng.pick([2, 3, 4, 5, 6, 8, 12]);
    const B = F(rng.int(1, denB - 1), denB);
    if (B.isInt()) continue;
    const A = B.add(diff);
    if (A.d > 12) continue;
    if (level === 3) { if (A.cmp(F(1)) <= 0) continue; } // level 3：A 是带分数
    else if (A.cmp(F(2)) >= 0) continue;

    const C = rng.pick(muls);
    const s1 = diff.div(C);
    if (s1.d > 12 || s1.n > 24) continue;
    const D = rng.pick(muls);
    const ans = s1.mul(D);
    // 至少一处交叉约分机会
    const cross1 = gcd(diff.n, C.n) > 1 || gcd(diff.d, C.d) > 1;
    const cross2 = gcd(s1.n, D.d) > 1 || gcd(s1.d, D.n) > 1;
    if (!cross1 && !cross2) continue;
    if (ans.n === 0 || ans.d > 30 || ans.cmp(F(8)) > 0) continue;

    return {
      tag: 'mixed.multi_step_frac',
      prompt: `(${fracHTML(A)} − ${fracHTML(B)}) ÷ ${fracHTML(C)} × ${fracHTML(D)}`,
      answer: fracHTML(ans),
      hint: '先算括号里的减法；除以分数变乘倒数，相乘前先交叉约分。',
      work: 'block',
    };
  }
  throw new Error('mixed.multi_step_frac: 构造失败');
}

// ---------- 4. 藏着简算结构的混合题 ----------
// level 4：更隐蔽的结构——裂项、双重分配、平方差口算
function buildSmartStructure4(rng) {
  const kind = rng.pick(['telescope', 'double_dist', 'sq_diff']);
  let prompt, ans, hint;

  if (kind === 'telescope') {
    // 1/(2×3) + 1/(3×4) + ... 裂项相消
    const p0 = rng.int(2, 6);
    const terms = rng.int(3, 4);
    const parts = [];
    let sum = F(0);
    for (let i = 0; i < terms; i++) {
      const p = p0 + i;
      parts.push(`<span class="frac"><span class="fn">1</span><span class="fd">${p}×${p + 1}</span></span>`);
      sum = sum.add(F(1, p * (p + 1)));
    }
    ans = F(1, p0).sub(F(1, p0 + terms));
    if (!ans.eq(sum)) throw new Error('mixed.smart_structure: 裂项校验失败');
    prompt = parts.join(' + ');
    hint = '每个分数都能拆成两个单位分数的差（裂项），中间项会成对抵消。';
  } else if (kind === 'double_dist') {
    // a×b + a×c − a×d，b+c−d 凑整
    const R = rng.pick([10, 100]);
    const a = oneDec(rng, 1, 9);
    const lo = Math.ceil(R / 2), hi = R - 1;
    const b = oneDec(rng, lo, hi);
    const c = oneDec(rng, lo, hi);
    const d = b.add(c).sub(F(R)); // b + c − d = R，且 d > 0
    if (d.n <= 0) return buildSmartStructure4(rng);
    ans = a.mul(F(R));
    prompt = `${num(dstr(a))} × ${num(dstr(b))} + ${num(dstr(a))} × ${num(dstr(c))} − ${num(dstr(a))} × ${num(dstr(d))}`;
    hint = '三项都有同一个乘数，逆用分配律：先算括号里 b + c − d 能不能凑整。';
  } else {
    // 平方差口算：99×101 = (100−1)(100+1)
    const n = rng.pick([40, 50, 60, 70, 80, 90, 100]);
    const k = rng.int(1, 3);
    ans = F(n * n - k * k);
    prompt = `${num(n - k)} × ${num(n + k)}`;
    hint = `两个乘数关于 ${n} 对称：(${n}−${k})×(${n}+${k}) = ${n}×${n} − ${k}×${k}。`;
  }
  return {
    tag: 'mixed.smart_structure',
    prompt,
    answer: naturalHTML(ans),
    hint,
    work: 'block',
  };
}

function buildSmartStructure(rng, level) {
  if (level === 4) return buildSmartStructure4(rng);
  const kinds = level === 3
    ? ['dist_add', 'unit_frac', 'times99', 'dist_sub']
    : ['dist_add', 'unit_frac', 'times99'];
  const kind = rng.pick(kinds);
  let prompt, ans;

  if (kind === 'dist_add') {
    // a×b + a×c，b+c 凑整（如 4.8×3.5 + 4.8×6.5）
    const a = oneDec(rng, 1, level === 3 ? 9 : 8);
    const R = rng.pick(level === 3 ? [10, 100] : [10]);
    const b = oneDec(rng, 1, R - 2);
    const c = F(R, 1).sub(b);
    ans = a.mul(F(R));
    prompt = `${num(dstr(a))} × ${num(dstr(b))} + ${num(dstr(a))} × ${num(dstr(c))}`;
  } else if (kind === 'dist_sub') {
    // a×b − a×c，b−c = 10
    const a = oneDec(rng, 1, 9);
    const c = oneDec(rng, 1, 9);
    const b = c.add(F(10));
    ans = a.mul(F(10));
    prompt = `${num(dstr(a))} × ${num(dstr(b))} − ${num(dstr(a))} × ${num(dstr(c))}`;
  } else if (kind === 'unit_frac') {
    // (1/p ± 1/q) × L，L 为公分母的倍数（如 (1/4+1/6)×12）
    const [p, q] = rng.pick([[2, 3], [3, 4], [2, 5], [4, 5], [5, 6], [3, 8], [2, 7], [3, 7], [4, 6]]);
    const m = rng.int(1, level === 3 ? 4 : 2);
    const L = lcm(p, q) * m;
    const minus = rng.chance(0.35); // p<q 时 1/p − 1/q 仍为正
    ans = minus ? F(L, p).sub(F(L, q)) : F(L, p).add(F(L, q));
    prompt = `(${fracHTML(F(1, p))} ${minus ? '−' : '+'} ${fracHTML(F(1, q))}) × ${num(L)}`;
  } else {
    // a×101 − a 或 a×99 + a
    const a = oneDec(rng, 1, 9);
    const over = rng.chance(0.5);
    ans = a.mul(F(100));
    prompt = over
      ? `${num(dstr(a))} × ${num(101)} − ${num(dstr(a))}`
      : `${num(dstr(a))} × ${num(99)} + ${num(dstr(a))}`;
  }
  return {
    tag: 'mixed.smart_structure',
    prompt,
    answer: naturalHTML(ans),
    hint: '先看结构再动笔：能不能逆用分配律或把两个数凑成整十整百？',
    work: 'block',
  };
}

// ---------- 5. 先估算后精算 ----------
// level 4：数值上到五位数，或三位小数的乘数
function buildEstimate4(rng) {
  for (let att = 0; att < 800; att++) {
    const kind = rng.pick(['five_digit', 'three_dec']);
    if (kind === 'five_digit') {
      // 四位数 × 一位小数 − 千位数，积达五位数
      const base = rng.pick([2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]);
      const A = base + rng.pick([-3, -2, -1, 1, 2, 3]);
      const n = rng.int(3, 9);
      const B = rng.chance(0.5) ? F(n * 10 - 1, 10) : F(n * 10 + 1, 10); // n.9 / n.1
      const roundCs = [1000, 2000, 3000].filter((r) => base * n - r >= 1000);
      if (!roundCs.length) continue;
      const roundC = rng.pick(roundCs);
      const C = roundC + rng.pick([-9, -7, -5, -3, -2, -1, 1, 2, 3, 5, 7, 9]);
      const exact = F(A).mul(B).sub(F(C));
      if (exact.isNeg() || exact.n === 0 || exact.d > 100) continue;
      const est = base * n - roundC;
      return {
        tag: 'mixed.estimate_check',
        prompt: `先估算结果大约是多少，再精确计算：${num(A)} × ${num(dstr(B))} − ${num(C)}`,
        answer: naturalHTML(exact),
        hint: `估算参照：把 ${A} 看作 ${base}、${dstr(B)} 看作 ${n}、${C} 看作 ${roundC}，大约是 ${est}，精确值应在它附近。`,
        work: 'block',
      };
    }
    // 两位偶数 × 三位小数 − 接近整数的小数
    const tens = rng.pick([30, 40, 50, 60, 70, 80, 90]);
    const A = tens + rng.pick([-4, -2, 2, 4]); // 偶数，保证精确值不超两位小数
    const n = rng.int(3, 9);
    const B = rng.chance(0.5) ? F(n * 1000 - 5, 1000) : F(n * 1000 + 5, 1000); // n.995 / n.005
    const roundCs = [50, 100, 150, 200].filter((r) => tens * n - r >= 20);
    if (!roundCs.length) continue;
    const roundC = rng.pick(roundCs);
    const C = Frac.fromDecimal(String(roundC)).add(F(rng.pick([-25, -15, -5, 5, 15, 25]), 10));
    if (C.isNeg()) continue;
    const exact = F(A).mul(B).sub(C);
    if (exact.isNeg() || exact.n === 0 || exact.d > 100) continue;
    const est = tens * n - roundC;
    return {
      tag: 'mixed.estimate_check',
      prompt: `先估算结果大约是多少，再精确计算：${num(A)} × ${num(dstr(B))} − ${num(dstr(C))}`,
      answer: naturalHTML(exact),
      hint: `估算参照：把 ${A} 看作 ${tens}、${dstr(B)} 看作 ${n}、${dstr(C)} 看作 ${roundC}，大约是 ${est}，精确值应在它附近。`,
      work: 'block',
    };
  }
  throw new Error('mixed.estimate_check: 构造失败');
}

function buildEstimate(rng, level) {
  if (level === 4) return buildEstimate4(rng);
  for (let att = 0; att < 500; att++) {
    const base = rng.pick(level === 3 ? [200, 300, 400, 500] : [100, 200, 300]);
    const A = base + rng.pick([-3, -2, -1, 1, 2, 3]);
    const n = rng.int(2, level === 3 ? 7 : 5);
    const B = rng.chance(0.5) ? F(n * 10 - 1, 10) : F(n * 10 + 1, 10); // n.9 / n.1 → 都看作 n
    const roundCs = [100, 200, 300].filter((r) => base * n - r >= 100);
    if (!roundCs.length) continue;
    const roundC = rng.pick(roundCs);
    const C = roundC + rng.pick([-5, -4, -3, -2, -1, 1, 2, 3, 4, 5]);
    const exact = F(A).mul(B).sub(F(C));
    if (exact.isNeg() || exact.n === 0) continue;
    const est = base * n - roundC;
    return {
      tag: 'mixed.estimate_check',
      prompt: `先估算结果大约是多少，再精确计算：${num(A)} × ${num(dstr(B))} − ${num(C)}`,
      answer: naturalHTML(exact),
      hint: `估算参照：把 ${A} 看作 ${base}、${dstr(B)} 看作 ${n}、${C} 看作 ${roundC}，大约是 ${est}，精确值应在它附近。`,
      work: 'block',
    };
  }
  throw new Error('mixed.estimate_check: 构造失败');
}

// ---------- 出题入口 ----------
export function generate(rng, level, count = 5) {
  const builders = [buildParenOrder, buildFracDec, buildMultiStepFrac, buildSmartStructure, buildEstimate];
  const plan = builders.slice();
  while (plan.length < count) plan.push(rng.pick(builders));

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
