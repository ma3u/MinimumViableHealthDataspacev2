// Shared 3D engine for the per-persona knowledge graph POCs.
// Layers are stacked planes on the z axis; the force layout runs in x/y only,
// so each persona reads as a small set of labelled discs, not a hairball.
// Library: 3d-force-graph 1.80 (three.js r183), loaded from jsDelivr at a pinned
// version. Labels and glows are drawn here so all objects share one three.js.
import ForceGraph3D from "https://cdn.jsdelivr.net/npm/3d-force-graph@1.80.0/+esm";
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.183.2/+esm";

export const STATUS_COLOR = {
  ok: "#22c55e",
  warn: "#f59e0b",
  bad: "#ef4444",
  info: "#38bdf8",
  none: "#94a3b8",
};

/** Fixed "today" so the static fixtures always tell the same story. */
export const ASOF = new Date("2026-09-23T00:00:00Z");
export const daysUntil = (iso) => Math.round((new Date(iso) - ASOF) / 86400000);
export const fmtDate = (iso) => (iso ? String(iso).slice(0, 10) : "n/a");

/** Mock fixtures mirror the live /api/* shapes (see .claude/rules/api-conventions.md). */
export async function loadJson(name) {
  const r = await fetch(`../../mock/${name}.json`);
  if (!r.ok) throw new Error(`${name}.json ${r.status}`);
  return r.json();
}

const LAYER_GAP = 110;

function textSprite(text, { size = 22, color = "#e5e7eb", bg = null } = {}) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const font = `600 ${size * 2}px Inter, system-ui, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  const h = size * 2 + 20;
  c.width = w;
  c.height = h;
  ctx.font = font;
  if (bg) {
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 14);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 12, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    }),
  );
  const scale = size / 2.4;
  sp.scale.set((w / h) * scale, scale, 1);
  return sp;
}

function glowSprite(color, scale) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color + "88");
  g.addColorStop(1, color + "00");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sp.scale.set(scale, scale, 1);
  return sp;
}

function nodeObject(n) {
  const g = new THREE.Group();
  const r = 3 + (n.size ?? 1) * 1.6;
  const color = n.color ?? STATUS_COLOR[n.status ?? "none"];
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(r, 24, 24),
    new THREE.MeshPhongMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.25,
      shininess: 60,
    }),
  );
  g.add(mesh);
  if (n.status && n.status !== "none") {
    const halo = glowSprite(STATUS_COLOR[n.status], r * 5);
    halo.userData.pulse = n.pulse ?? n.status === "bad";
    halo.userData.base = r * 5;
    g.add(halo);
    g.userData.halo = halo;
  }
  const label = textSprite(n.label, {
    size: n.size >= 3 ? 26 : 20,
    color: n.size >= 3 ? "#fde68a" : "#e5e7eb",
  });
  label.position.set(0, -(r + 7), 0);
  label.center.set(0.5, 1);
  g.add(label);
  return g;
}

function layerPlane(layer, radius) {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 72),
    new THREE.MeshBasicMaterial({
      color: layer.color,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 1.2, radius, 96),
    new THREE.MeshBasicMaterial({
      color: layer.color,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  grp.add(disc, ring);
  const label = textSprite(layer.name, {
    size: 24,
    color: layer.color,
    bg: "rgba(15,23,42,0.85)",
  });
  label.position.set(radius + 10, 0, 0);
  label.center.set(0, 0.5);
  grp.add(label);
  grp.position.z = layer.z * LAYER_GAP;
  return grp;
}

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

/**
 * Mount one persona view.
 * cfg = { persona, title, question, article, layers, nodes, links, signals, legend }
 */
export function mountPersona(cfg) {
  const root = document.getElementById("graph");
  const panel = document.getElementById("panel");

  // ── side panel ─────────────────────────────────────────────────────────
  panel.innerHTML = "";
  panel.append(el("h1", null, esc(cfg.title)));
  panel.append(el("div", "question", esc(cfg.question)));
  panel.append(el("span", "article", esc(cfg.article)));
  panel.append(el("h2", null, "In one view"));
  const sig = el("ul", "signals");
  const order = { bad: 0, warn: 1, info: 2, ok: 3 };
  [...cfg.signals]
    .sort((a, b) => order[a.severity] - order[b.severity])
    .forEach((s) => {
      const li = el(
        "li",
        null,
        `<span class="badge ${s.severity}"></span><span class="txt">${esc(
          s.text,
        )}${
          s.article ? `<span class="art">${esc(s.article)}</span>` : ""
        }</span>`,
      );
      li.dataset.node = s.nodeId;
      li.addEventListener("click", () => focusNode(s.nodeId, li));
      sig.append(li);
    });
  panel.append(sig);
  panel.append(el("h2", null, "Legend"));
  const leg = el("div", "legend");
  (cfg.legend ?? []).forEach((l) => {
    const s = el("span", null, esc(l.text));
    s.style.setProperty("--c", l.color);
    leg.append(s);
  });
  panel.append(leg);
  panel.append(
    el(
      "p",
      "question",
      `Data: static fixtures under <code>/mock</code> that mirror the live API shapes, as of ${fmtDate(
        ASOF.toISOString(),
      )}. ${esc(cfg.dataNote ?? "")}`,
    ),
  );

  // ── layer bar over the canvas ──────────────────────────────────────────
  const bar = el("div", "layerbar");
  [...cfg.layers]
    .sort((a, b) => b.z - a.z)
    .forEach((l) => {
      const s = el("span", null, esc(l.name));
      s.style.setProperty("--c", l.color);
      bar.append(s);
    });
  root.append(bar);
  root.append(
    el("div", "hint", "drag to orbit · wheel to zoom · click a node"),
  );

  // ── graph ──────────────────────────────────────────────────────────────
  const byId = new Map(cfg.nodes.map((n) => [n.id, n]));
  const layerZ = Object.fromEntries(
    cfg.layers.map((l) => [l.id, l.z * LAYER_GAP]),
  );
  cfg.nodes.forEach((n) => {
    n.fz = layerZ[n.layer] ?? 0;
    if (n.pin) {
      n.fx = n.pin[0];
      n.fy = n.pin[1];
    }
  });
  const links = cfg.links.filter(
    (l) => byId.has(l.source) && byId.has(l.target),
  );

  const Graph = ForceGraph3D({ controlType: "orbit" })(root)
    .width(root.clientWidth)
    .height(root.clientHeight)
    .backgroundColor("#0b1220")
    .showNavInfo(false)
    .nodeThreeObject(nodeObject)
    .nodeLabel((n) => `<b>${esc(n.label)}</b><br>${esc(n.detail?.sub ?? "")}`)
    .linkColor((l) => l.color ?? STATUS_COLOR[l.status ?? "none"])
    .linkOpacity(0.55)
    .linkWidth((l) => l.width ?? (l.status === "bad" ? 1.6 : 0.8))
    .linkDirectionalParticles((l) => l.particles ?? 0)
    .linkDirectionalParticleSpeed(0.006)
    .linkDirectionalParticleWidth(2.2)
    .linkDirectionalParticleColor(
      (l) => l.color ?? STATUS_COLOR[l.status ?? "none"],
    )
    .linkDirectionalArrowLength((l) => (l.arrow ? 4 : 0))
    .linkDirectionalArrowRelPos(0.85)
    .warmupTicks(120)
    .cooldownTicks(400)
    .cooldownTime(Infinity)
    .d3AlphaDecay(0.03)
    .d3VelocityDecay(0.35)
    .onNodeClick((n) => focusNode(n.id))
    .onBackgroundClick(() => showDetail(null))
    .graphData({ nodes: cfg.nodes, links });

  Graph.d3Force("charge").strength(-110);
  Graph.d3Force("link").distance((l) => l.distance ?? 60);

  // layer discs, sized by how many nodes sit on them
  const BASE_R = 100;
  const planes = {};
  cfg.layers.forEach((l) => {
    planes[l.id] = layerPlane(l, BASE_R);
    Graph.scene().add(planes[l.id]);
  });
  let maxR = 100;
  function fitPlanes() {
    maxR = 100;
    cfg.layers.forEach((l) => {
      let r = 60;
      cfg.nodes.forEach((n) => {
        if (n.layer === l.id && Number.isFinite(n.x))
          r = Math.max(r, Math.hypot(n.x, n.y) + 36);
      });
      maxR = Math.max(maxR, r);
      const g = planes[l.id];
      const k = r / BASE_R;
      g.children[0].scale.set(k, k, 1);
      g.children[1].scale.set(k, k, 1);
      g.children[2].position.x = r + 10;
    });
  }
  fitPlanes();
  Graph.onEngineStop(fitPlanes);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) Graph.d3ReheatSimulation();
  });
  Graph.scene().add(new THREE.AmbientLight(0xffffff, 0.35));

  // camera: look at the stack from a raised angle, slowly orbiting
  const cam = Graph.camera();
  cam.up.set(0, 0, 1);
  const zSpan =
    Math.max(...cfg.layers.map((l) => l.z)) -
    Math.min(...cfg.layers.map((l) => l.z));
  const zMid =
    ((Math.max(...cfg.layers.map((l) => l.z)) +
      Math.min(...cfg.layers.map((l) => l.z))) /
      2) *
    LAYER_GAP;
  const D = Math.max(380 + zSpan * 45, maxR * 1.9);
  let angle = 0;
  let orbiting = true;
  let focused = false;
  let idleTimer = null;
  const controls = Graph.controls();
  controls.target.set(0, 0, zMid);
  Graph.cameraPosition(
    { x: 0, y: -D, z: zMid + D * 0.6 },
    { x: 0, y: 0, z: zMid },
    0,
  );
  let selectedId = null;
  const pause = () => {
    orbiting = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!selectedId) orbiting = true;
    }, 12000);
  };
  root.addEventListener("pointerdown", pause);
  root.addEventListener("wheel", pause, { passive: true });

  let t0 = performance.now();
  let frameNo = 0;
  (function frame(t) {
    const dt = (t - t0) / 1000;
    t0 = t;
    if (orbiting && !focused) {
      angle += dt * 0.12;
      const p = cam.position;
      const rad = Math.hypot(p.x, p.y) || D;
      cam.position.set(Math.sin(angle) * rad, -Math.cos(angle) * rad, p.z);
      cam.lookAt(controls.target);
    }
    if (frameNo++ % 30 === 0) fitPlanes();
    const s = 1 + 0.18 * Math.sin(t / 380);
    cfg.nodes.forEach((n) => {
      const h = n.__threeObj?.userData?.halo;
      if (h && h.userData.pulse)
        h.scale.set(h.userData.base * s, h.userData.base * s, 1);
    });
    requestAnimationFrame(frame);
  })(t0);

  const right = document.getElementById("right");
  const mainEl = document.querySelector("main");
  const expanded = new Map(); // parent id -> { nodes, links }
  let allNodes = cfg.nodes;
  let allLinks = links;

  function toggleExpand(n) {
    if (typeof n.expand !== "function") return;
    if (expanded.has(n.id)) {
      const ex = expanded.get(n.id);
      const ids = new Set(ex.nodes.map((x) => x.id));
      allNodes = allNodes.filter((x) => !ids.has(x.id));
      allLinks = allLinks.filter(
        (l) =>
          !ids.has(l.source.id ?? l.source) &&
          !ids.has(l.target.id ?? l.target),
      );
      ids.forEach((id) => byId.delete(id));
      expanded.delete(n.id);
    } else {
      const ex = n.expand(n) ?? { nodes: [], links: [] };
      ex.nodes.forEach((x, i) => {
        x.fz = layerZ[x.layer] ?? n.fz;
        x.x = n.x + Math.cos(i) * 30;
        x.y = n.y + Math.sin(i) * 30;
        byId.set(x.id, x);
      });
      allNodes = allNodes.concat(ex.nodes);
      allLinks = allLinks.concat(
        ex.links.filter((l) => byId.has(l.source) && byId.has(l.target)),
      );
      expanded.set(n.id, ex);
    }
    Graph.graphData({ nodes: allNodes, links: allLinks });
    Graph.d3ReheatSimulation();
  }

  function focusNode(id, li) {
    const n = byId.get(id);
    if (!n) return;
    document
      .querySelectorAll("ul.signals li")
      .forEach((x) =>
        x.classList.toggle("active", x === li || x.dataset.node === id),
      );
    focused = true;
    selectedId = id;
    orbiting = false;
    clearTimeout(idleTimer);
    toggleExpand(n);
    const dist = 230;
    const from = cam.position
      .clone()
      .sub(new THREE.Vector3(n.x, n.y, n.z))
      .normalize();
    Graph.cameraPosition(
      {
        x: n.x + from.x * dist,
        y: n.y + from.y * dist,
        z: n.z + from.z * dist + 40,
      },
      { x: n.x, y: n.y, z: n.z },
      900,
    );
    setTimeout(() => (focused = false), 12000);
    showDetail(n);
  }

  function trendOf(n) {
    const v = n.series.map((p) => p.value);
    const first = v[0];
    const last = v[v.length - 1];
    const lo = n.range?.low;
    const hi = n.range?.high;
    const width =
      lo != null && hi != null ? hi - lo : Math.abs(first) * 0.2 || 1;
    const rel = (last - first) / width;
    const dir =
      Math.abs(rel) < 0.15 ? "stable" : rel > 0 ? "rising" : "falling";
    const out = (hi != null && last > hi) || (lo != null && last < lo);
    const worse =
      n.higherIsWorse === false ? dir === "falling" : dir === "rising";
    const sev =
      dir === "stable"
        ? out
          ? "warn"
          : "ok"
        : worse
          ? out
            ? "bad"
            : "warn"
          : "ok";
    const months = Math.round(
      (new Date(n.series[n.series.length - 1].date) -
        new Date(n.series[0].date)) /
        2629800000,
    );
    return { dir, sev, first, last, out, months };
  }

  function chartSvg(n) {
    const W = 340;
    const H = 170;
    const L = 38;
    const R = 14;
    const T = 14;
    const B = 26;
    const pts = n.series;
    const xs = pts.map((p) => new Date(p.date).getTime());
    const vs = pts.map((p) => p.value);
    const lo = n.range?.low;
    const hi = n.range?.high;
    let ymin = Math.min(...vs, lo ?? Infinity);
    let ymax = Math.max(...vs, hi ?? -Infinity);
    const pad = (ymax - ymin || 1) * 0.15;
    ymin -= pad;
    ymax += pad;
    const x = (t) =>
      L + ((t - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - ymin) / (ymax - ymin)) * (H - T - B);
    const bandTop = y(hi ?? ymax);
    const bandBot = y(lo ?? ymin);
    const line = pts
      .map(
        (p) =>
          `${x(new Date(p.date).getTime()).toFixed(1)},${y(p.value).toFixed(
            1,
          )}`,
      )
      .join(" ");
    const dots = pts
      .map((p) => {
        const out =
          (hi != null && p.value > hi) || (lo != null && p.value < lo);
        return `<circle cx="${x(new Date(p.date).getTime()).toFixed(
          1,
        )}" cy="${y(p.value).toFixed(1)}" r="4" fill="${
          out ? "#f59e0b" : "#22c55e"
        }" stroke="#0b1220" stroke-width="1.5"><title>${esc(p.date)}: ${
          p.value
        } ${esc(n.unit ?? "")}</title></circle>`;
      })
      .join("");
    const fmt = (d) => d.slice(0, 7);
    const yl = (v, label) =>
      v == null
        ? ""
        : `<text x="${L - 4}" y="${(y(v) + 4).toFixed(
            1,
          )}" text-anchor="end" font-size="10" fill="#9ca3af">${label}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(
      n.label,
    )} over time">
      <rect x="${L}" y="${Math.min(bandTop, bandBot).toFixed(1)}" width="${
        W - L - R
      }" height="${Math.abs(bandBot - bandTop).toFixed(
        1,
      )}" fill="#22c55e" opacity="0.12"/>
      ${yl(hi, hi)}${yl(lo, lo)}
      <polyline points="${line}" fill="none" stroke="#93c5fd" stroke-width="2"/>
      ${dots}
      <text x="${L}" y="${H - 8}" font-size="10" fill="#9ca3af">${fmt(
        pts[0].date,
      )}</text>
      <text x="${W - R}" y="${
        H - 8
      }" font-size="10" fill="#9ca3af" text-anchor="end">${fmt(
        pts[pts.length - 1].date,
      )}</text>
    </svg>`;
  }

  function showDetail(n) {
    if (!n) {
      right.classList.add("hidden");
      mainEl.classList.add("no-right");
      selectedId = null;
      pause();
      return;
    }
    right.classList.remove("hidden");
    mainEl.classList.remove("no-right");
    const d = n.detail ?? {};
    const facts = (d.facts ?? [])
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
      .join("");
    const links = (d.links ?? [])
      .map(
        (l) =>
          `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(
            l.text,
          )}</a>`,
      )
      .join("");
    let series = "";
    if (Array.isArray(n.series) && n.series.length > 1) {
      const t = trendOf(n);
      const rows = [...n.series]
        .reverse()
        .map((p) => {
          const out =
            (n.range?.high != null && p.value > n.range.high) ||
            (n.range?.low != null && p.value < n.range.low);
          return `<tr><td>${esc(p.date)}</td><td class="${out ? "out" : ""}">${
            p.value
          } ${esc(n.unit ?? "")}</td></tr>`;
        })
        .join("");
      const foldHint = expanded.has(n.id)
        ? "The measurements are unfolded as nodes on the record layer; click the node again to fold them."
        : "Click the node again to unfold the measurements as nodes.";
      series = `<div class="trend"><span class="val">${t.last} ${esc(
        n.unit ?? "",
      )}</span><span class="dir ${t.sev}">${t.dir}${
        t.dir === "stable" ? "" : ` from ${t.first} over ${t.months} months`
      }</span></div>
        ${chartSvg(n)}
        <div class="hintrow">Reference ${esc(
          n.range?.text ?? "n/a",
        )}. Green band = printed range. ${foldHint}</div>
        <table class="series"><tr><th>Date</th><th>Value</th></tr>${rows}</table>`;
    }
    right.innerHTML = `<span class="close" title="close" role="button" tabindex="0">×</span><h3>${esc(
      d.title ?? n.label,
    )}</h3><div class="sub">${esc(d.sub ?? "")}</div>${
      d.description ? `<div class="desc">${esc(d.description)}</div>` : ""
    }${series}<dl>${facts}</dl>${
      d.article
        ? `<div class="sub" style="margin-top:8px">${esc(d.article)}</div>`
        : ""
    }${links ? `<div class="links">${links}</div>` : ""}`;
    right
      .querySelector(".close")
      .addEventListener("click", () => showDetail(null));
  }
  showDetail(null);

  window.addEventListener("resize", () =>
    Graph.width(root.clientWidth).height(root.clientHeight),
  );
  window.__poc = { Graph, nodes: cfg.nodes, links, focusNode };
  return { Graph, focusNode };
}

/** Shared page chrome: top bar with the four persona links. */
export function renderTop(active) {
  const personas = [
    ["patient", "Patient"],
    ["researcher", "Researcher"],
    ["hdab", "Health data access body"],
    ["hospital", "Hospital / data holder"],
  ];
  const nav = personas
    .map(
      ([id, name]) =>
        `<a href="${id}.html" class="${
          id === active ? "active" : ""
        }">${name}</a>`,
    )
    .join("");
  document.querySelector("header.top").innerHTML =
    `<a class="brand" href="index.html">Persona graph POC</a><nav>${nav}</nav><span class="spacer"></span><a class="note" href="../../graph?persona=${
      active === "hdab" ? "hdab" : active
    }" target="_blank" rel="noopener">current graph page ↗</a>`;
}
