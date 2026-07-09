// v2 → v3 数据迁移。纯函数、幂等、无副作用（除一次性 console.warn 汇总未知 tag）。
// v2 错题条目按 domain.tag 分类，无 skill 字段；v3 掌握度地图以 skillId 索引。
// 本表把 v2 tag 一一落到 js/map/skills.js 的真实 skillId（目标值经 test-migrate 硬校验）。
// 查不到的 tag 落 mix.complex 兜底哨兵（非真实 skillId，表示"未分类复杂题"，不参与 skill 专项匹配）。

const FALLBACK_SKILL = 'mix.complex';

// key = v2 tag（domain.subtag），value = v3 skillId ∈ SKILL_IDS。
export const TAG_TO_SKILL = {
  // —— 口算（oral）——
  'oral.int': 'add100',
  'oral.decimal': 'dec_shift',
  'oral.frac': 'frac_same_denom',
  'oral.convert': 'dec_frac_base',
  'oral.carry_forget': 'add100',      // 进位遗漏（粗心子标签）→ 百以内加减
  'oral.borrow_forget': 'sub100',     // 退位遗漏 → 百以内退位减
  'oral.table_misread': 'mult_table', // 乘法表看错 → 表内乘法
  'oral.table_row_jump': 'mult_table',// 乘法表串行 → 表内乘法
  // —— 核心保温（keep）——
  'keep.mult': 'dec.mult_point',
  'keep.div': 'dec.div_same_multiple', // 修正：brief 的 dec.div_point 不存在，取小数除法基础型
  'keep.frac': 'frac.addsub_diff',
  // —— 表征互通（bridge）——统一表示时机判断
  'bridge.chain': 'mix.convert_judge',
  'bridge.compare': 'mix.convert_judge',
  'bridge.baseline': 'mix.convert_judge',
  'bridge.repeating': 'mix.convert_judge',
  'bridge.percent_of': 'dec_frac_base', // 修正：无 unit.percent，落百分数基准互化技能
  'bridge.ratio_simplify': 'rate.ratio',// 修正：unit.ratio → rate 命名空间的比与比例
  // —— 复杂四则混合（mixed）——修正：brief 的 mix.complex/mix.estimate 非真实 id
  'mixed.paren_order': 'gen.order_bracket',      // 运算顺序（含中括号）
  'mixed.frac_dec_mixed': 'mix.dec_frac',        // 分小混合（珠峰）
  'mixed.multi_step_frac': 'mix.unify_repr',     // 多步分数 → 统一表示策略
  'mixed.smart_structure': 'smart.dist_reverse', // brief 指定
  'mixed.estimate_check': 'gen.estimate_strategy',// 修正：mix.estimate → 估算策略
  // —— 单位·率·关系（unit → rate 命名空间）——
  'unit.speed': 'rate.speed_time',
  'unit.average_rate': 'rate.speed_time', // 平均速度 → 速度时间路程
  'unit.convert': 'rate.unit_price',      // 单位换算 → 单位率基础
  'unit.discount_tax': 'rate.unit_price', // 折扣税率 → 单价总价关系
  // —— 方程与简算（strategy）——
  'strategy.eq_basic': 'eq.x_add_sub',
  'strategy.eq_frac_ratio': 'eq.x_mult_div',
  'strategy.eq_special_pos': 'eq.special_pos',
  'strategy.smart_round': 'smart.round_group',
  'strategy.smart_group': 'smart.add_assoc',
  'strategy.smart_dist': 'smart.dist_forward',
  'strategy.smart_split': 'smart.split_compensate',
};

// v2 profile → v3。幂等：已迁移的再跑字节级无变化（只补缺字段，从不覆盖已有值）。
export function migrateProfile(profile) {
  if (!profile || typeof profile !== 'object') return profile;
  const unknown = new Set();
  const book = profile.errorBook && typeof profile.errorBook === 'object' ? profile.errorBook : {};
  for (const entry of Object.values(book)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.skill) continue; // 已有 skill：不覆盖（幂等 & 保留 v3 新条目预设）
    const skill = TAG_TO_SKILL[entry.tag];
    if (skill) {
      entry.skill = skill;
    } else {
      entry.skill = FALLBACK_SKILL;
      if (entry.tag != null) unknown.add(entry.tag);
    }
  }
  if (unknown.size) {
    console.warn(`[migrate] ${unknown.size} 个未映射 v2 tag 落 ${FALLBACK_SKILL}：`, [...unknown].join(', '));
  }
  return profile;
}

// 同步 dump → v3。对每个 profile_* 跑 migrateProfile 并盖 schemaVersion:3。
// 幂等：已是 schemaVersion:3 的 dump 原样返回（同引用，不再遍历）。
export function migrateDump(dump) {
  if (!dump || typeof dump !== 'object') return dump;
  if (dump.schemaVersion === 3) return dump;
  for (const key of Object.keys(dump)) {
    if (key.startsWith('profile_')) migrateProfile(dump[key]);
  }
  dump.schemaVersion = 3;
  return dump;
}
