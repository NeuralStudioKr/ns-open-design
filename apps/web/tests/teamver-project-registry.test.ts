import { describe, expect, it } from 'vitest';

import { buildTeamverProjectRegistryPayload } from '../src/teamver/projectRegistry';

describe('Teamver project registry payload', () => {
  it('maps OD project id and title to SDK camelCase payload', () => {
    expect(
      buildTeamverProjectRegistryPayload({
        id: 'od-1',
        name: ' Landing page ',
      }),
    ).toEqual({
      odProjectId: 'od-1',
      title: 'Landing page',
    });
  });

  it('omits blank title', () => {
    expect(
      buildTeamverProjectRegistryPayload({
        id: 'od-2',
        name: '   ',
      }),
    ).toEqual({
      odProjectId: 'od-2',
    });
  });
});
