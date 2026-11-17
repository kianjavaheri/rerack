# Rainbow glass icon (retired 2026-11-17)

The app icon before it went solid white: white letters and barbell with the logo's rainbow gathering towards each
piece's bottom right, bevelled glass edges and a soft glow, on the near-black tile.

- `public/`: the SVGs (`app-icon.svg`, `favicon.svg`, `app-icon-light.svg`) and the PWA / home-screen PNGs.
- `ios-AppIcon/`: the iPhone icon set's PNGs (dark, and the grey one for tinted home screens).
- `portfolio/`: the 1080p logo images.
- `scripts/app-icon.mjs`: the generator as it was.

To bring it back: set `STYLE = 'glass'` in `scripts/app-icon.mjs` (the same drawing is still there), run
`node scripts/app-icon.mjs`, `npm run icons` and `node scripts/portfolio-logo.mjs`, and bump the favicon's `?v=` in
`index.html`. Or copy these files back over the generated ones.
