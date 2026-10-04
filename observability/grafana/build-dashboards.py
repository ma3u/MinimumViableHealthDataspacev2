#!/usr/bin/env python3
"""Builds the MVHD Grafana dashboards (ADR-045 decision 5, #418).

Run after a change and commit both this file and its output:

    python3 observability/grafana/build-dashboards.py

Two dashboards, both read-only provisioned:

- EHDS audit trail: is the evidence intact (hash chains verified by the
  proxy), what was recorded, what was refused, did an audit write fail.
- EDC contracts and transfers: every DSP negotiation and transfer by state,
  refusals and failures with their reasons, and the connector services' errors.

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
    for name, board in (("ehds-audit-trail.json", ehds_audit()), ("edc-contracts-transfers.json", edc_dsp())):
        with open(os.path.join(OUT, name), "w") as f:
            json.dump(board, f, indent=2)
            f.write("\n")
        print(f"wrote {name}: {len(board['panels'])} panels")
