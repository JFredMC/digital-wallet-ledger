-- Runs once, when the Postgres data volume is first initialised.
-- The baseline TypeORM migration also creates these (IF NOT EXISTS), so managed
-- databases such as Neon end up with the same setup.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- TODO (later stage): dedicated least-privilege application role.
