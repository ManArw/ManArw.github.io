// The reactions offered at the end of each piece. The keys are stored by the
// Worker (worker/src/index.js lists the same four), so change labels and emoji
// freely but keep the keys.
export const REACTIONS = [
  { key: 'loved', emoji: '❤️', label: 'Loved it' },
  { key: 'think', emoji: '💭', label: 'Made me think' },
  { key: 'felt', emoji: '🌧️', label: 'Felt this' },
  { key: 'curious', emoji: '👀', label: 'Interesting' },
] as const;
