import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const certDir=path.join(root,'.cert');
const certFile=path.join(certDir,'localhost.crt');
const keyFile=path.join(certDir,'localhost.key');
if(!fs.existsSync(certFile)||!fs.existsSync(keyFile)){
  console.error('Missing .cert/localhost.crt and .cert/localhost.key. Generate a local certificate first; never commit private keys.');
  process.exit(1);
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
const server=https.createServer({cert:fs.readFileSync(certFile),key:fs.readFileSync(keyFile)},(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'https://localhost').pathname);
  const relative=pathname==='/'?'index.html':pathname.replace(/^\//,'');
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(err.code==='ENOENT'?404:500);res.end(err.code==='ENOENT'?'Not found':'Server error');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
});
server.listen(8443,'0.0.0.0',()=>console.log('KFE HTTPS dev server: https://localhost:8443'));
