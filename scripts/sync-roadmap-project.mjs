#!/usr/bin/env node
/**
 * Keeps the GitHub Project "Roadmap to 2031" and ui/src/lib/docs/roadmap.ts
 * in step. The Project is where the plan is edited: drag a bar in its Roadmap
 * view, change a priority or a status. roadmap.ts stays what /docs/roadmap
 * draws, with the notes, sources and translations the Project does not hold.
 *
 *   node scripts/sync-roadmap-project.mjs check   what differs (exit 1 if anything)
 *   node scripts/sync-roadmap-project.mjs pull    Project edits into roadmap.ts
 *   node scripts/sync-roadmap-project.mjs push    roadmap.ts into the Project
 *   node scripts/sync-roadmap-project.mjs create  a new Project with its fields
 *
 * What travels: per issue its Start, Target, Priority, Status and Lane; per
 * milestone (a draft item marked <!-- roadmap:<id> -->) its date. push also
 * gives every issue the GitHub milestone of the deadline its priority sets
 * (DEADLINES), so the Project groups the epics under it and draws it as a
 * marker. The Project also holds every other open issue, with a Priority
 * and under its epic (a parent issue labelled "epic"). roadmap.ts names the
 * epics (EPICS) with their sub-issues by priority: check compares those with
 * GitHub and the Project, pull writes them back, and push gives each epic
 * its bar (epicWindow(), derived from its issues, never edited by hand), its
 * Priority and its Lane. Any other issue is left alone. Needs
 * Node 23.6 or later (it imports roadmap.ts as it is) and `gh` with the
 * project scope (`gh auth refresh -s project`).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Node notes that roadmap.ts is an ES module without "type": "module"; it is.
process.removeAllListeners("warning");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROADMAP_TS = path.join(ROOT, "ui/src/lib/docs/roadmap.ts");
const OWNER = "ma3u";
const REPO_NAME = "MinimumViableHealthDataspacev2";
const TITLE = "Roadmap to 2031";

const roadmap = await import(ROADMAP_TS);
const { ITEMS, EPICS, MILESTONES, LANES, ROADMAP_PROJECT, epicWindow } =
  roadmap;
const PRIORITIES = ["P1", "P2", "P3"];

/** roadmap.ts's statuses and the Project's Status options, both ways. */
const STATUS = {
  planned: "Planned",
  "in-progress": "In progress",
  blocked: "Blocked",
  done: "Done",
};
const STATUS_BACK = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [v, k]),
);
const MARK = (id) => `<!-- roadmap:${id} -->`;

/** The deadline each priority sets, as a GitHub milestone (the page's
 *  intro: P1 due by 26 March 2027, P2 by 26 March 2029, P3 a comment). */
const DEADLINES = {
  P1: {
    title: "P1: EHDS applies",
    due_on: "2027-03-26T23:59:59Z",
    description:
      "Regulation (EU) 2025/327 applies generally (Art. 105). The P1 items of the roadmap are due by then. https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/roadmap",
  },
  P2: {
    title: "P2: Secondary use in full",
    due_on: "2029-03-26T23:59:59Z",
    description:
      "Chapter IV in full and dataset descriptions under 2026/2098 (Art. 105). The P2 items of the roadmap are due by then. https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/roadmap",
  },
  P3: {
    title: "P3: Comments on Simpl-Open",
    due_on: "2027-03-31T23:59:59Z",
    description:
      "The hub's comments on the requirements Simpl-Open proposed at its Community Preview of 28 October 2026 (BP02E, BP02F, BP02G, SA12). Comments, not builds.",
  },
};

function rest(method, route, body) {
  const out = execFileSync(
    "gh",
    ["api", "-X", method, route, ...(body ? ["--input", "-"] : [])],
    { input: body ? JSON.stringify(body) : undefined, encoding: "utf8" },
  );
  return out ? JSON.parse(out) : null;
}

/** The repository's milestones by title, the deadlines' created if missing. */
function deadlines(createMissing) {
  const repo = `repos/${OWNER}/${REPO_NAME}`;
  const have = Object.fromEntries(
    rest("GET", `${repo}/milestones?state=all&per_page=100`).map((m) => [
      m.title,
      m,
    ]),
  );
  for (const d of Object.values(DEADLINES)) {
    if (have[d.title] || !createMissing) continue;
    have[d.title] = rest("POST", `${repo}/milestones`, d);
    console.log(`created milestone ${d.title}`);
  }
  return have;
}

/** Issues whose GitHub milestone is not their priority's deadline. */
function milestoneDrift() {
  return ITEMS.map((i) => {
    const issue = rest("GET", `repos/${OWNER}/${REPO_NAME}/issues/${i.issue}`);
    return {
      issue: i.issue,
      want: DEADLINES[i.priority].title,
      have: issue.milestone?.title ?? null,
    };
  }).filter((r) => r.want !== r.have);
}

/** Each epic's sub-issues as GitHub and the Project hold them: the open ones
 *  by their Project priority, the closed ones apart. */
function epicMembers(project) {
  return EPICS.map((e) => {
    const subs = rest(
      "GET",
      `repos/${OWNER}/${REPO_NAME}/issues/${e.issue}/sub_issues?per_page=100`,
    );
    const open = { P1: [], P2: [], P3: [] };
    const done = [];
    for (const s of subs) {
      if (s.state === "closed") done.push(s.number);
      else {
        const p = project.items[`i${s.number}`]?.values.Priority;
        if (!PRIORITIES.includes(p))
          throw new Error(
            `#${s.number} under #${e.issue} has no Priority in the Project`,
          );
        open[p].push(s.number);
      }
    }
    for (const p of PRIORITIES) open[p].sort((a, b) => a - b);
    done.sort((a, b) => a - b);
    return { epic: e, open, done };
  });
}

/** Epics whose sub-issues in roadmap.ts differ from GitHub's. */
function epicDrift(project) {
  const same = (a, b) =>
    a.length === b.length &&
    [...a].sort((x, y) => x - y).every((n, i) => n === b[i]);
  return epicMembers(project).filter(
    (m) =>
      !same(m.epic.done, m.done) ||
      PRIORITIES.some((p) => !same(m.epic.open[p], m.open[p])),
  );
}

const members = (m) =>
  [
    ...PRIORITIES.map((p) => `${p} ${m.open[p].join(" ") || "-"}`),
    `done ${m.done.join(" ") || "-"}`,
  ].join("; ");

function gql(query, variables = {}) {
  const out = execFileSync("gh", ["api", "graphql", "--input", "-"], {
    input: JSON.stringify({ query, variables }),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const res = JSON.parse(out);
  if (res.errors) throw new Error(JSON.stringify(res.errors, null, 2));
  return res.data;
}

function projectNumber() {
  const m = /\/projects\/(\d+)$/.exec(ROADMAP_PROJECT ?? "");
  if (!m) throw new Error("ROADMAP_PROJECT in roadmap.ts names no project");
  return Number(m[1]);
}

/** The Project, its fields by name and its items keyed "i<issue>" or "m_<id>".
 *  It holds every open issue under its epic, not only roadmap.ts's, so the
 *  items come a page of 100 at a time. */
function readProject() {
  let p;
  const nodes = [];
  for (let after = null; ; ) {
    const data = gql(
      `query($owner: String!, $number: Int!, $after: String) {
        user(login: $owner) { projectV2(number: $number) {
          id url
          fields(first: 50) { nodes {
            ... on ProjectV2FieldCommon { id name dataType }
            ... on ProjectV2SingleSelectField { options { id name } }
          } }
          items(first: 100, after: $after) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              content {
                ... on Issue { number }
                ... on DraftIssue { id title body }
              }
              fieldValues(first: 20) { nodes {
                ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { name } } }
                ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
              } }
            }
          }
        } }
      }`,
      { owner: OWNER, number: projectNumber(), after },
    );
    p = data.user.projectV2;
    nodes.push(...p.items.nodes);
    if (!p.items.pageInfo.hasNextPage) break;
    after = p.items.pageInfo.endCursor;
  }
  const fields = Object.fromEntries(p.fields.nodes.map((f) => [f.name, f]));
  const items = {};
  for (const n of nodes) {
    const values = Object.fromEntries(
      n.fieldValues.nodes
        .filter((v) => v.field)
        .map((v) => [v.field.name, v.date ?? v.name]),
    );
    if (n.content?.number) items[`i${n.content.number}`] = { ...n, values };
    const mark = /<!-- roadmap:([\w-]+) -->/.exec(n.content?.body ?? "");
    if (mark) items[`m_${mark[1]}`] = { ...n, values };
  }
  return { id: p.id, url: p.url, fields, items };
}

/** What the Project should hold for every item and milestone. */
function wanted() {
  const lane = (id) => LANES.find((l) => l.id === id).label;
  return [
    ...ITEMS.map((i) => ({
      key: `i${i.issue}`,
      label: `#${i.issue} ${i.short}`,
      issue: i.issue,
      values: {
        Start: i.start,
        Target: i.end,
        Priority: i.priority,
        Status: STATUS[i.status],
        Lane: lane(i.lane),
        Kind: "Issue",
      },
    })),
    ...EPICS.map((e) => {
      const w = epicWindow(e);
      return {
        key: `i${e.issue}`,
        label: `#${e.issue} epic ${e.short}`,
        issue: e.issue,
        epic: e,
        values: {
          Start: w.start,
          Target: w.end,
          Priority: e.priority,
          Lane: lane(e.lane),
        },
      };
    }),
    ...MILESTONES.map((m) => ({
      key: `m_${m.id}`,
      label: `◆ ${m.label}`,
      milestone: m,
      values: {
        Start: m.date,
        Target: m.date,
        Lane: lane(m.lane),
        Kind: "Milestone",
      },
    })),
  ];
}

function diff(project) {
  const rows = [];
  for (const w of wanted()) {
    const have = project.items[w.key];
    if (!have) {
      rows.push({ w, field: "(item)", repo: "present", project: "missing" });
      continue;
    }
    for (const [field, value] of Object.entries(w.values)) {
      if ((have.values[field] ?? null) !== value)
        rows.push({
          w,
          have,
          field,
          repo: value,
          project: have.values[field] ?? null,
        });
    }
  }
  return rows;
}

function setValue(project, itemId, field, value) {
  const f = project.fields[field];
  if (!f) throw new Error(`The Project has no field ${field}; run create`);
  const v =
    f.dataType === "DATE"
      ? { date: value }
      : { singleSelectOptionId: f.options.find((o) => o.name === value)?.id };
  if (v.singleSelectOptionId === undefined && f.dataType !== "DATE")
    throw new Error(`${field} has no option ${value}`);
  gql(
    `mutation($p: ID!, $i: ID!, $f: ID!, $v: ProjectV2FieldValue!) {
      updateProjectV2ItemFieldValue(input: {projectId: $p, itemId: $i, fieldId: $f, value: $v}) { clientMutationId }
    }`,
    { p: project.id, i: itemId, f: f.id, v },
  );
}

function push() {
  let project = readProject();
  for (const w of wanted()) {
    if (project.items[w.key]) continue;
    if (w.issue) {
      const { repository } = gql(
        `query($o: String!, $r: String!, $n: Int!) { repository(owner: $o, name: $r) { issue(number: $n) { id } } }`,
        { o: OWNER, r: REPO_NAME, n: w.issue },
      );
      gql(
        `mutation($p: ID!, $c: ID!) { addProjectV2ItemById(input: {projectId: $p, contentId: $c}) { item { id } } }`,
        { p: project.id, c: repository.issue.id },
      );
    } else {
      const m = w.milestone;
      gql(
        `mutation($p: ID!, $t: String!, $b: String!) { addProjectV2DraftIssue(input: {projectId: $p, title: $t, body: $b}) { projectItem { id } } }`,
        {
          p: project.id,
          t: w.label,
          b: `${m.detail}\n\nSource: ${
            m.href
          }\n\nA date set by law or by a programme: change it in ui/src/lib/docs/roadmap.ts, with its source.\n\n${MARK(
            m.id,
          )}`,
        },
      );
    }
    console.log(`added ${w.label}`);
  }
  // A new item can take a moment to show in the Project's own listing.
  for (let tries = 0; ; tries++) {
    project = readProject();
    if (wanted().every((w) => project.items[w.key]) || tries === 5) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  for (const r of diff(project)) {
    if (!project.items[r.w.key])
      throw new Error(`${r.w.label} is not in the Project yet; run push again`);
    setValue(project, project.items[r.w.key].id, r.field, r.repo);
    console.log(`${r.w.label}: ${r.field} ${r.project ?? "-"} -> ${r.repo}`);
  }
  const milestones = deadlines(true);
  for (const r of milestoneDrift()) {
    rest("PATCH", `repos/${OWNER}/${REPO_NAME}/issues/${r.issue}`, {
      milestone: milestones[r.want].number,
    });
    console.log(`#${r.issue}: milestone ${r.have ?? "-"} -> ${r.want}`);
  }
  console.log(project.url);
}

/** Replaces `key: "old"` with the new value inside one object literal of roadmap.ts. */
function editBlock(src, anchor, key, value) {
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`roadmap.ts has no ${anchor}`);
  const end = src.indexOf("\n  },", at);
  const block = src.slice(at, end);
  const re = new RegExp(`(\\b${key}: )"[^"]*"`);
  if (!re.test(block)) throw new Error(`${anchor} has no ${key}`);
  return src.slice(0, at) + block.replace(re, `$1"${value}"`) + src.slice(end);
}

function pull() {
  const project = readProject();
  let src = readFileSync(ROADMAP_TS, "utf8");
  const back = {
    Start: "start",
    Target: "end",
    Priority: "priority",
    Status: "status",
  };
  let changed = 0;
  for (const r of diff(project)) {
    if (!r.have || r.project === null) continue;
    if (r.w.epic && (r.field === "Start" || r.field === "Target")) {
      console.log(
        `${r.w.label}: ${r.field} follows its issues (${r.repo}); move them instead`,
      );
      continue;
    }
    if (r.w.issue && back[r.field]) {
      const value = r.field === "Status" ? STATUS_BACK[r.project] : r.project;
      src = editBlock(src, `issue: ${r.w.issue},`, back[r.field], value);
    } else if (r.w.milestone && r.field === "Start") {
      src = editBlock(src, `id: "${r.w.milestone.id}",`, "date", r.project);
    } else {
      console.log(
        `${r.w.label}: ${r.field} is set in roadmap.ts only (${r.repo})`,
      );
      continue;
    }
    console.log(`${r.w.label}: ${r.field} ${r.repo} -> ${r.project}`);
    changed++;
  }
  for (const m of epicDrift(project)) {
    const at = src.indexOf(`issue: ${m.epic.issue},`);
    const end = src.indexOf("\n  },", at);
    const block = src
      .slice(at, end)
      .replace(
        /open: \{[\s\S]*?\},\n(\s*)done: \[[^\]]*\],/,
        (_, indent) =>
          `open: { ${PRIORITIES.map(
            (p) => `${p}: [${m.open[p].join(", ")}]`,
          ).join(", ")} },\n${indent}done: [${m.done.join(", ")}],`,
      );
    src = src.slice(0, at) + block + src.slice(end);
    console.log(`#${m.epic.issue} epic: ${members(m)}`);
    changed++;
  }
  if (changed) writeFileSync(ROADMAP_TS, src);
  console.log(
    changed
      ? `${changed} change(s) written to ui/src/lib/docs/roadmap.ts; update its notes and ROADMAP_PLANNED_ON if the plan moved.`
      : "roadmap.ts already matches the Project.",
  );
}

function check() {
  const project = readProject();
  const rows = diff(project);
  for (const r of rows)
    console.log(
      `${r.w.label}: ${r.field} repo=${r.repo} project=${r.project ?? "-"}`,
    );
  const drift = milestoneDrift();
  for (const r of drift)
    console.log(`#${r.issue}: milestone ${r.have ?? "-"}, due ${r.want}`);
  const epics = epicDrift(project);
  for (const m of epics)
    console.log(`#${m.epic.issue} epic: GitHub has ${members(m)}`);
  const n = rows.length + drift.length + epics.length;
  console.log(n ? `${n} difference(s)` : "in step");
  process.exitCode = n ? 1 : 0;
}

function create() {
  const { user, repository } = gql(
    `query($o: String!, $r: String!) { user(login: $o) { id } repository(owner: $o, name: $r) { id } }`,
    { o: OWNER, r: REPO_NAME },
  );
  const { createProjectV2 } = gql(
    `mutation($o: ID!, $r: ID!, $t: String!) { createProjectV2(input: {ownerId: $o, repositoryId: $r, title: $t}) { projectV2 { id number url } } }`,
    { o: user.id, r: repository.id, t: TITLE },
  );
  const p = createProjectV2.projectV2;
  // Public, since /docs/roadmap links it.
  gql(
    `mutation($p: ID!, $d: String!, $r: String!) { updateProjectV2(input: {projectId: $p, public: true, shortDescription: $d, readme: $r}) { clientMutationId } }`,
    {
      p: p.id,
      d: "The EHDS hub's plan to 2031: issues as planning windows, milestones set by law or by the programmes.",
      r: "Edit the plan here: drag a bar in the Roadmap view, or change Start, Target, Priority or Status.\n\n`node scripts/sync-roadmap-project.mjs pull` writes the edits into `ui/src/lib/docs/roadmap.ts`, which https://ma3u.github.io/MinimumViableHealthDataspacev2/docs/roadmap draws with its notes and sources. Milestones are dates set by law or by a programme: change them in roadmap.ts, with their source.",
    },
  );
  const opt = (name, color, description = "") => ({ name, color, description });
  const fields = [
    { name: "Start", dataType: "DATE" },
    { name: "Target", dataType: "DATE" },
    {
      name: "Lane",
      dataType: "SINGLE_SELECT",
      singleSelectOptions: LANES.map((l, i) =>
        opt(
          l.label,
          ["BLUE", "PURPLE", "GREEN", "ORANGE", "YELLOW", "PINK"][i],
        ),
      ),
    },
    {
      name: "Priority",
      dataType: "SINGLE_SELECT",
      singleSelectOptions: [
        opt("P1", "RED", "Due by 26 March 2027"),
        opt("P2", "ORANGE", "Due by 26 March 2029"),
        opt("P3", "GRAY", "A comment, not a build"),
      ],
    },
    {
      name: "Kind",
      dataType: "SINGLE_SELECT",
      singleSelectOptions: [
        opt("Issue", "BLUE", "A planning window"),
        opt("Milestone", "PURPLE", "A date set by law or by a programme"),
      ],
    },
  ];
  for (const f of fields)
    gql(
      `mutation($i: CreateProjectV2FieldInput!) { createProjectV2Field(input: $i) { clientMutationId } }`,
      { i: { projectId: p.id, ...f } },
    );
  // The built-in Status field takes roadmap.ts's four statuses.
  const project = { id: p.id, ...readFields(p.number) };
  gql(
    `mutation($f: ID!, $o: [ProjectV2SingleSelectFieldOptionInput!]) { updateProjectV2Field(input: {fieldId: $f, singleSelectOptions: $o}) { clientMutationId } }`,
    {
      f: project.fields.Status.id,
      o: [
        opt("Planned", "BLUE"),
        opt("In progress", "YELLOW"),
        opt("Blocked", "RED"),
        opt("Done", "GREEN"),
      ],
    },
  );
  console.log(
    `${p.url}\nSet ROADMAP_PROJECT in roadmap.ts to it, then run push.`,
  );
}

function readFields(number) {
  const data = gql(
    `query($o: String!, $n: Int!) { user(login: $o) { projectV2(number: $n) { fields(first: 50) { nodes {
      ... on ProjectV2FieldCommon { id name dataType }
    } } } } }`,
    { o: OWNER, n: number },
  );
  return {
    fields: Object.fromEntries(
      data.user.projectV2.fields.nodes.map((f) => [f.name, f]),
    ),
  };
}

const commands = { check, pull, push, create };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.error("usage: sync-roadmap-project.mjs check | pull | push | create");
  process.exit(2);
}
commands[cmd]();
