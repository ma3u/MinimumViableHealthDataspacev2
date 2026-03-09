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
