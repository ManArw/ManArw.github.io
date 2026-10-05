// The advancement fanfare. It only ever plays straight after a click or tap (never on load or
// scroll), at most once per page view. `prime()` starts the download early, on an earlier click,
// so the sound lands on the moment instead of after it.
let audio: HTMLAudioElement | null = null;
let played = false;

export function prime() {
  if (audio) return;
  audio = new Audio('/sounds/advancement.mp3');
  audio.preload = 'auto';
  audio.volume = 0.55;
}

export function fanfare() {
  if (played) return;
  played = true;
  prime();
  audio!.play().catch(() => {});
}
