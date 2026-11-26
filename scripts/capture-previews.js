const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\arnav\\.gemini\\antigravity\\brain\\12f1f3da-40af-4220-bbb9-c811a5806535';

const targets = [
  { url: 'http://localhost:3000/index.html', file: 'preview-landing-desktop.png', size: '--window-size=1280,900' },
  { url: 'http://localhost:3000/index.html', file: 'preview-landing-mobile.png', size: '--window-size=390,844' },
  { url: 'http://localhost:3000/app.html', file: 'preview-app-desktop.png', size: '--window-size=1280,900' },
  { url: 'http://localhost:3000/app.html', file: 'preview-app-mobile.png', size: '--window-size=390,844' }
];

targets.forEach(t => {
  const outPath = path.join(artifactDir, t.file);
  console.log(`Capturing ${t.url} (${t.size}) -> ${t.file}...`);
  try {
    execFileSync(chromePath, [
      '--headless=new',
      '--disable-gpu',
      `--screenshot=${outPath}`,
      t.size,
      t.url
    ], { stdio: 'inherit' });
    const stat = fs.statSync(outPath);
    console.log(`[SUCCESS] Saved ${t.file} (${stat.size} bytes)`);
  } catch (err) {
    console.error(`[ERROR] Failed to capture ${t.file}:`, err.message);
  }
});
