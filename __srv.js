const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const XLSX = require('xlsx');

const PORT = 8082;

const MIME_TYPES = {
    'html': 'text/html; charset=utf-8',
    'css': 'text/css; charset=utf-8',
    'js': 'text/javascript; charset=utf-8',
    'json': 'application/json; charset=utf-8',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

const DB_DIR = path.join(__dirname, 'dsr_stranding');
const STRAND_DB_PATH = path.join(DB_DIR, 'strand_db.json');
const ILBO_DB_PATH = path.join(DB_DIR, 'ilbo_db.json');

if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
}

// ── 기계명 정규화 (클라이언트와 동일) ──
const MACH_NORM = {
    '16"x35b':'m1','12"x36b-1':'m2','12"x36b-2':'m3','12"x25b-1':'m4',
    '12"x35b-2':'m5','12"x42b':'m6','10"x35b':'m7','8"x36b':'m8',
    '12"x6b':'m9','14"x6b':'m10','16"x6b':'m11','10"x6b-2':'m12',
    '12"x9b':'m13','14"x18b':'m14','24"x6b-2':'m15'
};
function normMach(raw) {
    if (!raw) return null;
    return MACH_NORM[String(raw)
        .replace(/[\r\n\s]+/g, '')
        .replace(/[“”″ʺ˝＂]/g, '"')
        .toLowerCase()] || null;
}

// ── 셀 값 쓰기 ──
function setCellValue(ws, rowIdx, colIdx, value) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
    if (value === null || value === undefined || value === '') {
        if (ws[addr]) delete ws[addr];
        return;
    }
    if (!ws[addr]) ws[addr] = {};
    ws[addr].v = value;
    ws[addr].t = typeof value === 'number' ? 'n' : 's';
    if (ws[addr].f) delete ws[addr].f; // 수식 제거 후 값으로 저장
}

// ── 엑셀 실시간 동기화 ──
function syncExcel(payload) {
    // dsr_stranding 폴더에서 엑셀 파일 찾기
    const files = fs.readdirSync(DB_DIR).filter(f => /\.(xlsx|xls)$/i.test(f));
    if (!files.length) return;
    const excelPath = path.join(DB_DIR, files[0]);

    try {
        const wb = XLSX.readFile(excelPath);
        const dateSheets = wb.SheetNames.filter(n => /^\d+\.\d+$/.test(n.trim()));
        if (!dateSheets.length) return;

        // 업로드 시 저장된 시트명 우선 사용, 없으면 최신 시트
        const sheetName = (payload.activeSheet && wb.SheetNames.includes(payload.activeSheet))
            ? payload.activeSheet
            : dateSheets[dateSheets.length - 1];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

        const baseOrders = payload.baseOrders || {};
        const prodData   = payload.orders    || {};

        const INCH_RE = /["]/;

        // 기계 행 위치 찾기
        const machIdxs = [];
        rows.forEach((r, i) => {
            if (r[0] && typeof r[0] === 'string' && INCH_RE.test(r[0].trim())) {
                machIdxs.push(i);
            }
        });

        machIdxs.forEach((mIdx, mi) => {
            const mId = normMach(rows[mIdx][0]);
            if (!mId) return;

            const orders = baseOrders[mId] || [];
            const nextIdx = machIdxs[mi + 1] ?? rows.length;

            // 기계 합계 계산
            let dayTotal = 0, nightTotal = 0, remainTotal = 0;
            orders.forEach(o => {
                const p = prodData[o.id] || {};
                const d = Number(p.day)   || 0;
                const n = Number(p.night) || 0;
                const qty = p.qty !== undefined ? p.qty : (o.qty || 0);
                dayTotal   += d;
                nightTotal += n;
                remainTotal += Math.max(0, qty - d - n);
            });

            // 기계 행 업데이트 (col 9=주간, 10=야간, 11=잔량)
            setCellValue(ws, mIdx, 9,  dayTotal   || null);
            setCellValue(ws, mIdx, 10, nightTotal  || null);
            setCellValue(ws, mIdx, 11, remainTotal || null);

            // 오더 행 업데이트
            for (let ri = mIdx + 1; ri < nextIdx; ri++) {
                const row = rows[ri];
                if (!row) continue;
                const spec = row[2];
                if (!spec || typeof spec !== 'string' || !spec.trim()) continue;

                const order = orders.find(o => o.proc === spec.trim());
                if (!order) continue;

                const p      = prodData[order.id] || {};
                const day    = Number(p.day)   || 0;
                const night  = Number(p.night) || 0;
                const status = p.status || order.initSt || '대기';
                const qty    = p.qty !== undefined ? p.qty : (order.qty || 0);
                const remain = Math.max(0, qty - day - night);

                // col 9 = 생산(주): 생산량 또는 상태텍스트
                if (day > 0) {
                    setCellValue(ws, ri, 9, day);
                } else if (status !== '대기') {
                    setCellValue(ws, ri, 9, status);
                } else {
                    setCellValue(ws, ri, 9, null);
                }

                // col 10 = 생산(야)
                setCellValue(ws, ri, 10, night > 0 ? night : null);

                // col 11 = 잔량: 완료면 "완", 아니면 잔량숫자
                if (status === '완료') {
                    setCellValue(ws, ri, 11, '완');
                } else if (remain > 0 && (day > 0 || night > 0)) {
                    setCellValue(ws, ri, 11, remain);
                } else {
                    setCellValue(ws, ri, 11, null);
                }
            }
        });

        XLSX.writeFile(wb, excelPath);
        console.log(`[Excel] ${sheetName} 시트 업데이트 완료`);
    } catch (e) {
        console.error('[Excel] 동기화 오류:', e.message);
    }
}

function getRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => { resolve(body); });
        req.on('error', err => { reject(err); });
    });
}

function safeWriteFile(filePath, dataString) {
    return new Promise((resolve, reject) => {
        const tempPath = filePath + '.tmp';
        fs.writeFile(tempPath, dataString, 'utf8', (err) => {
            if (err) return reject(err);
            fs.rename(tempPath, filePath, (err2) => {
                if (err2) return reject(err2);
                resolve();
            });
        });
    });
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = req.url.split('?')[0];

    // CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        return res.end();
    }

    // GET /api/stranding/data
    if (parsedUrl === '/api/stranding/data' && req.method === 'GET') {
        fs.readFile(STRAND_DB_PATH, 'utf8', (err, data) => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(err || !data ? JSON.stringify({}) : data);
        });
        return;
    }

    // POST /api/stranding/data → JSON 저장 + 엑셀 동기화
    if (parsedUrl === '/api/stranding/data' && req.method === 'POST') {
        try {
            const body = await getRequestBody(req);
            const payload = JSON.parse(body);
            await safeWriteFile(STRAND_DB_PATH, body);
            // 비동기로 엑셀 업데이트 (응답 지연 없이)
            setImmediate(() => syncExcel(payload));
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: true }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Invalid JSON or write failure', details: err.message }));
        }
        return;
    }

    // POST /api/excel/upload — 브라우저 업로드 엑셀을 서버에 저장
    if (parsedUrl === '/api/excel/upload' && req.method === 'POST') {
        try {
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                const buf = Buffer.concat(chunks);
                const excelPath = path.join(DB_DIR, '2026공정표.xlsx');
                fs.writeFile(excelPath, buf, err => {
                    if (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
                        res.end(JSON.stringify({ success: true }));
                    }
                });
            });
            req.on('error', err => {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
                res.end(JSON.stringify({ error: err.message }));
            });
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // GET /api/ilbo/data
    if (parsedUrl === '/api/ilbo/data' && req.method === 'GET') {
        fs.readFile(ILBO_DB_PATH, 'utf8', (err, data) => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(err || !data ? JSON.stringify({}) : data);
        });
        return;
    }

    // POST /api/ilbo/data
    if (parsedUrl === '/api/ilbo/data' && req.method === 'POST') {
        try {
            const body = await getRequestBody(req);
            JSON.parse(body);
            await safeWriteFile(ILBO_DB_PATH, body);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ success: true }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Invalid JSON or write failure', details: err.message }));
        }
        return;
    }

    // Static files
    let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const filePath = path.join(__dirname, urlPath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('404 Not Found');
        }
        const ext = path.extname(filePath).slice(1).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[ext] || 'text/plain; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    let localIp = 'localhost';
    for (const iface of Object.values(nets)) {
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal) {
                localIp = alias.address;
                break;
            }
        }
        if (localIp !== 'localhost') break;
    }
    console.log('==========================================');
    console.log(` DSR 연선공정표 서버 시작`);
    console.log(` 로컬:    http://localhost:${PORT}`);
    console.log(` 태블릿: http://${localIp}:${PORT}`);
    console.log(`\n 키오스크 주소:`);
    console.log(` http://${localIp}:${PORT}/dsr_stranding/stranding.html`);
    console.log('==========================================');
    exec(`start http://localhost:${PORT}`);
});
