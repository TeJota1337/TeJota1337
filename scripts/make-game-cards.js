// Generates rounded game cards (SVG) for the README.
// GitHub strips CSS from READMEs, so the rounded corners live inside each SVG.
// The cover is embedded as base64 because GitHub blocks external images inside SVGs.
//
// Usage: node scripts/make-game-cards.js
// To add a game: add an entry to GAMES and run again.
//   url   = the game's itch.io page
//   thumb = the cover thumbnail from the itch.io profile grid (fallback when the full cover can't be found)

const fs = require('fs');
const path = require('path');

const GAMES = [
  { id: 'domination', title: 'DOMiNATiON', url: 'https://tejota.itch.io/domination', thumb: 'https://img.itch.zone/aW1nLzI4NzEwMzY5LnBuZw==/315x250%23c/r6wOHC.png' },
  { id: 'par', title: 'PAR / A RAGE GAME', url: 'https://tejota.itch.io/par', thumb: 'https://img.itch.zone/aW1nLzI4MTE5MTgyLnBuZw==/315x250%23c/XNe5gN.png' },
  { id: 'cidade-dorme', title: 'Cidade Dorme', url: 'https://tejota.itch.io/cidade-dorme', thumb: 'https://img.itch.zone/aW1nLzI1NDA1NTY5LnBuZw==/315x250%23c/O7Ezz%2F.png' },
  { id: 'mask-trigger', title: 'Mask Trigger!', url: 'https://tejota.itch.io/mask-trigger', thumb: 'https://img.itch.zone/aW1nLzI1MzE3OTkwLnBuZw==/315x250%23c/uZr3JS.png' },
  { id: 'pumpqueen', title: 'PumpQueen', url: 'https://tejota.itch.io/pumpqueen', thumb: 'https://img.itch.zone/aW1nLzI0MTc1OTc1LnBuZw==/315x250%23c/Gy7WXh.png' },
  { id: 'timeless-bro', title: 'Timeless BRO', url: 'https://tejota.itch.io/timeless-bro', thumb: 'https://img.itch.zone/aW1nLzI0MDE0OTQxLnBuZw==/315x250%23c/sQZkTW.png' },
  { id: 'dice-loop', title: 'Dice Loop', url: 'https://tejota.itch.io/dice-loop', thumb: 'https://img.itch.zone/aW1nLzIyNDc3NzI1LnBuZw==/315x250%23c/AzN%2BI5.png' },
  { id: 'collapsi', title: 'Collapsi', url: 'https://tejota.itch.io/collapsi-digital-version', thumb: 'https://img.itch.zone/aW1nLzIxOTk5NDc5LnBuZw==/315x250%23c/S1kJXI.png' },
  { id: 'soda', title: 'The Forgotten Soda!', url: 'https://tejota.itch.io/soda', thumb: 'https://img.itch.zone/aW1nLzIwMTUzNjUwLnBuZw==/315x250%23c/1a2LHH.png' },
  { id: 'bubblewave', title: 'BubbleWave', url: 'https://tejota.itch.io/bubblewave', thumb: 'https://img.itch.zone/aW1nLzE5NTM5MzQzLnBuZw==/315x250%23c/KC5CKH.png' },
  { id: 'pilgoth', title: 'Pilgoth', url: 'https://tejota.itch.io/pilgoth', thumb: 'https://img.itch.zone/aW1nLzcwNzM3MDMucG5n/315x250%23c/NTggpl.png' },
  { id: 'capture-the-flag-5e', title: 'Capture the Flag 5e', url: 'https://nesges.itch.io/capture-the-flag-5e', thumb: 'https://img.itch.zone/aW1nLzc3MjgwMDIucG5n/315x250%23c/lkgcdC.png' },
];

const OUT_DIR = path.join(__dirname, '..', 'assets', 'games');
const GREEN = '#39D353';
const PURPLE = '#A855F7';
const MAX_COVER_BYTES = 1.5 * 1024 * 1024;

function escapeXml(text) {
  return text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

// itch.io serves some covers as GIF/JPEG even with a .png URL
function imageMime(bytes) {
  if (bytes.subarray(0, 3).toString() === 'GIF') return 'image/gif';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return 'image/png';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// itch.io rate-limits quickly (HTTP 429), so back off generously
async function fetchWithRetry(url, tries = 6) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (i >= tries) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i >= tries) throw err;
    }
    await sleep(5000 * i);
  }
}

// The thumbnail is a 315x250 center crop, which cuts wide logos in half.
// The game page's og:image is the full cover, but only when it shares the cover's image id
// (some pages use a screenshot as og:image instead).
// When throttled, itch.io may answer 200 with a stripped page, so a missing og:image is retried too.
async function fullCoverUrl(game) {
  const imageId = (url) => url.split('/')[3];
  for (let i = 1; i <= 4; i++) {
    const html = await (await fetchWithRetry(game.url)).text();
    const og = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
    if (og) return imageId(og) === imageId(game.thumb) ? og : null;
    await sleep(8000 * i);
  }
  console.warn(`    ${game.id}: no og:image found`);
  return null;
}

async function loadCover(game) {
  const full = await fullCoverUrl(game).catch((err) => {
    console.warn(`    ${game.id}: couldn't read game page (${err.message})`);
    return null;
  });
  if (full) {
    const bytes = Buffer.from(await (await fetchWithRetry(full)).arrayBuffer());
    if (bytes.length <= MAX_COVER_BYTES) return { bytes, source: 'full cover' };
  }
  return { bytes: Buffer.from(await (await fetchWithRetry(game.thumb)).arrayBuffer()), source: 'thumbnail' };
}

function card(title, mime, coverBase64) {
  const W = 320, H = 312, PAD = 12, IMG_W = W - PAD * 2, IMG_H = Math.round(IMG_W * 250 / 315);
  const href = `data:${mime};base64,${coverBase64}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="border" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GREEN}"/>
      <stop offset="1" stop-color="${PURPLE}"/>
    </linearGradient>
    <filter id="blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
    <clipPath id="cover"><rect x="${PAD}" y="${PAD}" width="${IMG_W}" height="${IMG_H}" rx="12"/></clipPath>
  </defs>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="20" fill="#0D1117" stroke="url(#border)" stroke-width="2"/>
  <g clip-path="url(#cover)">
    <!-- blurred copy fills the frame, the sharp cover sits on top uncropped -->
    <image x="${PAD - 20}" y="${PAD - 20}" width="${IMG_W + 40}" height="${IMG_H + 40}" preserveAspectRatio="xMidYMid slice" filter="url(#blur)" opacity="0.55" xlink:href="${href}"/>
    <image x="${PAD}" y="${PAD}" width="${IMG_W}" height="${IMG_H}" preserveAspectRatio="xMidYMid meet" xlink:href="${href}"/>
  </g>
  <text x="${PAD + 4}" y="${PAD + IMG_H + 30}" fill="#F0F6FC" font-family="'Segoe UI', Helvetica, Arial, sans-serif" font-size="17" font-weight="700">${escapeXml(title)}</text>
  <text x="${PAD + 4}" y="${PAD + IMG_H + 52}" fill="${GREEN}" font-family="'Segoe UI', Helvetica, Arial, sans-serif" font-size="13" font-weight="600">▶ Play on itch.io</text>
</svg>
`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const game of GAMES) {
    const { bytes, source } = await loadCover(game);
    const mime = imageMime(bytes);
    fs.writeFileSync(path.join(OUT_DIR, `${game.id}.svg`), card(game.title, mime, bytes.toString('base64')));
    console.log(`ok  ${game.id}.svg (${source}, ${mime}, ${Math.round(bytes.length / 1024)} KB)`);
    await sleep(3000);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
