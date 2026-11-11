-- The EDC 1.0 databases (#881). docker-compose.jad.yml runs this after
-- jad/init-postgres.sql on a fresh volume; on an existing one, run it once with
-- psql as cp. The owners are the users init-postgres.sql creates.
CREATE DATABASE controlplane_v1 OWNER cp;
CREATE DATABASE identityhub_v1 OWNER ih;
CREATE DATABASE issuerservice_v1 OWNER issuer;
CREATE DATABASE simplga_v1 OWNER simplga;
CREATE DATABASE rogueissuer_v1 OWNER rogueissuer;
-- CFM 0.0.7 (ADR-085, profile `cfm`).
CREATE DATABASE cfm_v007 OWNER cfm;
