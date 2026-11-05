// Draws public/landing/og.png, the link preview for the website (index.html og:image): `node scripts/landing-og.mjs`.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const W = 1200, H = 630;
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="g" cx="78%" cy="62%" r="45%"><stop offset="0" stop-color="#ed7543" stop-opacity="0.45"/><stop offset="1" stop-color="#08090a" stop-opacity="0"/></radialGradient>
    <linearGradient id="ink" x1="0" x2="1"><stop offset="0" stop-color="#f58a5c"/><stop offset="0.5" stop-color="#f28f82"/><stop offset="1" stop-color="#ea5560"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#08090a"/>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <text x="80" y="208" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="3" fill="url(#ink)">WORKOUT LOG</text>
  <text font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="68" font-weight="800" fill="#f7f8f8" letter-spacing="-2">
    <tspan x="76" y="290">The workout log</tspan><tspan x="76" y="370">that remembers</tspan><tspan x="76" y="450">last time.</tspan>
  </text>
  <text x="80" y="540" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="30" fill="#8a8f98">www.rerackapp.net</text>
</svg>`);
const logo = await sharp(readFileSync(`${root}/public/app-icon.svg`)).resize(84, 84).png().toBuffer();
// The Home screenshot in a phone frame that runs off the bottom edge.
const top = 90;
const shotW = 330, shotH = H - top - 10;
const shot = await sharp(`${root}/public/landing/home.webp`).resize(shotW, shotH, { fit: 'cover', position: 'top' }).png().toBuffer();
const mask = Buffer.from(`<svg width="${shotW}" height="${shotH}"><rect width="${shotW}" height="${shotH + 60}" rx="40" fill="#fff"/></svg>`);
const rounded = await sharp(shot).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
const frame = Buffer.from(`<svg width="${shotW + 20}" height="${H - top}"><rect x="1" y="1" width="${shotW + 18}" height="${H - top + 80}" rx="50" fill="#1c1d20" stroke="#ffffff22" stroke-width="2"/></svg>`);
await sharp(bg)
  .composite([
    { input: logo, left: 80, top: 60 },
    { input: frame, left: 780, top },
    { input: rounded, left: 790, top: top + 10 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(`${root}/public/landing/og.png`);
console.log('ok');
