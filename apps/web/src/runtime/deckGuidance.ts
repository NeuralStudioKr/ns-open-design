/**
 * Re-export the contracts slide-count guidance so Canvas/Drive run prompts
 * and the Teamver system prompt share one authority. The previous local
 * string ("If the user did not ask…") drifted from Plugin-input slideCount
 * language and fought quick-settings mapping.
 */
export {
  COMPACT_DECK_SLIDE_COUNT_GUIDANCE,
  COMPACT_FIRST_FILL_HONOR_MAX,
  COMPACT_FIRST_FILL_SLIDE_COUNT_GUIDANCE,
  COMPACT_FIRST_FILL_SLIDE_COUNT_THIS_TURN,
  COMPACT_FIRST_FILL_TOP_UP_FROM,
} from '@open-design/contracts';
