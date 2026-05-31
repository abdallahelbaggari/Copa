/* ═══════════════════════════════════════════════════════
   functions/approve.js — Cloudflare Pages Function
   Copa.pi — Pi Network Payment Approval
   WorldCup pattern — 4-step verification
═══════════════════════════════════════════════════════ */

const PI_BASE = 'https://api.minepi.com/v2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

function jsonResponse(data, status){
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: CORS
  });
}

export async function onRequest(context) {
  const request = context.request;
  const env     = context.env;

  if(request.method === 'OPTIONS'){
    return new Response('', { status: 200, headers: CORS });
  }

  const PI_KEY = env.PI_API_KEY;
  if(!PI_KEY){
    console.error('[Copa approve] PI_API_KEY not set');
    return jsonResponse({ error: 'PI_API_KEY not configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch(e){
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { paymentId, expectedAmount } = body;

  if(!paymentId){
    return jsonResponse({ error: 'Missing paymentId' }, 400);
  }

  console.log('[Copa approve] paymentId:', paymentId);

  try {
    /* STEP 1 — GET payment from Pi */
    const getRes = await fetch(PI_BASE+'/payments/'+paymentId, {
      headers: {
        'Authorization': 'Key '+PI_KEY,
        'Content-Type':  'application/json'
      }
    });

    if(!getRes.ok){
      const err = await getRes.json().catch(() => ({}));
      console.error('[Copa approve] GET failed:', getRes.status, err);
      return jsonResponse({ error: 'Payment not found', status: getRes.status }, 400);
    }

    const payment = await getRes.json();
    console.log('[Copa approve] payment status:', payment.status);

    /* STEP 2 — Check not already approved */
    if(payment.status && payment.status.developer_approved){
      console.log('[Copa approve] Already approved');
      return jsonResponse({ success: true, already: true });
    }

    /* STEP 3 — Verify amount */
    if(expectedAmount && Math.abs(payment.amount - expectedAmount) > 0.001){
      console.error('[Copa approve] Amount mismatch:', payment.amount, 'expected:', expectedAmount);
      return jsonResponse({ error: 'Amount mismatch' }, 400);
    }

    /* STEP 4 — POST approve */
    const approveRes = await fetch(PI_BASE+'/payments/'+paymentId+'/approve', {
      method: 'POST',
      headers: {
        'Authorization': 'Key '+PI_KEY,
        'Content-Type':  'application/json'
      }
    });

    if(!approveRes.ok){
      const err = await approveRes.json().catch(() => ({}));
      console.error('[Copa approve] Approve failed:', approveRes.status, err);
      return jsonResponse({ error: 'Approve failed', status: approveRes.status }, 400);
    }

    const result = await approveRes.json();
    console.log('[Copa approve] ✅ Approved successfully');
    return jsonResponse({ success: true, payment: result });

  } catch(e){
    console.error('[Copa approve] Exception:', e.message);
    return jsonResponse({ error: e.message }, 500);
  }
}
