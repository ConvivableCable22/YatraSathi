const http = require('http');

http.get('http://localhost:3000/', res => {
  let html = '';
  res.on('data', chunk => html += chunk);
  res.on('end', () => {
    console.log('HTML length:', html.length);
    console.log('Has mobile-toggle:', html.includes('id="mobile-toggle"'));
    console.log('Has nav-menu:', html.includes('id="nav-menu"'));
  });
});
