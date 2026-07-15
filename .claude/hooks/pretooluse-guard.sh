#!/usr/bin/env bash
# PreToolUse guard — blocks catastrophic commands and secret-file reads,
# downgrades merely-destructive commands to an explicit user confirmation.
# Wired in .claude/settings.json under hooks.PreToolUse (Bash matcher).
# Exit 2 = deny (stderr shown to Claude). JSON permissionDecision=ask = confirm.
set -euo pipefail

INPUT="$(cat)"

COMMAND=$(printf '%s' "$INPUT" | python3 -c '
import json, sys
data = json.load(sys.stdin)
print(data.get("tool_input", {}).get("command", ""))' 2>/dev/null || echo "")

[[ -z "$COMMAND" ]] && exit 0

# ── Hard deny: catastrophic or secret-exfiltrating ──────────────────────────
DENY_PATTERNS=(
  'rm -rf /([^a-zA-Z0-9_]|$)'          # rm -rf on root
  'rm -rf ~([^a-zA-Z0-9_]|$)'
  'chmod -R 777 /'
  'docker system prune'
  '(cat|less|head|tail|grep|cp|scp) [^|;&]*\.(pem|key)([^a-zA-Z0-9]|$)'
  '(cat|less|head|tail|grep|cp|scp) [^|;&]*\.env([^a-zA-Z0-9]|$)'
  '(cat|less|head|tail|grep|cp|scp) [^|;&]*id_rsa'
)
for p in "${DENY_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qiE "$p"; then
    echo "Blocked by .claude/hooks/pretooluse-guard.sh: matches deny pattern '$p'. Secrets must never be read into context (Vault is the secret store — ADR context in CLAUDE.md gotcha #1); catastrophic deletes need a human." >&2
    exit 2
  fi
done

# ── Ask: destructive but sometimes legitimate ────────────────────────────────
ASK_PATTERNS=(
  'rm -rf'
  'git reset --hard'
  'git push [^|;&]*--force'
  'git clean -[a-z]*f'
  'kubectl delete'
  'helm uninstall'
  'terraform destroy'
  'az (group|containerapp|keyvault) delete'
  'DETACH DELETE'
  'DROP (DATABASE|CONSTRAINT|INDEX)'
)
for p in "${ASK_PATTERNS[@]}"; do
  if printf '%s' "$COMMAND" | grep -qiE "$p"; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Destructive command matched guard pattern: %s"}}\n' "$p"
    exit 0
  fi
done

exit 0
