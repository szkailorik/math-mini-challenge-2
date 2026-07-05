// 表征互通：分数·小数·百分数·比 的互化与比较（每卷 6 题，六类各一）
import { Frac, F, gcd, fracHTML, improperHTML, decimalHTML, percentHTML, ratioHTML } from '../fraction.js';

const rawFrac = (n, d) =>
  `<span class="frac"><span class="fn">${n}</span><span class="fd">${d}</span></span>`;

function q(tag, prompt, answer, hint) {
  return { tag, prompt, answer, hint, work: 'lines' };
}

// 1. 一条链互化：给一种表示，补齐其余三种
function chainQ(rng, level) {
  const pool = level >= 3
    ? [[1, 8], [3, 8], [5, 8], [7, 8], [3, 16], [9, 16], [11, 20], [9, 40], [13, 40], [21, 40], [6, 25], [9, 25]]
    : [[1, 4], [3, 4], [2, 5], [3, 5], [4, 5], [1, 2], [3, 10], [7, 10], [9, 10], [3, 20], [7, 20], [1, 5]];
  const fr = F(...rng.pick(pool));
  const reps = {
    frac:  { name: '最简分数',   html: fracHTML(fr) },
    dec:   { name: '小数',       html: decimalHTML(fr) },
    pct:   { name: '百分数',     html: percentHTML(fr) },
    ratio: { name: '最简整数比', html: ratioHTML(fr) },
  };
  const keys = ['frac', 'dec', 'pct', 'ratio'];
  const given = rng.pick(keys);
  const others = keys.filter(k => k !== given);
  return q('bridge.chain',
    `把 ${reps[given].html} 写成${others.map(k => reps[k].name).join('、')}。`,
    others.map(k => `${reps[k].name} ${reps[k].html}`).join('；'),
    '先化成最简分数，再转出其余表示');
}

// 2. 三种表示比大小
function compareQ(rng, level) {
  // 全部选“化不成有限小数”的分数，保证与小数、百分数严格不等
  const pool = level >= 3
    ? [[2, 3], [5, 6], [3, 7], [4, 7], [5, 9], [7, 9], [5, 12], [7, 12], [2, 7]]
    : [[2, 3], [1, 3], [5, 6], [1, 6], [3, 7], [5, 9], [2, 9]];
  const fr = F(...rng.pick(pool));
  const base = Math.round(fr.toNumber() * 100);
  const near = level >= 3 ? [-1, 1, -2, 2] : [-3, -2, 2, 3];
  const dOff = rng.pick(near);
  const pOff = rng.pick(near.filter(x => x !== dOff));
  const dec = F(base + dOff, 100);
  const pct = F(base + pOff, 100);
  const items = [
    { fr, html: fracHTML(fr) },
    { fr: dec, html: `<span class="num">${dec.toDecimalString()}</span>` },
    { fr: pct, html: percentHTML(pct) },
  ];
  const shown = rng.shuffle(items);
  const sorted = items.slice().sort((x, y) => x.fr.cmp(y.fr));
  return q('bridge.compare',
    `把下面三个数从小到大排列：${shown.map(x => x.html).join('、')}`,
    sorted.map(x => x.html).join(' ＜ '),
    '先统一成同一种表示再比');
}

// 3. 分母 8/16/25/40 的精确基准转换
function baselineQ(rng, level) {
  const d = rng.pick(level >= 3 ? [16, 40, 16, 40, 8, 25] : [8, 25, 8, 25]);
  let n = rng.int(1, d - 1);
  for (let t = 0; t < 100 && gcd(n, d) !== 1; t++) n = rng.int(1, d - 1);
  if (gcd(n, d) !== 1) n = 1;
  const fr = F(n, d);
  return q('bridge.baseline',
    `把 ${fracHTML(fr)} 化成小数和百分数。`,
    `${decimalHTML(fr)}，${percentHTML(fr)}`,
    '分母是 8、16、25、40 的分数都能化成有限小数');
}

// 4. 求一个数的百分之几（level 2 正向）/ 已知百分之几求整体（level 3 反向）
function percentOfQ(rng, level) {
  const p = rng.pick([15, 25, 35, 45, 55, 65, 75, 85, 20, 30, 40, 60, 80, 95]);
  const whole = rng.int(3, level >= 3 ? 45 : 30) * 20;
  const part = F(whole).mul(F(p, 100)); // 整数（whole 是 20 的倍数，p 是 5 的倍数）
  if (level >= 3) {
    return q('bridge.percent_of',
      `某数的 ${p}% 是 ${part.toDecimalString()}，这个数是多少？`,
      decimalHTML(part.div(F(p, 100))),
      '已知部分求整体：部分 ÷ 百分率');
  }
  return q('bridge.percent_of',
    `${whole} 的 ${p}% 是多少？`,
    decimalHTML(part),
    '求一个数的百分之几，用乘法');
}

// 5. 化简比并求比值（跨表示）
function ratioSimplifyQ(rng, level) {
  const bPool = level >= 3
    ? [[5, 8], [3, 8], [7, 10], [5, 4], [3, 2], [7, 8], [9, 10], [3, 4]]
    : [[3, 4], [2, 5], [1, 4], [4, 5], [1, 2], [7, 10], [3, 5]];
  const rPool = [[6, 5], [3, 2], [2, 3], [5, 4], [4, 5], [1, 2], [2, 1], [3, 4], [5, 6], [5, 2], [3, 1]];
  for (let t = 0; t < 400; t++) {
    const b = F(...rng.pick(bPool));
    const r0 = F(...rng.pick(rPool));
    const a = b.mul(r0); // 反推另一边
    if (!a.isFiniteDecimal() || a.eq(b) || a.cmp(F(10)) > 0) continue;
    const aStr = a.toDecimalString();
    if ((aStr.split('.')[1] || '').length > 2) continue;
    // 随机决定小数在前还是分数在前
    const decFirst = rng.chance(0.5);
    const first = decFirst ? `${aStr}` : improperHTML(b);
    const second = decFirst ? improperHTML(b) : `${aStr}`;
    const ratio = decFirst ? a.div(b) : b.div(a);
    return q('bridge.ratio_simplify',
      `化简比并求比值：${first} : ${second}`,
      `${ratioHTML(ratio)}，比值 ${improperHTML(ratio)}`,
      '先把两边统一成分数（或小数），再化成最简整数比');
  }
  const fb = F(5, 8), fa = F(3, 4); // 0.75 : 5/8 兜底
  const ratio = fa.div(fb);
  return q('bridge.ratio_simplify',
    `化简比并求比值：0.75 : ${improperHTML(fb)}`,
    `${ratioHTML(ratio)}，比值 ${improperHTML(ratio)}`,
    '先把两边统一成分数（或小数），再化成最简整数比');
}

// 6. 能否化成有限小数（level 3 需先约分的“陷阱”分数）
function oddPart(d) { let x = d; while (x % 2 === 0) x /= 2; while (x % 5 === 0) x /= 5; return x; }
function smallestPrime(x) { for (let p = 2; p * p <= x; p++) if (x % p === 0) return p; return x; }

function repeatingQ(rng, level) {
  let rawN, rawD;
  if (level >= 3) { // 未约分的分数：先约分再判断
    [rawN, rawD] = rng.pick([
      [9, 24], [15, 24], [21, 28], [14, 35], [6, 15], [22, 55], [18, 48], [24, 64],
      [10, 24], [12, 27], [15, 36], [14, 24], [10, 45], [21, 56],
    ]);
  } else { // 最简分数直接判断
    [rawN, rawD] = rng.pick([
      [3, 8], [7, 20], [5, 6], [7, 25], [5, 12], [9, 40], [2, 3], [11, 20],
      [5, 9], [3, 16], [4, 7], [7, 8], [13, 25], [5, 18],
    ]);
  }
  const fr = F(rawN, rawD); // 自动约分
  const simplified = fr.d !== rawD;
  const can = fr.isFiniteDecimal();
  const head = simplified ? `先约分：${rawFrac(rawN, rawD)} = ${fracHTML(fr)}；` : '';
  const answer = can
    ? `能。${head}分母 ${fr.d} 只含质因数 2 和 5，${fracHTML(fr)} = ${decimalHTML(fr)}`
    : `不能。${head}分母 ${fr.d} 含质因数 ${smallestPrime(oddPart(fr.d))}（不只 2 和 5）`;
  return q('bridge.repeating',
    `判断：${rawFrac(rawN, rawD)} 能化成有限小数吗？说明理由。`,
    answer,
    simplified ? '先约分成最简分数，再看分母的质因数' : '最简分数的分母只含质因数 2 和 5 ⇔ 能化成有限小数');
}

export function generate(rng, level, count) {
  const kinds = [chainQ, compareQ, baselineQ, percentOfQ, ratioSimplifyQ, repeatingQ];
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
