@echo off
echo 발주계산 서버를 시작합니다...
echo 브라우저에서 http://localhost:8080 으로 접속하세요.
echo.
echo 이 창을 닫으면 서버가 종료됩니다.
echo.
node -e "const http=require('http'),fs=require('fs'),path=require('path');http.createServer((req,res)=>{let f=path.join('.',req.url==='/'?'/발주계산.html':req.url);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end('Not found');}else{const ext=path.extname(f);const ct={'html':'text/html','json':'application/json','js':'text/javascript','css':'text/css'}[ext.slice(1)]||'text/plain';res.writeHead(200,{'Content-Type':ct+';charset=utf-8','Access-Control-Allow-Origin':'*'});res.end(d);}});}).listen(8080,()=>{console.log('서버 실행 중: http://localhost:8080');require('child_process').exec('start http://localhost:8080');});"
pause
