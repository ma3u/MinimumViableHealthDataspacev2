// The persona overview behind the cover and the close of the deck: the
// patient's view on the first slide, the researcher's on the last, drawn
// with the prototype engine under poc/persona-3d/ (3d-force-graph on
// three.js) so the deck shows the same scene as /overview and the POC.
//
// The view comes from the platform when the presenter is signed in
// (GET /api/overview?persona=), else from the static fixture under /mock
// that mirrors the same shape; the static export has no API at all. If
// the module or WebGL fails, the deck keeps its canvas drawing.
import {
  ForceGraph3D,
  THREE,
  LAYER_GAP,
  STATUS_COLOR,
  nodeObject,
  layerPlane,
} from "../../poc/persona-3d/engine.js";

const W = 1600;
const H = 900;

async function fetchJson(url, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      credentials: "same-origin",
    });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("json")) throw new Error(`${url} is not JSON`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/** The live view when the session may open it, else the fixture. */
export async function loadView(persona) {
  try {
    const v = await fetchJson(`../../api/overview?persona=${persona}`, 6000);
    if (v && Array.isArray(v.nodes) && v.nodes.length)
      return { view: v, source: "live" };
  } catch {
    /* not signed in, wrong role, or no API: the fixture below */
  }
  return {
    view: await fetchJson(`../../mock/overview_${persona}.json`, 15000),
    source: "fixture",
  };
}

/**
 * Mount one view into `root` (1600 x 900, the slide canvas), slowly orbiting.
 * opts.shiftX moves the stack to the right, in slide pixels, so it sits
 * beside the text; opts.zoom scales the camera distance.
 * Returns { pause, resume, source }.
 */
export async function mountBackground(root, persona, opts = {}) {
  const { view, source } = await loadView(persona);
  const layerZ = Object.fromEntries(
    view.layers.map((l) => [l.id, l.z * LAYER_GAP]),
  );
  const nodes = view.nodes.map((n) => {
    const sn = { ...n, fz: layerZ[n.layer] ?? 0 };
    if (n.pin) {
      sn.fx = n.pin[0];
      sn.fy = n.pin[1];
    }
    return sn;
  });
  const ids = new Set(nodes.map((n) => n.id));
  const links = view.links
    .filter((l) => ids.has(l.source) && ids.has(l.target))
    .map((l) => ({ ...l }));

  const Graph = ForceGraph3D({ controlType: "orbit" })(root)
    .width(W)
    .height(H)
    .backgroundColor(opts.background ?? "#14213d")
    .showNavInfo(false)
    .enablePointerInteraction(false)
    .enableNodeDrag(false)
    .enableNavigationControls(false)
    .nodeThreeObject(nodeObject)
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
    .graphData({ nodes, links });
  Graph.d3Force("charge").strength(-90);
  Graph.d3Force("link").distance((l) => l.distance ?? 60);

  // layer discs, sized by how far their nodes reach
  const BASE_R = 100;
  const planes = {};
  view.layers.forEach((l) => {
    planes[l.id] = layerPlane(l, BASE_R);
    Graph.scene().add(planes[l.id]);
  });
  let maxR = 100;
  function fitPlanes() {
    maxR = 100;
    view.layers.forEach((l) => {
      let r = 60;
      nodes.forEach((n) => {
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
  Graph.scene().add(new THREE.AmbientLight(0xffffff, 0.35));

  // camera: the stack from a raised angle, orbiting; shifted right so the
  // slide's text keeps the left
  const cam = Graph.camera();
  cam.up.set(0, 0, 1);
  const zs = view.layers.map((l) => l.z);
  const zSpan = Math.max(...zs) - Math.min(...zs);
  const zMid = ((Math.max(...zs) + Math.min(...zs)) / 2) * LAYER_GAP;
  const D = Math.max(380 + zSpan * 45, maxR * 1.9) * (opts.zoom ?? 1);
  const target = new THREE.Vector3(0, 0, zMid);
  // The host slides right by shiftX; the slide's frame clips what spills over.
  root.style.left = `${opts.shiftX ?? 0}px`;
  Graph.cameraPosition({ x: 0, y: -D, z: zMid + D * 0.6 }, target, 0);

  let angle = 0;
  let running = true;
  let t0 = performance.now();
  let frameNo = 0;
  function frame(t) {
    if (!running) return;
    const dt = Math.min((t - t0) / 1000, 0.1);
    t0 = t;
    angle += dt * (opts.speed ?? 0.1);
    const p = cam.position;
    const rad = Math.hypot(p.x, p.y) || D;
    cam.position.set(Math.sin(angle) * rad, -Math.cos(angle) * rad, p.z);
    cam.lookAt(target);
    if (frameNo++ % 30 === 0) fitPlanes();
    const s = 1 + 0.18 * Math.sin(t / 380);
    nodes.forEach((n) => {
      const h = n.__threeObj?.userData?.halo;
      if (h && h.userData.pulse)
        h.scale.set(h.userData.base * s, h.userData.base * s, 1);
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    source,
    view,
    pause() {
      if (!running) return;
      running = false;
      Graph.pauseAnimation();
    },
    resume() {
      if (running) return;
      running = true;
      t0 = performance.now();
      Graph.resumeAnimation();
      requestAnimationFrame(frame);
    },
  };
}
