/* =================================================================
   COPA.pi · functions/complete.js · Cloudflare Pages Function
   Route: /complete
   MAINNET · sandbox: false
================================================================= */

export async function onRequestGet(context) {
  const key = context.env.PI_API_KEY;
  return new Response(JSON.stringify({
    success: true,
    message: 'Copa.pi complete.js working',
    route:   '/complete',
    network: 'MAINNET · sandbox:false',
    pi_api_key_present: !!key,
  }), { status:200, headers:{ 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }});
}

export async function onRequestPost(context) {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json',
  };
  console.log('[Copa MAINNET] /complete POST');
  try {
    const body      = await context.request.json();
    const paymentId = body.paymentId;
    const txid      = body.txid;
    if (!paymentId) {
      return new Response(JSON.stringify({ completed:false, error:'missing paymentId' }), { status:200, headers:cors });
    }
    if (!txid) {
      return new Response(JSON.stringify({ completed:true, skipped:true, message:'no txid yet' }), { status:200, headers:cors });
    }
    const PI_API_KEY = context.env.PI_API_KEY;
    if (!PI_API_KEY) {
      return new Response(JSON.stringify({ completed:true, skipped:true, error:'PI_API_KEY not set' }), { status:200, headers:cors });
    }
    const res = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
      method:  'POST',
      headers: { 'Authorization':`Key ${PI_API_KEY}`, 'Content-Type':'application/json' },
      body:    JSON.stringify({ txid }),
    });
    const text = await res.text();
    console.log('[Copa MAINNET] complete response:', res.status, text.slice(0,200));
    return new Response(JSON.stringify({ completed:res.ok, pi_status:res.status }), { status:200, headers:cors });
  } catch(err) {
    console.error('[Copa MAINNET] complete error:', err.message);
    return new Response(JSON.stringify({ completed:false, error:err.message }), { status:200, headers:cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status:200, headers:{
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
  }});
}
