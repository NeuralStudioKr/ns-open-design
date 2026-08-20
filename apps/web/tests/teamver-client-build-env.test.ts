import { describe, expect, it } from 'vitest';

import {
  readTeamverClientBuildEnv,
  TEAMVER_CLIENT_BUILD_ENV_KEYS,
} from '../src/teamver/teamverClientBuildEnv';

describe('readTeamverClientBuildEnv', () => {
  it('exports draw annotation enable for Next client env inlining', () => {
    expect(TEAMVER_CLIENT_BUILD_ENV_KEYS).toContain('VITE_TEAMVER_DRAW_ANNOTATION_ENABLE');
  });

  it('exports manual edit box drag enable for Next client env inlining', () => {
    expect(TEAMVER_CLIENT_BUILD_ENV_KEYS).toContain('VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE');
  });

  it('exports HTML source copy enable for Next client env inlining', () => {
    expect(TEAMVER_CLIENT_BUILD_ENV_KEYS).toContain('VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE');
  });

  it('passes through non-empty bake-time values', () => {
    expect(
      readTeamverClientBuildEnv({
        VITE_TEAMVER_DRAW_ANNOTATION_ENABLE: '1',
        VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE: '1',
        VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE: '1',
        VITE_TEAMVER_SITE_URL: 'https://stg-design.teamver.com',
        EMPTY: '',
      }),
    ).toEqual({
      VITE_TEAMVER_DRAW_ANNOTATION_ENABLE: '1',
      VITE_TEAMVER_SOURCE_HTML_COPY_ENABLE: '1',
      VITE_TEAMVER_MANUAL_EDIT_BOX_DRAG_ENABLE: '1',
      VITE_TEAMVER_SITE_URL: 'https://stg-design.teamver.com',
    });
  });
});
