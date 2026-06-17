/* =================================================================
   COPA.pi · functions/cancel-payment.js · Cloudflare Pages Function
   Route: /cancel-payment
   Called by onIncompletePayment when payment has no txid
   Re-approves stuck payment so Pi SDK can retry
   MAINNET · sandbox: false
================================================================= */

export async function onRequestGet(context) {
  return new Response(JSON.stringify({
    success:'true', route:'/cancel-payment', network:'MAINNET'
  }), { status:200, headers:{ 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' }});
}

export async function onRequestPost(context) {
  const cors = {
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type','Content-Type':'application/json',
  };
  try {
    const body      = await context.request.json();
    const paymentId = body.paymentId;
    if (!paymentId) return new Response(JSON.stringify({ success:false }), { status:200, headers:cors });
    const PI_API_KEY = context.env.PI_API_KEY;
    if (!PI_API_KEY) return new Response(JSON.stringify({ success:false, error:'no key' }), { status:200, headers:cors });
    const res = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/approve`, {
      method:'POST',
      headers:{ 'Authorization':`Key ${PI_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    return new Response(JSON.stringify({ success:true, pi_status:res.status }), { status:200, headers:cors });
  } catch(err) {
    return new Response(JSON.stringify({ success:false, error:err.message }), { status:200, headers:cors });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status:200, headers:{
    'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST,GET,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
  }});
}
