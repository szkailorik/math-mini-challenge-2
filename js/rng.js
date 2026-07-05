// 种子化随机数：同一套号永远生成同一份试卷（可复现、可补打、无需缓存）
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(...parts) {
  return wrapRng(mulberry32(fnv1a(parts.join('|'))));
}

function wrapRng(next) {
  const rng = {
    next,
    // 整数 [lo, hi] 闭区间
    int(lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    // 不放回抽取 n 个
    sample(arr, n) {
      const pool = arr.slice();
      const out = [];
      while (out.length < n && pool.length) {
        out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
      }
      return out;
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    chance(p) { return next() < p; },
    // 派生独立子流，避免各大题之间互相扰动
    fork(label) { return makeRng(String(next()), label); },
  };
  return rng;
}
