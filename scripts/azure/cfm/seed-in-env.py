"""Seeds CFM on Azure, steps 3 and 4 of scripts/seed-cfm.sh, from inside the
environment (the managers have internal ingress only). Env: KC_TOKEN_URL,
CLIENT_SECRET, TM_URL, PM_URL, ISSUER_DID, ISSUER_URL. Prints no secret.

The dataspace profile asks for the MembershipCredential in the format of the
issuer's definition: from IdentityHub 1.0.0-RC6 that is the issuer's DCP
profile's (VC2_0_JOSE), and the holder refuses a delivery in another format,
so the onboarding agent waits on a request that stays REQUESTED (#1094). A
profile seeded for another format is replaced; the Tenant Manager refuses
that while a participant profile still uses it."""
import base64, json, os, sys, time, urllib.error, urllib.parse, urllib.request

e = os.environ
TM, PM = e["TM_URL"].rstrip("/"), e["PM_URL"].rstrip("/")


def req(method, url, body=None, token=None, form=None, auth=None):
    data, headers = None, {}
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    if auth:
        headers["Authorization"] = "Basic " + base64.b64encode(auth.encode()).decode()
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode()[:400]


def die(msg):
    print("seed-cfm-azure: " + msg, flush=True)
    sys.exit(1)


status, tok = req("POST", e["KC_TOKEN_URL"], form={"grant_type": "client_credentials"},
                  auth="cfm-agents:" + e["CLIENT_SECRET"])
if status != 200:
    die(f"no cfm-agents token: HTTP {status}")
TOKEN = tok["access_token"]
print("token for cfm-agents", flush=True)

for _ in range(60):
    try:
        if req("GET", PM + "/health")[0] == 200 and req("GET", TM + "/health")[0] == 200:
            break
    except Exception:
        pass
    time.sleep(5)
else:
    die("managers not healthy")
print("managers healthy", flush=True)

s, defs = req("GET", PM + "/api/v1alpha1/activity-definitions", token=TOKEN)
if s != 200:
    die(f"activity definitions: HTTP {s} {defs}")
have = {d.get("type") for d in (defs or [])}
for t in ["edcv-activity", "identityhub-activity", "registration-activity",
          "onboarding-activity", "jwtlet-activity", "siglet-activity"]:
    if t not in have:
        s, b = req("POST", PM + "/api/v1alpha1/activity-definitions", token=TOKEN, body={
            "type": t, "description": f"{t} (core-platform-distribution v0.0.39)",
            "inputSchema": {}, "outputSchema": {}})
        if s >= 300:
            die(f"activity {t}: HTTP {s} {b}")
print("3. activity definitions present", flush=True)

s, orchs = req("GET", PM + "/api/v1alpha1/orchestration-definitions", token=TOKEN)
if s != 200:
    die(f"orchestration definitions: HTTP {s} {orchs}")
if not any(d.get("templateRef") == "mvhd-vpa" for d in (orchs or [])):
    s, b = req("POST", PM + "/api/v1alpha1/orchestration-definitions", token=TOKEN, body={
        "id": "mvhd-vpa",
        "description": "Deploys and disposes a dataspace member (core-platform-distribution v0.0.39)",
        "schema": {},
        "activities": {
            "cfm.orchestration.vpa.deploy": [
                {"id": "jwtlet-tokenexchange-agent", "type": "jwtlet-activity"},
                {"id": "registration-agent", "type": "registration-activity", "dependsOn": ["jwtlet-tokenexchange-agent"]},
                {"id": "connector-provisioner", "type": "edcv-activity", "dependsOn": ["jwtlet-tokenexchange-agent"]},
                {"id": "siglet-provisioner", "type": "siglet-activity", "dependsOn": ["jwtlet-tokenexchange-agent", "connector-provisioner"]},
                {"id": "identityhub-provisioner", "type": "identityhub-activity", "dependsOn": ["jwtlet-tokenexchange-agent"]},
                {"id": "onboarding-agent", "type": "onboarding-activity",
                 "dependsOn": ["jwtlet-tokenexchange-agent", "connector-provisioner", "identityhub-provisioner", "registration-agent"]},
            ],
            "cfm.orchestration.vpa.dispose": [
                {"id": "offboarding-agent", "type": "onboarding-activity", "dependsOn": []},
                {"id": "registration-rollback", "type": "registration-activity", "dependsOn": []},
                {"id": "connector-rollback", "type": "edcv-activity", "dependsOn": []},
                {"id": "identityhub-rollback", "type": "identityhub-activity", "dependsOn": []},
                {"id": "siglet-rollback", "type": "siglet-activity", "dependsOn": []},
            ],
        }})
    if s >= 300:
        die(f"orchestration definition: HTTP {s} {b}")
    print("3. orchestration definition created", flush=True)
else:
    print("3. orchestration definition exists", flush=True)

s, cells = req("GET", TM + "/api/v1alpha1/cells", token=TOKEN)
if s != 200:
    die(f"cells: HTTP {s} {cells}")
if cells:
    cell = cells[0]["id"]
else:
    s, b = req("POST", TM + "/api/v1alpha1/cells", token=TOKEN, body={
        "state": "active", "stateTimestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "properties": {"name": "azure"}})
    if s >= 300:
        die(f"cell: HTTP {s} {b}")
    cell = b["id"]
print("4. cell " + cell, flush=True)

definition, fmt = "membership-credential-def", "VC1_0_JWT"
if e.get("ISSUER_URL"):
    s, defs = req("POST", e["ISSUER_URL"].rstrip("/") + "/v1/participants/issuer/credentialdefinitions/query",
                  token=TOKEN, body={})
    hit = [d for d in (defs if isinstance(defs, list) else [])
           if isinstance(d, dict) and d.get("credentialType") == "MembershipCredential" and d.get("id")]
    if hit:
        definition, fmt = hit[0]["id"], hit[0].get("format") or fmt
    else:
        print(f"4. no MembershipCredential definition from the issuer (HTTP {s}); assuming {fmt}", flush=True)
print(f"4. MembershipCredential: {definition}, {fmt}", flush=True)

s, profiles = req("GET", TM + "/api/v1alpha1/dataspace-profiles", token=TOKEN)
if s != 200:
    die(f"dataspace profiles: HTTP {s} {profiles}")
if profiles:
    seeded = {c.get("format") for c in (profiles[0].get("dataspaceSpec") or {}).get("credentialSpecs", [])
              if c.get("type") == "MembershipCredential"}
    if seeded and seeded != {fmt}:
        old = profiles[0]["id"]
        s, b = req("DELETE", f"{TM}/api/v1alpha1/dataspace-profiles/{old}", token=TOKEN)
        if s >= 300:
            die(f"dataspace profile {old} asks for {sorted(seeded)}, the issuer issues {fmt}, "
                f"and it cannot be replaced: HTTP {s} {b}")
        print(f"4. dataspace profile {old} asked for {sorted(seeded)}: replaced", flush=True)
        profiles = []
if profiles:
    ds = profiles[0]["id"]
else:
    s, b = req("POST", TM + "/api/v1alpha1/dataspace-profiles", token=TOKEN, body={
        "artifacts": [], "properties": {"name": "ehds"},
        "dataspaceSpec": {"protocolStack": ["dsp-2025-1", "dcp-2025-1"],
                          "credentialSpecs": [{"id": definition, "type": "MembershipCredential",
                                               "issuer": e["ISSUER_DID"], "format": fmt}]}})
    if s >= 300:
        die(f"dataspace profile: HTTP {s} {b}")
    ds = b["id"]
    s, b = req("POST", f"{TM}/api/v1alpha1/dataspace-profiles/{ds}/deployments", token=TOKEN,
               body={"profileId": ds, "cellId": cell})
    if s >= 300:
        die(f"dataspace profile deployment: HTTP {s} {b}")
print("4. dataspace profile " + ds, flush=True)
print("CFM seeded.", flush=True)
