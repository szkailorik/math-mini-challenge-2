// 掌握度跨设备同步单测：mergeMastery 双向对称、新者胜、单侧保留、空对象安全。
// localStorage 内存垫片（浏览器外运行），模式抄 test-migrate.mjs。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { mergeMastery } = await import('../js/sync.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('  ✗', msg); } else console.log('  ✓', msg); };

const entry = (over = {}) => ({ hits: [1, 1, 0], speedOk: true, state: 'learning', lastSet: 1, streakWrong: 0, ...over });

console.log('mergeMastery：lastSet 新者胜');
{
  const local = { add100: entry({ lastSet: 3, state: 'learning' }) };
  const remote = { add100: entry({ lastSet: 5, state: 'maintain' }) };
  const merged = mergeMastery(local, remote);
  ok(merged.add100.lastSet === 5 && merged.add100.state === 'maintain', 'lastSet 较大的一方胜出');
}

console.log('mergeMastery：lastSet 相等取 local');
{
  const local = { add100: entry({ lastSet: 4, state: 'learning' }) };
  const remote = { add100: entry({ lastSet: 4, state: 'maintain' }) };
  const merged = mergeMastery(local, remote);
  ok(merged.add100.state === 'learning', 'lastSet 相等时保留 local 一方');
}

console.log('mergeMastery：单方独有直接保留');
{
  const local = { add100: entry({ lastSet: 2 }) };
  const remote = { sub100: entry({ lastSet: 7 }) };
  const merged = mergeMastery(local, remote);
  ok(merged.add100.lastSet === 2, 'local 独有技能保留');
  ok(merged.sub100.lastSet === 7, 'remote 独有技能保留');
  ok(Object.keys(merged).length === 2, '合并后共 2 个技能条目');
}

console.log('mergeMastery：空对象安全');
{
  ok(JSON.stringify(mergeMastery({}, {})) === '{}', '双空对象合并为空对象');
  ok(JSON.stringify(mergeMastery(undefined, undefined)) === '{}', '双 undefined 合并为空对象（默认参数兜底）');
  const local = { add100: entry({ lastSet: 1 }) };
  ok(JSON.stringify(mergeMastery(local, {})) === JSON.stringify(mergeMastery(local, undefined)), 'remote 空对象与 undefined 等价');
  ok(mergeMastery(local, {}).add100.lastSet === 1, 'remote 为空时 local 原样保留');
}

console.log('mergeMastery：双向对称（字节级）');
{
  const local = {
    add100: entry({ lastSet: 3, state: 'learning' }),
    sub100: entry({ lastSet: 9, state: 'maintain' }),
  };
  const remote = {
    add100: entry({ lastSet: 5, state: 'maintain' }),
    mult_table: entry({ lastSet: 2, state: 'learning' }),
  };
  const ab = JSON.stringify(mergeMastery(local, remote));
  const ba = JSON.stringify(mergeMastery(remote, local));
  ok(ab === ba, 'A合B 与 B合A 字节级全等');
}

console.log('mergeMastery：键排序输出（字节稳定）');
{
  const local = { sub100: entry({ lastSet: 1 }), add100: entry({ lastSet: 1 }) };
  const merged = mergeMastery(local, {});
  ok(JSON.stringify(Object.keys(merged)) === JSON.stringify(['add100', 'sub100']), '输出键按字典序排序');
}

console.log(fails === 0 ? '\n✅ test-sync-mastery 全部通过' : `\n❌ ${fails} 项失败`);
process.exit(fails === 0 ? 0 : 1);
