// POST /cancel-payment  { paymentId }  — cancels a stuck payment that never reached the blockchain (Pi mainnet).
import { log, reply, options, readBody, validPaymentId, piFetch, health } from '../server/pi.js';

export async function onRequestPost(context) {
  const { paymentId } = await readBody(context.request);
  log('cancel:request', { paymentId });
  if (!validPaymentId(paymentId)) return reply({ ok: false, error: 'Invalid paymentId' });
  const r = await piFetch(context.env, `/payments/${paymentId}/cancel`, 'POST');
  log(r.ok ? 'cancel:ok' : 'cancel:failed', { paymentId, status: r.status, error: r.ok ? undefined : (r.data?.error || r.data?.error_message) });
  return reply({ ok: r.ok, paymentId, cancelled: r.ok });
}

export const onRequestGet = (context) => health('cancel-payment', context.env);
export const onRequestOptions = () => options();
