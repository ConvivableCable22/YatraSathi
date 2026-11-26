const { execFileSync } = require('child_process');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const script = `
  const wide = [];
  document.querySelectorAll('*').forEach(el => {
    if (el.offsetWidth > document.documentElement.clientWidth) {
      wide.push({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        width: el.offsetWidth,
        clientWidth: document.documentElement.clientWidth
      });
    }
  });
  console.log('OVERFLOW_ELEMENTS:' + JSON.stringify(wide));
`;

// Run Chrome headless with DevTools script or inspect CSS
console.log('Checking CSS for fixed widths or overflowing containers...');
const fs = require('fs');
const css = fs.readFileSync('css/styles.css', 'utf8');
const fixedWidths = [...css.matchAll(/width:\s*([4-9]\d{2}|[1-9]\d{3})px/g)].map(m => m[0]);
console.log('Fixed widths > 400px in css/styles.css:', fixedWidths);
