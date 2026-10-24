// POST /approve  { paymentId }  — server-side approval (Pi mainnet).
import { log, reply, options, readBody, validPaymentId, piFetch, health, ALLOWED_AMOUNTS } from '../server/pi.js';

export async function onRequestPost(context) {
  const { paymentId } = await readBody(context.request);
  log('approve:request', { paymentId });
  if (!validPaymentId(paymentId)) { log('approve:bad-id', { paymentId }); return reply({ ok: false, error: 'Invalid paymentId' }); }

  // Check the payment really is a Copa payment for an allowed amount before approving it.
  const p = await piFetch(context.env, `/payments/${paymentId}`);
  if (!p.ok) { log('approve:lookup-failed', { paymentId, status: p.status, error: p.data?.error || p.data?.error_message }); return reply({ ok: false, error: 'Payment lookup failed' }); }
  const amount = Number(p.data.amount);
  const meta = p.data.metadata || {};
  if (meta.app !== 'copa' || !ALLOWED_AMOUNTS.includes(amount)) {
    log('approve:rejected', { paymentId, amount, metaApp: meta.app || null });
    return reply({ ok: false, error: 'Payment does not match a Copa product' });
  }

  const r = await piFetch(context.env, `/payments/${paymentId}/approve`, 'POST');
  log(r.ok ? 'approve:ok' : 'approve:failed', { paymentId, amount, user: p.data.user_uid || null, status: r.status, error: r.ok ? undefined : (r.data?.error || r.data?.error_message) });
  return reply({ ok: r.ok, paymentId, approved: r.ok });
}

export const onRequestGet = (context) => health('approve', context.env);
export const onRequestOptions = () => options();
