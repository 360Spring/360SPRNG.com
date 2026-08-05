const ALLOWED_ORIGIN = 'https://360sprng.com';

/* ── Kill switch — flip to false to redirect all traffic to coming-soon ── */
const SITE_LIVE = true;

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
};

/* ── Security headers added to every response ── */
const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.paystack.co https://omnisnippet1.com",
    "connect-src 'self' https://api.paystack.co https://api.brevo.com https://omnisnippet1.com https://tracking.omnisend.com",
    "img-src 'self' data: blob: https://omnisnippet1.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-src https://js.paystack.co https://checkout.paystack.com",
  ].join('; '),
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ── CORS preflight ── */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, ...securityHeaders } });
    }

    /* ── Kill switch — server-side enforcement ── */
    if (!SITE_LIVE && !url.pathname.includes('coming-soon')) {
      return Response.redirect('https://360sprng.com/coming-soon.html', 302);
    }

    /* ── POST /api/orders — verify payment with Paystack, then write to D1 ── */
    if (url.pathname === '/api/orders' && request.method === 'POST') {
      try {
        const b = await request.json();

        if (!b.ref || !b.email || !b.items || !b.total) {
          return json({ error: 'missing required fields' }, 400);
        }

        const email = String(b.email).trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json({ error: 'invalid email' }, 400);
        }

        const total = Number(b.total);
        if (!Number.isFinite(total) || total <= 0) {
          return json({ error: 'invalid total' }, 400);
        }

        const ref = String(b.ref).slice(0, 200);
        const cap = (s, max = 500) => String(s || '').slice(0, max);

        /* ── Server-side proof of payment — never trust a client-reported total ── */
        if (!env.PAYSTACK_SECRET_KEY) {
          console.error('PAYSTACK_SECRET_KEY is not configured');
          return json({ error: 'order verification unavailable' }, 500);
        }

        const verifyRes = await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
          { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } }
        );

        if (!verifyRes.ok) {
          console.error('Paystack verify request failed:', verifyRes.status);
          return json({ error: 'payment could not be verified' }, 402);
        }

        const verifyData = await verifyRes.json();
        const tx = verifyData && verifyData.data;
        const expectedPesewas = Math.round(total * 100);
        const paymentOk =
          verifyData.status === true &&
          tx &&
          tx.status === 'success' &&
          tx.currency === 'GHS' &&
          Math.abs(tx.amount - expectedPesewas) <= 1; // 1-pesewa rounding slack

        if (!paymentOk) {
          console.error('Paystack verify mismatch:', { ref, txStatus: tx && tx.status, txAmount: tx && tx.amount, expectedPesewas });
          return json({ error: 'payment could not be verified' }, 402);
        }

        await env.DB.prepare(`
          INSERT OR IGNORE INTO orders
            (ref, created_at, name, email, phone, country, address,
             city, region, postal, digital_address, notes, items, total)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          ref,
          new Date().toISOString(),
          cap(b.name),
          email,
          cap(b.phone, 40),
          cap(b.country, 100),
          cap(b.address),
          cap(b.city, 100),
          cap(b.region, 100),
          cap(b.postal, 40),
          cap(b.digital_address, 100),
          cap(b.notes, 2000),
          cap(typeof b.items === 'string' ? b.items : JSON.stringify(b.items), 4000),
          total
        ).run();

        return json({ ok: true }, 200);
      } catch (e) {
        console.error('Order insert failed:', e);
        return json({ error: 'order submission failed' }, 500);
      }
    }

    /* ── POST /api/newsletter — subscribe an email via Brevo ── */
    if (url.pathname === '/api/newsletter' && request.method === 'POST') {
      try {
        const b = await request.json();
        const email = (b.email || '').trim();
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!emailOk) return json({ error: 'invalid email' }, 400);
        if (!env.BREVO_API_KEY) {
          console.error('BREVO_API_KEY is not configured');
          return json({ error: 'newsletter signup is temporarily unavailable' }, 500);
        }

        const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'api-key': env.BREVO_API_KEY,
          },
          body: JSON.stringify({
            email,
            updateEnabled: true,
            ...(env.BREVO_NEWSLETTER_LIST_ID ? { listIds: [Number(env.BREVO_NEWSLETTER_LIST_ID)] } : {}),
          }),
        });

        // Brevo returns 201 for new contacts, 204 for an update to an existing one.
        if (!brevoRes.ok && brevoRes.status !== 400) {
          const errText = await brevoRes.text();
          console.error('Brevo subscribe failed:', brevoRes.status, errText);
          return json({ error: 'subscribe failed' }, 502);
        }
        // Brevo returns 400 "duplicate_parameter" if the contact already exists — treat as success.
        return json({ ok: true }, 200);
      } catch (e) {
        console.error('Newsletter subscribe failed:', e);
        return json({ error: 'subscribe failed' }, 500);
      }
    }

    /* ── GET /api/orders — list all orders (admin only) ── */
    if (url.pathname === '/api/orders' && request.method === 'GET') {
      const key = request.headers.get('X-Admin-Key') || '';
      if (!env.ADMIN_SECRET || !timingSafeStringEqual(key, env.ADMIN_SECRET)) {
        return json({ error: 'unauthorized' }, 401);
      }
      const { results } = await env.DB
        .prepare('SELECT * FROM orders ORDER BY created_at DESC')
        .all();
      return json(results, 200);
    }

    /* ── everything else → static assets ── */
    const assetRes = await env.ASSETS.fetch(request);
    return addSecurityHeaders(assetRes);
  }
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, ...securityHeaders, 'Content-Type': 'application/json' },
  });
}

/* ── Constant-time string compare (Workers-native timingSafeEqual) ── */
function timingSafeStringEqual(a, b) {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) {
    // Still run a compare of equal length to avoid an obvious early return.
    crypto.subtle.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

/* ── Attach security headers to any Response without mutating the original ── */
function addSecurityHeaders(response) {
  const res = new Response(response.body, response);
  Object.entries(securityHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}