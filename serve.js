const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 5501;
const ROOT = __dirname;

const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const rewriteRules = (vercelConfig.rewrites || []).map(r => ({
  regex: new RegExp('^' + r.source.replace(/:[^/]+/g, '[^/]+') + '$'),
  destination: r.destination
}));

function resolveRewrite(pathname) {
  for (const rule of rewriteRules) {
    if (rule.regex.test(pathname)) return rule.destination;
  }
  return pathname;
}

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  console.log(new Date().toISOString(), req.method, req.url);
  const parsedUrl = url.parse(req.url, true);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // 1) vercel.json rewrites 재현 (동적 :param 세그먼트 포함)
  pathname = resolveRewrite(pathname);

  // 2) 확장자가 없고 대응하는 .html이 있으면 리라이트
  const ext = path.extname(pathname);
  if (!ext && pathname !== '/') {
    const candidate = path.join(ROOT, pathname + '.html');
    if (fs.existsSync(candidate)) {
      pathname += '.html';
    }
  }

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(ROOT, pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const fileExt = path.extname(filePath);
    const contentType = mimeTypes[fileExt] || 'application/octet-stream';

    // 캐시 방지 헤더
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.writeHead(200, { 'Content-Type': contentType });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`card-fighter Node.js 미리보기 서버가 시작되었습니다: http://localhost:${PORT}`);
});
