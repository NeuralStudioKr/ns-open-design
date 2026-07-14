// One-off migration: legacy SQLite `app.sqlite` → Postgres DaemonDb.
//
// Reads projects, conversations, messages, agent_sessions, tabs_state from
// the source SQLite file, then upserts into the DaemonDb Postgres tables
// covered by B5.1 / B5.2. Idempotent: safe to run more than once.
//
// Usage:
//   node dist/scripts/migrate-sqlite-to-postgres.js \
//        --sqlite /path/to/app.sqlite \
//        [--dry-run]
//
// Env:
//   OD_DAEMON_DB=postgres, OD_PG_HOST, OD_PG_DATABASE, OD_PG_USER,
//   OD_PG_PASSWORD, OD_PG_PORT (optional), OD_PG_SSL_MODE (optional).
//
// The script does NOT touch the daemon runtime; it opens its own pg.Pool
// and better-sqlite3 handle so it can run against an offline daemon.

import Database from 'better-sqlite3';
import { Pool } from 'pg';

import { resolveDaemonDbConfig } from '../storage/daemon-db.js';
import {
  createPostgresPool,
  migratePostgresDaemonSchema,
  probePostgresPool,
} from '../storage/daemon-db-postgres.js';
import { resolveDaemonDbPassword } from '../storage/daemon-db-runtime.js';

type SqliteDb = Database.Database;

interface CliArgs {
  sqlite: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let sqlite: string | null = null;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--sqlite') {
      sqlite = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  if (!sqlite) {
    printHelp();
    console.error('\nERROR: --sqlite <path> is required.');
    process.exit(2);
  }
  return { sqlite, dryRun };
}

function printHelp(): void {
  console.log(`migrate-sqlite-to-postgres — Track B5 daemon-db migration

Usage:
  node dist/scripts/migrate-sqlite-to-postgres.js \\
       --sqlite /path/to/app.sqlite [--dry-run]

Reads OD_DAEMON_DB / OD_PG_* env for the destination.`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = resolveDaemonDbConfig(process.env);
  if (config.kind !== 'postgres' || !config.postgres) {
    console.error('OD_DAEMON_DB must be "postgres" and OD_PG_* env vars set.');
    process.exit(2);
  }
  const password = resolveDaemonDbPassword(process.env);

  const sqlite = new Database(args.sqlite, { fileMustExist: true, readonly: true });
  const pool: Pool = createPostgresPool(config.postgres, password);
  await migratePostgresDaemonSchema(pool);
  await probePostgresPool(pool);

  const stats = {
    projects: 0,
    conversations: 0,
    messages: 0,
    agent_sessions: 0,
    tabs_state: 0,
    preview_comments: 0,
    deployments: 0,
    routines: 0,
    routine_runs: 0,
    routine_schedule_claims: 0,
    installed_plugins: 0,
    plugin_marketplaces: 0,
    applied_plugin_snapshots: 0,
    media_tasks: 0,
    skipped: 0,
  };

  try {
    stats.projects                 = await migrateProjects(sqlite, pool, args.dryRun);
    stats.conversations            = await migrateConversations(sqlite, pool, args.dryRun);
    stats.messages                 = await migrateMessages(sqlite, pool, args.dryRun);
    stats.agent_sessions           = await migrateAgentSessions(sqlite, pool, args.dryRun);
    stats.tabs_state               = await migrateTabsState(sqlite, pool, args.dryRun);
    stats.preview_comments         = await migratePreviewComments(sqlite, pool, args.dryRun);
    stats.deployments              = await migrateDeployments(sqlite, pool, args.dryRun);
    stats.routines                 = await migrateRoutines(sqlite, pool, args.dryRun);
    stats.routine_runs             = await migrateRoutineRuns(sqlite, pool, args.dryRun);
    stats.routine_schedule_claims  = await migrateRoutineScheduleClaims(sqlite, pool, args.dryRun);
    stats.installed_plugins        = await migrateInstalledPlugins(sqlite, pool, args.dryRun);
    stats.plugin_marketplaces      = await migratePluginMarketplaces(sqlite, pool, args.dryRun);
    stats.applied_plugin_snapshots = await migrateAppliedPluginSnapshots(sqlite, pool, args.dryRun);
    stats.media_tasks              = await migrateMediaTasks(sqlite, pool, args.dryRun);
  } finally {
    sqlite.close();
    await pool.end();
  }

  console.log(
    JSON.stringify({
      metric: 'daemon_db_sqlite_to_postgres_done',
      dryRun: args.dryRun,
      counts: stats,
    }),
  );
}

async function migrateProjects(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  const rows = sqlite
    .prepare(
      `SELECT id, name, skill_id, design_system_id, pending_prompt,
              metadata_json, applied_plugin_snapshot_id, custom_instructions,
              created_at, updated_at
         FROM projects`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('projects', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO projects
         (id, name, skill_id, design_system_id, pending_prompt,
          metadata_json, applied_plugin_snapshot_id, custom_instructions,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             skill_id = EXCLUDED.skill_id,
             design_system_id = EXCLUDED.design_system_id,
             pending_prompt = EXCLUDED.pending_prompt,
             metadata_json = EXCLUDED.metadata_json,
             applied_plugin_snapshot_id = EXCLUDED.applied_plugin_snapshot_id,
             custom_instructions = EXCLUDED.custom_instructions,
             updated_at = EXCLUDED.updated_at`,
      [
        r.id,
        r.name,
        r.skill_id ?? null,
        r.design_system_id ?? null,
        r.pending_prompt ?? null,
        r.metadata_json ?? null,
        r.applied_plugin_snapshot_id ?? null,
        r.custom_instructions ?? null,
        Number(r.created_at ?? Date.now()),
        Number(r.updated_at ?? Date.now()),
      ],
    );
  }
  logStage('projects', rows.length, 'applied');
  return rows.length;
}

async function migrateConversations(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  const rows = sqlite
    .prepare(
      `SELECT id, project_id, title, session_mode, created_at, updated_at
         FROM conversations`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('conversations', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO conversations
         (id, project_id, title, session_mode, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             session_mode = EXCLUDED.session_mode,
             updated_at = EXCLUDED.updated_at`,
      [
        r.id,
        r.project_id,
        r.title ?? null,
        r.session_mode ?? 'design',
        Number(r.created_at ?? Date.now()),
        Number(r.updated_at ?? Date.now()),
      ],
    );
  }
  logStage('conversations', rows.length, 'applied');
  return rows.length;
}

async function migrateMessages(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  const rows = sqlite
    .prepare(
      `SELECT id, conversation_id, role, content, agent_id, agent_name,
              run_id, run_status, last_run_event_id,
              events_json, attachments_json, comment_attachments_json,
              produced_files_json, feedback_json, pre_turn_file_names_json,
              session_mode, run_context_json, applied_plugin_snapshot_json,
              telemetry_finalized_at, started_at, ended_at, position, created_at
         FROM messages
        ORDER BY conversation_id, position ASC`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('messages', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO messages
         (id, conversation_id, role, content, agent_id, agent_name,
          run_id, run_status, last_run_event_id, events_json,
          attachments_json, comment_attachments_json, produced_files_json,
          feedback_json, pre_turn_file_names_json,
          session_mode, run_context_json, applied_plugin_snapshot_json,
          telemetry_finalized_at, started_at, ended_at, position, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (id) DO UPDATE
         SET role = EXCLUDED.role,
             content = EXCLUDED.content,
             agent_id = EXCLUDED.agent_id,
             agent_name = EXCLUDED.agent_name,
             run_id = EXCLUDED.run_id,
             run_status = EXCLUDED.run_status,
             last_run_event_id = EXCLUDED.last_run_event_id,
             events_json = EXCLUDED.events_json,
             attachments_json = EXCLUDED.attachments_json,
             comment_attachments_json = EXCLUDED.comment_attachments_json,
             produced_files_json = EXCLUDED.produced_files_json,
             feedback_json = EXCLUDED.feedback_json,
             pre_turn_file_names_json = EXCLUDED.pre_turn_file_names_json,
             session_mode = EXCLUDED.session_mode,
             run_context_json = EXCLUDED.run_context_json,
             applied_plugin_snapshot_json = EXCLUDED.applied_plugin_snapshot_json,
             telemetry_finalized_at = EXCLUDED.telemetry_finalized_at,
             started_at = EXCLUDED.started_at,
             ended_at = EXCLUDED.ended_at,
             position = EXCLUDED.position`,
      [
        r.id,
        r.conversation_id,
        r.role,
        r.content,
        r.agent_id ?? null,
        r.agent_name ?? null,
        r.run_id ?? null,
        r.run_status ?? null,
        r.last_run_event_id ?? null,
        r.events_json ?? null,
        r.attachments_json ?? null,
        r.comment_attachments_json ?? null,
        r.produced_files_json ?? null,
        r.feedback_json ?? null,
        r.pre_turn_file_names_json ?? null,
        r.session_mode ?? null,
        r.run_context_json ?? null,
        r.applied_plugin_snapshot_json ?? null,
        r.telemetry_finalized_at ?? null,
        r.started_at ?? null,
        r.ended_at ?? null,
        Number(r.position ?? 0),
        Number(r.created_at ?? Date.now()),
      ],
    );
  }
  logStage('messages', rows.length, 'applied');
  return rows.length;
}

async function migrateAgentSessions(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  const rows = sqlite
    .prepare(
      `SELECT conversation_id, agent_id, session_id, stable_prompt_hash, updated_at
         FROM agent_sessions`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('agent_sessions', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO agent_sessions
         (conversation_id, agent_id, session_id, stable_prompt_hash, updated_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (conversation_id, agent_id) DO UPDATE
         SET session_id = EXCLUDED.session_id,
             stable_prompt_hash = EXCLUDED.stable_prompt_hash,
             updated_at = EXCLUDED.updated_at`,
      [
        r.conversation_id,
        r.agent_id,
        r.session_id,
        r.stable_prompt_hash ?? null,
        Number(r.updated_at ?? Date.now()),
      ],
    );
  }
  logStage('agent_sessions', rows.length, 'applied');
  return rows.length;
}

async function migrateTabsState(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  // The `tabs` table holds derived per-name rows; the JSON blob in tabs_state
  // is the actual source of truth. Postgres only stores the JSON blob.
  const rows = sqlite
    .prepare(
      `SELECT project_id, updated_at, state_json FROM tabs_state`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('project_tabs_state', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    if (r.state_json == null) continue;
    await pool.query(
      `INSERT INTO project_tabs_state (project_id, state_json, updated_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (project_id) DO UPDATE
         SET state_json = EXCLUDED.state_json,
             updated_at = EXCLUDED.updated_at`,
      [
        r.project_id,
        String(r.state_json),
        Number(r.updated_at ?? Date.now()),
      ],
    );
  }
  logStage('project_tabs_state', rows.length, 'applied');
  return rows.length;
}

async function migratePreviewComments(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  const rows = sqlite
    .prepare(
      `SELECT id, project_id, conversation_id, file_path, element_id, selector,
              label, text, position_json, html_hint, selection_kind, member_count,
              pod_members_json, style_json, attachments_json, slide_index,
              slide_key, note, status, created_at, updated_at
         FROM preview_comments`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('preview_comments', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO preview_comments
         (id, project_id, conversation_id, file_path, element_id, selector, label,
          text, position_json, html_hint, selection_kind, member_count,
          pod_members_json, style_json, attachments_json,
          slide_index, slide_key, note, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (id) DO UPDATE
         SET selector = EXCLUDED.selector,
             label = EXCLUDED.label,
             text = EXCLUDED.text,
             position_json = EXCLUDED.position_json,
             html_hint = EXCLUDED.html_hint,
             selection_kind = EXCLUDED.selection_kind,
             member_count = EXCLUDED.member_count,
             pod_members_json = EXCLUDED.pod_members_json,
             style_json = EXCLUDED.style_json,
             attachments_json = EXCLUDED.attachments_json,
             slide_index = EXCLUDED.slide_index,
             slide_key = EXCLUDED.slide_key,
             note = EXCLUDED.note,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at`,
      [
        r.id,
        r.project_id,
        r.conversation_id,
        r.file_path,
        r.element_id,
        r.selector,
        r.label,
        r.text,
        r.position_json,
        r.html_hint,
        r.selection_kind ?? null,
        r.member_count ?? null,
        r.pod_members_json ?? null,
        r.style_json ?? null,
        r.attachments_json ?? null,
        r.slide_index ?? null,
        Number(r.slide_key ?? -1),
        r.note,
        r.status,
        Number(r.created_at ?? Date.now()),
        Number(r.updated_at ?? Date.now()),
      ],
    );
  }
  logStage('preview_comments', rows.length, 'applied');
  return rows.length;
}

async function migrateDeployments(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  const rows = sqlite
    .prepare(
      `SELECT id, project_id, file_name, provider_id, url, deployment_id,
              deployment_count, target, status, status_message, reachable_at,
              provider_metadata_json, created_at, updated_at
         FROM deployments`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('deployments', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO deployments
         (id, project_id, file_name, provider_id, url, deployment_id,
          deployment_count, target, status, status_message, reachable_at,
          provider_metadata_json, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE
         SET url = EXCLUDED.url,
             deployment_id = EXCLUDED.deployment_id,
             deployment_count = EXCLUDED.deployment_count,
             target = EXCLUDED.target,
             status = EXCLUDED.status,
             status_message = EXCLUDED.status_message,
             reachable_at = EXCLUDED.reachable_at,
             provider_metadata_json = EXCLUDED.provider_metadata_json,
             updated_at = EXCLUDED.updated_at`,
      [
        r.id,
        r.project_id,
        r.file_name,
        r.provider_id,
        r.url,
        r.deployment_id ?? null,
        Number(r.deployment_count ?? 1),
        r.target ?? 'preview',
        r.status ?? 'ready',
        r.status_message ?? null,
        r.reachable_at == null ? null : Number(r.reachable_at),
        r.provider_metadata_json ?? null,
        Number(r.created_at ?? Date.now()),
        Number(r.updated_at ?? Date.now()),
      ],
    );
  }
  logStage('deployments', rows.length, 'applied');
  return rows.length;
}

async function migrateRoutines(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  const rows = sqlite
    .prepare(
      `SELECT id, name, prompt, schedule_kind, schedule_value, schedule_json,
              project_mode, project_id, skill_id, agent_id, context_json,
              enabled, created_at, updated_at
         FROM routines`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('routines', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO routines
         (id, name, prompt, schedule_kind, schedule_value, schedule_json,
          project_mode, project_id, skill_id, agent_id, context_json, enabled,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             prompt = EXCLUDED.prompt,
             schedule_kind = EXCLUDED.schedule_kind,
             schedule_value = EXCLUDED.schedule_value,
             schedule_json = EXCLUDED.schedule_json,
             project_mode = EXCLUDED.project_mode,
             project_id = EXCLUDED.project_id,
             skill_id = EXCLUDED.skill_id,
             agent_id = EXCLUDED.agent_id,
             context_json = EXCLUDED.context_json,
             enabled = EXCLUDED.enabled,
             updated_at = EXCLUDED.updated_at`,
      [
        r.id,
        r.name,
        r.prompt,
        r.schedule_kind,
        r.schedule_value,
        r.schedule_json ?? null,
        r.project_mode,
        r.project_id ?? null,
        r.skill_id ?? null,
        r.agent_id ?? null,
        r.context_json ?? null,
        Number(r.enabled ?? 0) === 1 ? 1 : 0,
        Number(r.created_at ?? Date.now()),
        Number(r.updated_at ?? Date.now()),
      ],
    );
  }
  logStage('routines', rows.length, 'applied');
  return rows.length;
}

async function migrateRoutineRuns(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  const rows = sqlite
    .prepare(
      `SELECT id, routine_id, trigger, status, project_id, conversation_id,
              agent_run_id, started_at, completed_at, summary, error, error_code
         FROM routine_runs`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('routine_runs', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO routine_runs
         (id, routine_id, trigger, status, project_id, conversation_id,
          agent_run_id, started_at, completed_at, summary, error, error_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             completed_at = EXCLUDED.completed_at,
             summary = EXCLUDED.summary,
             error = EXCLUDED.error,
             error_code = EXCLUDED.error_code`,
      [
        r.id,
        r.routine_id,
        r.trigger,
        r.status,
        r.project_id,
        r.conversation_id,
        r.agent_run_id,
        Number(r.started_at ?? Date.now()),
        r.completed_at == null ? null : Number(r.completed_at),
        r.summary ?? null,
        r.error ?? null,
        r.error_code ?? null,
      ],
    );
  }
  logStage('routine_runs', rows.length, 'applied');
  return rows.length;
}

async function migrateRoutineScheduleClaims(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  const rows = sqlite
    .prepare(
      `SELECT routine_id, slot_at, claimed_at FROM routine_schedule_claims`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('routine_schedule_claims', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO routine_schedule_claims (routine_id, slot_at, claimed_at)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [
        r.routine_id,
        Number(r.slot_at ?? 0),
        Number(r.claimed_at ?? Date.now()),
      ],
    );
  }
  logStage('routine_schedule_claims', rows.length, 'applied');
  return rows.length;
}

async function migrateInstalledPlugins(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  if (!sqliteTableExists(sqlite, 'installed_plugins')) return 0;
  const rows = sqlite
    .prepare(
      `SELECT id, title, version, source_kind, source, pinned_ref, source_digest,
              source_marketplace_id, source_marketplace_entry_name,
              source_marketplace_entry_version, marketplace_trust,
              resolved_source, resolved_ref, manifest_digest, archive_integrity,
              trust, capabilities_granted, manifest_json, fs_path,
              installed_at, updated_at
         FROM installed_plugins`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('installed_plugins', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO installed_plugins
         (id, title, version, source_kind, source, pinned_ref, source_digest,
          source_marketplace_id, source_marketplace_entry_name,
          source_marketplace_entry_version, marketplace_trust,
          resolved_source, resolved_ref, manifest_digest, archive_integrity,
          trust, capabilities_granted, manifest_json, fs_path,
          installed_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       ON CONFLICT (id) DO UPDATE
         SET title = EXCLUDED.title,
             version = EXCLUDED.version,
             source_kind = EXCLUDED.source_kind,
             source = EXCLUDED.source,
             pinned_ref = EXCLUDED.pinned_ref,
             source_digest = EXCLUDED.source_digest,
             source_marketplace_id = EXCLUDED.source_marketplace_id,
             source_marketplace_entry_name = EXCLUDED.source_marketplace_entry_name,
             source_marketplace_entry_version = EXCLUDED.source_marketplace_entry_version,
             marketplace_trust = EXCLUDED.marketplace_trust,
             resolved_source = EXCLUDED.resolved_source,
             resolved_ref = EXCLUDED.resolved_ref,
             manifest_digest = EXCLUDED.manifest_digest,
             archive_integrity = EXCLUDED.archive_integrity,
             trust = EXCLUDED.trust,
             capabilities_granted = EXCLUDED.capabilities_granted,
             manifest_json = EXCLUDED.manifest_json,
             fs_path = EXCLUDED.fs_path,
             updated_at = EXCLUDED.updated_at`,
      [
        r.id,
        r.title,
        r.version,
        r.source_kind,
        r.source,
        r.pinned_ref ?? null,
        r.source_digest ?? null,
        r.source_marketplace_id ?? null,
        r.source_marketplace_entry_name ?? null,
        r.source_marketplace_entry_version ?? null,
        r.marketplace_trust ?? null,
        r.resolved_source ?? null,
        r.resolved_ref ?? null,
        r.manifest_digest ?? null,
        r.archive_integrity ?? null,
        r.trust,
        r.capabilities_granted,
        r.manifest_json,
        r.fs_path,
        Number(r.installed_at ?? Date.now()),
        Number(r.updated_at ?? Date.now()),
      ],
    );
  }
  logStage('installed_plugins', rows.length, 'applied');
  return rows.length;
}

async function migratePluginMarketplaces(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  if (!sqliteTableExists(sqlite, 'plugin_marketplaces')) return 0;
  const rows = sqlite
    .prepare(
      `SELECT id, url, spec_version, version, trust, manifest_json,
              added_at, refreshed_at
         FROM plugin_marketplaces`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('plugin_marketplaces', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO plugin_marketplaces
         (id, url, spec_version, version, trust, manifest_json, added_at, refreshed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE
         SET url = EXCLUDED.url,
             spec_version = EXCLUDED.spec_version,
             version = EXCLUDED.version,
             trust = EXCLUDED.trust,
             manifest_json = EXCLUDED.manifest_json,
             refreshed_at = EXCLUDED.refreshed_at`,
      [
        r.id,
        r.url,
        r.spec_version ?? '1.0.0',
        r.version ?? '0.0.0',
        r.trust,
        r.manifest_json,
        Number(r.added_at ?? Date.now()),
        Number(r.refreshed_at ?? Date.now()),
      ],
    );
  }
  logStage('plugin_marketplaces', rows.length, 'applied');
  return rows.length;
}

async function migrateAppliedPluginSnapshots(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  if (!sqliteTableExists(sqlite, 'applied_plugin_snapshots')) return 0;
  const rows = sqlite
    .prepare(
      `SELECT id, project_id, conversation_id, run_id, plugin_id,
              plugin_spec_version, plugin_version, manifest_source_digest,
              source_marketplace_id, source_marketplace_entry_name,
              source_marketplace_entry_version, marketplace_trust,
              resolved_source, resolved_ref, archive_integrity, pinned_ref,
              task_kind, inputs_json, resolved_context_json, craft_requires_json,
              pipeline_json, genui_surfaces_json, capabilities_granted,
              capabilities_required, assets_staged_json, connectors_required_json,
              connectors_resolved_json, mcp_servers_json,
              plugin_title, plugin_description, query_text,
              status, applied_at, expires_at
         FROM applied_plugin_snapshots`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('applied_plugin_snapshots', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO applied_plugin_snapshots
         (id, project_id, conversation_id, run_id, plugin_id,
          plugin_spec_version, plugin_version, manifest_source_digest,
          source_marketplace_id, source_marketplace_entry_name,
          source_marketplace_entry_version, marketplace_trust,
          resolved_source, resolved_ref, archive_integrity, pinned_ref,
          task_kind, inputs_json, resolved_context_json, craft_requires_json,
          pipeline_json, genui_surfaces_json, capabilities_granted,
          capabilities_required, assets_staged_json, connectors_required_json,
          connectors_resolved_json, mcp_servers_json,
          plugin_title, plugin_description, query_text,
          status, applied_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             expires_at = EXCLUDED.expires_at`,
      [
        r.id,
        r.project_id,
        r.conversation_id ?? null,
        r.run_id ?? null,
        r.plugin_id,
        r.plugin_spec_version ?? '1.0.0',
        r.plugin_version,
        r.manifest_source_digest,
        r.source_marketplace_id ?? null,
        r.source_marketplace_entry_name ?? null,
        r.source_marketplace_entry_version ?? null,
        r.marketplace_trust ?? null,
        r.resolved_source ?? null,
        r.resolved_ref ?? null,
        r.archive_integrity ?? null,
        r.pinned_ref ?? null,
        r.task_kind,
        r.inputs_json,
        r.resolved_context_json,
        r.craft_requires_json ?? '[]',
        r.pipeline_json ?? null,
        r.genui_surfaces_json ?? '[]',
        r.capabilities_granted,
        r.capabilities_required ?? '[]',
        r.assets_staged_json,
        r.connectors_required_json ?? '[]',
        r.connectors_resolved_json ?? '[]',
        r.mcp_servers_json ?? '[]',
        r.plugin_title ?? null,
        r.plugin_description ?? null,
        r.query_text ?? null,
        r.status ?? 'fresh',
        Number(r.applied_at ?? Date.now()),
        r.expires_at == null ? null : Number(r.expires_at),
      ],
    );
  }
  logStage('applied_plugin_snapshots', rows.length, 'applied');
  return rows.length;
}

async function migrateMediaTasks(
  sqlite: SqliteDb,
  pool: Pool,
  dryRun: boolean,
): Promise<number> {
  if (!sqliteTableExists(sqlite, 'media_tasks')) return 0;
  const rows = sqlite
    .prepare(
      `SELECT id, project_id, status, surface, model, progress_json, file_json,
              error_json, started_at, ended_at, created_at, updated_at
         FROM media_tasks`,
    )
    .all() as Array<Record<string, unknown>>;
  if (dryRun) {
    logStage('media_tasks', rows.length, 'dry-run');
    return rows.length;
  }
  for (const r of rows) {
    await pool.query(
      `INSERT INTO media_tasks
         (id, project_id, status, surface, model, progress_json, file_json,
          error_json, started_at, ended_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE
         SET status = EXCLUDED.status,
             surface = EXCLUDED.surface,
             model = EXCLUDED.model,
             progress_json = EXCLUDED.progress_json,
             file_json = EXCLUDED.file_json,
             error_json = EXCLUDED.error_json,
             started_at = EXCLUDED.started_at,
             ended_at = EXCLUDED.ended_at,
             updated_at = EXCLUDED.updated_at`,
      [
        r.id,
        r.project_id,
        r.status,
        r.surface ?? null,
        r.model ?? null,
        r.progress_json ?? '[]',
        r.file_json ?? null,
        r.error_json ?? null,
        Number(r.started_at ?? Date.now()),
        r.ended_at == null ? null : Number(r.ended_at),
        Number(r.created_at ?? Date.now()),
        Number(r.updated_at ?? Date.now()),
      ],
    );
  }
  logStage('media_tasks', rows.length, 'applied');
  return rows.length;
}

function sqliteTableExists(sqlite: SqliteDb, name: string): boolean {
  const row = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(name);
  return !!row;
}

function logStage(name: string, count: number, mode: string): void {
  console.log(
    JSON.stringify({
      metric: 'daemon_db_migrate_stage',
      table: name,
      count,
      mode,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
