// netlify/functions/approve.js
// Copa.pi — Pi Network MAINNET · sandbox: false
// Set PI_API_KEY in Netlify → Site settings → Environment variables
const https = require('https');
const CORS  = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Content-Type':'application/json' };
exports.handler = async (event) => {
  if (event.httpMethod==='OPTIONS') return {statusCode:200,headers:CORS,body:''};
  if (event.httpMethod!=='POST')    return {statusCode:200,headers:CORS,body:JSON.stringify({error:'POST required'})};
  let paymentId;
  try { paymentId=JSON.parse(event.body||'{}').paymentId; } catch(e) { return {statusCode:200,headers:CORS,body:JSON.stringify({error:'Invalid JSON'})}; }
  if (!paymentId) return {statusCode:200,headers:CORS,body:JSON.stringify({error:'Missing paymentId'})};
  const KEY=process.env.PI_API_KEY;
  if (!KEY) { console.error('[Copa APPROVE] PI_API_KEY not set!'); return {statusCode:200,headers:CORS,body:JSON.stringify({approved:false,error:'PI_API_KEY not configured',paymentId})}; }
  console.log('[Copa APPROVE]',paymentId);
  return new Promise((resolve)=>{
    const req=https.request({hostname:'api.minepi.com',path:`/v2/payments/${paymentId}/approve`,method:'POST',headers:{'Authorization':`Key ${KEY}`,'Content-Type':'application/json'},timeout:25000},(res)=>{
      let data=''; res.on('data',(c)=>{data+=c;}); res.on('end',()=>{
        let parsed={}; try{parsed=JSON.parse(data);}catch(e){parsed={raw:data};}
        console.log('[Copa APPROVE] Pi API:',res.statusCode,data);
        resolve({statusCode:200,headers:CORS,body:JSON.stringify({approved:res.statusCode===200,piStatus:res.statusCode,paymentId,data:parsed})});
      });
    });
    req.on('error',(e)=>{console.error('[Copa APPROVE] error:',e.message);resolve({statusCode:200,headers:CORS,body:JSON.stringify({approved:false,error:e.message,paymentId})});});
    req.on('timeout',()=>{req.destroy();resolve({statusCode:200,headers:CORS,body:JSON.stringify({approved:false,error:'Timeout',paymentId})});});
    req.end();
  });
};
