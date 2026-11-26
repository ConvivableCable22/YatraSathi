/**
 * YatraSathi — External Integrations (Public Config & Razorpay Test-Mode Gate)
 *
 * Security invariants:
 * - Maps use free Leaflet + OpenStreetMap tiles client-side (no paid map/route API keys).
 * - RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET stay server-side only.
 * - Live Razorpay keys (rzp_live_*) are explicitly rejected; test mode only.
 * - No payable YatraSathi product SKU is enabled until product/pricing is decided in prd.md.
 * - External travel bookings are NEVER marked confirmed by payment webhooks or callbacks.
 */

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(String(message)));
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqualHex(a, b) {
  const sa = String(a || '').toLowerCase();
  const sb = String(b || '').toLowerCase();
  if (sa.length !== sb.length || sa.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i++) {
    diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  }
  return diff === 0;
}

export function handlePublicConfig(env) {
  return jsonResponse({
    ok: true,
    mapProvider: 'leaflet-openstreetmap',
    googleSignInEnabled: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    razorpayTestModeOnly: true,
    razorpayPayableProductDefined: false
  });
}

export async function handlePaymentsRequest(request, env, sessionUser) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/payments/status' && method === 'GET') {
    return jsonResponse({
      ok: true,
      enabled: false,
      mode: 'test',
      reason: 'PRODUCT_UNDECIDED',
      message: 'Checkout is disabled: no payable YatraSathi product is defined in prd.md yet. Trip budgets and external bookings are never charged.'
    });
  }

  if (path === '/api/payments/webhook' && method === 'POST') {
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      return jsonResponse({ ok: false, code: 'WEBHOOK_NOT_CONFIGURED' }, 503);
    }
    const rawBody = await request.text();
    const signature = request.headers.get('X-Razorpay-Signature') || '';
    const expected = await hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, rawBody);
    if (!timingSafeEqualHex(signature, expected)) {
      return jsonResponse({ ok: false, code: 'INVALID_WEBHOOK_SIGNATURE' }, 401);
    }

    const event = JSON.parse(rawBody || '{}');
    const paymentEntity = event?.payload?.payment?.entity;
    const orderId = paymentEntity?.order_id;
    const paymentId = paymentEntity?.id;
    const eventName = String(event?.event || '');

    if (orderId && env.DB) {
      const nextStatus = eventName === 'payment.captured'
        ? 'captured'
        : (eventName === 'payment.failed' ? 'failed' : 'authorized');
      await env.DB
        .prepare(
          `UPDATE payment_orders
           SET status = ?, razorpay_payment_id = COALESCE(?, razorpay_payment_id),
               webhook_event_id = ?, updated_at = ?
           WHERE razorpay_order_id = ? AND mode = 'test'`
        )
        .bind(nextStatus, paymentId || null, String(event?.event_id || eventName), Date.now(), orderId)
        .run();
    }

    return jsonResponse({ ok: true, received: true });
  }

  if (!sessionUser || !sessionUser.id) {
    return jsonResponse({ ok: false, code: 'UNAUTHORIZED', message: 'Authentication required.' }, 401);
  }

  if (path === '/api/payments/orders' && method === 'POST') {
    if (env.RAZORPAY_KEY_ID && String(env.RAZORPAY_KEY_ID).startsWith('rzp_live_')) {
      return jsonResponse({
        ok: false,
        code: 'LIVE_MODE_FORBIDDEN',
        message: 'Live Razorpay keys are blocked; only test-mode keys (rzp_test_*) are permitted.'
      }, 400);
    }

    return jsonResponse({
      ok: false,
      code: 'PRODUCT_UNDECIDED',
      message: 'Live/test checkout is disabled until a payable YatraSathi product SKU is defined in prd.md. Trip budgets and external travel bookings cannot be charged.'
    }, 501);
  }

  if (path === '/api/payments/verify' && method === 'POST') {
    if (!env.RAZORPAY_KEY_SECRET) {
      return jsonResponse({ ok: false, code: 'RAZORPAY_NOT_CONFIGURED' }, 503);
    }
    const body = await request.json().catch(() => ({}));
    const orderId = String(body.razorpay_order_id || '').trim();
    const paymentId = String(body.razorpay_payment_id || '').trim();
    const signature = String(body.razorpay_signature || '').trim();
    if (!orderId || !paymentId || !signature) {
      return jsonResponse({ ok: false, code: 'INVALID_PAYMENT_PROOF' }, 400);
    }

    const expected = await hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
    if (!timingSafeEqualHex(signature, expected)) {
      return jsonResponse({ ok: false, code: 'INVALID_PAYMENT_SIGNATURE' }, 400);
    }

    const res = await env.DB
      .prepare(
        `UPDATE payment_orders
         SET razorpay_payment_id = ?, razorpay_signature = ?, status = 'captured', updated_at = ?
         WHERE razorpay_order_id = ? AND user_id = ? AND mode = 'test'`
      )
      .bind(paymentId, signature, Date.now(), orderId, sessionUser.id)
      .run();

    if (!res?.meta?.changes) {
      return jsonResponse({ ok: false, code: 'ORDER_NOT_FOUND' }, 404);
    }

    return jsonResponse({ ok: true, status: 'captured', mode: 'test' });
  }

  return jsonResponse({ ok: false, code: 'NOT_FOUND' }, 404);
}
