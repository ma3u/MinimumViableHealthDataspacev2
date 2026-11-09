-- The EDC 1.0 databases (#881). docker-compose.jad.yml runs this after
-- jad/init-postgres.sql on a fresh volume; on an existing one, run it once with
-- psql as cp. The 0.18 databases stay untouched. Same users as init-postgres.sql.
CREATE DATABASE controlplane_v1 OWNER cp;
CREATE DATABASE identityhub_v1 OWNER ih;
CREATE DATABASE issuerservice_v1 OWNER issuer;
CREATE DATABASE simplga_v1 OWNER simplga;
CREATE DATABASE rogueissuer_v1 OWNER rogueissuer;
-- CFM 0.0.7 (ADR-085, profile `cfm`); its own database, apart from the 2026-03 CFM's `cfm`.
CREATE DATABASE cfm_v007 OWNER cfm;
