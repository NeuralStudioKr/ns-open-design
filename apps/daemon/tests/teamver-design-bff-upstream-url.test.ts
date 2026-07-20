import { describe, expect, it } from 'vitest';

import { __buildTeamverBffUpstreamUrlForTests as buildUpstreamUrl } from '../src/teamver-design-bff-proxy.js';

describe('teamver BFF upstream URL slash normalization', () => {
  it('maps list and trailing-slash list to /api/v1/projects', () => {
    expect(buildUpstreamUrl('http://design-api.example', 'projects', '')).toBe(
      'http://design-api.example/api/v1/projects',
    );
    expect(buildUpstreamUrl('http://design-api.example', 'projects/', '')).toBe(
      'http://design-api.example/api/v1/projects',
    );
  });

  it('preserves nested paths without a trailing slash', () => {
    expect(buildUpstreamUrl('http://design-api.example', 'projects/abc/publish/', '')).toBe(
      'http://design-api.example/api/v1/projects/abc/publish',
    );
    expect(buildUpstreamUrl('http://design-api.example', 'runtime-config/', '?x=1')).toBe(
      'http://design-api.example/api/v1/runtime-config?x=1',
    );
  });
});
