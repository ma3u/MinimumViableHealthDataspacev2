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
    ("hash", "Hash", "string"),
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


def load_test():
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
        # Counted from the requests by status: k6 writes its rate metrics once per
        # tag set, so the status="0" series is always 1 and a max() over them
        # read 100 % for a run with 34 failures in 12,494 requests.
        stat(ids, "Failed requests",
             prom(f'sum(increase(k6_http_reqs_total{{{K6}, status!~"[23].."}}[$__range]))'
                  f" / sum(increase(k6_http_reqs_total{{{K6}}}[$__range]))"), 8, 1,
             unit="percentunit", thresholds=fail_thresholds,
             description="Share of requests answered with 4xx or 5xx, or not at all (status 0), over the "
                         "time range. The SLO is under 1 %."),
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

        row(ids, "Server side: the proxy, log lines of this run (load_test = testid)", 39),
        series(ids, "Requests / s by route",
               [loki_target(f"sum by (route) (rate({PROXY_RUN} [$__auto]))", "{{route}}")],
               0, 40, datasource=LOKI, unit="reqps"),
        series(ids, "p95 duration by route (server side)",
               [loki_target(f"quantile_over_time(0.95, {PROXY_RUN} | unwrap duration_ms [$__auto]) by (route)", "{{route}}")],
               12, 40, datasource=LOKI, unit="ms",
               description="Measured in the proxy; the difference to the client-side p95 is the UI and the network."),
        series(ids, "429 and 5xx per minute",
               [loki_target(f'sum by (status) (count_over_time({PROXY_RUN} | status=~"429|5.." [1m]))', "{{status}}")],
               0, 48, datasource=LOKI, draw="bars", stack=True),
        series(ids, "Audit records per transaction",
               [loki_target('avg_over_time({service_name=~".*neo4j-proxy.*"} | json | __error__="" | msg="audit recorded" | unwrap audit_batch [$__auto])', "batch size")],
               12, 48, datasource=LOKI,
               description="#519 hypothesis 2: one record per transaction was the ceiling for audited queries. Above 1 means the batch writer is doing its work."),
        logs(ids, "Errors during the run (proxy and UI)",
             '{service_name=~".*(neo4j-proxy|ui).*"} |~ "(?i)\\\\berror\\\\b|exception|ECONN|timed? ?out" != "GET /api/health"',
             0, 56, h=10),

        row(ids, "Containers: who saturates first (Docker stats, compose stack)", 66),
        series(ids, "CPU by container", [prom(f"container_cpu_utilization_ratio{{{CONTAINERS}}}", "{{container_name}}")],
               0, 67, unit="percentunit"),
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



def ehds_audit():
    ids = Ids()
    p = [
        text(ids, "**The evidence is the hash chain**, read and re-verified by the proxy on every "
                  "refresh: changing, removing or reordering any record breaks every hash after it. "
                  "Counts and curves are counted from the chain's records too; only failed audit writes "
                  "come from the proxy's logs, because a failed write leaves no record. Every query, contract negotiation and data transfer is recorded; a "
                  "request whose record cannot be written is not carried out (fail closed). "
                  "Regulation (EU) 2025/327 Art. 73 · GDPR Art. 5(2), 30.", 0, 0),
        row(ids, "Integrity of the evidence", 3),
        stat(ids, "Query chain", infinity("/audit/chains/query/verify", [("ok", "ok", "string")]),
             0, 4, mappings=INTACT, description="NLQ and federated queries. Verified hash by hash."),
        stat(ids, "Query records", infinity("/audit/chains/query/verify", [("count", "count", "number")]),
             4, 4),
        stat(ids, "Contract & transfer chain", infinity("/audit/chains/dsp/verify", [("ok", "ok", "string")]),
             8, 4, mappings=INTACT, description="DSP negotiations and data transfers. Verified hash by hash."),
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
    return dashboard("mvhd-ehds-audit", "EHDS audit trail",
                     "Integrity and content of the regulatory audit trail (ADR-045 plane 2).", p,
                     ["ehds", "audit", "mvhd"])


def edc_dsp():
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
        timeseries(ids, "Errors by service", f'sum by (service_name) (count_over_time({{service_name=~"{EDC}"}} | detected_level=~"(?i)error|severe" != "otel.javaagent" [$__auto]))',
                   "{{service_name}}", 0, 35, description="ERROR and SEVERE lines, without the OTel agent's own export errors."),
        timeseries(ids, "Log lines by service (what Log Analytics would bill)", f'sum by (service_name) (count_over_time({{service_name=~"{EDC}"}} [$__auto]))',
                   "{{service_name}}", 12, 35),
        logs(ids, "Latest connector errors", f'{{service_name=~"{EDC}"}} | detected_level=~"(?i)error|severe" != "otel.javaagent"', 0, 43),
    ]
    return dashboard("mvhd-edc-dsp", "EDC contracts and transfers",
                     "Every DSP contract negotiation and data transfer by state, with refusals, failures and the connector's errors.",
                     p, ["edc", "dsp", "audit", "mvhd"])


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, board in (("ehds-audit-trail.json", ehds_audit()), ("edc-contracts-transfers.json", edc_dsp()),
                        ("load-stress-test.json", load_test())):
        with open(os.path.join(OUT, name), "w") as f:
            json.dump(board, f, indent=2)
            f.write("\n")
        print(f"wrote {name}: {len(board['panels'])} panels")
