import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoutes = readFileSync(
  path.join(here, '../src/project-routes.ts'),
  'utf8',
);
const hydrate = readFileSync(
  path.join(here, '../src/teamver-project-sqlite-hydrate.ts'),
  'utf8',
);
const nginxUpstream = readFileSync(
  path.join(
    here,
    '../../../deploy/teamver/devops/nginx/teamver-design-od-daemon-upstream.inc.conf',
  ),
  'utf8',
);

describe('cold-node project resolve for revisions (prod P0)', () => {
  it('revision POST uses resolveProjectRow (getProjectAsync) not sync getProject only', () => {
    expect(projectRoutes).toContain('async function resolveProjectRow');
    const revisionPostAt = projectRoutes.indexOf(
      "app.post(/^\\/api\\/projects\\/([^/]+)\\/files\\/(.+)\\/revisions$/u",
    );
    expect(revisionPostAt).toBeGreaterThan(-1);
    const slice = projectRoutes.slice(revisionPostAt, revisionPostAt + 800);
    expect(slice).toContain('await resolveProjectRow(projectId)');
    expect(slice).not.toMatch(/const project = getProject\(db, projectId\)/);
  });

  it('sqlite hydrate warms Postgres before design-api gate', () => {
    const warmAt = hydrate.indexOf('warmProjectFromPostgres');
    const designGateAt = hydrate.indexOf('if (!isTeamverDesignManaged()) return next()');
    expect(warmAt).toBeGreaterThan(-1);
    expect(designGateAt).toBeGreaterThan(-1);
    expect(warmAt).toBeLessThan(designGateAt);
  });

  it('nginx hash map excludes preview-url-batch and cover-html-batch', () => {
    expect(nginxUpstream).toMatch(
      /preview-url-batch\|cover-html-batch|cover-html-batch\|preview-url-batch/,
    );
    expect(nginxUpstream).toContain(
      'recent|cover-hints|status-hints|preview-url-batch|cover-html-batch',
    );
  });
});
