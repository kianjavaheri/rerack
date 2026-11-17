// Draws the logo: public/app-icon.svg (the app icon), public/favicon.svg (the same in a circle) and
// public/app-icon-light.svg (on white, for the portfolio). `node scripts/app-icon.mjs`, then `npm run icons`.
// The shapes are worked out here rather than hand-edited, so the pieces stay single outlines (anything overlapping
// shows as a seam under the translucent colour) and the colour fades stay in step across all three.
//
// The mark: an abstract bench press that reads as Rerack. A barbell through the middle, with an r on the left (its
// arm at the top) and the same r turned half a turn on the right (its foot at the bottom), a thin gap where the bar
// crosses them. Now plain: the mark in solid white on the dark tile (2026-11-17). The glass-and-rainbow version (after
// the Apple TV mark: white with a rainbow gathering towards each piece's bottom right, bevelled edges, a glow) is
// still here as `icon()`, and its files are kept in archive/icon-rainbow-glass/.
// RestTimerWidget.swift's LogoMark draws the same outline: change both together.
import { writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;

const L = 340, TOP = 296, BOT = 728, BAR = 512, HALF = 40; // stem centre, letter top/bottom, bar centre, half a stroke
const ARM = 146; // stem centre to the arm's end
const OUTER = 100, INNER = 20; // the r's outer and inner corner sizes
const PW = 84, PH = 196, PR = 22, BH = 23; // plate width / height / corner, half the bar's thickness
const plL = L - HALF - 36 - PW, plR = 1024 - plL - PW; // plates 36 clear of the stems

/** The left r as one outline; the right one is the same turned half a turn about the centre. */
function rOutline(flip) {
  const P = (x, y) => (flip ? `${1024 - x} ${1024 - y}` : `${x} ${y}`);
  const x0 = L - HALF, x1 = L + HALF, yT = TOP - HALF, yA = TOP + HALF, xe = L + ARM;
  return [
    `M${P(x0, BOT)}`, `L${P(x0, yT + OUTER)}`, `Q${P(x0, yT)} ${P(x0 + OUTER, yT)}`, `L${P(xe, yT)}`, `L${P(xe, yA)}`,
    `L${P(x1 + INNER, yA)}`, `Q${P(x1, yA)} ${P(x1, yA + INNER)}`, `L${P(x1, BOT)}`, 'Z',
  ].join(' ');
}

/** The barbell as one outline: plates and bar joined. */
function barbellOutline() {
  const a = plL, b = plL + PW, c = plR, d = plR + PW, t = BAR - PH / 2, u = BAR + PH / 2, r = PR;
  const arc = (x, y) => `A${r} ${r} 0 0 1 ${x} ${y}`;
  return [
    `M${a + r} ${t}`, `H${b - r}`, arc(b, t + r), `V${BAR - BH}`, `H${c}`, `V${t + r}`, arc(c + r, t),
    `H${d - r}`, arc(d, t + r), `V${u - r}`, arc(d - r, u), `H${c + r}`, arc(c, u - r), `V${BAR + BH}`,
    `H${b}`, `V${u - r}`, arc(b - r, u), `H${a + r}`, arc(a, u - r), `V${t + r}`, arc(a + r, t), 'Z',
  ].join(' ');
}

// Each piece's diagonal runs from its own top left to its own bottom right. The barbell's runs mostly downwards
// (white along the top, colour underneath), slightly tilted, as one gradient so there's no seam at the plates.
const pieces = [
  { d: rOutline(false), gap: true, box: [L - HALF, TOP - HALF, L + ARM, BOT] },
  { d: rOutline(true), gap: true, box: [1024 - L - ARM, TOP, 1024 - L + HALF, BOT + HALF] },
  { d: barbellOutline(), box: [512 - 15, BAR - PH / 2, 512 + 15, BAR + PH / 2] },
];

const draw = (p, paint) => `<path d="${p.d}" fill="${paint}"${p.gap ? ' mask="url(#gap)"' : ''}/>`;
const mark = (paint) => pieces.map((p) => draw(p, paint)).join('\n    ');

/** Opacity along each piece's diagonal: none in the first quarter, then rising along a power curve to `max`. */
const quarters = (max, power, start, full = 1) =>
  [0, ...Array.from({ length: 13 }, (_, i) => start + ((1 - start) * i) / 12)].map((t) => [
    +t.toFixed(4),
    t <= start ? 0 : +(max * Math.min(1, (t - start) / (full - start)) ** power).toFixed(3),
  ]);

/** A mask: each piece painted with its own white fade along its diagonal. */
const fadeMask = (id, stops) =>
  pieces
    .map((p, i) => {
      const [x1, y1, x2, y2] = p.box;
      return `<linearGradient id="${id}${i}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
        .map(([o, a]) => `<stop offset="${o}" stop-color="#fff" stop-opacity="${a}"/>`)
        .join('')}</linearGradient>`;
    })
    .join('\n    ') +
  `\n    <mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">\n    ${pieces
    .map((p, i) => draw(p, `url(#${id}${i})`))
    .join('\n    ')}\n    </mask>`;

function icon({ comment, tile, round, base, bevel, rainbow, glow, max, power, start, full }) {
  return `<!-- ${comment} Drawn by scripts/app-icon.mjs: edit that, not this. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tile[0]}"/><stop offset="1" stop-color="${tile[1]}"/>
    </linearGradient>
    <!-- The hues run left to right across the mark. -->
    <linearGradient id="rainbow" gradientUnits="userSpaceOnUse" x1="176" y1="0" x2="848" y2="0">
      ${rainbow.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}
    </linearGradient>
    <!-- How much colour, along each piece's diagonal; the edge band follows a gentler curve. -->
    ${fadeMask('fade', quarters(max, power, start, full))}
    ${fadeMask('rimfade', quarters(1, power * 0.75, start, full))}
    <!-- A thin gap in the letters where the bar crosses them. -->
    <mask id="gap" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#fff"/>
      <path d="M${plL + PW} ${BAR} H${plR}" stroke="#000" stroke-width="84" stroke-linecap="round"/>
    </mask>
    <!-- Glass edges, after the Apple TV mark: a rim ${bevel.rim} units wide round every piece that catches the light.
         The rim is washed with white (so on the coloured parts it reads as a lighter, reflecting edge), a faint
         darker line marks where it meets the face, light from the top left adds a specular highlight along the
         rounded-off edges (the alpha, blurred, is the height map; flat faces get almost none since the light is low),
         and the edges facing away get a soft inner shadow. -->
    <filter id="bevel" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <feMorphology in="SourceAlpha" operator="erode" radius="${bevel.rim}" result="inner"/>
      <feGaussianBlur in="inner" stdDeviation="2" result="innerSoft"/>
      <feComposite in="SourceAlpha" in2="innerSoft" operator="out" result="rim"/>
      <feFlood flood-color="#fff" flood-opacity="${bevel.sheen}"/>
      <feComposite in2="rim" operator="in" result="sheen"/>
      <feMorphology in="SourceAlpha" operator="erode" radius="${bevel.rim + 3}" result="inner2"/>
      <feGaussianBlur in="inner2" stdDeviation="2" result="inner2Soft"/>
      <feComposite in="innerSoft" in2="inner2Soft" operator="out" result="ring"/>
      <feFlood flood-color="#000" flood-opacity="${bevel.line}"/>
      <feComposite in2="ring" operator="in" result="line"/>
      <feGaussianBlur in="SourceAlpha" stdDeviation="${bevel.blur}" result="height"/>
      <feSpecularLighting in="height" surfaceScale="${bevel.scale}" specularConstant="${bevel.ks}" specularExponent="20" lighting-color="#fff" result="spec">
        <feDistantLight azimuth="225" elevation="22"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="shine"/>
      <feOffset in="SourceAlpha" dx="-5" dy="-5" result="shifted"/>
      <feGaussianBlur in="shifted" stdDeviation="5" result="shiftedBlur"/>
      <feComposite in="SourceAlpha" in2="shiftedBlur" operator="out" result="far"/>
      <feFlood flood-color="#000" flood-opacity="${bevel.shade}"/>
      <feComposite in2="far" operator="in" result="shade"/>
      <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="sheen"/><feMergeNode in="line"/><feMergeNode in="shade"/><feMergeNode in="shine"/></feMerge>
    </filter>
    <!-- Keeps only a soft band just inside the edges. -->
    <filter id="rim" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <feGaussianBlur in="SourceAlpha" stdDeviation="22" result="b"/>
      <feComposite in="SourceAlpha" in2="b" operator="out" result="edge"/>
      <feComposite in="SourceGraphic" in2="edge" operator="in"/>
    </filter>
    <filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <feGaussianBlur stdDeviation="30"/>
    </filter>
  </defs>

  <rect width="1024" height="1024"${round ? ' rx="512"' : ''} fill="url(#tile)"/>

  <!-- Glow: the coloured mark, blurred, behind. -->
  <g filter="url(#glow)" opacity="${glow}"><g mask="url(#fade)">
    ${mark('url(#rainbow)')}
  </g></g>

  <g filter="url(#bevel)">
    <!-- The letters and barbell, the colour over them, then the colour along their edges. -->
    ${mark(base)}
    <g mask="url(#fade)">
    ${mark('url(#rainbow)')}
    </g>
    <g mask="url(#rimfade)" opacity="0.85"><g filter="url(#rim)">
    ${mark('url(#rainbow)')}
    </g></g>
  </g>
</svg>
`;
}

/** The mark in one flat colour on the tile: no rainbow, edges or glow. */
function flatIcon({ comment, tile, round, base }) {
  return `<!-- ${comment} Drawn by scripts/app-icon.mjs: edit that, not this. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tile[0]}"/><stop offset="1" stop-color="${tile[1]}"/>
    </linearGradient>
    <!-- A thin gap in the letters where the bar crosses them. -->
    <mask id="gap" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#fff"/>
      <path d="M${plL + PW} ${BAR} H${plR}" stroke="#000" stroke-width="84" stroke-linecap="round"/>
    </mask>
  </defs>

  <rect width="1024" height="1024"${round ? ' rx="512"' : ''} fill="url(#tile)"/>
  <g>
    ${mark(base)}
  </g>
</svg>
`;
}

/** Which look the files get: 'flat' (solid white) now; 'glass' is the archived rainbow one. */
const STYLE = 'flat';

const dark = {
  tile: ['#151516', '#050505'],
  base: STYLE === 'flat' ? '#ffffff' : '#f6f6f8',
  bevel: { rim: 13, sheen: 0.3, line: 0.14, blur: 6, scale: 8, ks: 1.1, shade: 0.22 },
  // The original logo's rainbow, at full strength.
  rainbow: [[0, '#9a7bff'], [0.25, '#5ec8ff'], [0.45, '#5fe3a1'], [0.62, '#ffd25a'], [0.8, '#ff8f6b'], [1, '#ff8fc8']],
  glow: 0.22,
  max: 1,
  // Colour from just past each piece's top left, at full strength by 70% of the way along its diagonal.
  power: 1,
  start: 0.05,
  full: 0.7,
};

const draw2 = (o) => (STYLE === 'flat' ? flatIcon(o) : icon(o));
writeFileSync(`${root}public/app-icon.svg`, draw2({
  ...dark,
  comment: 'App icon (npm run icons turns it into the home-screen, install and iPhone app icons; favicon.svg is the same in a circle).',
}));
writeFileSync(`${root}public/favicon.svg`, draw2({ ...dark, round: true, comment: 'The app icon in a circle: favicon, loader, splash and sign-in.' }));
writeFileSync(`${root}public/app-icon-light.svg`, draw2({
  comment: "A white version of the app icon, for the portfolio's light logo image (scripts/portfolio-logo.mjs). Not in the iPhone icon set: there it showed even in dark mode. Near-black lettering with a deeper rainbow that comes in a little sooner, since dark over colour goes muddy.",
  tile: ['#ffffff', '#e9e9ec'],
  base: '#1c1c1e',
  bevel: { rim: 13, sheen: 0.12, line: 0.25, blur: 6, scale: 8, ks: 0.9, shade: 0.3 },
  rainbow: [[0, '#7b5cff'], [0.22, '#2ea6f2'], [0.42, '#22c47a'], [0.6, '#f5b51f'], [0.8, '#ff6f45'], [1, '#ff5aa8']],
  glow: 0.3,
  max: 1,
  power: 1,
  start: 0.05,
  full: 0.7,
}));
console.log('wrote public/app-icon.svg, favicon.svg, app-icon-light.svg');
