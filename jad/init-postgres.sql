-- =============================================================================
-- JAD PostgreSQL Initialization Script
-- =============================================================================
-- Creates the users of the EDC 1.0 and CFM services, and the databases that
-- are not EDC's (keycloak, taskdb). The EDC 1.0 databases and CFM 0.0.7's
-- follow in jad/init-postgres-edc1.sql, owned by the users made here.
-- Local only (Compose). On Azure the databases live on Flexible Server (ADR-041).
-- Default database (controlplane/cp/cp) is created by POSTGRES_DB/USER/PASSWORD env vars.
-- EDC 0.18's identityhub, issuerservice, dataplane and dataplane_omop and the
-- 2026-03 CFM's cfm were removed with #927; an older volume still has them.
-- =============================================================================

-- The owners of identityhub_v1 and issuerservice_v1 (init-postgres-edc1.sql).
CREATE USER ih WITH PASSWORD 'ih';
CREATE USER issuer WITH PASSWORD 'issuer';

CREATE DATABASE keycloak;
CREATE USER kc WITH PASSWORD 'kc';
GRANT ALL PRIVILEGES ON DATABASE keycloak TO kc;
\c keycloak
GRANT ALL ON SCHEMA public TO kc;

-- The owner of cfm_v007, CFM 0.0.7's database (ADR-085, init-postgres-edc1.sql).
CREATE USER cfm WITH PASSWORD 'cfm';

CREATE DATABASE redlinedb;
CREATE USER redline WITH PASSWORD 'redline';
GRANT ALL PRIVILEGES ON DATABASE redlinedb TO redline;
\c redlinedb
GRANT ALL ON SCHEMA public TO redline;

-- =============================================================================
-- Task Management Database (Phase 13)
-- =============================================================================
-- Persistent decentralised task storage for negotiations and transfers.
-- Each participant stores their own task state on the provider/consumer side.
CREATE DATABASE taskdb;
CREATE USER taskuser WITH PASSWORD 'taskuser';
GRANT ALL PRIVILEGES ON DATABASE taskdb TO taskuser;
\c taskdb
GRANT ALL ON SCHEMA public TO taskuser;

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,           -- EDC-V negotiation or transfer ID
  type            TEXT NOT NULL CHECK (type IN ('negotiation', 'transfer')),
  participant     TEXT NOT NULL,              -- human-readable participant name
  participant_id  TEXT NOT NULL,              -- UUID context ID
  asset           TEXT NOT NULL DEFAULT '',   -- human-readable asset name
  asset_id        TEXT NOT NULL DEFAULT '',   -- raw asset ID
  state           TEXT NOT NULL DEFAULT 'REQUESTED',
  counter_party   TEXT NOT NULL DEFAULT '',   -- human-readable counter-party name
  timestamp_ms    BIGINT NOT NULL DEFAULT 0,  -- last state update (epoch millis)
  contract_id     TEXT,                       -- contract agreement ID (if available)
  transfer_type   TEXT,                       -- e.g. HttpData-PULL
  edr_available   BOOLEAN DEFAULT FALSE,      -- DPS: Endpoint Data Reference available
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_participant_id ON tasks(participant_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);

-- This script runs as the superuser, so the table above would belong to it
-- and the proxy's CREATE INDEX IF NOT EXISTS (routes/tasks.ts) failed with
-- "must be owner of table tasks" on every /tasks call (#571). The indexes
-- follow the table's owner.
ALTER TABLE tasks OWNER TO taskuser;

-- #710: the IssuerService of a fictional Simpl Governance Authority, a trusted
-- issuer for MembershipCredential (ADR-064), and of an issuer on no trust
-- list, which the identity checks start only to see it refused.
-- scripts/seed-test-issuer.sh creates both for a volume initialised earlier.
CREATE DATABASE simplga;
CREATE USER simplga WITH PASSWORD 'simplga';
GRANT ALL PRIVILEGES ON DATABASE simplga TO simplga;
\c simplga
GRANT ALL ON SCHEMA public TO simplga;

CREATE DATABASE rogueissuer;
CREATE USER rogueissuer WITH PASSWORD 'rogueissuer';
GRANT ALL PRIVILEGES ON DATABASE rogueissuer TO rogueissuer;
\c rogueissuer
GRANT ALL ON SCHEMA public TO rogueissuer;
