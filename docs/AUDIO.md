# Narration ("Listen to this piece")

Pieces can have a narrated version: a real MP3 made by an open-source voice
model, played by a small HTML5 audio player at the top of the piece. It costs
nothing: the model runs on a CPU (your laptop or GitHub's free runners for
public repos), the files are served by GitHub Pages, and no paid service,
account or API key is involved.

## How to add audio to a new article

**A Substack essay**

1. Publish it on Substack as usual and wait for it to appear on the site.
2. Add its slug (the end of its URL, e.g. `the-evidence` from
   `manas1211.substack.com/p/the-evidence`) to `NARRATED_ESSAYS` in
   `src/data/narration.mjs`. You can do this in GitHub's web editor.
3. Commit. The workflow generates the audio, commits it, and deploys
   (a 5-minute essay takes about 3–4 minutes of CI time).

**A blog post**: add `audio: true` to its front matter and commit.

That's all. Prefer to do it on your laptop (faster, and you can listen before
publishing)? See [Generating locally](#generating-locally).

## How it works

```
piece text ──> narration script ──> fingerprint ──> already have it? ──> yes: done
                (title, subtitle,     (words + voice                     no: Kokoro-82M → MP3
                 body headings and     settings)                              │
                 paragraphs)                                                  ▼
                                               public/audio/<slug>.<fingerprint>.mp3
                                               src/data/audio-manifest.json
```

- **What's read:** the title, the subtitle/summary, then the body's headings and
  paragraphs, word for word. Never read: photos, captions, video, code, footnote
  markers, tags, dates, share/reaction controls or anything else on the page.
  `src/lib/narration.mjs` builds this script; the site build and the generator
  both use it, so they always agree.
- **The voice:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), voice
  `af_heart`, run through [kokoro-js](https://www.npmjs.com/package/kokoro-js) on
  the CPU. Long pieces are split at paragraph boundaries and then at sentence
  boundaries (~300 characters per pass, never mid-sentence unless one sentence is
  longer than that), and stitched back together with consistent pauses: longer
  after the title, before headings and at section breaks. The result is one
  continuous file.
- **The file:** MP3, 48 kbps mono, about 0.36 MB per minute (a 5-minute essay is
  ~2 MB, the Japan travelogue ~10 MB). Levelled to about −18 LUFS.
- **The player:** a plain `<audio preload="none">`, so nothing downloads until
  someone presses play, and the home page never loads audio. Speed (0.75×–2×) is
  `playbackRate` on the same recording; nothing is re-spoken. The chosen speed
  and the listening position are remembered for the visit (sessionStorage only).

## Caching: nothing is generated twice

Each narration's **fingerprint** is a hash of its exact narration script plus
every setting in `NARRATION` (`src/data/narration.mjs`). The fingerprint is in the
file name, and `src/data/audio-manifest.json` records which fingerprint each
piece's current file was made from.

- **Unchanged piece:** fingerprint matches the manifest, so nothing happens. The
  check takes a fraction of a second and never loads the model.
- **Edited piece** (e.g. a typo fixed on Substack): new fingerprint, so a new file
  is made and the old one deleted. Every spoken passage is also cached in
  `narration/.cache/chunks` (locally, and between CI runs), so only the changed
  paragraphs are re-spoken; the rest is reused.
- **Narration switched off:** its file and manifest entry are removed on the next
  run.
- **Regenerating everything on purpose** (new voice, model, pauses…): change the
  setting in `NARRATION`, or bump `version`. Every fingerprint changes.
- **Regenerating one piece:** `npm run narrate -- --force the-evidence`.

The site only shows a player when the manifest's fingerprint matches the piece's
current text, so it can never play audio of an older version.

## In GitHub Actions

`.github/workflows/deploy.yml`:

1. **sync**: Substack sync, then `node narration/plan.mjs`, which compares
   fingerprints (no model) and says whether any narration is missing.
2. **narrate**: only runs when something is missing. Installs the narration
   tools, restores the cached model and passages, runs `npm run narrate`,
   commits the new MP3s and manifest. Scheduled (every-2-hours) runs only
   narrate when Substack brought new content, so a failure isn't retried on a
   loop; pushes and manual runs always try.
3. **build** and **deploy** as before.

Rough timings on GitHub's free runners: a few seconds when nothing is needed;
installing the tools ~1 minute; about 1 minute of audio per 20–40 seconds of
work. Public repositories get unlimited free Actions minutes (6-hour job limit).

## When narration fails

- The run is marked failed and GitHub emails you. The narrate job's summary
  shows `Narration failed: <slug>` with the reason, and the log ends with
  `Narration failed for: <slug>`.
- Everything else still happens: other pieces' audio is committed, the site
  builds and deploys, and the failed piece publishes normally **without a
  player**. The build log says `Narration missing for <slug>` so you can tell it
  apart from a piece that just doesn't have narration switched on (those are
  silent).
- To retry: Actions → Deploy to GitHub Pages → Run workflow, or run
  `npm run narrate` locally and commit.
- If the audio file is ever missing in a reader's browser (network trouble), the
  player says so and offers to try again; the text is unaffected.

## Generating locally

Useful for listening before you publish, or to save CI time on a long travelogue.

```bash
npm run narrate:setup      # once: installs the tools into narration/ (~900 MB, mostly ONNX Runtime)
npm run narrate            # generate whatever is missing or changed
npm run narrate -- --dry   # just list what would be generated
```

The first run downloads the model (~330 MB) into `narration/.cache/`. On this
laptop it runs about 2.5–3× faster than real time (the 28-minute travelogue took
about 12 minutes). Then commit `public/audio/` and `src/data/audio-manifest.json`
and push; the workflow sees the fingerprints match and doesn't redo the work.

## Where files live

| What | Where |
| --- | --- |
| Which pieces are narrated, voice settings | `src/data/narration.mjs` (essays), front matter `audio: true` (blog posts) |
| What gets read (text cleaning, fingerprint, chunking) | `src/lib/narration.mjs` |
| Generator / planner | `narration/narrate.mjs`, `narration/plan.mjs` |
| Audio files | `public/audio/<slug>.<fingerprint>.mp3` (in the repo, served by GitHub Pages) |
| Which file belongs to which piece | `src/data/audio-manifest.json` |
| Model and passage cache (not committed) | `narration/.cache/` |
| Player | `src/components/Listen.astro` |

**Why the repo, and not Cloudflare R2 or similar?** R2 needs a card on file, so a
bill is possible; that rules it out. Workers KV isn't meant for audio. GitHub
Pages serves MP3s with proper byte-range support at no cost. The trade-off: git
keeps every version ever committed. At ~0.36 MB per minute that's fine for years
(a dozen narrated essays plus a few travelogues is well under 100 MB; GitHub's
soft limit is 1 GB for the repo and 1 GB for the published site). If it ever gets
big, regenerating less often or moving old files to a GitHub Release (also free)
are the options.

## Changing the voice or model

- **Another Kokoro voice:** set `voice` in `NARRATION` (e.g. `am_michael`,
  `bm_george`; the full list is in Kokoro's
  [VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)). All
  narration regenerates on the next run.
- **Pauses, loudness, bitrate:** the other values in `NARRATION`.
- **A different model entirely:** replace `model()` and `speak()` in
  `narration/narrate.mjs`. `speak(text)` must return 16-bit mono PCM at 24 kHz;
  change `SR` if the new model uses another rate. Check the new model's licence
  first (see below).

## Licences

| Component | Licence | Notes |
| --- | --- | --- |
| Kokoro-82M weights (hexgrad) | Apache-2.0 | Commercial and public use allowed |
| Kokoro-82M ONNX export (onnx-community) | Apache-2.0 | |
| kokoro-js | Apache-2.0 | |
| @huggingface/transformers | Apache-2.0 | |
| ONNX Runtime (onnxruntime-node) | MIT | |
| phonemizer (npm) / espeak-ng | Apache-2.0 wrapper around espeak-ng (GPL-3.0) | Runs as a build tool only; never shipped to readers |
| ffmpeg-static / FFmpeg with LAME | GPL-3.0 build (LAME is LGPL) | Build tool only; never shipped to readers |

The GPL parts are only *run* here (on your laptop or the CI runner) and are not
distributed with the website, and the GPL doesn't extend to the audio those
programs help produce. The narration MP3s are your text read by an
Apache-licensed model, so they're fine to publish. Voices that are clones of
real people, or models with non-commercial weights (e.g. XTTS-v2, F5-TTS), were
deliberately not used.
