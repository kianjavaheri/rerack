// Native Google sign-in returns to the app through a URL scheme: the iOS client ID reversed
// (com.googleusercontent.apps.<id>). Writes it into ios/App/App/Info.plist from VITE_GOOGLE_IOS_CLIENT_ID in
// .env.local, so the value lives in one place, next to the app's own `rerack://` (the home-screen widget opens
// rerack://check-in; src/native/links.ts). Run by `npm run ios`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const plist = 'ios/App/App/Info.plist';
const env = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const clientId = /^VITE_GOOGLE_IOS_CLIENT_ID=(.+)$/m.exec(env)?.[1]?.trim();

const schemes = [{ CFBundleURLName: 'com.kianjavaheri.fitnesstracker', CFBundleURLSchemes: ['rerack'] }];
if (clientId) {
  const scheme = `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
  schemes.push({ CFBundleURLSchemes: [scheme] });
  console.log(`Google sign-in URL scheme set: ${scheme}`);
} else {
  console.warn('VITE_GOOGLE_IOS_CLIENT_ID is not set in .env.local; Google sign-in will not work in the iPhone app.');
}
execFileSync('plutil', ['-replace', 'CFBundleURLTypes', '-json', JSON.stringify(schemes), plist]);
