/**
 * Pure renderer for the `## Active plugin` / `## Plugin inputs` / `## Plugin atoms`
 * blocks injected into `composeSystemPrompt()` (spec §11.8 PB1).
 *
 * Lives in contracts so the daemon and the contracts-side composer share
 * one definition; spec §11.8 byte-equality CI fixture is replaced by a
 * single-import compile-time guarantee. This file MUST stay free of
 * runtime dependencies — it only consumes `AppliedPluginSnapshot`.
 */
import type { AppliedPluginSnapshot } from '../plugins/apply.js';

export type RenderPluginBlockOptions = {
  /**
   * Canvas → Slide pins a separate visual template while create still binds
   * the deck scenario plugin (example-simple-deck) for structure/inputs.
   * When set, the block must NOT claim Simple Deck owns the look — that
   * competed with `## Selected deck template` and made decks look default.
   */
  role?: 'primary' | 'scenario-only';
};

export function renderPluginBlock(
  snapshot: AppliedPluginSnapshot,
  options: RenderPluginBlockOptions = {},
): string {
  const scenarioOnly = options.role === 'scenario-only';
  const lines: string[] = [];
  lines.push(scenarioOnly ? '\n\n## Active scenario plugin (structure only)' : '\n\n## Active plugin');
  lines.push('');
  if (scenarioOnly) {
    lines.push(
      `The project is bound to scenario plugin **${snapshot.pluginTitle ?? snapshot.pluginId}** (\`${snapshot.pluginId}@${snapshot.pluginVersion}\`) for brief/structure inputs only.`,
    );
    lines.push('');
    lines.push(
      'A separate deck visual template was explicitly selected. Do NOT use this scenario plugin\'s palette, typography, seed template, or layout look. Match the Selected deck template visual contract instead.',
    );
  } else {
    lines.push(
      `The user applied plugin **${snapshot.pluginTitle ?? snapshot.pluginId}** (\`${snapshot.pluginId}@${snapshot.pluginVersion}\`).`,
    );
  }
  if (!scenarioOnly && snapshot.pluginDescription) {
    lines.push('');
    lines.push(snapshot.pluginDescription.trim());
  }
  if (!scenarioOnly && snapshot.query) {
    lines.push('');
    lines.push(`The plugin's example brief is: _${snapshot.query.trim()}_`);
  }

  const inputs = snapshot.inputs ?? {};
  const inputKeys = Object.keys(inputs).sort();
  if (inputKeys.length > 0) {
    lines.push('');
    lines.push('## Plugin inputs');
    lines.push('');
    lines.push(
      scenarioOnly
        ? 'Treat these as authoritative brief answers (topic, audience, slide count) unless the user message / [User instruction] explicitly requests a different slide count — then the user count wins. They are NOT a visual template.'
        : 'Treat these as authoritative answers to questions the plugin author baked into the brief — do not re-ask the user about them. If the user message explicitly requests a different slide count, the user count wins.',
    );
    lines.push('');
    for (const key of inputKeys) {
      lines.push(`- **${key}**: ${formatInput(inputs[key])}`);
    }
  }

  const atomIds = snapshot.resolvedContext?.atoms ?? [];
  if (atomIds.length > 0 && !scenarioOnly) {
    lines.push('');
    lines.push('## Plugin atoms');
    lines.push('');
    lines.push(
      'The plugin opted into these workflow atoms; prefer them over ad-hoc shortcuts:',
    );
    lines.push('');
    for (const id of atomIds) lines.push(`- \`${id}\``);
  }

  return lines.join('\n');
}

function formatInput(value: string | number | boolean | undefined): string {
  if (value === undefined || value === null) return '(empty)';
  if (typeof value === 'string') return value.length > 0 ? value : '(empty)';
  return String(value);
}
