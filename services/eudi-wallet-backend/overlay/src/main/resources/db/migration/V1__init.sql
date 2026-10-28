-- Schema for the German national wallet backend, derived from the published
-- source: the mirror ships no db/migration directory, so nothing creates the
-- tables its repositories query.
--
-- Every column below is named by a @Column / @Table annotation or by a literal
-- in an @Query in src/main/kotlin. Types follow from the Kotlin types and from
-- how the queries use them:
--   UUID -> uuid, ByteArray -> bytea, Instant -> timestamptz,
--   io.r2dbc.postgresql.codec.Json -> jsonb, @Version Long -> bigint.
--
-- Where upstream's own constraints are inferable from a query they are written
-- here as constraints rather than left to the application:
--   * PnsRepository.upsertByAccountId does ON CONFLICT (account_id)
--     -> unique (account_id)
--   * StatusListRepository.insertListIfAbsent does
--     ON CONFLICT (pool) WHERE cursor < size -> partial unique index
--   * advanceCursor / updateStatusBit assume defaults for cursor, version,
--     created -> defaults declared here.
-- Anything not inferable (index tuning, retention) is deliberately absent.

CREATE TABLE IF NOT EXISTS wpb_account (
    id                     uuid        PRIMARY KEY,
    wpb_account_id         uuid        NOT NULL UNIQUE,
    wi_mdvm_auth_pubk_der  bytea       NOT NULL,
    wpb_wi_revocation_hash bytea       UNIQUE,
    wi_handle              text,
    revoked_at             timestamptz,
    mdvm_wi_id             uuid
);
CREATE INDEX IF NOT EXISTS wpb_account_wi_handle_idx ON wpb_account (wi_handle);

CREATE TABLE IF NOT EXISTS rwsca_account (
    id                       uuid        PRIMARY KEY,
    rwsca_account_id         uuid        NOT NULL UNIQUE,
    wi_mdvm_auth_pubk_der    bytea       NOT NULL,
    wi_rwsca_pin_pubk_der    bytea,
    rwsca_pin_try_counter    integer,
    rwsca_pin_try_failed_at  timestamptz,
    wi_handle                text,
    revoked_at               timestamptz,
    mdvm_wi_id               uuid
);
CREATE INDEX IF NOT EXISTS rwsca_account_wi_handle_idx ON rwsca_account (wi_handle);

CREATE TABLE IF NOT EXISTS device_account (
    id                          uuid        PRIMARY KEY,
    mdvm_wi_id                  uuid        NOT NULL UNIQUE,
    wi_mdvm_auth_pubk_der       bytea       NOT NULL,
    device_type                 text        NOT NULL CHECK (device_type IN ('ANDROID', 'IOS')),
    device_class                jsonb       NOT NULL,
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    android_attestation_details jsonb,
    ios_devicecheck_attestation jsonb,
    ios_devicecheck_assertion   jsonb,
    wi_handle                   text,
    revoked_at                  timestamptz,
    version                     bigint      NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS device_account_wi_handle_idx ON device_account (wi_handle);

CREATE TABLE IF NOT EXISTS mdvm_analytics (
    id                   uuid   PRIMARY KEY,
    operation_name       text   NOT NULL,
    auth_challenge       text   NOT NULL,
    skip_integrity_checks text  NOT NULL,
    request              jsonb  NOT NULL,
    exception_details    jsonb,
    version              bigint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notification_registration (
    id                    uuid        PRIMARY KEY,
    account_id            uuid        NOT NULL UNIQUE,
    mpp_registration_token text       NOT NULL,
    registered_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS status_list (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    pool           text        NOT NULL,
    bits_per_entry integer     NOT NULL,
    size           integer     NOT NULL,
    cursor         integer     NOT NULL DEFAULT 0,
    seed           bytea       NOT NULL,
    data           bytea       NOT NULL,
    version        integer     NOT NULL DEFAULT 0,
    created        timestamptz NOT NULL DEFAULT now(),
    exhausted_at   timestamptz
);
-- insertListIfAbsent relies on this exact predicate: at most one list per pool
-- may still have room, so concurrent allocators cannot open a second one.
CREATE UNIQUE INDEX IF NOT EXISTS status_list_open_per_pool_idx
    ON status_list (pool) WHERE cursor < size;
CREATE INDEX IF NOT EXISTS status_list_pool_created_idx ON status_list (pool, created);

CREATE TABLE IF NOT EXISTS status_list_entry (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id         uuid        NOT NULL,
    list_id            uuid        NOT NULL REFERENCES status_list (id) ON DELETE CASCADE,
    idx                integer     NOT NULL,
    exp                timestamptz NOT NULL,
    created            timestamptz NOT NULL DEFAULT now(),
    client_instance_id uuid,
    UNIQUE (list_id, idx)
);
CREATE INDEX IF NOT EXISTS status_list_entry_account_idx ON status_list_entry (account_id);
CREATE INDEX IF NOT EXISTS status_list_entry_exp_idx ON status_list_entry (exp);
