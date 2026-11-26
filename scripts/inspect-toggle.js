const { execFileSync } = require('child_process');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const script = `
  const btn = document.getElementById('mobile-toggle');
  const style = window.getComputedStyle(btn);
  const rect = btn.getBoundingClientRect();
  const res = {
    display: style.display,
    visibility: style.visibility,
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    right: rect.right,
    windowWidth: window.innerWidth
  };
  document.body.innerHTML = '<h1>TEST_RESULT:' + JSON.stringify(res) + '</h1>';
`;

try {
  const out = execFileSync(chromePath, [
    '--headless=new',
    '--window-size=390,844',
    '--dump-dom',
    'http://localhost:3000/'
  ], { encoding: 'utf8' });
  const m = out.match(/id="mobile-toggle"[^>]*>/);
  console.log('mobile-toggle tag:', m ? m[0] : 'not found');
  const navActions = out.match(/class="nav-actions"[^>]*>/);
  console.log('nav-actions tag:', navActions ? navActions[0] : 'not found');
} catch (e) {
  console.error(e);
}
