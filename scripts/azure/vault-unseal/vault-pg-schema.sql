-- Vault's postgresql storage backend does not create its own table (ADR-046).
-- From the Vault storage documentation; idempotent, so the unseal sidecar
-- runs it on every start. HA is off (one replica), so no vault_ha_locks.
CREATE TABLE IF NOT EXISTS vault_kv_store (
  parent_path TEXT COLLATE "C" NOT NULL,
  path        TEXT COLLATE "C",
  key         TEXT COLLATE "C",
  value       BYTEA,
  CONSTRAINT pkey PRIMARY KEY (path, key)
);
CREATE INDEX IF NOT EXISTS parent_path_idx ON vault_kv_store (parent_path);
