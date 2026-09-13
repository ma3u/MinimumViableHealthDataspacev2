#!/usr/bin/env bash
# safety-guard — preToolUse guard for GitHub Copilot agents.
#
# Denies catastrophic commands and secret-file reads; downgrades merely
# destructive commands to an explicit user confirmation.
#
# Contract (GitHub Copilot hooks reference):
#   exit 0 + stdout JSON  -> decision honoured
#   exit 2                -> deny (preToolUse fails closed)
#   JSON fields           -> permissionDecision: allow|deny|ask,
#                            permissionDecisionReason
#
# Ported from .claude/hooks/pretooluse-guard.sh — keep the two rule lists in sync.
set -euo pipefail

INPUT="$(cat)"

# The command lives at a slightly different path depending on the caller, so probe
# the plausible ones rather than assuming a single shape. Unknown shape => allow
# (the deny lists below are the safety net, not this extraction).
COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for path in (("tool_input", "command"), ("toolInput", "command"),
             ("arguments", "command"), ("input", "command")):
    cur = d
    for key in path:
        if not isinstance(cur, dict):
            cur = None
            break
        cur = cur.get(key)
    if isinstance(cur, str) and cur:
        print(cur)
        break
else:
    for key in ("command", "bash", "script"):
        if isinstance(d.get(key), str) and d[key]:
            print(d[key])
            break
' 2>/dev/null || echo "")

[[ -z "$COMMAND" ]] && exit 0

# -- Hard deny: catastrophic, or exfiltrates a secret into model context --------
DENY_PATTERNS=(
  'rm -rf /([^a-zA-Z0-9_]|$)'
  'rm -rf ~([^a-zA-Z0-9_]|$)'
  'chmod -R 777 /'
  'docker system prune'
  '(cat|less|head|tail|grep|cp|scp) [^|;&]*\.(pem|key)([^a-zA-Z0-9]|$)'
  '(cat|less|head|tail|grep|cp|scp) [^|;&]*\.env([^a-zA-Z0-9]|$)'
  '(cat|less|head|tail|grep|cp|scp) [^|;&]*id_rsa'
  '(cat|less|head|tail|grep|cp|scp) [^|;&]*secret'
)
for p in "${DENY_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qiE "$p"; then
    # The pattern goes to stderr only — regexes contain backslashes and quotes
    # that are not valid inside a JSON string.
    printf 'Blocked by .github/hooks/safety-guard: matches deny pattern "%s". Secrets must never be read into context (Vault is the secret store); catastrophic deletes need a human.\n' "$p" >&2
    printf '{"permissionDecision":"deny","permissionDecisionReason":"Matched a safety-guard deny rule (catastrophic delete or secret-file read). See stderr for the pattern."}\n'
    exit 2
  fi
done

# -- Ask: destructive but sometimes legitimate ---------------------------------
ASK_PATTERNS=(
  'rm -rf'
  'git reset --hard'
  'git push [^|;&]*--force'
  'git clean -[a-z]*f'
  'kubectl delete'
  'helm uninstall'
  'terraform destroy'
  'az (group|containerapp|keyvault) delete'
  'scripts/azure/teardown\.sh'
  'DETACH DELETE'
  'DROP (DATABASE|CONSTRAINT|INDEX)'
)
for p in "${ASK_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qiE "$p"; then
    printf 'safety-guard: destructive command matched ask pattern "%s".\n' "$p" >&2
    printf '{"permissionDecision":"ask","permissionDecisionReason":"Destructive command matched a safety-guard ask rule. See stderr for the pattern."}\n'
    exit 0
  fi
done

exit 0
