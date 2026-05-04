const http = require('http');
const fs = require('fs');
const path = require('path');
const urlMod = require('url');

http.createServer((req, res) => {
    const p = decodeURIComponent(urlMod.parse(req.url).pathname);
    const defaultFile = '/\ubc1c\uc8fc\uacc4\uc0b0.html'; // 발주계산.html
    let f = path.join('.', p === '/' ? defaultFile : p);

    fs.readFile(f, (e, d) => {
        if (e) {
            res.writeHead(404);
            res.end('Not found: ' + f);
        } else {
            const ext = path.extname(f).slice(1).toLowerCase();
            const ctMap = {
                'html': 'text/html',
                'json': 'application/json',
                'js':   'text/javascript',
                'css':  'text/css',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'xls':  'application/vnd.ms-excel',
            };
            const ct = ctMap[ext] || 'application/octet-stream';
            const charset = (ct.startsWith('text') || ct === 'application/json') ? ';charset=utf-8' : '';
            const disp = (ext === 'xlsx' || ext === 'xls') ? 'attachment' : 'inline';
            res.writeHead(200, {
                'Content-Type': ct + charset,
                'Access-Control-Allow-Origin': '*',
                'Content-Disposition': disp,
            });
            res.end(d);
        }
    });
}).listen(8080, () => {
    console.log('Server running at http://localhost:8080');
    require('child_process').exec('start http://localhost:8080');
});
