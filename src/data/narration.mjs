// Narration ("Listen to this piece"). How it works: docs/AUDIO.md.
// Shared by the site build and narration/narrate.mjs.

// Substack essays to narrate, by slug (the end of the article's URL, e.g.
// manas1211.substack.com/p/the-evidence → 'the-evidence').
// Blog posts switch narration on with `audio: true` in their front matter.
export const NARRATED_ESSAYS = ['the-evidence'];

// The voice and how it's rendered. Every value here is part of each audio
// file's fingerprint, so changing anything (or bumping `version`) regenerates
// all narration on the next run.
export const NARRATION = {
  version: 1,
  engine: 'kokoro-js',
  model: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  dtype: 'fp32',
  voice: 'af_heart',
  // Silence (seconds) after each kind of block, so it sounds read, not stitched.
  pauses: { title: 1.1, para: 0.6, heading: 0.8, beforeHeading: 1.0, sentence: 0.22, break: 1.3 },
  // Longest piece of text sent to the model at once (it handles ~500 phonemes).
  maxChars: 300,
  bitrate: '48k',
  // Kokoro speaks at about −22 LUFS; lift it to normal spoken-word level.
  gainDb: 4,
};
