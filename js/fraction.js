// 精确有理数运算 + 数学排版渲染。
// 所有生成器一律用 Frac 计算答案，保证参考答案零差错。

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export class Frac {
  constructor(n, d = 1) {
    if (d === 0) throw new Error('denominator 0');
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d);
    this.n = n / g;
    this.d = d / g;
  }
  static fromDecimal(x) {
    // 通过字符串精确转换，避免浮点误差（支持最多 6 位小数）
    const s = String(x);
    if (!s.includes('.')) return new Frac(Number(s), 1);
    const [i, f] = s.split('.');
    const d = 10 ** f.length;
    const sign = s.startsWith('-') ? -1 : 1;
    return new Frac(sign * (Math.abs(Number(i)) * d + Number(f)), d);
  }
  add(o) { return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Frac(this.n * o.n, this.d * o.d); }
  div(o) {
    if (o.n === 0) throw new Error('divide by zero');
    return new Frac(this.n * o.d, this.d * o.n);
  }
  neg() { return new Frac(-this.n, this.d); }
  cmp(o) { return this.n * o.d - o.n * this.d; }
  eq(o) { return this.cmp(o) === 0; }
  isInt() { return this.d === 1; }
  isNeg() { return this.n < 0; }
  toNumber() { return this.n / this.d; }
  // 是否能写成有限小数
  isFiniteDecimal() {
    let d = this.d;
    while (d % 2 === 0) d /= 2;
    while (d % 5 === 0) d /= 5;
    return d === 1;
  }
  // 有限小数字符串（保证精确）
  toDecimalString() {
    if (!this.isFiniteDecimal()) throw new Error('not finite decimal');
    let shift = 0, d = this.d;
    while (d % 2 === 0) { d /= 2; shift++; }
    let shift5 = 0;
    while (d % 5 === 0) { d /= 5; shift5++; }
    const places = Math.max(shift, shift5);
    const scaled = this.n * (10 ** places) / this.d;
    const sign = scaled < 0 ? '-' : '';
    const abs = Math.abs(Math.round(scaled));
    if (places === 0) return sign + abs;
    const s = String(abs).padStart(places + 1, '0');
    const int = s.slice(0, -places);
    const frac = s.slice(-places).replace(/0+$/, '');
    return frac ? `${sign}${int}.${frac}` : sign + int;
  }
}

export const F = (n, d = 1) => new Frac(n, d);

// ---------- 渲染 ----------

// 真分数/带分数 HTML（打印与屏幕共用同一结构，样式在 CSS 中控制）
export function fracHTML(fr, { mixed = true } = {}) {
  if (fr.isInt()) return `<span class="num">${fr.n}</span>`;
  const sign = fr.isNeg() ? '−' : '';
  const n = Math.abs(fr.n), d = fr.d;
  if (mixed && n > d) {
    const whole = Math.floor(n / d);
    const rem = n % d;
    return `<span class="num">${sign}${whole}</span><span class="frac"><span class="fn">${rem}</span><span class="fd">${d}</span></span>`;
  }
  return `${sign}<span class="frac"><span class="fn">${n}</span><span class="fd">${d}</span></span>`;
}

// 假分数形式（不转带分数）
export function improperHTML(fr) { return fracHTML(fr, { mixed: false }); }

// 值的“最自然”展示：整数→整数；有限小数且来自小数语境→小数；否则分数（带分数）
export function valueHTML(fr, prefer = 'frac') {
  if (fr.isInt()) return `<span class="num">${fr.n}</span>`;
  if (prefer === 'decimal' && fr.isFiniteDecimal()) {
    return `<span class="num">${fr.toDecimalString()}</span>`;
  }
  return fracHTML(fr);
}

export function decimalHTML(fr) { return valueHTML(fr, 'decimal'); }

// 百分数显示
export function percentHTML(fr) {
  const p = fr.mul(F(100));
  const body = p.isFiniteDecimal() ? p.toDecimalString() : null;
  if (body !== null) return `<span class="num">${body}%</span>`;
  return `${fracHTML(p)}<span class="num">%</span>`;
}

// 比显示 a:b（最简整数比）
export function ratioHTML(fr) {
  return `<span class="num">${Math.abs(fr.n)} : ${fr.d}</span>`;
}
