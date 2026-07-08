import type { Pool } from 'pg';

import {
  queryPostgresRow,
  queryPostgresRows,
} from './daemon-db-postgres.js';

type DbRow = Record<string, unknown>;

const PROJECT_COLS = `id, name, skill_id AS "skillId",
  design_system_id AS "designSystemId",
  pending_prompt AS "pendingPrompt",
  metadata_json AS "metadataJson",
  applied_plugin_snapshot_id AS "appliedPluginSnapshotId",
  custom_instructions AS "customInstructions",
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

const TERMINAL_RUN_DURATION_SQL = `CASE
  WHEN m.started_at IS NOT NULL AND m.ended_at IS NOT NULL THEN
    GREATEST(0, m.ended_at - m.started_at)
  ELSE COALESCE((
    SELECT (elem->>'durationMs')::bigint
      FROM jsonb_array_elements(
        CASE
          WHEN m.events_json IS NOT NULL AND btrim(m.events_json) <> ''
            THEN m.events_json::jsonb
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS t(elem, ord)
     WHERE elem->>'kind' = 'usage'
       AND (elem->>'durationMs') ~ '^-?[0-9]+$'
     ORDER BY ord DESC
     LIMIT 1
  ), 0)
END`;

export async function pgGetProject(pool: Pool, id: string): Promise<DbRow | null> {
  return queryPostgresRow(
    pool,
    `SELECT ${PROJECT_COLS} FROM projects WHERE id = $1`,
    [id],
  );
}

export async function pgInsertProject(pool: Pool, p: DbRow): Promise<DbRow | null> {
  await pool.query(
    `INSERT INTO projects
       (id, name, skill_id, design_system_id, pending_prompt,
        metadata_json, applied_plugin_snapshot_id, custom_instructions,
        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [
      p.id,
      p.name,
      p.skillId ?? null,
      p.designSystemId ?? null,
      p.pendingPrompt ?? null,
      p.metadata ? JSON.stringify(p.metadata) : null,
      p.appliedPluginSnapshotId ?? null,
      p.customInstructions ?? null,
      p.createdAt,
      p.updatedAt,
    ],
  );
  return pgGetProject(pool, String(p.id));
}

export async function pgUpdateProject(pool: Pool, id: string, merged: DbRow): Promise<DbRow | null> {
  await pool.query(
    `UPDATE projects
        SET name = $2,
            skill_id = $3,
            design_system_id = $4,
            pending_prompt = $5,
            metadata_json = $6,
            custom_instructions = $7,
            updated_at = $8
      WHERE id = $1`,
    [
      id,
      merged.name,
      merged.skillId ?? null,
      merged.designSystemId ?? null,
      merged.pendingPrompt ?? null,
      merged.metadata ? JSON.stringify(merged.metadata) : null,
      merged.customInstructions ?? null,
      merged.updatedAt,
    ],
  );
  return pgGetProject(pool, id);
}

export async function pgDeleteProject(pool: Pool, id: string): Promise<void> {
  await pool.query(`DELETE FROM projects WHERE id = $1`, [id]);
}

export async function pgListConversations(pool: Pool, projectId: string): Promise<DbRow[]> {
  return queryPostgresRows(
    pool,
    `WITH project_conversations AS (
        SELECT id, project_id AS "projectId", title, session_mode AS "sessionMode",
               created_at AS "createdAt", updated_at AS "updatedAt"
          FROM conversations
         WHERE project_id = $1
      ),
      latest_runs AS (
        SELECT conversation_id AS "conversationId",
               run_status AS "latestRunStatus",
               started_at AS "latestRunStartedAt",
               ended_at AS "latestRunEndedAt",
               events_json AS "latestRunEventsJson"
          FROM (
            SELECT m.conversation_id,
                   m.run_status,
                   m.started_at,
                   m.ended_at,
                   m.events_json,
                   ROW_NUMBER() OVER (
                     PARTITION BY m.conversation_id
                     ORDER BY m.position DESC
                   ) AS rn
              FROM messages m
              JOIN project_conversations c ON c.id = m.conversation_id
             WHERE m.role = 'assistant'
               AND m.run_status IS NOT NULL
          ) ranked
         WHERE rn = 1
      ),
      message_counts AS (
        SELECT m.conversation_id AS "conversationId",
               COUNT(*)::int AS "messageCount"
          FROM messages m
          JOIN project_conversations c ON c.id = m.conversation_id
         GROUP BY m.conversation_id
      ),
      total_run_durations AS (
        SELECT m.conversation_id AS "conversationId",
               SUM(${TERMINAL_RUN_DURATION_SQL})::bigint AS "totalDurationMs"
          FROM messages m
          JOIN project_conversations c ON c.id = m.conversation_id
         WHERE m.role = 'assistant'
           AND m.run_status IN ('succeeded', 'failed', 'canceled')
         GROUP BY m.conversation_id
      )
      SELECT c.id, c."projectId", c.title, c."sessionMode", c."createdAt", c."updatedAt",
             COALESCE(mc."messageCount", 0) AS "messageCount",
             lr."latestRunStatus", lr."latestRunStartedAt",
             lr."latestRunEndedAt", lr."latestRunEventsJson",
             trd."totalDurationMs"
        FROM project_conversations c
        LEFT JOIN latest_runs lr ON lr."conversationId" = c.id
        LEFT JOIN message_counts mc ON mc."conversationId" = c.id
        LEFT JOIN total_run_durations trd ON trd."conversationId" = c.id
       ORDER BY c."updatedAt" DESC`,
    [projectId],
  );
}

export async function pgGetConversation(pool: Pool, id: string): Promise<DbRow | null> {
  return queryPostgresRow(
    pool,
    `SELECT id, project_id AS "projectId", title, session_mode AS "sessionMode",
            created_at AS "createdAt", updated_at AS "updatedAt",
            (SELECT COUNT(*)::int FROM messages WHERE conversation_id = conversations.id) AS "messageCount"
       FROM conversations WHERE id = $1`,
    [id],
  );
}

export async function pgInsertConversation(pool: Pool, c: DbRow): Promise<DbRow | null> {
  await pool.query(
    `INSERT INTO conversations
       (id, project_id, title, session_mode, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      c.id,
      c.projectId,
      c.title ?? null,
      c.sessionMode ?? 'design',
      c.createdAt,
      c.updatedAt,
    ],
  );
  return pgGetConversation(pool, String(c.id));
}

export async function pgUpdateConversation(pool: Pool, id: string, merged: DbRow): Promise<DbRow | null> {
  await pool.query(
    `UPDATE conversations SET title = $2, session_mode = $3, updated_at = $4 WHERE id = $1`,
    [id, merged.title ?? null, merged.sessionMode ?? 'design', merged.updatedAt],
  );
  return pgGetConversation(pool, id);
}

export async function pgDeleteConversation(pool: Pool, id: string): Promise<void> {
  await pool.query(`DELETE FROM conversations WHERE id = $1`, [id]);
}

export async function pgListMessages(pool: Pool, conversationId: string): Promise<DbRow[]> {
  return queryPostgresRows(
    pool,
    `SELECT id, role, content, agent_id AS "agentId", agent_name AS "agentName",
            run_id AS "runId", run_status AS "runStatus",
            last_run_event_id AS "lastRunEventId",
            events_json AS "eventsJson",
            attachments_json AS "attachmentsJson",
            comment_attachments_json AS "commentAttachmentsJson",
            produced_files_json AS "producedFilesJson",
            feedback_json AS "feedbackJson",
            pre_turn_file_names_json AS "preTurnFileNamesJson",
            session_mode AS "sessionMode",
            run_context_json AS "runContextJson",
            applied_plugin_snapshot_json AS "appliedPluginSnapshotJson",
            created_at AS "createdAt", started_at AS "startedAt", ended_at AS "endedAt",
            position
       FROM messages
      WHERE conversation_id = $1
      ORDER BY position ASC`,
    [conversationId],
  );
}

export async function pgUpsertMessage(pool: Pool, conversationId: string, m: DbRow): Promise<void> {
  const existing = await queryPostgresRow<{ position: number }>(
    pool,
    `SELECT position FROM messages WHERE id = $1`,
    [m.id],
  );
  const now = Date.now();
  if (existing) {
    await pool.query(
      `UPDATE messages
          SET role = $2, content = $3, agent_id = $4, agent_name = $5,
              run_id = $6, run_status = $7, last_run_event_id = $8,
              events_json = $9, attachments_json = $10, comment_attachments_json = $11,
              produced_files_json = $12, feedback_json = $13,
              pre_turn_file_names_json = $14,
              session_mode = $15, run_context_json = $16, applied_plugin_snapshot_json = $17,
              telemetry_finalized_at = CASE
                WHEN $18 THEN COALESCE(telemetry_finalized_at, $19)
                ELSE telemetry_finalized_at
              END,
              started_at = $20, ended_at = $21
        WHERE id = $1`,
      [
        m.id,
        m.role,
        m.content,
        m.agentId ?? null,
        m.agentName ?? null,
        m.runId ?? null,
        m.runStatus ?? null,
        m.lastRunEventId ?? null,
        m.events ? JSON.stringify(m.events) : null,
        m.attachments ? JSON.stringify(m.attachments) : null,
        m.commentAttachments ? JSON.stringify(m.commentAttachments) : null,
        m.producedFiles ? JSON.stringify(m.producedFiles) : null,
        m.feedback ? JSON.stringify(m.feedback) : null,
        m.preTurnFileNames ? JSON.stringify(m.preTurnFileNames) : null,
        m.sessionMode ?? null,
        m.runContext ? JSON.stringify(m.runContext) : null,
        m.appliedPluginSnapshot ? JSON.stringify(m.appliedPluginSnapshot) : null,
        m.telemetryFinalized === true,
        now,
        m.startedAt ?? null,
        m.endedAt ?? null,
      ],
    );
    return;
  }
  const max = await queryPostgresRow<{ m: number }>(
    pool,
    `SELECT COALESCE(MAX(position), -1) AS m FROM messages WHERE conversation_id = $1`,
    [conversationId],
  );
  const position = (max?.m ?? -1) + 1;
  await pool.query(
    `INSERT INTO messages
       (id, conversation_id, role, content, agent_id, agent_name,
        run_id, run_status, last_run_event_id, events_json,
        attachments_json, comment_attachments_json, produced_files_json,
        feedback_json, pre_turn_file_names_json,
        session_mode, run_context_json, applied_plugin_snapshot_json,
        telemetry_finalized_at, started_at, ended_at, position, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
    [
      m.id,
      conversationId,
      m.role,
      m.content,
      m.agentId ?? null,
      m.agentName ?? null,
      m.runId ?? null,
      m.runStatus ?? null,
      m.lastRunEventId ?? null,
      m.events ? JSON.stringify(m.events) : null,
      m.attachments ? JSON.stringify(m.attachments) : null,
      m.commentAttachments ? JSON.stringify(m.commentAttachments) : null,
      m.producedFiles ? JSON.stringify(m.producedFiles) : null,
      m.feedback ? JSON.stringify(m.feedback) : null,
      m.preTurnFileNames ? JSON.stringify(m.preTurnFileNames) : null,
      m.sessionMode ?? null,
      m.runContext ? JSON.stringify(m.runContext) : null,
      m.appliedPluginSnapshot ? JSON.stringify(m.appliedPluginSnapshot) : null,
      m.telemetryFinalized === true ? now : null,
      m.startedAt ?? null,
      m.endedAt ?? null,
      position,
      m.createdAt ?? now,
    ],
  );
}

export async function pgUpsertAgentSession(
  pool: Pool,
  input: {
    conversationId: string;
    agentId: string;
    sessionId: string;
    stablePromptHash?: string | null;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO agent_sessions (conversation_id, agent_id, session_id, stable_prompt_hash, updated_at)
       VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (conversation_id, agent_id)
       DO UPDATE SET session_id = EXCLUDED.session_id,
                     stable_prompt_hash = EXCLUDED.stable_prompt_hash,
                     updated_at = EXCLUDED.updated_at`,
    [
      input.conversationId,
      input.agentId,
      input.sessionId,
      input.stablePromptHash ?? null,
      Date.now(),
    ],
  );
}

export async function pgGetAgentSession(
  pool: Pool,
  conversationId: string,
  agentId: string,
): Promise<string | null> {
  const row = await queryPostgresRow<{ session_id: string }>(
    pool,
    `SELECT session_id FROM agent_sessions WHERE conversation_id = $1 AND agent_id = $2`,
    [conversationId, agentId],
  );
  return row?.session_id ?? null;
}

export async function pgGetAgentSessionRecord(
  pool: Pool,
  conversationId: string,
  agentId: string,
): Promise<{ sessionId: string; stablePromptHash: string | null } | null> {
  const row = await queryPostgresRow<{ session_id: string; stable_prompt_hash: string | null }>(
    pool,
    `SELECT session_id, stable_prompt_hash FROM agent_sessions
      WHERE conversation_id = $1 AND agent_id = $2`,
    [conversationId, agentId],
  );
  if (!row) return null;
  return {
    sessionId: row.session_id,
    stablePromptHash: row.stable_prompt_hash,
  };
}

export async function pgUpdateAgentSessionStableHash(
  pool: Pool,
  conversationId: string,
  agentId: string,
  stablePromptHash: string,
): Promise<void> {
  await pool.query(
    `UPDATE agent_sessions SET stable_prompt_hash = $3, updated_at = $4
      WHERE conversation_id = $1 AND agent_id = $2`,
    [conversationId, agentId, stablePromptHash, Date.now()],
  );
}

export async function pgClearAgentSession(
  pool: Pool,
  conversationId: string,
  agentId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM agent_sessions WHERE conversation_id = $1 AND agent_id = $2`,
    [conversationId, agentId],
  );
}

// ---------- project_tabs_state ----------
// Stored as a single JSON blob per project. sqlite has both `tabs` (derived
// rows) and `tabs_state` (JSON) tables; Postgres only carries `tabs_state`
// because callers always read the JSON path via listTabs.

export interface PgTabsStateRow {
  projectId: string;
  stateJson: string | null;
  updatedAt: number;
}

export async function pgGetTabsState(
  pool: Pool,
  projectId: string,
): Promise<PgTabsStateRow | null> {
  const row = await queryPostgresRow<{
    project_id: string;
    state_json: string | null;
    updated_at: string;
  }>(
    pool,
    `SELECT project_id, state_json, updated_at
       FROM project_tabs_state WHERE project_id = $1`,
    [projectId],
  );
  if (!row) return null;
  return {
    projectId: row.project_id,
    stateJson: row.state_json ?? null,
    updatedAt: Number(row.updated_at),
  };
}

export async function pgUpsertTabsState(
  pool: Pool,
  projectId: string,
  stateJson: string,
  updatedAt: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO project_tabs_state (project_id, state_json, updated_at)
       VALUES ($1, $2, $3)
     ON CONFLICT (project_id) DO UPDATE
        SET state_json = EXCLUDED.state_json,
            updated_at = EXCLUDED.updated_at`,
    [projectId, stateJson, updatedAt],
  );
}

export async function pgDeleteTabsState(pool: Pool, projectId: string): Promise<void> {
  await pool.query(`DELETE FROM project_tabs_state WHERE project_id = $1`, [projectId]);
}

// ---------- preview_comments ----------

const PREVIEW_COMMENT_COLS = `id,
  project_id AS "projectId",
  conversation_id AS "conversationId",
  file_path AS "filePath",
  element_id AS "elementId",
  selector,
  label,
  text,
  position_json AS "positionJson",
  html_hint AS "htmlHint",
  selection_kind AS "selectionKind",
  member_count AS "memberCount",
  pod_members_json AS "podMembersJson",
  style_json AS "styleJson",
  attachments_json AS "attachmentsJson",
  slide_index AS "slideIndex",
  slide_key AS "slideKey",
  note,
  status,
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

export async function pgListPreviewComments(
  pool: Pool,
  projectId: string,
  conversationId: string,
): Promise<DbRow[]> {
  return queryPostgresRows(
    pool,
    `SELECT ${PREVIEW_COMMENT_COLS}
       FROM preview_comments
      WHERE project_id = $1 AND conversation_id = $2
      ORDER BY created_at ASC, id ASC`,
    [projectId, conversationId],
  );
}

export async function pgListPreviewCommentsForProject(
  pool: Pool,
  projectId: string,
): Promise<DbRow[]> {
  return queryPostgresRows(
    pool,
    `SELECT ${PREVIEW_COMMENT_COLS}
       FROM preview_comments
      WHERE project_id = $1
      ORDER BY conversation_id, created_at ASC, id ASC`,
    [projectId],
  );
}

export interface PgPreviewCommentInput {
  id: string;
  projectId: string;
  conversationId: string;
  filePath: string;
  elementId: string;
  selector: string;
  label: string;
  text: string;
  positionJson: string;
  htmlHint: string;
  selectionKind: string;
  memberCount: number | null;
  podMembersJson: string | null;
  styleJson: string | null;
  attachmentsJson: string | null;
  slideIndex: number | null;
  slideKey: number;
  note: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export async function pgUpsertPreviewComment(
  pool: Pool,
  c: PgPreviewCommentInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO preview_comments
       (id, project_id, conversation_id, file_path, element_id, selector, label,
        text, position_json, html_hint, selection_kind, member_count,
        pod_members_json, style_json, attachments_json,
        slide_index, slide_key, note, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     ON CONFLICT ON CONSTRAINT preview_comments_scope_unique DO UPDATE SET
       selector = EXCLUDED.selector,
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
       note = EXCLUDED.note,
       status = 'open',
       updated_at = EXCLUDED.updated_at`,
    [
      c.id,
      c.projectId,
      c.conversationId,
      c.filePath,
      c.elementId,
      c.selector,
      c.label,
      c.text,
      c.positionJson,
      c.htmlHint,
      c.selectionKind,
      c.memberCount,
      c.podMembersJson,
      c.styleJson,
      c.attachmentsJson,
      c.slideIndex,
      c.slideKey,
      c.note,
      c.status,
      c.createdAt,
      c.updatedAt,
    ],
  );
}

export async function pgUpdatePreviewCommentStatus(
  pool: Pool,
  projectId: string,
  conversationId: string,
  id: string,
  status: string,
  updatedAt: number,
): Promise<void> {
  await pool.query(
    `UPDATE preview_comments
        SET status = $4, updated_at = $5
      WHERE id = $1 AND project_id = $2 AND conversation_id = $3`,
    [id, projectId, conversationId, status, updatedAt],
  );
}

export async function pgDeletePreviewComment(
  pool: Pool,
  projectId: string,
  conversationId: string,
  id: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM preview_comments
       WHERE id = $1 AND project_id = $2 AND conversation_id = $3`,
    [id, projectId, conversationId],
  );
}

// ---------- deployments ----------

const DEPLOYMENT_COLS = `id,
  project_id AS "projectId",
  file_name AS "fileName",
  provider_id AS "providerId",
  url,
  deployment_id AS "deploymentId",
  deployment_count AS "deploymentCount",
  target,
  status,
  status_message AS "statusMessage",
  reachable_at AS "reachableAt",
  provider_metadata_json AS "providerMetadataJson",
  created_at AS "createdAt",
  updated_at AS "updatedAt"`;

export async function pgListDeployments(pool: Pool, projectId: string): Promise<DbRow[]> {
  return queryPostgresRows(
    pool,
    `SELECT ${DEPLOYMENT_COLS}
       FROM deployments
      WHERE project_id = $1
      ORDER BY updated_at DESC`,
    [projectId],
  );
}

export async function pgGetDeploymentByScope(
  pool: Pool,
  projectId: string,
  fileName: string,
  providerId: string,
): Promise<DbRow | null> {
  return queryPostgresRow(
    pool,
    `SELECT ${DEPLOYMENT_COLS}
       FROM deployments
      WHERE project_id = $1 AND file_name = $2 AND provider_id = $3`,
    [projectId, fileName, providerId],
  );
}

export interface PgDeploymentInput {
  id: string;
  projectId: string;
  fileName: string;
  providerId: string;
  url: string;
  deploymentId: string | null;
  deploymentCount: number;
  target: string;
  status: string;
  statusMessage: string | null;
  reachableAt: number | null;
  providerMetadataJson: string | null;
  createdAt: number;
  updatedAt: number;
}

export async function pgUpsertDeployment(pool: Pool, d: PgDeploymentInput): Promise<void> {
  await pool.query(
    `INSERT INTO deployments
       (id, project_id, file_name, provider_id, url, deployment_id,
        deployment_count, target, status, status_message, reachable_at,
        provider_metadata_json, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT ON CONSTRAINT deployments_scope_unique DO UPDATE SET
       url = EXCLUDED.url,
       deployment_id = EXCLUDED.deployment_id,
       deployment_count = EXCLUDED.deployment_count,
       target = EXCLUDED.target,
       status = EXCLUDED.status,
       status_message = EXCLUDED.status_message,
       reachable_at = EXCLUDED.reachable_at,
       provider_metadata_json = EXCLUDED.provider_metadata_json,
       updated_at = EXCLUDED.updated_at`,
    [
      d.id,
      d.projectId,
      d.fileName,
      d.providerId,
      d.url,
      d.deploymentId,
      d.deploymentCount,
      d.target,
      d.status,
      d.statusMessage,
      d.reachableAt,
      d.providerMetadataJson,
      d.createdAt,
      d.updatedAt,
    ],
  );
}
