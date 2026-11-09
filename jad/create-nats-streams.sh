#!/bin/sh
# Creates the control plane's JetStream task streams as file streams, before
# the control plane starts (compose service nats-streams, docs/gotchas.md
# 2026-11-09). Runs in natsio/nats-box, so POSIX sh.
#
# EDC 1.0's control plane creates cn-stream and tp-stream itself
# (edc.nats.cn/tp.subscriber.autocreate), but always in memory
# (StorageType.Memory in NatsSubscriber.prepare, 1.0.0-RC5) and only at
# startup. A NATS restart then takes both, and every negotiation start answers
# 500 until the control plane is restarted. A stream that already exists it
# leaves alone (NatsFunctions.createStream asks streamExists first) and only
# attaches its durable consumer, so streams created here on the nats_data
# volume survive a NATS restart, with the consumers and every task not yet
# handled. Measured 2026-11-09: NATS restarted under a running control plane,
# and the next message was delivered and acknowledged.
#
# The configuration is the control plane's own (subjects, limits retention)
# except two things. The storage is file. And messages expire after seven
# days: a memory stream was emptied by every restart, a file stream is not,
# and limits retention keeps a message after it is acknowledged. A task has
# been handled or given up within minutes (edc.negotiation.send.retry.limit).
#
# A stream that exists is left as it is. A memory stream from before this
# file stays memory until it is converted once, while the control plane is
# stopped; the steps are in docs/gotchas.md.
set -eu

SERVER="${NATS_URL:-nats://nats:4222}"

ensure_file_stream() {
  stream="$1" subject="$2"
  if info=$(nats --server "$SERVER" stream info "$stream" --json 2>/dev/null); then
    if printf '%s' "$info" | grep -q '"storage": *"file"'; then
      echo "$stream: file stream, left as it is"
    else
      echo "WARNING: $stream is a memory stream and will not survive a NATS restart."
      echo "  Convert it once, while the control plane is stopped: docs/gotchas.md (2026-11-09)."
    fi
    return 0
  fi
  nats --server "$SERVER" stream add "$stream" --subjects "$subject" \
    --storage file --max-age 7d --defaults >/dev/null
  echo "$stream: created as a file stream for $subject"
}

ensure_file_stream cn-stream 'negotiations.>'
ensure_file_stream tp-stream 'transfers.>'
