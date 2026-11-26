/**
 * YatraSathi — Staging Preview Server
 * Lightweight staging server that serves the static build with:
 * - Security headers defined in `_headers` (CSP, HSTS, X-Frame-Options, etc.)
 * - URL rewrites defined in `_redirects` (/app, /workspace, /planner -> app.html)
 * - MIME type mapping for web standards
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_PORT = parseInt(process.env.PORT || '3000', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';"
};

// URL rewrite table matching _redirects
const REWRITES = {
  '/': '/index.html',
  '/app': '/app.html',
  '/workspace': '/app.html',
  '/planner': '/app.html',
  '/login': '/index.html',
  '/signup': '/index.html'
};

function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Static UI preview does not run Worker/D1 APIs; return clear 503 JSON instead of faking backend responses
  if (pathname.startsWith('/api/')) {
    res.writeHead(503, {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({
      ok: false,
      code: 'STATIC_PREVIEW_NO_API',
      message: 'Backend APIs require Wrangler. Run "npm run dev" and open http://127.0.0.1:8787/ to use auth and D1 features.'
    }));
    return;
  }

  // Apply rewrites
  if (REWRITES[pathname]) {
    pathname = REWRITES[pathname];
  } else if (!path.extname(pathname) && fs.existsSync(path.join(ROOT_DIR, `${pathname}.html`))) {
    pathname = `${pathname}.html`;
  }

  const safePath = path.normalize(path.join(ROOT_DIR, pathname));

  // Prevent directory traversal
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 404 fallback
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
      res.end(`<!DOCTYPE html><html><head><title>404 Not Found — YatraSathi Preview</title><style>body{font-family:sans-serif;padding:40px;background:#FFF9F0;color:#17221F;}</style></head><body><h1>404 — Page Not Found</h1><p>The requested resource <code>${pathname}</code> was not found on this preview server.</p><p><a href="/">Return to Home</a> | <a href="/app.html">Go to Workspace</a></p></body></html>`);
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Caching headers
    const cacheHeader = ext === '.html'
      ? 'public, max-age=0, must-revalidate'
      : 'public, max-age=86400';

    const headers = {
      ...SECURITY_HEADERS,
      'Content-Type': contentType,
      'Cache-Control': cacheHeader
    };

    res.writeHead(200, headers);
    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
}

function startServer(port) {
  const server = http.createServer(handleRequest);

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[YatraSathi Staging] Port ${port} in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('[YatraSathi Staging] Server error:', err);
      process.exit(1);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 YATRASATHI STAGING PREVIEW SERVER ACTIVE`);
    console.log(`======================================================`);
    console.log(`Preview URL: http://localhost:${port}/`);
    console.log(`App Workspace: http://localhost:${port}/app`);
    console.log(`Environment: Staging / Local Preview Sandbox`);
    console.log(`Security: Security headers + CSP applied matching _headers`);
    console.log(`Data isolation: Local in-memory / Prototype state only`);
    console.log(`======================================================\n`);
  });
}

startServer(DEFAULT_PORT);
