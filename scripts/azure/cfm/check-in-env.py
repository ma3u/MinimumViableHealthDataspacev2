"""Onboards one throwaway participant through CFM on Azure and disposes it
again, as scripts/check-cfm-onboarding.sh does on the compose stack, from
inside the environment (the managers and the EDC admin APIs have internal
ingress only). Env: KC_TOKEN_URL, CLIENT_SECRET, TM_URL, MGMT_URL,
IDENTITY_URL, ISSUER_URL, DID_BASE, DID_PORT_HOST. Prints no secret.
Exit 0 when every check passes."""
import base64, json, os, secrets, sys, time, urllib.error, urllib.parse, urllib.request

e = os.environ
TM = e["TM_URL"].rstrip("/")
MGMT = e["MGMT_URL"].rstrip("/")
IDENTITY = e["IDENTITY_URL"].rstrip("/")
ISSUER = e["ISSUER_URL"].rstrip("/")
SLUG = "cfm-check-" + secrets.token_hex(3)
DID = e["DID_BASE"].rstrip(":") + ":" + SLUG
DID_DOC = "http://" + e["DID_PORT_HOST"] + "/" + SLUG + "/did.json"
TIMEOUT = 240
passed, failed = 0, 0


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
            try:
                return resp.status, (json.loads(raw) if raw.strip() else None)
            except ValueError:
                return resp.status, raw[:400]
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode()[:400]
    except Exception as err:  # unreachable host, timeout
        return 0, str(err)[:200]


def token():
    s, tok = req("POST", e["KC_TOKEN_URL"], form={"grant_type": "client_credentials"},
                 auth="cfm-agents:" + e["CLIENT_SECRET"])
    if s != 200:
        print(f"no cfm-agents token: HTTP {s}", flush=True)
        sys.exit(1)
    return tok["access_token"]


def check(name, want, got):
    global passed, failed
    if str(want) == str(got):
        passed += 1
        print(f"  ok    {name:<44} {got}", flush=True)
    else:
        failed += 1
        print(f"  FAIL  {name:<44} got {got}, want {want}", flush=True)


def profile_state(url, tok):
    s, d = req("GET", url, token=tok)
    if s != 200 or not isinstance(d, dict):
        return s, f"HTTP {s}", ""
    states = " ".join(sorted({v.get("state", "") for v in d.get("vpas", [])}))
    err = ""
    if d.get("error"):
        err = (d.get("errorDetail") or "") + " | " + (d.get("errorCause") or "")[:600]
    return s, states, err


TOKEN = token()
s, dsps = req("GET", TM + "/api/v1alpha1/dataspace-profiles", token=TOKEN)
if s != 200 or not dsps:
    print(f"dataspace profiles: HTTP {s} {dsps}", flush=True)
    sys.exit(1)
DS_ID = dsps[0]["id"]
fmt = [c.get("format") for c in (dsps[0].get("dataspaceSpec") or {}).get("credentialSpecs", [])]
print(f"Onboarding {DID} through the Tenant Manager (profile asks for {fmt})", flush=True)

s, tenant = req("POST", TM + "/api/v1alpha1/tenants", {"properties": {"name": SLUG}}, token=TOKEN)
if s >= 300:
    print(f"tenant: HTTP {s} {tenant}", flush=True)
    sys.exit(1)
TENANT = tenant["id"]
s, prof = req("POST", f"{TM}/api/v1alpha1/tenants/{TENANT}/participant-profiles", {
    "identifier": DID,
    "dataspaceProfileIds": [DS_ID],
    "participantRoles": {DS_ID: ["participant"]},
    "vpaProperties": {
        "cfm.connector": {"dataspaceProfiles": ["http-dsp-profile-2025-1"]},
        "cfm.issuer": {"id": DID},
        "cfm.dataplane": {"transferTypeMappings": {"HttpData-PULL": {
            "transferType": "HttpData-PULL", "endpointType": "HTTP", "tokenSource": "provider",
            "endpoint": "http://mvhd-neo4j-proxy/dataspace/data"}}},
    },
    "properties": {},
}, token=TOKEN)
if s >= 300:
    print(f"participant profile: HTTP {s} {prof}", flush=True)
    req("DELETE", f"{TM}/api/v1alpha1/tenants/{TENANT}", token=TOKEN)
    sys.exit(1)
PROFILE_URL = f"{TM}/api/v1alpha1/tenants/{TENANT}/participant-profiles/{prof['id']}"

start = time.time()
states, err = "", ""
while time.time() - start < TIMEOUT:
    _, states, err = profile_state(PROFILE_URL, TOKEN)
    if states == "active" or err:
        break
    time.sleep(3)
print(f"  deploy took {int(time.time() - start)}s, VPA states: {states}", flush=True)
if err:
    print(f"  error: {err}", flush=True)
check("participant profile deployed", "active", states)

TOKEN = token()
s, parts = req("GET", MGMT + "/v5/participants", token=TOKEN)
CTX = ""
for p in parts if isinstance(parts, list) else []:
    if p.get("identity") == DID:
        CTX = p.get("@id") or p.get("participantContextId") or p.get("id") or ""
print(f"  participant context: {CTX or 'none'}", flush=True)
check("control plane context for the DID", "yes", "yes" if CTX else "no")
if CTX:
    check("IdentityHub participant", 200, req("GET", f"{IDENTITY}/v1/participants/{CTX}", token=TOKEN)[0])
    check("DID document served", 200, req("GET", DID_DOC)[0])
    check("issuer holder", 200, req("GET", f"{ISSUER}/v1/participants/issuer/holders/{CTX}", token=TOKEN)[0])
    types = ""
    for _ in range(20):
        s, creds = req("GET", f"{IDENTITY}/v1/participants/{CTX}/credentials", token=TOKEN)
        types = " ".join(sorted(t for c in (creds if isinstance(creds, list) else []) if isinstance(c, dict)
                                for t in c.get("verifiableCredential", {}).get("credential", {}).get("type", [])
                                if t != "VerifiableCredential"))
        if "MembershipCredential" in types:
            break
        time.sleep(3)
    check("MembershipCredential in the IdentityHub", "MembershipCredential",
          "MembershipCredential" if "MembershipCredential" in types else types or "none")

print("Disposing", flush=True)
TOKEN = token()
s, _ = req("DELETE", PROFILE_URL, token=TOKEN)
print(f"  DELETE participant profile: HTTP {s}", flush=True)
start, code = time.time(), ""
while time.time() - start < TIMEOUT:
    code, states, err = profile_state(PROFILE_URL, TOKEN)
    if code == 404 or states == "disposed" or err:
        break
    time.sleep(3)
print(f"  dispose took {int(time.time() - start)}s, profile: {code} {states}", flush=True)
if err:
    print(f"  error: {err}", flush=True)
check("participant profile disposed", "yes", "yes" if (code == 404 or (states == "disposed" and not err)) else "no")
if CTX:
    TOKEN = token()
    check("control plane context removed", 404, req("GET", f"{MGMT}/v5/participants/{CTX}", token=TOKEN)[0])
    check("issuer holder removed", 404, req("GET", f"{ISSUER}/v1/participants/issuer/holders/{CTX}", token=TOKEN)[0])
    check("IdentityHub participant removed", 404, req("GET", f"{IDENTITY}/v1/participants/{CTX}", token=TOKEN)[0])
req("DELETE", f"{TM}/api/v1alpha1/tenants/{TENANT}", token=TOKEN)

print(f"\n{passed} passed, {failed} failed", flush=True)
sys.exit(0 if failed == 0 else 1)
