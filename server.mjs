import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
const port=Number(process.env.PORT||8000);
const uploadsEnabled=false; // Public metadata uploads are intentionally disabled for the Devnet preview.
const headers={'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https: wss:; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"};
function json(res,code,obj){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(obj))}
http.createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&pathname==='/health')return json(res,200,{status:'ok',network:'devnet',metadataUploadsEnabled:uploadsEnabled});
  if(pathname==='/api/metadata')return json(res,503,{error:'Public metadata uploads are disabled for this Devnet preview.'});
  if(pathname==='/api/raydium/build'){
   if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
   if(!(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{error:'JSON required'});
   const origin=req.headers.origin;
   const expectedOrigin='https://sollaunch-cosmos.onrender.com';
   if(origin&&origin!==expectedOrigin&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))return json(res,403,{error:'Origin not allowed'});
   try{const {buildDevnetPool}=await import('./raydium-api.mjs');return json(res,200,await buildDevnetPool(req))}
   catch(e){console.error('Raydium pool build error:',e.message);return json(res,e.httpStatus||503,{error:e.httpStatus?e.message:'Raydium transaction builder is unavailable. Check Devnet status and try again.'})}
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
  const file=pathname==='/'?'index.html':pathname.slice(1);
  if(!['index.html','vendor/solana-web3.iife.min.js'].includes(file))return json(res,404,{error:'Not found'});
  const data=await fs.readFile(path.join(root,file));
  res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8','Cache-Control':'public, max-age=300',...headers});
  if(req.method==='HEAD')res.end();else res.end(data);
 }catch(err){json(res,err.code==='ENOENT'?404:500,{error:'Service unavailable'})}
}).listen(port,'0.0.0.0',()=>console.log('SolLaunch Cosmos Devnet preview listening on '+port));
