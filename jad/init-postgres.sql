-- =============================================================================
-- JAD PostgreSQL Initialization Script
-- =============================================================================
-- Creates all databases and users required by the EDC-V / CFM services.
-- This mirrors the K8s ConfigMap in k8s/base/postgres.yaml.
-- Default database (controlplane/cp/cp) is created by POSTGRES_DB/USER/PASSWORD env vars.
-- =============================================================================

CREATE DATABASE identityhub;
CREATE USER ih WITH PASSWORD 'ih';
GRANT ALL PRIVILEGES ON DATABASE identityhub TO ih;
\c identityhub
GRANT ALL ON SCHEMA public TO ih;

CREATE DATABASE issuerservice;
CREATE USER issuer WITH PASSWORD 'issuer';
GRANT ALL PRIVILEGES ON DATABASE issuerservice TO issuer;
\c issuerservice
GRANT ALL ON SCHEMA public TO issuer;

CREATE DATABASE dataplane;
CREATE USER dp WITH PASSWORD 'dp';
GRANT ALL PRIVILEGES ON DATABASE dataplane TO dp;
\c dataplane
GRANT ALL ON SCHEMA public TO dp;

-- ADR-2: Separate database for the OMOP DCore data plane instance
CREATE DATABASE dataplane_omop;
CREATE USER dp_omop WITH PASSWORD 'dp_omop';
GRANT ALL PRIVILEGES ON DATABASE dataplane_omop TO dp_omop;
\c dataplane_omop
GRANT ALL ON SCHEMA public TO dp_omop;

CREATE DATABASE keycloak;
CREATE USER kc WITH PASSWORD 'kc';
GRANT ALL PRIVILEGES ON DATABASE keycloak TO kc;
\c keycloak
GRANT ALL ON SCHEMA public TO kc;

CREATE DATABASE cfm;
CREATE USER cfm WITH PASSWORD 'cfm';
GRANT ALL PRIVILEGES ON DATABASE cfm TO cfm;
\c cfm
GRANT ALL ON SCHEMA public TO cfm;

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
