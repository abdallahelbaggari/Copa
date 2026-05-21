// netlify/functions/complete.js
// Copa.pi — Pi Network MAINNET · sandbox: false
const https = require('https');
const CORS  = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Content-Type':'application/json' };
exports.handler = async (event) => {
  if (event.httpMethod==='OPTIONS') return {statusCode:200,headers:CORS,body:''};
  if (event.httpMethod!=='POST')    return {statusCode:200,headers:CORS,body:JSON.stringify({error:'POST required'})};
  let paymentId,txid;
  try { const b=JSON.parse(event.body||'{}'); paymentId=b.paymentId; txid=b.txid; } catch(e) { return {statusCode:200,headers:CORS,body:JSON.stringify({error:'Invalid JSON'})}; }
  if (!paymentId) return {statusCode:200,headers:CORS,body:JSON.stringify({error:'Missing paymentId'})};
  if (!txid)      return {statusCode:200,headers:CORS,body:JSON.stringify({completed:false,error:'No txid',paymentId})};
  const KEY=process.env.PI_API_KEY;
  if (!KEY) { console.error('[Copa COMPLETE] PI_API_KEY not set!'); return {statusCode:200,headers:CORS,body:JSON.stringify({completed:false,error:'PI_API_KEY not configured',paymentId,txid})}; }
  const postBody=JSON.stringify({txid});
  console.log('[Copa COMPLETE]',paymentId,txid);
  return new Promise((resolve)=>{
    const req=https.request({hostname:'api.minepi.com',path:`/v2/payments/${paymentId}/complete`,method:'POST',headers:{'Authorization':`Key ${KEY}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(postBody)},timeout:25000},(res)=>{
      let data=''; res.on('data',(c)=>{data+=c;}); res.on('end',()=>{
        let parsed={}; try{parsed=JSON.parse(data);}catch(e){parsed={raw:data};}
        console.log('[Copa COMPLETE] Pi API:',res.statusCode,data);
        resolve({statusCode:200,headers:CORS,body:JSON.stringify({completed:res.statusCode===200,piStatus:res.statusCode,paymentId,txid,data:parsed})});
      });
    });
    req.on('error',(e)=>{console.error('[Copa COMPLETE] error:',e.message);resolve({statusCode:200,headers:CORS,body:JSON.stringify({completed:false,error:e.message,paymentId,txid})});});
    req.on('timeout',()=>{req.destroy();resolve({statusCode:200,headers:CORS,body:JSON.stringify({completed:false,error:'Timeout',paymentId,txid})});});
    req.write(postBody); req.end();
  });
};
