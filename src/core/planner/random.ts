/** Kleiner, reproduzierbarer Zufallsgenerator (mulberry32) – Tests nutzen feste Seeds. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gewichtete Auswahl aus den ersten Einträgen einer sortierten Liste (3 : 2 : 1). */
export function pickTop<T>(sorted: T[], rng: () => number): T {
  const top = sorted.slice(0, 3);
  const weights = [3, 2, 1].slice(0, top.length);
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) return top[i];
  }
  return top[0];
}
