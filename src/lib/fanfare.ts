// Minecraft-style advancements: the "challenge complete" sound and the toast that slides in at
// the top right, as in the game. Only ever straight after a click or tap (never on load or
// scroll). `prime()` starts the sound downloading on an earlier click, so it lands on the moment.
import '@fontsource/pixelify-sans/latin-400.css';
import '../styles/toast.css';

let audio: HTMLAudioElement | null = null;
let toast: HTMLElement | null = null;
let hideTimer = 0;

export function prime() {
  if (audio) return;
  audio = new Audio('/sounds/advancement.mp3');
  audio.preload = 'auto';
  audio.volume = 0.55;
  document.fonts?.load("16px 'Pixelify Sans'").catch(() => {});
}

// 16×16 pixel icons, one character per pixel ('.' is transparent).
const icons = {
  paw: {
    colours: { o: '#3b2430', p: '#f0a3b4' },
    rows: [
      '................',
      '....oo....oo....',
      '...oppo..oppo...',
      '...oppo..oppo...',
      '....oo....oo....',
      '.oo..........oo.',
      'oppo........oppo',
      'oppo..oooo..oppo',
      '.oo..oppppo..oo.',
      '....oppppppo....',
      '...oppppppppo...',
      '...oppppppppo...',
      '...oppppppppo...',
      '....oppooppo....',
      '.....oo..oo.....',
      '................',
    ],
  },
  fuji: {
    colours: { w: '#f4f7fb', b: '#4a6fa5', d: '#36557f', g: '#3f7d3a' },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '......wwww......',
      '.....wwwwww.....',
      '....wwbwwbwd....',
      '...wbbbwbbbdd...',
      '...bbbbbbbdddd..',
      '..bbbbbbbbbddd..',
      '..bbbbbbbbdddd..',
      '.bbbbbbbbbddddd.',
      '.bbbbbbbbbbdddd.',
      'bbbbbbbbbbbddddd',
      'gggggggggggggggg',
      'gggggggggggggggg',
    ],
  },
};
export type Icon = keyof typeof icons;

function iconSvg(name: Icon) {
  const { colours, rows } = icons[name];
  let rects = '';
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const fill = colours[ch as keyof typeof colours];
      if (fill) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    }),
  );
  return `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

/** Plays the sound and shows the toast. Call it from a click handler. */
export function advancement(title: string, icon: Icon) {
  prime();
  audio!.currentTime = 0;
  audio!.play().catch(() => {});

  if (!toast) {
    const tray = document.createElement('div');
    tray.className = 'mc-tray';
    toast = document.createElement('div');
    toast.className = 'mc-toast';
    toast.setAttribute('role', 'status');
    tray.append(toast);
    document.body.append(tray);
  }
  toast.innerHTML = `${iconSvg(icon)}<p><span class="mc-kind">Challenge Complete!</span><span class="mc-title"></span></p>`;
  toast.querySelector('.mc-title')!.textContent = title;
  toast.classList.remove('in');
  void toast.offsetWidth; // restart the slide
  toast.classList.add('in');
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => toast?.classList.remove('in'), 5600);
}
