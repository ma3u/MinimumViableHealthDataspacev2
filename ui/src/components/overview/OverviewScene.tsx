"use client";

/**
 * The layered 3D scene of a persona overview (issue #271).
 *
 * Layers are stacked discs on the z axis, the force layout runs in x and y
 * only, so a persona reads as a few labelled planes and not a hairball.
 * Status is a glow halo (pulsing for "bad"), flows are particles on links.
 * The camera orbits slowly until a node is selected.
 *
 * An enhancement: everything it shows is also in the signal list and the
 * detail panel of the page. It is loaded with next/dynamic and never on
 * the server; the page leaves it out under prefers-reduced-motion.
 *
 * Ported from the prototype engine under ui/public/poc/persona-3d/engine.js
 * (3d-force-graph 1.80, three r183 as npm dependencies instead of a CDN).
 */
import { useEffect, useRef } from "react";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import * as THREE from "three";
import type {
  OverviewLayer,
  OverviewLink,
  OverviewNode,
  OverviewView,
} from "@/lib/overview/types";

export const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  warn: "#f59e0b",
  bad: "#ef4444",
  info: "#38bdf8",
  none: "#94a3b8",
};

const LAYER_GAP = 110;
const BASE_R = 100;

type SceneNode = OverviewNode & {
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
  __threeObj?: THREE.Object3D;
};
type SceneLink = Omit<OverviewLink, "source" | "target"> & {
  source: string | SceneNode;
  target: string | SceneNode;
};
type Graph = ForceGraph3DInstance<SceneNode, SceneLink>;

function textSprite(
  text: string,
  { size = 22, color = "#e5e7eb", bg = null as string | null } = {},
): THREE.Sprite {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
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

function glowSprite(color: string, scale: number): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
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

function nodeObject(n: SceneNode): THREE.Object3D {
  const g = new THREE.Group();
  const r = 3 + (n.size ?? 1) * 1.6;
  const color = n.color ?? STATUS_COLOR[n.status ?? "none"];
  g.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 24),
      new THREE.MeshPhongMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        shininess: 60,
      }),
    ),
  );
  if (n.status && n.status !== "none") {
    const halo = glowSprite(STATUS_COLOR[n.status], r * 5);
    halo.userData.pulse = n.pulse ?? n.status === "bad";
    halo.userData.base = r * 5;
    g.add(halo);
    g.userData.halo = halo;
  }
  const label = textSprite(n.label, {
    size: (n.size ?? 1) >= 3 ? 26 : 20,
    color: (n.size ?? 1) >= 3 ? "#fde68a" : "#e5e7eb",
  });
  label.position.set(0, -(r + 7), 0);
  label.center.set(0.5, 1);
  g.add(label);
  return g;
}

function layerPlane(layer: OverviewLayer): THREE.Group {
  const grp = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(BASE_R, 72),
    new THREE.MeshBasicMaterial({
      color: layer.color,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(BASE_R - 1.2, BASE_R, 96),
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
  label.position.set(BASE_R + 10, 0, 0);
  label.center.set(0, 0.5);
  grp.add(label);
  grp.position.z = layer.z * LAYER_GAP;
  return grp;
}

export interface OverviewSceneProps {
  view: OverviewView;
  selectedId: string | null;
  /** Ids of nodes whose `expand` set is unfolded */
  expandedIds: string[];
  onSelect: (id: string | null) => void;
  className?: string;
}

interface SceneState {
  graph: Graph;
  nodes: Map<string, SceneNode>;
  layerZ: Record<string, number>;
  planes: Record<string, THREE.Group>;
  orbiting: boolean;
  angle: number;
  focused: boolean;
  idleTimer: ReturnType<typeof setTimeout> | null;
  raf: number;
  maxR: number;
  zMid: number;
  D: number;
}

export default function OverviewScene({
  view,
  selectedId,
  expandedIds,
  onSelect,
  className,
}: OverviewSceneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useRef<SceneState | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // ── mount: one graph per view ─────────────────────────────────────────────
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const layerZ = Object.fromEntries(
      view.layers.map((l) => [l.id, l.z * LAYER_GAP]),
    );
    const nodes = new Map<string, SceneNode>();
    for (const n of view.nodes) {
      const sn: SceneNode = { ...n, fz: layerZ[n.layer] ?? 0 };
      if (n.pin) {
        sn.fx = n.pin[0];
        sn.fy = n.pin[1];
      }
      nodes.set(n.id, sn);
    }
    const links: SceneLink[] = view.links
      .filter((l) => nodes.has(l.source) && nodes.has(l.target))
      .map((l) => ({ ...l }));

    // The constructor's types are not generic; the instance's are.
    const graph = new ForceGraph3D(root, {
      controlType: "orbit",
    }) as unknown as Graph;
    graph
      .width(root.clientWidth)
      .height(root.clientHeight)
      .backgroundColor("#0b1220")
      .showNavInfo(false)
      .nodeThreeObject((n) => nodeObject(n))
      .nodeLabel(
        (n) => `<b>${escapeHtml(n.label)}</b><br>${escapeHtml(n.sub ?? "")}`,
      )
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
      .onNodeClick((n) => onSelectRef.current(n.id))
      .onBackgroundClick(() => onSelectRef.current(null))
      .graphData({ nodes: [...nodes.values()], links });
    graph.d3Force("charge")?.strength(-110);
    graph.d3Force("link")?.distance((l: SceneLink) => l.distance ?? 60);

    const planes: Record<string, THREE.Group> = {};
    for (const l of view.layers) {
      planes[l.id] = layerPlane(l);
      graph.scene().add(planes[l.id]);
    }
    graph.scene().add(new THREE.AmbientLight(0xffffff, 0.35));

    const zs = view.layers.map((l) => l.z);
    const zSpan = Math.max(...zs) - Math.min(...zs);
    const zMid = ((Math.max(...zs) + Math.min(...zs)) / 2) * LAYER_GAP;
    const st: SceneState = {
      graph,
      nodes,
      layerZ,
      planes,
      orbiting: true,
      angle: 0,
      focused: false,
      idleTimer: null,
      raf: 0,
      maxR: 100,
      zMid,
      D: 520 + zSpan * 60,
    };
    state.current = st;

    const fitPlanes = () => {
      st.maxR = 100;
      for (const l of view.layers) {
        let r = 60;
        for (const n of nodes.values()) {
          if (n.layer === l.id && Number.isFinite(n.x)) {
            r = Math.max(r, Math.hypot(n.x ?? 0, n.y ?? 0) + 36);
          }
        }
        st.maxR = Math.max(st.maxR, r);
        const g = planes[l.id];
        const k = r / BASE_R;
        g.children[0].scale.set(k, k, 1);
        g.children[1].scale.set(k, k, 1);
        g.children[2].position.x = r + 10;
      }
      st.D = Math.max(520 + zSpan * 60, st.maxR * 2.2);
    };
    fitPlanes();
    graph.onEngineStop(fitPlanes);

    const cam = graph.camera();
    cam.up.set(0, 0, 1);
    const controls = graph.controls() as { target: THREE.Vector3 };
    controls.target.set(0, 0, zMid);
    graph.cameraPosition(
      { x: 0, y: -st.D, z: zMid + st.D * 0.6 },
      { x: 0, y: 0, z: zMid },
      0,
    );

    const pause = () => {
      st.orbiting = false;
      if (st.idleTimer) clearTimeout(st.idleTimer);
      st.idleTimer = setTimeout(() => {
        if (!selectedRef.current) st.orbiting = true;
      }, 12000);
    };
    root.addEventListener("pointerdown", pause);
    root.addEventListener("wheel", pause, { passive: true });

    let t0 = performance.now();
    let frameNo = 0;
    const frame = (t: number) => {
      const dt = (t - t0) / 1000;
      t0 = t;
      if (st.orbiting && !st.focused) {
        st.angle += dt * 0.12;
        const p = cam.position;
        const rad = Math.hypot(p.x, p.y) || st.D;
        cam.position.set(
          Math.sin(st.angle) * rad,
          -Math.cos(st.angle) * rad,
          p.z,
        );
        cam.lookAt(controls.target);
      }
      if (frameNo++ % 30 === 0) fitPlanes();
      const s = 1 + 0.18 * Math.sin(t / 380);
      for (const n of nodes.values()) {
        const h = n.__threeObj?.userData?.halo as THREE.Sprite | undefined;
        if (h && h.userData.pulse) {
          h.scale.set(h.userData.base * s, h.userData.base * s, 1);
        }
      }
      st.raf = requestAnimationFrame(frame);
    };
    st.raf = requestAnimationFrame(frame);

    const onVisible = () => {
      if (!document.hidden) graph.d3ReheatSimulation();
    };
    document.addEventListener("visibilitychange", onVisible);
    const ro = new ResizeObserver(() =>
      graph.width(root.clientWidth).height(root.clientHeight),
    );
    ro.observe(root);

    return () => {
      cancelAnimationFrame(st.raf);
      if (st.idleTimer) clearTimeout(st.idleTimer);
      root.removeEventListener("pointerdown", pause);
      root.removeEventListener("wheel", pause);
      document.removeEventListener("visibilitychange", onVisible);
      ro.disconnect();
      graph._destructor();
      state.current = null;
    };
  }, [view]);

  // ── unfold / fold ─────────────────────────────────────────────────────────
  useEffect(() => {
    const st = state.current;
    if (!st) return;
    const base = view.nodes.map((n) => st.nodes.get(n.id)!).filter(Boolean);
    const extra: SceneNode[] = [];
    const extraLinks: OverviewLink[] = [];
    for (const id of expandedIds) {
      const parent = st.nodes.get(id);
      if (!parent?.expand) continue;
      parent.expand.nodes.forEach((x, i) => {
        let sn = st.nodes.get(x.id);
        if (!sn) {
          sn = {
            ...x,
            fz: st.layerZ[x.layer] ?? parent.fz,
            x: (parent.x ?? 0) + Math.cos(i) * 30,
            y: (parent.y ?? 0) + Math.sin(i) * 30,
          };
          st.nodes.set(x.id, sn);
        }
        extra.push(sn);
      });
      extraLinks.push(...parent.expand.links);
    }
    const all = [...base, ...extra];
    const known = new Set(all.map((n) => n.id));
    const links: SceneLink[] = [...view.links, ...extraLinks]
      .filter((l) => known.has(l.source) && known.has(l.target))
      .map((l) => ({ ...l }));
    st.graph.graphData({ nodes: all, links });
    st.graph.d3ReheatSimulation();
  }, [view, expandedIds]);

  // ── focus ─────────────────────────────────────────────────────────────────
  const selectedRef = useRef<string | null>(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => {
    const st = state.current;
    if (!st) return;
    if (!selectedId) {
      st.orbiting = false;
      if (st.idleTimer) clearTimeout(st.idleTimer);
      st.idleTimer = setTimeout(() => (st.orbiting = true), 3000);
      return;
    }
    const n = st.nodes.get(selectedId);
    if (!n) return;
    st.focused = true;
    st.orbiting = false;
    if (st.idleTimer) clearTimeout(st.idleTimer);
    const dist = 230;
    const cam = st.graph.camera();
    const nx = n.x ?? 0;
    const ny = n.y ?? 0;
    const nz = n.z ?? n.fz ?? 0;
    const from = cam.position
      .clone()
      .sub(new THREE.Vector3(nx, ny, nz))
      .normalize();
    st.graph.cameraPosition(
      {
        x: nx + from.x * dist,
        y: ny + from.y * dist,
        z: nz + from.z * dist + 40,
      },
      { x: nx, y: ny, z: nz },
      900,
    );
    const t = setTimeout(() => (st.focused = false), 12000);
    return () => clearTimeout(t);
  }, [selectedId]);

  return (
    <div
      ref={ref}
      className={className}
      data-testid="overview-canvas"
      role="img"
      aria-label="Layered 3D scene of the overview; every node is also in the list"
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}
