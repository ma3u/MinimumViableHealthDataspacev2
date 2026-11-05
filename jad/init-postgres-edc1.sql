-- Fresh databases for the EDC 1.0 spike (#881, docker-compose.edc1.yml). The 0.18
-- databases stay untouched, so switching back is starting the stack without the
-- overlay. Same users as jad/init-postgres.sql; run once with psql as cp.
CREATE DATABASE controlplane_v1 OWNER cp;
CREATE DATABASE identityhub_v1 OWNER ih;
CREATE DATABASE issuerservice_v1 OWNER issuer;
CREATE DATABASE simplga_v1 OWNER simplga;
CREATE DATABASE rogueissuer_v1 OWNER rogueissuer;
