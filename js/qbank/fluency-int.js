// 地基层题模 · 整数事实（6 技能点）
// 纯整数运算，不依赖 Frac；出题严格按 .superpowers/sdd/task-4-brief.md 的参数表。
import { defineQModel } from '../engine/qmodel.js';

// —— add20.carry: a∈[3,9], b∈[11−a,9]（必进位）——
function genAdd20(rng) {
  const a = rng.int(3, 9);
  const b = rng.int(11 - a, 9);
  return { a, b };
}

const add20carry = defineQModel({
  id: 'add20.carry',
  skill: 'add20',
  tier: 'core',
  bugs: ['oral.carry_forget'],
  traps: [],
  generate(rng) {
    const { a, b } = genAdd20(rng);
    return { prompt: `${a} + ${b} =`, answer: String(a + b), hint: '凑十法', work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const { a, b } = genAdd20(rng);
      const s = a + b;
      if (rng.chance(0.5)) return { prompt: `( ) + ${b} = ${s}`, answer: String(a), hint: '凑十法', work: 'inline' };
      return { prompt: `${a} + ( ) = ${s}`, answer: String(b), hint: '凑十法', work: 'inline' };
    }
    return this.generate(rng);
  },
});

// —— sub20.borrow: 差d∈[3,9], a=d+b, a∈[11,18], b 保证必退位 ——
function genSub20(rng) {
  const d = rng.int(3, 9);
  const lo = Math.max(2, 11 - d);
  const hi = Math.min(9, 18 - d);
  const b = rng.int(lo, hi);
  const a = d + b;
  return { a, b, d };
}

const sub20borrow = defineQModel({
  id: 'sub20.borrow',
  skill: 'sub20',
  tier: 'core',
  bugs: ['oral.borrow_forget', 'int.borrow_chain'],
  traps: [],
  generate(rng) {
    const { a, b, d } = genSub20(rng);
    return { prompt: `${a} − ${b} =`, answer: String(d), hint: '想加算减', work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const { a, b, d } = genSub20(rng);
      if (rng.chance(0.5)) return { prompt: `( ) − ${b} = ${d}`, answer: String(a), hint: '想加算减', work: 'inline' };
      return { prompt: `${a} − ( ) = ${d}`, answer: String(b), hint: '想加算减', work: 'inline' };
    }
    return this.generate(rng);
  },
});

// —— mult_table.core: a,b∈[2,9]，30% 概率出 "a×( )=ab" 填空 ——
const multTableCore = defineQModel({
  id: 'mult_table.core',
  skill: 'mult_table',
  tier: 'core',
  bugs: ['oral.table_row_jump', 'oral.table_misread'],
  traps: [],
  generate(rng) {
    const a = rng.int(2, 9), b = rng.int(2, 9), ab = a * b;
    if (rng.chance(0.3)) {
      return { prompt: `${a} × ( ) = ${ab}`, answer: String(b), hint: '想乘法口诀', work: 'inline' };
    }
    return { prompt: `${a} × ${b} =`, answer: String(ab), hint: '想乘法口诀', work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const a = rng.int(2, 9), b = rng.int(2, 9), ab = a * b;
      if (rng.chance(0.5)) return { prompt: `( ) × ${b} = ${ab}`, answer: String(a), hint: '想乘法口诀', work: 'inline' };
      return { prompt: `${a} × ( ) = ${ab}`, answer: String(b), hint: '想乘法口诀', work: 'inline' };
    }
    return this.generate(rng);
  },
});

// —— div_table.core: b,q∈[2,9], a=b×q ——
const divTableCore = defineQModel({
  id: 'div_table.core',
  skill: 'div_table',
  tier: 'core',
  bugs: ['oral.table_misread'],
  traps: [],
  generate(rng) {
    const b = rng.int(2, 9), q = rng.int(2, 9), a = b * q;
    return { prompt: `${a} ÷ ${b} =`, answer: String(q), hint: '想乘法口诀试商', work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const b = rng.int(2, 9), q = rng.int(2, 9), a = b * q;
      if (rng.chance(0.5)) return { prompt: `( ) ÷ ${b} = ${q}`, answer: String(a), hint: '想乘法口诀', work: 'inline' };
      return { prompt: `${a} ÷ ( ) = ${q}`, answer: String(b), hint: '想乘法口诀', work: 'inline' };
    }
    return this.generate(rng);
  },
});

// —— add100.mixed: 50% 两位+两位不进位 / 30% 进位 / 20% 整十+两位 ——
function add100NoCarry(rng) {
  const tensA = rng.int(1, 8);
  const onesA = rng.int(0, 9);
  const onesB = rng.int(0, Math.max(0, 9 - onesA));
  const maxTensB = Math.max(1, 9 - tensA);
  const tensB = rng.int(1, maxTensB);
  return { a: tensA * 10 + onesA, b: tensB * 10 + onesB };
}
function add100Carry(rng) {
  const tensA = rng.int(1, 7);
  const maxTensB = Math.max(1, 8 - tensA);
  const tensB = rng.int(1, maxTensB);
  const onesA = rng.int(1, 9);
  const onesB = rng.int(10 - onesA, 9);
  return { a: tensA * 10 + onesA, b: tensB * 10 + onesB };
}
function add100RoundTen(rng) {
  const round = rng.pick([10, 20, 30, 40, 50, 60, 70, 80]);
  const other = rng.int(10, 99 - round);
  return rng.chance(0.5) ? { a: round, b: other } : { a: other, b: round };
}
function genAdd100(rng) {
  if (rng.chance(0.5)) return add100NoCarry(rng);
  if (rng.chance(0.6)) return add100Carry(rng);
  return add100RoundTen(rng);
}

const add100mixed = defineQModel({
  id: 'add100.mixed',
  skill: 'add100',
  tier: 'core',
  bugs: ['oral.carry_forget', 'int.carry_chain'],
  traps: [],
  generate(rng) {
    const { a, b } = genAdd100(rng);
    return { prompt: `${a} + ${b} =`, answer: String(a + b), hint: '满十进一', work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const { a, b } = genAdd100(rng);
      const s = a + b;
      if (rng.chance(0.5)) return { prompt: `( ) + ${b} = ${s}`, answer: String(a), hint: '满十进一', work: 'inline' };
      return { prompt: `${a} + ( ) = ${s}`, answer: String(b), hint: '满十进一', work: 'inline' };
    }
    return this.generate(rng);
  },
});

// —— sub100.borrow: a∈[31,99], b∈[12,a−10]，个位 b>a（必退位）——
function genSub100(rng) {
  const onesA = rng.int(1, 8);
  const onesB = rng.int(onesA + 1, 9);
  const tensB = rng.int(1, 6);
  const tensA = tensB + rng.int(2, 9 - tensB);
  const a = tensA * 10 + onesA;
  const b = tensB * 10 + onesB;
  return { a, b };
}

const sub100borrow = defineQModel({
  id: 'sub100.borrow',
  skill: 'sub100',
  tier: 'core',
  bugs: ['oral.borrow_forget', 'int.borrow_chain'],
  traps: [],
  generate(rng) {
    const { a, b } = genSub100(rng);
    return { prompt: `${a} − ${b} =`, answer: String(a - b), hint: '退位减法', work: 'inline' };
  },
  variant(rng, bugId, level) {
    if (level === 'L3') {
      const { a, b } = genSub100(rng);
      const d = a - b;
      if (rng.chance(0.5)) return { prompt: `( ) − ${b} = ${d}`, answer: String(a), hint: '退位减法', work: 'inline' };
      return { prompt: `${a} − ( ) = ${d}`, answer: String(b), hint: '退位减法', work: 'inline' };
    }
    return this.generate(rng);
  },
});

export const MODELS = [add20carry, sub20borrow, multTableCore, divTableCore, add100mixed, sub100borrow];
