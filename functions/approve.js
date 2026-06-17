/* =================================================================
   COPA.pi · functions/approve.js · Cloudflare Pages Function
   Route: /approve

   ██████████████████████████████████████
   ██   MAINNET · sandbox: false       ██
   ██████████████████████████████████████

   Pi Network Mainnet:
   - SDK: Pi.init({ version:"2.0", sandbox:false })
   - API: api.minepi.com/v2
   - Auth: "Key MAINNET_PI_API_KEY"

   SETUP: Cloudflare Dashboard → Settings → Environment Variables
   Set PI_API_KEY = your mainnet key from develop.pi
================================================================= */

export async function onRequestGet(context) {
  const key = context.env.PI_API_KEY;
  return new Response(JSON.stringify({
    success: true,
    message: 'Copa.pi approve.js working',
    route:   '/approve',
    network: 'MAINNET · sandbox:false',
    pi_api_key_present: !!key,
    pi_api_key_prefix:  key ? key.substring(0,8)+'...' : 'MISSING',
  }), { status:200, headers:{ 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }});
}

export async function onRequestPost(context) {
  const cors = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json',
  };
  console.log('[Copa MAINNET] /approve POST');
  try {
    let paymentId = null;
    try {
      const body = await context.request.json();
      paymentId  = body.paymentId || null;
    } catch(e) {
      return new Response(JSON.stringify({ approved:true, step:'body_parse_error' }), { status:200, headers:cors });
    }
    if (!paymentId) {
      return new Response(JSON.stringify({ approved:true, step:'no_payment_id' }), { status:200, headers:cors });
    }
    const PI_API_KEY = context.env.PI_API_KEY;
    if (!PI_API_KEY) {
      console.error('[Copa MAINNET] PI_API_KEY missing');
      return new Response(JSON.stringify({ approved:true, step:'no_api_key' }), { status:200, headers:cors });
    }
    const res = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/approve`, {
      method:  'POST',
      headers: { 'Authorization':`Key ${PI_API_KEY}`, 'Content-Type':'application/json' },
      body:    JSON.stringify({}),
    });
    const text = await res.text();
    console.log('[Copa MAINNET] approve response:', res.status, text.slice(0,200));
    return new Response(JSON.stringify({ approved:true, pi_status:res.status }), { status:200, headers:cors });
  } catch(err) {
    console.error('[Copa MAINNET] approve error:', err.message);
    return new Response(JSON.stringify({ approved:true, error:err.message }), { status:200, headers:cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status:200, headers:{
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
  }});
}
