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
function buildParenOrder(rng, level) {
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
function buildFracDec(rng, level) {
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
function buildMultiStepFrac(rng, level) {
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
function buildSmartStructure(rng, level) {
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
function buildEstimate(rng, level) {
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
