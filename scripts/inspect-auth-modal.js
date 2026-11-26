const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactDir = 'C:\\Users\\arnav\\.gemini\\antigravity\\brain\\12f1f3da-40af-4220-bbb9-c811a5806535';

// Script to inject to open the auth modal
const testHtml = fs.readFileSync('index.html', 'utf8')
  .replace('<div id="auth-modal" class="modal-backdrop"', '<div id="auth-modal" class="modal-backdrop open"');

fs.writeFileSync('temp-modal-test.html', testHtml);

const viewports = [
  { name: 'modal-desktop', size: '--window-size=1280,720' },
  { name: 'modal-short', size: '--window-size=800,520' },
  { name: 'modal-mobile', size: '--window-size=390,640' }
];

viewports.forEach(v => {
  const out = path.join(artifactDir, `${v.name}.png`);
  console.log(`Capturing ${v.name} (${v.size})...`);
  try {
    execFileSync(chromePath, [
      '--headless=new',
      '--disable-gpu',
      `--screenshot=${out}`,
      v.size,
      'http://localhost:3000/temp-modal-test.html'
    ], { stdio: 'inherit' });
    console.log(`[OK] Saved ${v.name}.png`);
  } catch (e) {
    console.error(`[ERR] Failed ${v.name}:`, e.message);
  }
});

// Clean up temp file
if (fs.existsSync('temp-modal-test.html')) {
  fs.unlinkSync('temp-modal-test.html');
}
