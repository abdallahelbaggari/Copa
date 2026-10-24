// POST /complete  { paymentId, txid }  — server-side completion after the blockchain transaction (Pi mainnet).
import { log, reply, options, readBody, validPaymentId, piFetch, health } from '../server/pi.js';

export async function onRequestPost(context) {
  const { paymentId, txid } = await readBody(context.request);
  log('complete:request', { paymentId, txid });
  if (!validPaymentId(paymentId) || typeof txid !== 'string' || !/^[A-Za-z0-9]{10,128}$/.test(txid)) {
    log('complete:bad-input', { paymentId, txid });
    return reply({ ok: false, error: 'Invalid paymentId or txid' });
  }
  const r = await piFetch(context.env, `/payments/${paymentId}/complete`, 'POST', { txid });
  log(r.ok ? 'complete:ok' : 'complete:failed', {
    paymentId, txid, status: r.status,
    amount: r.data?.amount ?? null, user: r.data?.user_uid || null,
    error: r.ok ? undefined : (r.data?.error || r.data?.error_message),
  });
  return reply({ ok: r.ok, paymentId, txid, completed: r.ok });
}

export const onRequestGet = (context) => health('complete', context.env);
export const onRequestOptions = () => options();
