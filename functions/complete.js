/* ═══════════════════════════════════════════════════════
   functions/complete.js — Cloudflare Pages Function
   Copa.pi — Pi Network Payment Completion
   WorldCup pattern — 7-step verification
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
    console.error('[Copa complete] PI_API_KEY not set');
    return jsonResponse({ error: 'PI_API_KEY not configured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch(e){
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { paymentId, txid, expectedAmount } = body;

  if(!paymentId || !txid){
    return jsonResponse({ error: 'Missing paymentId or txid' }, 400);
  }

  console.log('[Copa complete] paymentId:', paymentId, 'txid:', txid);

  try {
    /* STEP 1 — GET payment */
    const getRes = await fetch(PI_BASE+'/payments/'+paymentId, {
      headers: {
        'Authorization': 'Key '+PI_KEY,
        'Content-Type':  'application/json'
      }
    });

    if(!getRes.ok){
      const err = await getRes.json().catch(() => ({}));
      console.error('[Copa complete] GET failed:', getRes.status, err);
      return jsonResponse({ error: 'Payment not found' }, 400);
    }

    const payment = await getRes.json();
    console.log('[Copa complete] payment status:', JSON.stringify(payment.status));

    /* STEP 2 — Check approved */
    if(!payment.status || !payment.status.developer_approved){
      console.error('[Copa complete] Not approved yet');
      return jsonResponse({ error: 'Payment not approved' }, 400);
    }

    /* STEP 3 — Check transaction verified */
    if(!payment.status.transaction_verified){
      console.error('[Copa complete] Transaction not verified');
      return jsonResponse({ error: 'Transaction not verified' }, 400);
    }

    /* STEP 4 — Check not already completed */
    if(payment.status.developer_completed){
      console.log('[Copa complete] Already completed');
      return jsonResponse({ success: true, already: true });
    }

    /* STEP 5 — Verify txid */
    if(payment.transaction && payment.transaction.txid !== txid){
      console.error('[Copa complete] TXID mismatch');
      return jsonResponse({ error: 'TXID mismatch' }, 400);
    }

    /* STEP 6 — Verify amount */
    if(expectedAmount && Math.abs(payment.amount - expectedAmount) > 0.001){
      console.error('[Copa complete] Amount mismatch:', payment.amount);
      return jsonResponse({ error: 'Amount mismatch' }, 400);
    }

    /* STEP 7 — POST complete */
    const completeRes = await fetch(PI_BASE+'/payments/'+paymentId+'/complete', {
      method: 'POST',
      headers: {
        'Authorization': 'Key '+PI_KEY,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({ txid })
    });

    if(!completeRes.ok){
      const err = await completeRes.json().catch(() => ({}));
      console.error('[Copa complete] Complete failed:', completeRes.status, err);
      return jsonResponse({ error: 'Complete failed' }, 400);
    }

    const result = await completeRes.json();
    console.log('[Copa complete] ✅ Completed successfully');
    return jsonResponse({ success: true, payment: result });

  } catch(e){
    console.error('[Copa complete] Exception:', e.message);
    return jsonResponse({ error: e.message }, 500);
  }
}
