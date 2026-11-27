// The iPhone app's alternate icons (run by `npm run icons`): one per premade accent (src/core/accents.ts) on each
// theme's tile (dark, light, bamboo), the mark in the accent's sweep (Mono: white on dark, near-black on the others).
// Written as AppIcon-<accent>-<theme>.appiconset in the app's asset catalog; the app switches to one with
// AppScreenPlugin.setIcon (src/core/appIcon.ts picks which). Mono on dark is the primary icon, so it isn't repeated.
// Every set shares the primary icon's grey tinted version: iOS colours that itself, whatever the accent.
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { ACCENT_PRESETS, accentTone } from '../src/core/accents.ts';
import { accentIconSvg, ICON_TILES } from './app-icon.mjs';
import { ICON_THEMES, iconName } from '../src/core/appIcon.ts';

const assets = 'ios/App/App/Assets.xcassets';
const tinted = `${assets}/AppIcon.appiconset/AppIcon-tinted.png`;

const contents = {
  images: [
    { filename: 'icon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
    { appearances: [{ appearance: 'luminosity', value: 'tinted' }], filename: 'tinted.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
  ],
  info: { author: 'xcode', version: 1 },
};

// Start clean, so an accent that's gone leaves no set behind.
for (const dir of readdirSync(assets)) if (/^AppIcon-.+\.appiconset$/.test(dir)) rmSync(`${assets}/${dir}`, { recursive: true });

const names = [];
for (const preset of ACCENT_PRESETS) {
  for (const theme of ICON_THEMES) {
    const name = iconName(preset.id, theme);
    if (!name) continue;
    const onDark = theme === 'dark';
    const svg =
      preset.id === 'mono'
        ? accentIconSvg({ tile: ICON_TILES[theme], base: onDark ? '#ffffff' : '#1c1c1e', comment: name })
        : accentIconSvg({ tile: ICON_TILES[theme], sweep: accentTone(preset.id, onDark).ink, comment: name });
    const dir = `${assets}/${name}.appiconset`;
    mkdirSync(dir, { recursive: true });
    await sharp(Buffer.from(svg), { density: 72 }).resize(1024, 1024).flatten({ background: ICON_TILES[theme][1] }).png().toFile(`${dir}/icon.png`);
    copyFileSync(tinted, `${dir}/tinted.png`);
    writeFileSync(`${dir}/Contents.json`, JSON.stringify(contents, null, 2) + '\n');
    names.push(name);
  }
}
console.log(`${names.length} alternate app icons written: ${names.join(', ')}`);
