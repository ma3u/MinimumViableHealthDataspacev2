#!/usr/bin/env python3
"""Builds the MVHD Grafana dashboards (ADR-045 decision 5, #418).

Run after a change and commit both this file and its output:

    python3 observability/grafana/build-dashboards.py

Three dashboards, all read-only provisioned:

- EHDS audit trail: is the evidence intact (hash chains verified by the
  proxy), what was recorded, what was refused, did an audit write fail.
- EDC contracts and transfers: every DSP negotiation and transfer by state,
  refusals and failures with their reasons, and the connector services' errors.
- Load and stress test (#519): k6's view of a run (load, response time by kind
  and endpoint), the proxy's own view of the same run, and container stats.

Data: every audit number is counted from the hash chain itself, through the
proxy's read-only endpoints and the Infinity datasource. Loki supplies only what
leaves no record: failed audit writes, and the connector services' errors. The
log-line copy is not used for counting: locally the Docker observer restarts
its receivers on health-check events and can miss lines (ADR-045, #418).
"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboards")
LOKI = {"type": "loki", "uid": "loki"}
AUDIT = {"type": "yesoreyeram-infinity-datasource", "uid": "mvhd-audit"}
PROXY = '{service_name=~".*neo4j-proxy.*"}'
EDC = 'health-dataspace-(controlplane|dataplane-fhir|dataplane-omop|identityhub|issuerservice)|mvhd-(controlplane|dp-fhir|dp-omop|identityhub|issuerservice)'

OUTCOME_MAP = [
    {"type": "value", "options": {
        "0": {"text": "success", "color": "green", "index": 0},
        "4": {"text": "refused", "color": "orange", "index": 1},
        "8": {"text": "failure", "color": "red", "index": 2},
    }},
]


class Ids:
    def __init__(self):
        self.n = 0

    def next(self):
        self.n += 1
        return self.n


def loki(expr, legend="", instant=False):
    return {"datasource": LOKI, "expr": expr, "legendFormat": legend,
            "queryType": "instant" if instant else "range", "refId": "A"}


def infinity(path, columns):
    return {
        "datasource": AUDIT, "refId": "A", "type": "json", "source": "url",
        "format": "table", "parser": "backend", "url": path,
        "url_options": {"method": "GET", "data": ""}, "root_selector": "",
        "columns": [{"selector": s, "text": t, "type": ty} for s, t, ty in columns],
    }


def stats_target(chain, root):
    """Counts from the chain itself (proxy /audit/chains/<chain>/stats)."""
    cols = ([("type", "type", "string"), ("outcome", "outcome", "string"), ("count", "count", "number")]
            if root == "totals" else
            [("time", "time", "timestamp"), ("type", "type", "string"), ("count", "count", "number")])
    t = infinity(f"/audit/chains/{chain}/stats?from=${{__from}}&to=${{__to}}", cols)
    t["root_selector"] = root
    return t


def only(field, regex):
    return [{"id": "filterByValue", "options": {
        "type": "include", "match": "all",
        "filters": [{"fieldName": field, "config": {"id": "regex", "options": {"value": f"^({regex})$"}}}]}}]


def chain_stat(ids, title, chain, type_regex, x, y, w=4, h=4, thresholds=None, description="",
               field="type"):
    p = stat(ids, title, stats_target(chain, "totals"), x, y, w=w, h=h, thresholds=thresholds,
             description=description, reduce="sum", fields="/^count$/")
    p["transformations"] = only(field, type_regex)
    return p


def chain_series(ids, title, chain, type_regex, x, y, w=12, h=8, description=""):
    t = stats_target(chain, "series")
    return {
        "type": "timeseries", "id": ids.next(), "title": title, "description": description,
        "datasource": AUDIT, "targets": [t],
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "transformations": only("type", type_regex) + [
            {"id": "partitionByValues", "options": {"fields": ["type"], "keepFields": False}}],
        "fieldConfig": {"defaults": {"custom": {
            "drawStyle": "bars", "fillOpacity": 70, "lineWidth": 1,
            "stacking": {"mode": "normal", "group": "A"}}, "unit": "short",
            "displayName": "${__field.labels.type}"}, "overrides": []},
        "options": {"legend": {"displayMode": "table", "placement": "right", "calcs": ["sum"]},
                    "tooltip": {"mode": "multi"}},
    }


def row(ids, title, y):
    return {"type": "row", "id": ids.next(), "title": title, "collapsed": False,
            "gridPos": {"h": 1, "w": 24, "x": 0, "y": y}, "panels": []}


def stat(ids, title, target, x, y, w=4, h=4, mappings=None, thresholds=None,
         unit="none", description="", reduce="lastNotNull", fields=""):
    return {
        "type": "stat", "id": ids.next(), "title": title, "description": description,
        "datasource": target["datasource"], "targets": [target],
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "options": {"reduceOptions": {"calcs": [reduce], "fields": fields, "values": False},
                    "colorMode": "background", "graphMode": "none", "textMode": "value",
                    "justifyMode": "center"},
        "fieldConfig": {"defaults": {
            "unit": unit, "mappings": mappings or [],
            "thresholds": thresholds or {"mode": "absolute", "steps": [
                {"color": "blue", "value": None}]},
            "noValue": "0"}, "overrides": []},
    }


def timeseries(ids, title, expr, legend, x, y, w=12, h=8, description="", stack=True):
    return {
        "type": "timeseries", "id": ids.next(), "title": title, "description": description,
        "datasource": LOKI, "targets": [loki(expr, legend)],
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "fieldConfig": {"defaults": {"custom": {
            "drawStyle": "bars", "fillOpacity": 70, "lineWidth": 1,
            "stacking": {"mode": "normal" if stack else "none", "group": "A"}},
            "unit": "short"}, "overrides": []},
        "options": {"legend": {"displayMode": "table", "placement": "right",
                               "calcs": ["sum"]},
                    "tooltip": {"mode": "multi"}},
    }


def table(ids, title, target, x, y, w=24, h=10, transformations=None,
          description="", overrides=None):
    return {
        "type": "table", "id": ids.next(), "title": title, "description": description,
        "datasource": target["datasource"], "targets": [target],
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "options": {"showHeader": True, "cellHeight": "sm",
                    "footer": {"show": False}},
        "fieldConfig": {"defaults": {"custom": {"filterable": True}},
                        "overrides": overrides or []},
        "transformations": transformations or [],
    }


def logs(ids, title, expr, x, y, w=24, h=10, description=""):
    return {
        "type": "logs", "id": ids.next(), "title": title, "description": description,
        "datasource": LOKI, "targets": [loki(expr)],
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "options": {"showTime": True, "wrapLogMessage": True, "sortOrder": "Descending",
                    "enableLogDetails": True, "dedupStrategy": "none"},
    }


def text(ids, content, x, y, w=24, h=3):
    return {"type": "text", "id": ids.next(), "title": "",
            "gridPos": {"h": h, "w": w, "x": x, "y": y},
            "options": {"mode": "markdown", "content": content}}


def shift(panels, dy):
    """Moves panels down by dy grid rows, to make room above them."""
    for panel in panels:
        panel["gridPos"]["y"] += dy
    return panels


def newest_record(ids, chain, x, y, w=6, h=3):
    """When the chain's newest record was written, as "3 hours ago"."""
    p = stat(ids, "Newest record", infinity(f"/audit/chains/{chain}/events?limit=1",
                                             [("recorded", "recorded", "timestamp")]),
             x, y, w=w, h=h, unit="dateTimeFromNow", fields="/^recorded$/",
             description="The newest record in the chain, whatever the time range. An empty range "
                         "with an old newest record means nothing happened since.")
    p["fieldConfig"]["defaults"]["noValue"] = "no records yet"
    return p


def chain_head(ids, title, chain, x, y, w=12, h=4):
    """The chain's head hash and length, to copy into the audit report."""
    return table(ids, title, infinity(f"/audit/chains/{chain}/verify",
                                      [("ok", "Intact", "string"), ("count", "Records", "number"),
                                       ("head", "Head hash (SHA-256)", "string")]),
                 x, y, w=w, h=h,
                 description="Copy both values into the audit report. At the next audit the chain must "
                             "still hold this head at the same record number; if it does not, records "
                             "before it were rewritten.",
                 overrides=[{"matcher": {"id": "byName", "options": "Head hash (SHA-256)"},
                             "properties": [{"id": "custom.width", "value": 620}]}],
                 transformations=[{"id": "organize", "options": {"indexByName": {
                     "Intact": 0, "Records": 1, "Head hash (SHA-256)": 2}}}])


def count_over_range(selector):
    return f"sum(count_over_time({selector} [$__range]))"


def dashboard(uid, title, description, panels, tags):
    return {
        "uid": uid, "title": title, "description": description, "tags": tags,
        "timezone": "browser", "editable": False, "graphTooltip": 1,
        "time": {"from": "now-24h", "to": "now"}, "refresh": "1m",
        "schemaVersion": 39, "version": 1, "panels": panels,
        "templating": {"list": []}, "annotations": {"list": []},
        "links": [{"title": "Runbook: cost-efficient logging", "type": "link",
                   "url": "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/knowledge/runbooks/cost-efficient-logging.md",
                   "targetBlank": True},
                  {"title": "ADR-045", "type": "link",
                   "url": "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-045-observability-and-regulatory-audit-trail.md",
                   "targetBlank": True}],
    }


INTACT = [{"type": "value", "options": {
    "true": {"text": "INTACT", "color": "green", "index": 0},
    "false": {"text": "BROKEN", "color": "red", "index": 1}}}]
ALERT_ON_ANY = {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                              {"color": "red", "value": 1}]}
WARN_ON_ANY = {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                             {"color": "orange", "value": 1}]}

RECORD_COLUMNS = [
    ("seq", "Seq", "number"), ("recorded", "Recorded", "timestamp"),
    ("type", "What", "string"), ("outcome", "Outcome", "string"),
    ("outcomeDesc", "Reason", "string"), ("agents", "Parties", "string"),
    ("entities", "Agreement, asset, permit", "string"),
    ("source", "Reported by", "string"), ("demo", "Demo", "boolean"),
    ("loadTest", "Load test run", "string"), ("hash", "Hash", "string"),
]
OUTCOME_OVERRIDE = [{"matcher": {"id": "byName", "options": "Outcome"},
                     "properties": [{"id": "mappings", "value": OUTCOME_MAP},
                                    {"id": "custom.cellOptions",
                                     "value": {"type": "color-background"}}]},
                    {"matcher": {"id": "byName", "options": "Hash"},
                     "properties": [{"id": "custom.width", "value": 160}]}]


# ---------------------------------------------------------------------------
# Load and stress test (#519)
# ---------------------------------------------------------------------------

PROM = {"type": "prometheus", "uid": "prometheus"}
K6 = 'testid="$testid"'
PROXY_RUN = '{service_name=~".*neo4j-proxy.*"} | json | __error__="" | load_test="$testid"'
CONTAINERS = 'container_name=~"health-dataspace-.*"'
# | json: over OTLP (Azure) the fields are only in the JSON body; from a
# container's stdout (compose) the collector has already lifted them.
AUDIT_LINES = ('{service_name=~".*neo4j-proxy.*"} | json | msg="audit recorded" | keep audit_chain, audit_batch '
               '| unwrap audit_batch | __error__=""')


def prom(expr, legend="", instant=False, ref="A"):
    t = {"datasource": PROM, "expr": expr, "legendFormat": legend, "refId": ref}
    if instant:
        t.update({"instant": True, "range": False, "format": "table"})
    return t


def series(ids, title, targets, x, y, w=12, h=8, unit="short", description="",
           datasource=PROM, draw="line", stack=False, legend_calcs=("max", "last")):
    return {
        "type": "timeseries", "id": ids.next(), "title": title, "description": description,
        "datasource": datasource, "targets": targets,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "fieldConfig": {"defaults": {"custom": {
            "drawStyle": draw, "fillOpacity": 70 if draw == "bars" else 10,
            "lineWidth": 1, "showPoints": "never",
            "stacking": {"mode": "normal" if stack else "none", "group": "A"}},
            "unit": unit}, "overrides": []},
        "options": {"legend": {"displayMode": "table", "placement": "right",
                               "calcs": list(legend_calcs), "sortBy": "Max", "sortDesc": True},
                    "tooltip": {"mode": "multi", "sort": "desc"}},
    }


def p95(by):
    return (f'histogram_quantile(0.95, sum by ({by}) '
            f'(rate(k6_http_req_duration_seconds{{{K6}}}[$__rate_interval])))')


# ---------------------------------------------------------------------------
# Azure Monitor (the live hub's Grafana only; observability/azure)
# ---------------------------------------------------------------------------

AZMON = {"type": "grafana-azure-monitor-datasource", "uid": "azure-monitor"}
OUT_AZURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboards-azure")
# The workspace's resource id names the subscription; that id is not a secret
# (it is in ADR-018 already). Metric queries leave it out and use the
# datasource's default.
LAW_ID = ("/subscriptions/27836c51-b944-484c-bf76-8de3e9642238/resourceGroups/rg-mvhd-dev"
          "/providers/Microsoft.OperationalInsights/workspaces/mvhd-logs")
ACA_APPS = ["mvhd-ui", "mvhd-neo4j-proxy", "mvhd-neo4j", "mvhd-keycloak",
            "mvhd-controlplane", "mvhd-identityhub", "mvhd-observability"]
EDC_APPS = ["mvhd-controlplane", "mvhd-dp-fhir", "mvhd-dp-omop", "mvhd-identityhub", "mvhd-issuerservice"]
ACA_NS = "microsoft.app/containerapps"
PG_NS = "microsoft.dbforpostgresql/flexibleservers"
PG_SERVER = "mvhd-pg-b53a0449"


def azmon_target(ref, resource, metric, aggregation, ns=ACA_NS):
    """One resource per query: a query over several resources goes through the
    subscription-wide metrics API, and the managed identity may read only
    rg-mvhd-dev (403 otherwise)."""
    return {"refId": ref, "datasource": AZMON, "queryType": "Azure Monitor",
            "azureMonitor": {"resources": [{"resourceGroup": "rg-mvhd-dev", "resourceName": resource,
                                            "metricNamespace": ns, "region": "westeurope"}],
                             "metricNamespace": ns, "metricName": metric, "aggregation": aggregation,
                             "timeGrain": "auto", "region": "westeurope", "dimensionFilters": []}}


def azmon_series(ids, title, items, x, y, w=12, h=8, unit="short", description=""):
    """items: (label, resource, metric, aggregation, namespace); one target each, named by label."""
    refs = [chr(ord("A") + i) for i in range(len(items))]
    p = series(ids, title, [azmon_target(r, res, m, a, ns) for r, (_, res, m, a, ns) in zip(refs, items)],
               x, y, w=w, h=h, unit=unit, description=description, datasource=AZMON)
    p["fieldConfig"]["overrides"] = [
        {"matcher": {"id": "byFrameRefID", "options": r},
         "properties": [{"id": "displayName", "value": label}]}
        for r, (label, *_rest) in zip(refs, items)]
    return p


def law_target(query, fmt="time_series"):
    return {"refId": "A", "datasource": AZMON, "queryType": "Azure Log Analytics",
            "azureLogAnalytics": {"query": query, "resources": [LAW_ID], "resultFormat": fmt}}


def per_app(metric, aggregation, apps=ACA_APPS):
    return [(a.replace("mvhd-", ""), a, metric, aggregation, ACA_NS) for a in apps]


AZURE_LIVE = """**Live from Azure Monitor**, read by mvhd-observability's managed identity (Monitoring Reader on rg-mvhd-dev, Log Analytics Reader on mvhd-logs). CPU and memory are a share of each app's limit, one-minute grain.

The proxy's log lines of a run, also in Log Analytics (the same `load_test` field as the panels above):

```
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "mvhd-neo4j-proxy" and TimeGenerated between (datetime(<start>) .. datetime(<end>))
| extend j = parse_json(Log_s)
| where tostring(j.load_test) == "<testid>"
| summarize requests = count(), p95_ms = percentile(toreal(j.duration_ms), 95), errors = countif(toint(j.status) >= 500) by route = tostring(j.route), bin(TimeGenerated, 1m)
```
"""


def azure_containers(ids, y):
    """The Containers row for the live hub: Azure Monitor, not Docker."""
    return [
        row(ids, "Azure: who saturates first (Azure Monitor, the live hub)", y),
        azmon_series(ids, "CPU, % of each app's limit", per_app("CpuPercentage", "Maximum"), 0, y + 1,
                     unit="percent", description="Maximum per minute. Neo4j at 100 % is the ceiling (#519)."),
        azmon_series(ids, "Memory, % of each app's limit", per_app("MemoryPercentage", "Maximum"), 12, y + 1,
                     unit="percent", description="Neo4j near 100 % ends in an out-of-memory kill (exit 137)."),
        azmon_series(ids, "Replicas", per_app("Replicas", "Maximum", ["mvhd-ui", "mvhd-neo4j-proxy", "mvhd-neo4j"]),
                     0, y + 9, w=8, h=7, description="ACA scales the UI to 3 and the proxy to 2; Neo4j is one."),
        azmon_series(ids, "Restarts", per_app("RestartCount", "Maximum",
                                              ["mvhd-ui", "mvhd-neo4j-proxy", "mvhd-neo4j", "mvhd-keycloak"]),
                     8, y + 9, w=8, h=7, description="A restart under load is usually Neo4j killed for memory."),
        azmon_series(ids, "Postgres (Flexible Server B1ms)",
                     [("CPU %", PG_SERVER, "cpu_percent", "Maximum", PG_NS),
                      ("burst credits", PG_SERVER, "cpu_credits_remaining", "Minimum", PG_NS),
                      ("connections", PG_SERVER, "active_connections", "Maximum", PG_NS)],
                     16, y + 9, w=8, h=7, description="B1ms bursts on credits; under about 10 it throttles everything that shares it."),
        row(ids, "Azure, the live hub", y + 16),
        text(ids, AZURE_LIVE, 0, y + 17, h=8),
    ]


def load_test(azure=False):
    """What to watch while a load, stress or soak test runs, and where it broke.

    k6 streams every metric to Prometheus with the run's `testid`; the proxy logs
    the same id as `load_test`; Docker stats say which container saturates. The
    Azure half (replicas, CPU and the Log Analytics copy of the proxy log) is
    pulled after the run with the commands in the last panel.
    """
    ids = Ids()
    fail_thresholds = {"mode": "absolute", "steps": [
        {"color": "green", "value": None}, {"color": "orange", "value": 0.005},
        {"color": "red", "value": 0.01}]}
    pass_thresholds = {"mode": "absolute", "steps": [
        {"color": "red", "value": None}, {"color": "orange", "value": 0.95},
        {"color": "green", "value": 0.99}]}
    panels = [
        row(ids, "Load (k6): what the test is doing", 0),
        stat(ids, "Virtual users", prom(f"max(k6_vus{{{K6}}})"), 0, 1,
             description="Concurrent users right now."),
        stat(ids, "Requests / s", prom(f"sum(rate(k6_http_reqs_total{{{K6}}}[$__rate_interval]))"), 4, 1,
             unit="reqps"),
        # Counted from the requests k6 itself marks unexpected: its rate metrics
        # are written once per tag set, so a max() over them read 100 % for a
        # run with 34 failures in 12,494 requests, and counting by status alone
        # would count a step's expected 403 (the regulator's trust-centre call).
        stat(ids, "Failed requests",
             prom(f'(sum(increase(k6_http_reqs_total{{{K6}, expected_response="false"}}[$__range])) or vector(0))'
                  f" / sum(increase(k6_http_reqs_total{{{K6}}}[$__range]))"), 8, 1,
             unit="percentunit", thresholds=fail_thresholds,
             description="Share of requests with a status the step did not expect (4xx, 5xx, or no answer "
                         "at all), over the time range. The SLO is under 1 %."),
        stat(ids, "Rate limited (429)",
             prom(f'sum(increase(k6_http_reqs_total{{{K6}, status="429"}}[$__range]))'), 12, 1,
             thresholds=ALERT_ON_ANY,
             description="#519 hypothesis 1: before the fix every user shared one bucket of 20 analytical queries a minute."),
        stat(ids, "Checks passed (worst check)", prom(f"min(k6_checks_rate{{{K6}}})"), 16, 1,
             unit="percentunit", thresholds=pass_thresholds,
             description="The check that passed least often, e.g. \"api under 1000 ms\". Each check is "
                         "status 200 or under the SLO, per request; k6 writes one rate per check."),
        stat(ids, "Iterations", prom(f"sum(increase(k6_iterations_total{{{K6}}}[$__range]))"), 20, 1,
             description="Completed persona journeys (or sign-ins, or queries) in the run."),
        series(ids, "Virtual users and requests / s",
               [prom(f"max(k6_vus{{{K6}}})", "virtual users", ref="A"),
                prom(f"sum(rate(k6_http_reqs_total{{{K6}}}[$__rate_interval]))", "requests / s", ref="B")],
               0, 5),
        series(ids, "Responses by HTTP status",
               [prom(f"sum by (status) (rate(k6_http_reqs_total{{{K6}}}[$__rate_interval]))", "{{status}}")],
               12, 5, unit="reqps", draw="bars", stack=True,
               description="429 is the rate limit, 5xx the hub failing, 0 a request that got no answer."),

        row(ids, "Response time, as the client sees it", 13),
        series(ids, "p95 by kind: website pages, API, NLQ, sign-in",
               [prom(p95("kind"), "{{kind}}")], 0, 14, unit="s",
               description="The proposed SLOs (#519): pages under 2 s, API under 1 s, NLQ under 3 s."),
        series(ids, "p50, p95 and p99, all requests",
               [prom(p95("testid").replace("0.95", q), f"p{q[2:]}", ref=r)
                for q, r in (("0.50", "A"), ("0.95", "B"), ("0.99", "C"))],
               12, 14, unit="s"),
        series(ids, "p95 per endpoint", [prom(p95("name"), "{{name}}")], 0, 22, w=24, unit="s",
               description="The route pattern k6 names, never a URL with an id. The legend is sorted by the worst value."),
        table(ids, "Per endpoint: p95, requests, failures",
              prom(p95("name"), instant=True, ref="A"), 0, 30, h=9,
              description="Sorted by p95. Failures are responses k6 did not expect (4xx, 5xx, none)."),

        row(ids, "Server side: the proxy, log lines of this run (load_test = testid; NLQ, federated and tasks)", 39),
        series(ids, "Requests / s by route",
               [loki_target(f"sum by (route) (rate({PROXY_RUN} [$__auto]))", "{{route}}")],
               0, 40, datasource=LOKI, unit="reqps"),
        series(ids, "p95 duration by route (server side)",
               [loki_target(f"quantile_over_time(0.95, {PROXY_RUN} | unwrap duration_ms [$__auto]) by (route)", "{{route}}")],
               12, 40, datasource=LOKI, unit="ms",
               description="Measured in the proxy; the difference to the client-side p95 is the UI and the network."),
        # All statuses, so the panel is never empty during a run: a run without
        # 429 or 5xx is the good case and used to read "No data".
        series(ids, "Proxy responses per minute, by status",
               [loki_target(f"sum by (status) (count_over_time({PROXY_RUN} [1m]))", "{{status}}")],
               0, 48, datasource=LOKI, draw="bars", stack=True,
               description="The proxy's answers to this run's calls. 429 is the rate limit, 5xx the proxy failing. "
                           "Only the UI routes that call the proxy (NLQ, federated queries, tasks) appear here; "
                           "the others read Neo4j directly."),
        # Aggregated: every audit line carries its own trace id and sequence
        # number, so without the outer avg/max each line is a series and Loki
        # stops at 500 of them ("No data").
        series(ids, "Audit records per transaction",
               [loki_target(f"avg by (audit_chain) (avg_over_time({AUDIT_LINES} [$__auto]))", "{{audit_chain}} average"),
                dict(loki_target(f"max by (audit_chain) (max_over_time({AUDIT_LINES} [$__auto]))", "{{audit_chain}} largest"),
                     refId="B")],
               12, 48, datasource=LOKI,
               description="#519 hypothesis 2: one record per transaction was the ceiling for audited queries. Above 1 "
                           "means the batch writer is doing its work. Audit lines carry no run id, so this is every "
                           "audited query in the time range, not only the run's."),
        logs(ids, "Errors during the run (proxy and UI)",
             '{service_name=~".*(neo4j-proxy|ui).*"} |~ "(?i)\\\\berror\\\\b|exception|ECONN|timed? ?out" != "GET /api/health"',
             0, 56, h=10),

    ]
    panels += azure_containers(ids, 66) if azure else [
        row(ids, "Containers: who saturates first (Docker stats, compose stack)", 66),
        # From the CPU time counter: the receiver's container.cpu.utilization
        # barely moved under load (the UI read 6 to 14 % while docker stats
        # showed 16 to 127 %), so it cannot say who saturates.
        series(ids, "CPU by container (100 % = one core)",
               [prom(f"sum by (container_name) (rate(container_cpu_usage_nanoseconds_total{{{CONTAINERS}}}"
                     f"[$__rate_interval])) / 1e9", "{{container_name}}")],
               0, 67, unit="percentunit",
               description="CPU time per second of wall clock. A Node.js container such as the UI tops out "
                           "near 100 %: one event loop on one core."),
        series(ids, "Memory by container", [prom(f"container_memory_usage_total_bytes{{{CONTAINERS}}}", "{{container_name}}")],
               12, 67, unit="bytes"),
        series(ids, "Network bytes / s by container",
               [prom(f"sum by (container_name) (rate(container_network_io_usage_rx_bytes_total{{{CONTAINERS}}}[$__rate_interval]) "
                     f"+ rate(container_network_io_usage_tx_bytes_total{{{CONTAINERS}}}[$__rate_interval]))", "{{container_name}}")],
               0, 75, w=24, h=6, unit="Bps"),

        row(ids, "Azure, the live hub: pulled after the run", 81),
        text(ids, AZURE_AFTER_RUN, 0, 82, h=9),
    ]
    per_endpoint = next(p for p in panels if p["title"] == "Per endpoint: p95, requests, failures")
    per_endpoint["transformations"] = [
        {"id": "merge"},
        {"id": "organize", "options": {"excludeByName": {"Time": True},
                                        "renameByName": {"Value #A": "p95 (s)", "Value #B": "requests", "Value #C": "failed"}}},
        {"id": "sortBy", "options": {"sort": [{"field": "p95 (s)", "desc": True}]}},
    ]
    per_endpoint["targets"] += [
        prom(f"sum by (name) (increase(k6_http_reqs_total{{{K6}}}[$__range]))", instant=True, ref="B"),
        prom(f'sum by (name) (increase(k6_http_reqs_total{{{K6}, expected_response="false"}}[$__range]))', instant=True, ref="C"),
    ]
    board = dashboard(
        "mvhd-load-test", "Load and stress test",
        "What to watch while k6 runs against the hub (#519): load, client-side response time by kind "
        "and endpoint, the proxy's own view of the same run, and which container saturates first.",
        panels, ["mvhd", "load-test", "k6"])
    board["time"] = {"from": "now-1h", "to": "now"}
    board["refresh"] = "10s"
    board["templating"]["list"] = [{
        "name": "testid", "label": "Test run", "type": "query", "datasource": PROM,
        "query": {"query": "label_values(k6_vus, testid)", "refId": "A"},
        "definition": "label_values(k6_vus, testid)", "refresh": 2, "sort": 2,
        "includeAll": False, "multi": False, "current": {}, "options": [],
    }]
    board["links"] = [
        {"title": "Runbook: load and stress test", "type": "link", "targetBlank": True,
         "url": "https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/knowledge/runbooks/load-and-stress-test.md"},
        {"title": "Issue #519", "type": "link", "targetBlank": True,
         "url": "https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/519"},
    ]
    return board


def loki_target(expr, legend=""):
    return {"datasource": LOKI, "expr": expr, "legendFormat": legend, "queryType": "range", "refId": "A"}


AZURE_AFTER_RUN = """Grafana has no Azure credentials here, so the live hub's numbers are pulled after the run and kept with the k6 summary (`load-tests/results/<testid>/`).

**Replicas, CPU, memory and requests per app** (one line per app, 1-minute grain):

```
scripts/azure/export-load-metrics.sh <testid> <start ISO> <end ISO>
```

**The proxy's log lines of the run** in Log Analytics (the same `load_test` field as the Loki panels above):

```
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "mvhd-neo4j-proxy" and TimeGenerated between (datetime(<start>) .. datetime(<end>))
| extend j = parse_json(Log_s)
| where tostring(j.load_test) == "<testid>"
| summarize requests = count(), p95_ms = percentile(toreal(j.duration_ms), 95), errors = countif(toint(j.status) >= 500), limited = countif(toint(j.status) == 429) by route = tostring(j.route), bin(TimeGenerated, 1m)
```

**Errors as they happen** (any app):

```
az containerapp logs show -n mvhd-ui -g rg-mvhd-dev --follow --tail 20 | grep -iE "error|exception|ECONN"
```
"""



AUDITOR_GUIDE = """### How to audit this trail, step by step

**What the law asks.** Under Regulation (EU) 2025/327 (EHDS), health data for secondary use is reached only with a data permit from the health data access body (Art. 61(1), Art. 68), and access to and activity in the secure processing environment is logged, the logs kept for at least one year (Art. 73(1)(e)). In primary use a person can see who accessed their data, kept for at least three years (Art. 9). GDPR Art. 5(2) and Art. 30 ask the controller to prove compliance and keep records of processing. Here every query, every contract negotiation and every data transfer becomes a FHIR R4 `AuditEvent`, hash-chained to the one before it, and a request whose record cannot be written is refused (fail closed).

1. **Set the audit period** with the time picker, top right. Records are not deleted within the retention period, so widen the range before concluding that nothing happened.
2. **Check integrity.** Both chains must read **INTACT**: the proxy recomputes every hash from the first record on every refresh. **BROKEN** means a record was changed, removed or reordered; stop and escalate. Copy both **chain heads** (record count and hash) into your report: at the next audit each chain must still hold that head at the same record number.
3. **Check completeness.** *Audit writes failed* must be 0, or explained. Each one is a request that was refused because its record could not be written: not a gap in the evidence, but an outage to account for.
4. **Queries** (*Query records*). One row per natural-language or federated query: who asked (*Parties*), when, and the outcome. The question and the generated Cypher are kept only as SHA-256, so no record holds health data. *Refused* means a guard stopped the query (re-identification risk, ODRL prohibition, k-anonymity); read the reason.
5. **Contracts and transfers** (*Contract and transfer records*, and the dashboard *EDC contracts and transfers*). Follow each negotiation from *requested* to *finalized* and each transfer from *requested* to *completed*. A transfer of health data for secondary use must name its contract agreement and its data permit (*Agreement, asset, permit*). A transfer refused for want of a permit is the gate working (Art. 61(1)). Every *terminated* or *failed* row carries the connector's reason.
6. **Re-verify outside this dashboard.** `scripts/verify-audit-chain.sh` reads Neo4j directly and recomputes the chain. The raw records are FHIR `AuditEvent`s at `/audit/chains/query/events` and `/audit/chains/dsp/events` on the proxy.
7. **Write down** the period, both chain heads, the counts, every refusal and failed write with its reason, and any record marked *Demo* (demonstration traffic, not real use). A record with a *Load test run* was written by a k6 run against the hub (synthetic traffic, #571): count it apart, it is not a data user's access.

**Known limit (#418).** The chain lives in Neo4j. It proves order and integrity, but someone with write access to the database could rebuild it from a point onward. Comparing chain heads between audits (step 2) detects that; a signed daily digest and a write-once copy will close it.
"""

EDC_INTRO = ("**What this shows:** every DSP contract negotiation and data transfer, counted from the `dsp` hash "
             "chain. The hub writes a record when it asks the connector (*requested*) or refuses a transfer for want "
             "of a data permit; the connector's callbacks write every later state (*agreed*, *finalized*, *started*, "
             "*completed*, *terminated*). **Empty?** Nothing was negotiated in the time range: widen it, or see "
             "*Newest record*. A negotiation that was started but never shows up points to the connector: see "
             "*Connector services* at the bottom. **Refused?** A transfer no data permit covers is refused "
             "(Art. 61(1)) and recorded. The k6 contract journey asks for one on purpose, one time in four: those "
             "rows carry a *Load test run* and are expected (#571).")


def ehds_audit():
    ids = Ids()
    p = [
        row(ids, "Integrity of the evidence", 3),
        # fields names the string column: a stat reads only numeric fields by
        # default, so these tiles showed "0" (noValue) instead of INTACT.
        stat(ids, "Query chain", infinity("/audit/chains/query/verify", [("ok", "ok", "string")]),
             0, 4, mappings=INTACT, fields="/^ok$/", description="NLQ and federated queries. Verified hash by hash."),
        stat(ids, "Query records", infinity("/audit/chains/query/verify", [("count", "count", "number")]),
             4, 4),
        stat(ids, "Contract & transfer chain", infinity("/audit/chains/dsp/verify", [("ok", "ok", "string")]),
             8, 4, mappings=INTACT, fields="/^ok$/",
             description="DSP negotiations and data transfers. Verified hash by hash."),
        stat(ids, "Contract & transfer records", infinity("/audit/chains/dsp/verify", [("count", "count", "number")]),
             12, 4),
        stat(ids, "Audit writes failed (request refused)",
             loki(count_over_range(f'{PROXY} |~ "audit write failed|could not be written"'), instant=True),
             16, 4, thresholds=ALERT_ON_ANY,
             description="Each one is a query, negotiation or transfer that was not carried out because its record could not be written."),
        chain_stat(ids, "Refused queries", "query", "refused", 20, 4, w=2, field="outcome",
                   thresholds=WARN_ON_ANY,
                   description="Refused by a guard: re-identification risk, ODRL prohibition, k-anonymity."),
        chain_stat(ids, "Refused transfers", "dsp", "refused", 22, 4, w=2, field="outcome",
                   thresholds=WARN_ON_ANY, description="No data permit (Art. 61(1))."),
        row(ids, "What was recorded", 8),
        chain_series(ids, "Contract and transfer records by kind", "dsp", ".*", 0, 9),
        chain_series(ids, "Query records by kind", "query", ".*", 12, 9),
        row(ids, "Records, newest first (from the chain)", 17),
        table(ids, "Contract and transfer records", infinity("/audit/chains/dsp/events?limit=200", RECORD_COLUMNS),
              0, 18, h=11, overrides=OUTCOME_OVERRIDE,
              description="Every step of every DSP negotiation and transfer: what the hub sent, what it refused, and every state the connector reported."),
        table(ids, "Query records", infinity("/audit/chains/query/events?limit=200", RECORD_COLUMNS),
              0, 29, h=9, overrides=OUTCOME_OVERRIDE,
              description="NLQ and federated queries. The question and the Cypher are kept as SHA-256 only, so no record holds health data."),
    ]
    guide = [row(ids, "Auditor guide: the regulation, and how to audit this trail step by step", 0),
             text(ids, AUDITOR_GUIDE, 0, 1, h=14)]
    heads = [row(ids, "For the audit report: chain heads", 38),
             chain_head(ids, "Query chain head", "query", 0, 39, w=24),
             chain_head(ids, "Contract & transfer chain head", "dsp", 0, 43, w=24)]
    p = guide + shift(p, 12) + shift(heads, 12)
    return dashboard("mvhd-ehds-audit", "EHDS audit trail",
                     "Integrity and content of the regulatory audit trail (ADR-045 plane 2).", p,
                     ["ehds", "audit", "mvhd"])


def edc_logs_azure(ids, y):
    """The connector services' logs on the live hub: EDC writes to stdout,
    which Container Apps sends only to Log Analytics.

    The EDC services log at INFO only at start and on trouble, so a healthy
    hour has no lines at all, and the panels read "No data" as if broken
    (2026-10-06). Each series is therefore filled with zeros, one per app, and
    the table says in words that there was no error."""
    apps = ", ".join(f"'{a}'" for a in EDC_APPS)
    errors_only = "| where Log_s has_any ('SEVERE', 'ERROR') and Log_s !has 'otel.javaagent'"

    def zero_filled(name, where=""):
        return (f"let apps = dynamic([{apps}]); "
                "range TimeGenerated from bin($__timeFrom(), $__interval) to $__timeTo() step $__interval "
                "| extend ContainerAppName_s = apps | mv-expand ContainerAppName_s to typeof(string) "
                "| extend n = 0 "
                "| union (ContainerAppConsoleLogs_CL | where $__timeFilter(TimeGenerated) "
                f"| where ContainerAppName_s in (apps) {where} | extend n = 1) "
                f"| summarize {name} = sum(n) by bin(TimeGenerated, $__interval), ContainerAppName_s "
                "| order by TimeGenerated asc")

    err = series(ids, "Errors by service (Log Analytics)", [law_target(zero_filled("errors", errors_only))],
                 0, y, unit="short", datasource=AZMON, draw="bars", stack=True,
                 description="ERROR and SEVERE lines, without the OTel agent's own export errors. "
                             "Zero is the normal case.")
    lines = series(ids, "Log lines by service (what Log Analytics bills)", [law_target(zero_filled("lines"))],
                   12, y, unit="short", datasource=AZMON, draw="bars", stack=True,
                   description="The EDC services log at INFO only at start and on trouble: a quiet hour is a "
                               "healthy one. On Azure the hub's negotiations and transfers take the demo path "
                               "(#25, #345), so they reach no connector and add no lines here.")
    latest = table(ids, "Latest connector errors (Log Analytics)",
                   law_target(f"let errs = ContainerAppConsoleLogs_CL | where $__timeFilter(TimeGenerated) "
                              f"| where ContainerAppName_s in ({apps}) {errors_only} "
                              "| project TimeGenerated, app = ContainerAppName_s, line = Log_s "
                              "| order by TimeGenerated desc | take 100; "
                              "errs | union (print TimeGenerated = now(), app = '-', "
                              "line = 'No connector errors in this time range.' "
                              "| where toscalar(errs | count) == 0)", fmt="table"),
                   0, y + 8, h=10)
    return [err, lines, latest]


def edc_dsp(azure=False):
    ids = Ids()
    p = [
        row(ids, "Contract negotiations (DSP)", 0),
        chain_stat(ids, "Requested", "dsp", "contract-negotiation.requested", 0, 1),
        chain_stat(ids, "Agreed", "dsp", "contract-negotiation.agreed", 4, 1),
        chain_stat(ids, "Finalized", "dsp", "contract-negotiation.finalized", 8, 1,
                   thresholds={"mode": "absolute", "steps": [{"color": "green", "value": None}]}),
        chain_stat(ids, "Terminated or failed", "dsp", "contract-negotiation.(terminated|failed)", 12, 1,
                   thresholds=WARN_ON_ANY),
        chain_series(ids, "Negotiation states", "dsp", "contract-negotiation\\..*", 0, 5, w=24, h=7),
        row(ids, "Data transfers", 12),
        chain_stat(ids, "Requested", "dsp", "transfer-process.requested", 0, 13),
        chain_stat(ids, "Started", "dsp", "transfer-process.started", 4, 13),
        chain_stat(ids, "Completed", "dsp", "transfer-process.completed", 8, 13,
                   thresholds={"mode": "absolute", "steps": [{"color": "green", "value": None}]}),
        chain_stat(ids, "Refused (no data permit)", "dsp", "transfer-process.refused", 12, 13,
                   thresholds=WARN_ON_ANY, description="Art. 61(1): no access without a data permit (Art. 68)."),
        chain_stat(ids, "Terminated or failed", "dsp", "transfer-process.(terminated|failed)", 16, 13,
                   thresholds=WARN_ON_ANY),
        chain_series(ids, "Transfer states", "dsp", "transfer-process\\..*", 0, 17, w=24, h=7),
        row(ids, "Refused, terminated and failed, with reasons (from the chain)", 24),
        table(ids, "Not completed", infinity("/audit/chains/dsp/events?limit=500", RECORD_COLUMNS),
              0, 25, h=9, overrides=OUTCOME_OVERRIDE,
              transformations=[{"id": "filterByValue", "options": {
                  "type": "exclude", "match": "any",
                  "filters": [{"fieldName": "Outcome", "config": {"id": "equal", "options": {"value": "0"}}}]}}]),
        row(ids, "Connector services (EDC)", 34),
    ]
    p += edc_logs_azure(ids, 35) if azure else [
        timeseries(ids, "Errors by service", f'sum by (service_name) (count_over_time({{service_name=~"{EDC}"}} | detected_level=~"(?i)error|severe" != "otel.javaagent" [$__auto]))',
                   "{{service_name}}", 0, 35, description="ERROR and SEVERE lines, without the OTel agent's own export errors."),
        timeseries(ids, "Log lines by service (what Log Analytics would bill)", f'sum by (service_name) (count_over_time({{service_name=~"{EDC}"}} [$__auto]))',
                   "{{service_name}}", 12, 35),
        logs(ids, "Latest connector errors", f'{{service_name=~"{EDC}"}} | detected_level=~"(?i)error|severe" != "otel.javaagent"', 0, 43),
    ]
    p = [text(ids, EDC_INTRO, 0, 0, w=18, h=3), newest_record(ids, "dsp", 18, 0)] + shift(p, 3)
    return dashboard("mvhd-edc-dsp", "EDC contracts and transfers",
                     "Every DSP contract negotiation and data transfer by state, with refusals, failures and the connector's errors.",
                     p, ["edc", "dsp", "audit", "mvhd"])


if __name__ == "__main__":
    # dashboards/: compose (Loki and Docker); dashboards-azure/: the live hub's
    # variants (Azure Monitor), which observability/azure lays over them.
    for out, boards in ((OUT, (("ehds-audit-trail.json", ehds_audit()),
                               ("edc-contracts-transfers.json", edc_dsp()),
                               ("load-stress-test.json", load_test()))),
                        (OUT_AZURE, (("edc-contracts-transfers.json", edc_dsp(azure=True)),
                                     ("load-stress-test.json", load_test(azure=True))))):
        os.makedirs(out, exist_ok=True)
        for name, board in boards:
            with open(os.path.join(out, name), "w") as f:
                json.dump(board, f, indent=2)
                f.write("\n")
            print(f"wrote {os.path.basename(out)}/{name}: {len(board['panels'])} panels")
