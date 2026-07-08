-- Teamver Design — OD DaemonDb (Postgres) database bootstrap.
--
-- SSOT for database *name*: terraform/services/teamver-design
--   terraform output -raw daemon_db_name
--   terraform output -raw rds_create_daemon_database_sql
--
-- This file mirrors that output for ops without a terraform checkout.
-- Prefer Terraform output when applying infra changes.
--
-- Staging (shared teamver-staging-postgres):
--   CREATE DATABASE teamver_design_daemon_staging OWNER teamver_be_admin;
--
-- Production (teamver-design-prod-postgres):
--   CREATE DATABASE teamver_design_daemon_production OWNER teamver_design_admin;
--
-- Run once as RDS master against dbname=postgres, then set daemon env:
--   OD_DAEMON_DB=postgres
--   OD_PG_HOST=<terraform output postgres_host>
--   OD_PG_DATABASE=<terraform output daemon_db_name>
--   OD_PG_USER=<terraform output postgres_username>
--   OD_PG_PASSWORD=<same as TF_VAR_teamver_design_rds_pass / POSTGRES_PASSWD>
--
-- Tables: created by open-design-daemon boot migrate (not this SQL).

CREATE DATABASE teamver_design_daemon_staging
  OWNER teamver_be_admin
  ENCODING 'UTF8'
  LC_COLLATE 'en_US.UTF-8'
  LC_CTYPE 'en_US.UTF-8'
  TEMPLATE template0;
