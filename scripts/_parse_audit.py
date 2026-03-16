#!/usr/bin/env python3
import sys, json
for line in sys.stdin:
    try:
        e = json.loads(line.strip())
        p = e.get("request", {}).get("path", "")
        t = e.get("type", "")
        if t == "response" and "did" in p:
            resp = e.get("response", {})
            d = resp.get("data")
            code = resp.get("http_status_code", "?")
            data_keys = list(d.get("data", {}).keys()) if d else []
            print(f"HTTP {code} | {p} | keys={data_keys}")
    except:
        pass
