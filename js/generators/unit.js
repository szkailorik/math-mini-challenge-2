// 单位·率·关系：换算链 / 速度单价工效 / 折扣税率 / 平均数与按比分配（每卷 4 题，四类各一）
import { Frac, F, valueHTML, decimalHTML } from '../fraction.js';

const D = Frac.fromDecimal;

function q(tag, prompt, answer, hint) {
  return { tag, prompt, answer, hint, work: 'lines' };
}

// 1. 复合单位换算链（构造保证有限小数）
function convertQ(rng, level) {
  const v = rng.int(1, 4);
  if (v === 1) { // km ↔ m
    const m = rng.int(105, level >= 3 ? 985 : 685) * 10; // 1050 ~ 9850
    const km = F(m, 1000);
    if (level >= 3 && rng.chance(0.5)) {
      return q('unit.convert', `${m} m = ___ km`, `${km.toDecimalString()} km`,
        '除以进率 1000，小数点左移三位');
    }
    return q('unit.convert', `${km.toDecimalString()} km = ___ m`, `${m} m`,
      '乘进率 1000，小数点右移三位');
  }
  if (v === 2) { // 时 + 分 → 小数小时
    const h = rng.int(1, level >= 3 ? 8 : 5);
    const min = rng.pick([6, 12, 15, 18, 24, 30, 36, 45, 48, 54]);
    const total = F(h).add(F(min, 60));
    return q('unit.convert', `${h} 小时 ${min} 分 = ___ 小时`,
      `${total.toDecimalString()} 小时`,
      '分化小时要除以 60，不是除以 100');
  }
  if (v === 3) { // mL → L
    const ml = rng.int(24, level >= 3 ? 196 : 120) * 25; // 600 ~ 4900
    const L = F(ml, 1000);
    return q('unit.convert', `${ml} mL = ___ L`, `${L.toDecimalString()} L`,
      '毫升化升除以 1000');
  }
  // kg ↔ g
  const g = rng.int(105, level >= 3 ? 985 : 685) * 10;
  const kg = F(g, 1000);
  return q('unit.convert', `${kg.toDecimalString()} kg = ___ g`, `${g} g`,
    '千克化克乘 1000');
}

// 2. 速度 / 单价 / 工效
function speedQ(rng, level) {
  const v = rng.int(1, 3);
  if (v === 1) { // 速度
    const sp = rng.int(42, level >= 3 ? 118 : 96);
    const t = rng.pick(level >= 3 ? [1.5, 2.5, 3.5, 4.5, 5.5] : [1.5, 2.5, 3.5, 2, 3, 4]);
    const dist = F(sp).mul(D(t));
    if (level >= 3 && rng.chance(0.5)) { // 反向：求时间
      return q('unit.speed',
        `一辆汽车每小时行 ${sp} km，行驶 ${dist.toDecimalString()} km 需要多少小时？`,
        `${D(t).toDecimalString()} 小时`,
        '时间 = 路程 ÷ 速度');
    }
    return q('unit.speed',
      `一辆汽车 ${D(t).toDecimalString()} 小时行驶 ${dist.toDecimalString()} km，平均每小时行多少 km？`,
      `${valueHTML(F(sp))} km`,
      '速度 = 路程 ÷ 时间');
  }
  if (v === 2) { // 单价
    const unit = rng.int(4, level >= 3 ? 24 : 15);
    const qty = rng.pick([1.5, 2.5, 3.5, 4.5, 0.5, 2, 4]);
    const total = F(unit).mul(D(qty));
    return q('unit.speed',
      `买 ${D(qty).toDecimalString()} kg 苹果共花 ${total.toDecimalString()} 元，每千克多少元？`,
      `${valueHTML(F(unit))} 元`,
      '单价 = 总价 ÷ 数量');
  }
  // 工效
  const rate = rng.int(12, level >= 3 ? 65 : 45);
  const t = rng.int(2, 6);
  const total = rate * t;
  return q('unit.speed',
    `一台打印机 ${t} 分钟打印 ${total} 页，平均每分钟打印多少页？`,
    `${valueHTML(F(total).div(F(t)))} 页`,
    '工效 = 工作总量 ÷ 时间');
}

// 3. 折扣 / 税率
const ZHE = { 6: '六', 6.5: '六五', 7: '七', 7.5: '七五', 8: '八', 8.5: '八五', 9: '九', 9.5: '九五' };

function discountQ(rng, level) {
  if (rng.chance(0.35)) { // 税率
    const p = rng.pick([3, 4, 5, 6]);
    const amt = rng.int(level >= 3 ? 30 : 12, level >= 3 ? 95 : 60) * 100;
    const tax = F(amt).mul(F(p, 100)); // 整数
    return q('unit.discount_tax',
      `某店本月营业额 ${amt} 元，按 ${p}% 缴纳营业税，应缴税款多少元？`,
      `${valueHTML(tax)} 元`,
      '税款 = 营业额 × 税率');
  }
  const z = rng.pick(level >= 3 ? [6, 6.5, 7, 7.5, 8, 8.5] : [7, 7.5, 8, 8.5, 9]);
  const orig = rng.int(6, level >= 3 ? 45 : 25) * 20; // 20 的倍数 → 折后价必为整数
  const sale = F(orig).mul(F(z * 10, 100));
  if (level >= 3) { // 反向：已知折后价求原价
    return q('unit.discount_tax',
      `某商品打${ZHE[z]}折后售价 ${sale.toDecimalString()} 元，原价是多少元？`,
      `${valueHTML(F(orig))} 元`,
      '原价 = 折后价 ÷ 折扣率');
  }
  return q('unit.discount_tax',
    `原价 ${orig} 元的商品打${ZHE[z]}折，现价多少元？`,
    `${valueHTML(sale)} 元`,
    `打${ZHE[z]}折就是按原价的 ${z * 10}% 计算`);
}

// 4. 平均数 / 按比分配
function averageQ(rng, level) {
  if (rng.chance(0.5)) { // 按比分配
    const [a, b] = rng.pick([[4, 5], [2, 3], [3, 5], [2, 7], [3, 4], [5, 7], [1, 4]]);
    const k = rng.int(9, level >= 3 ? 48 : 30);
    const total = (a + b) * k;
    const item = rng.pick([['本书', '本'], ['支铅笔', '支'], ['个乒乓球', '个']]);
    const shareA = F(total).mul(F(a, a + b));
    const shareB = F(total).mul(F(b, a + b));
    return q('unit.average_rate',
      `把 ${total} ${item[0]}按 ${a} : ${b} 分给两个班，两个班各得多少${item[1]}？`,
      `${valueHTML(shareA)} ${item[1]}和 ${valueHTML(shareB)} ${item[1]}`,
      '按比分配：先求总份数，再算每份');
  }
  // 平均数（构造保证整数）
  const avg3 = rng.int(78, 92);
  const delta = rng.int(1, 2);
  const f4 = avg3 + 4 * delta; // 保证四次平均为整数
  const avg4 = F(3 * avg3 + f4, 4);
  if (level >= 3) { // 反向：求第 4 次成绩
    return q('unit.average_rate',
      `小雨前 3 次测验平均 ${avg3} 分，要使 4 次平均达到 ${avg4.toDecimalString()} 分，第 4 次要考多少分？`,
      `${valueHTML(avg4.mul(F(4)).sub(F(3 * avg3)))} 分`,
      '先算 4 次总分，再减前 3 次总分');
  }
  return q('unit.average_rate',
    `小雨前 3 次测验平均 ${avg3} 分，第 4 次得 ${f4} 分，4 次平均多少分？`,
    `${valueHTML(avg4)} 分`,
    '平均数 = 总数 ÷ 次数');
}

export function generate(rng, level, count) {
  const kinds = [convertQ, speedQ, discountQ, averageQ];
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
