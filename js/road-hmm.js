/* NavDR local directed-road HMM. Distance emissions and shortest-path transitions;
 * online Viterbi recurrence with a bounded observation window. No Valhalla dependency.
 */
(function (N) {
  "use strict";
  class RoadHMM {
    constructor(graph) {
      if (!graph?.nodes?.length || !graph?.edges?.length)
        throw Error("Road graph needs nodes and directed edges");
      if (graph.nodes.length > 5000 || graph.edges.length > 12000)
        throw Error(
          "Use a corridor graph with at most 5000 nodes / 12000 edges",
        );
      if (
        graph.nodes.some(
          (n) =>
            !Number.isFinite(n.lat) ||
            !Number.isFinite(n.lon) ||
            Math.abs(n.lat) > 90 ||
            Math.abs(n.lon) > 180,
        )
      )
        throw Error("Invalid road coordinates");
      if (
        new Set(graph.nodes.map((n) => String(n.id))).size !==
        graph.nodes.length
      )
        throw Error("Duplicate road node IDs");
      this.graph = graph;
      this.nodes = new Map(graph.nodes.map((n) => [String(n.id), n]));
      this.adj = new Map();
      this.previous = null;
      this.age = 0;
      this.scores = [];
      this.edges = graph.edges.map((e, i) => {
        const a = this.nodes.get(String(e.from)),
          b = this.nodes.get(String(e.to));
        if (!a || !b) throw Error("Road edge references missing node");
        const len = N.Core.distance(a, b);
        if (len < 0.01) throw Error("Zero-length road edge");
        const edge = { ...e, id: String(e.id ?? i), a, b, len };
        const list = this.adj.get(String(e.from)) || [];
        list.push(edge);
        this.adj.set(String(e.from), list);
        return edge;
      });
      this.edgeById = new Map(this.edges.map((e) => [e.id, e]));
    }
    shortest(from, to) {
      from = String(from);
      to = String(to);
      if (from === to) return 0;
      this.pathCache = this.pathCache || new Map();
      if (this.pathCache.has(from))
        return this.pathCache.get(from).get(to) ?? Infinity;
      const costs = new Map([[from, 0]]),
        heap = [];
      const push = (item) => {
        heap.push(item);
        let i = heap.length - 1;
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (heap[p][0] <= item[0]) break;
          heap[i] = heap[p];
          i = p;
        }
        heap[i] = item;
      };
      const pop = () => {
        const root = heap[0],
          tail = heap.pop();
        if (heap.length) {
          let i = 0;
          while (i * 2 + 1 < heap.length) {
            let j = i * 2 + 1;
            if (j + 1 < heap.length && heap[j + 1][0] < heap[j][0]) j++;
            if (heap[j][0] >= tail[0]) break;
            heap[i] = heap[j];
            i = j;
          }
          heap[i] = tail;
        }
        return root;
      };
      push([0, from]);
      while (heap.length) {
        const [best, key] = pop();
        if (best !== costs.get(key) || best > 2000) continue;
        for (const e of this.adj.get(key) || []) {
          const d = best + e.len,
            k = String(e.to);
          if (d <= 2000 && d < (costs.get(k) ?? Infinity)) {
            costs.set(k, d);
            push([d, k]);
          }
        }
      }
      this.pathCache.set(from, costs);
      if (this.pathCache.size > 128)
        this.pathCache.delete(this.pathCache.keys().next().value);
      return costs.get(to) ?? Infinity;
    }
    project(e, p, h) {
      const v = N.Core.local(e.b, e.a),
        q = N.Core.local(p, e.a),
        t = Math.max(0, Math.min(1, (q[0] * v[0] + q[1] * v[1]) / e.len ** 2)),
        position = N.Core.geo(
          v.map((x) => x * t),
          e.a,
        ),
        distance = N.Core.distance(p, position),
        heading = Math.atan2(v[1], v[0]),
        dh = Math.abs(N.Core.wrap(h - heading));
      return {
        edge: e,
        t,
        position,
        distance,
        heading,
        emission: -0.5 * (distance / 12) ** 2 - 0.5 * (dh / 0.7) ** 2,
      };
    }
    candidates(p, h) {
      return this.edges
        .map((e) => this.project(e, p, h))
        .filter((c) => c.distance < 50)
        .sort((a, b) => b.emission - a.emission)
        .slice(0, 8);
    }
    update(p, h, dt) {
      this.age += dt;
      if (this.age < 0.5 && this.result) {
        const edge = this.edgeById.get(this.result.edgeId);
        const current = edge ? this.project(edge, p, h) : null;
        return current
          ? {
              ...this.result,
              position: current.position,
              distance: current.distance,
              matched: current.distance <= 30,
            }
          : { ...this.result, matched: false, status: "OFF NETWORK" };
      }
      this.age = 0;
      const candidates = this.candidates(p, h),
        observed = this.previous ? N.Core.distance(p, this.previous) : 0;
      if (!candidates.length) {
        this.scores = [];
        this.previous = p;
        return (this.result = { matched: false, status: "OFF NETWORK" });
      }
      const next = candidates.map((c) => {
        let score = c.emission,
          path = [c.edge.id];
        if (this.scores.length) {
          let best = -Infinity,
            bestPath = [];
          for (const prev of this.scores) {
            const a = prev.c;
            const network =
              a.edge.id === c.edge.id && c.t >= a.t
                ? (c.t - a.t) * c.edge.len
                : (1 - a.t) * a.edge.len +
                  this.shortest(a.edge.to, c.edge.from) +
                  c.t * c.edge.len;
            const transition = -Math.abs(network - observed) / 15;
            const s = prev.score + transition;
            if (s > best) {
              best = s;
              bestPath = prev.path;
            }
          }
          score += best;
          path = [...bestPath, c.edge.id].slice(-20);
        }
        return { c, score, path };
      });
      next.sort((a, b) => b.score - a.score);
      const best = next[0];
      if (!Number.isFinite(best.score)) {
        this.scores = [];
        this.previous = p;
        return (this.result = {
          matched: false,
          status: "DISCONNECTED TRANSITION",
        });
      }
      this.scores = next.map((x) => ({ ...x, score: x.score - best.score }));
      this.previous = { ...p };
      return (this.result = {
        matched: best.c.distance <= 30,
        position: best.c.position,
        distance: best.c.distance,
        edgeId: best.c.edge.id,
        path: best.path,
        status: "HMM VITERBI",
        provenance: this.graph.provenance,
      });
    }
    static fromOSM(osm) {
      const nodes = osm.elements
        .filter((e) => e.type === "node")
        .map((e) => ({ id: String(e.id), lat: e.lat, lon: e.lon }));
      const ids = new Set(nodes.map((n) => n.id)),
        edges = [];
      for (const w of osm.elements.filter(
        (e) => e.type === "way" && e.tags?.highway,
      ))
        for (let i = 1; i < w.nodes.length; i++) {
          const a = String(w.nodes[i - 1]),
            b = String(w.nodes[i]);
          if (!ids.has(a) || !ids.has(b)) continue;
          const one = w.tags.oneway;
          const reverse = one === "-1";
          if (!reverse)
            edges.push({ id: w.id + "-" + i + "f", from: a, to: b });
          if (
            reverse ||
            (!["yes", "1", "true"].includes(one) &&
              w.tags.junction !== "roundabout")
          )
            edges.push({ id: w.id + "-" + i + "r", from: b, to: a });
        }
      return {
        nodes,
        edges,
        provenance:
          "OpenStreetMap import; ODbL; turn restrictions not imported",
      };
    }
  }
  N.RoadHMM = RoadHMM;
})((window.NavDR = window.NavDR || {}));
