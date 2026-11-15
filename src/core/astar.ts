/**
 * A* 8-vizinhos sobre um campo de custo (fator por célula). Heap binário em typed arrays,
 * heurística euclidiana × menor fator do campo (admissível).
 */

export interface AStarInput {
  width: number;
  height: number;
  cellWM: number;
  cellHM: number;
  cost: Float32Array;
  minFactor: number;
  start: number;
  goal: number;
}

export interface AStarResult {
  /** índices de célula do início ao fim; [] se não houver caminho */
  path: number[];
  cost: number;
  expanded: number;
}

class MinHeap {
  idx: Int32Array;
  key: Float64Array;
  size = 0;
  constructor(cap: number) {
    this.idx = new Int32Array(cap);
    this.key = new Float64Array(cap);
  }
  push(i: number, k: number) {
    if (this.size >= this.idx.length) this.grow();
    let p = this.size++;
    const { idx, key } = this;
    while (p > 0) {
      const parent = (p - 1) >> 1;
      if (key[parent] <= k) break;
      idx[p] = idx[parent];
      key[p] = key[parent];
      p = parent;
    }
    idx[p] = i;
    key[p] = k;
  }
  pop(): number {
    const { idx, key } = this;
    const top = idx[0];
    const lastI = idx[--this.size];
    const lastK = key[this.size];
    let p = 0;
    const n = this.size;
    for (;;) {
      let c = 2 * p + 1;
      if (c >= n) break;
      if (c + 1 < n && key[c + 1] < key[c]) c++;
      if (key[c] >= lastK) break;
      idx[p] = idx[c];
      key[p] = key[c];
      p = c;
    }
    idx[p] = lastI;
    key[p] = lastK;
    return top;
  }
  private grow() {
    const ni = new Int32Array(this.idx.length * 2);
    const nk = new Float64Array(this.key.length * 2);
    ni.set(this.idx);
    nk.set(this.key);
    this.idx = ni;
    this.key = nk;
  }
}

const DR = [-1, -1, -1, 0, 0, 1, 1, 1];
const DC = [-1, 0, 1, -1, 1, -1, 0, 1];

export function astar(inp: AStarInput): AStarResult {
  const { width: W, height: H, cellWM, cellHM, cost, start, goal } = inp;
  const n = W * H;
  const hf = Math.max(0, inp.minFactor);
  const g = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap(Math.max(1024, n >> 2));
  const gr = (goal / W) | 0;
  const gc = goal - gr * W;
  const stepLen = DR.map((dr, k) => Math.hypot(dr * cellHM, DC[k] * cellWM));
  const h = (i: number) => {
    const r = (i / W) | 0;
    const c = i - r * W;
    return Math.hypot((r - gr) * cellHM, (c - gc) * cellWM) * hf;
  };

  g[start] = 0;
  heap.push(start, h(start));
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    expanded++;
    if (cur === goal) break;
    const r = (cur / W) | 0;
    const c = cur - r * W;
    const gcur = g[cur];
    const fcur = cost[cur];
    for (let k = 0; k < 8; k++) {
      const nr = r + DR[k];
      const nc = c + DC[k];
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      const ni = nr * W + nc;
      if (closed[ni]) continue;
      const ng = gcur + stepLen[k] * 0.5 * (fcur + cost[ni]);
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + h(ni));
      }
    }
  }
  if (!closed[goal]) return { path: [], cost: Infinity, expanded };
  const path: number[] = [];
  for (let i = goal; i !== -1; i = came[i]) path.push(i);
  path.reverse();
  return { path, cost: g[goal], expanded };
}
