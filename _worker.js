const ALLOWED_ORIGIN = 'https://360sprng.com';

/* ── Kill switch — flip to false to take the site down ────────────────────
   Fixed vs. the live worker: this response is fully self-contained (inline
   CSS, inline SVG mark, no local asset requests), so — unlike coming-soon.html
   on the live site — it can't break itself by having its own CSS/logo/favicon
   requests bounced back into the same redirect. It also only takes effect
   because wrangler.toml below sets run_worker_first = true; without that,
   Cloudflare serves matching static files directly and this code never runs
   for real page requests at all (this was silently broken on the live site). */
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
    "script-src 'self' 'unsafe-inline' https://js.paystack.co",
    "connect-src 'self' https://api.paystack.co https://api.brevo.com",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    // fixed: mobile-money/standard checkout redirects through standard.paystack.co,
    // the popup itself through checkout.paystack.com — both were needed, only one was present.
    "frame-src https://js.paystack.co https://checkout.paystack.com https://standard.paystack.co",
  ].join('; '),
};

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>360SPRNG — Back Soon</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#fff; color:#0a0a0a; font-family:-apple-system,Arial,sans-serif;
    min-height:100vh; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:20px; text-align:center; padding:24px; }
  svg { width:54px; height:54px; }
  h1 { font-family:'Anton',sans-serif; font-size:22px; letter-spacing:1px; text-transform:uppercase; }
  p { font-size:14px; opacity:0.6; max-width:26rem; line-height:1.6; }
  a { color:#5603e8; }
</style></head>
<body>
  <svg viewBox="0 0 40 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 2 L38 30 H2 Z" stroke="#0a0a0a" stroke-width="3" stroke-linejoin="round"/></svg>
  <h1>Live Beyond Life. Back Shortly.</h1>
  <p>360SPRNG is between drops right now. Follow <a href="https://instagram.com/360SPRNG" target="_blank" rel="noopener">@360SPRNG</a> for the next one.</p>
</body></html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, ...securityHeaders } });
    }

    /* ── Kill switch — server-side enforcement, self-contained response ── */
    if (!SITE_LIVE) {
      return new Response(MAINTENANCE_HTML, {
        status: 503,
        headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=UTF-8', 'Retry-After': '3600' },
      });
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

    /* ── POST /api/newsletter — subscribe an email via Brevo (server-side key) ── */
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

        if (!brevoRes.ok && brevoRes.status !== 400) {
          const errText = await brevoRes.text();
          console.error('Brevo subscribe failed:', brevoRes.status, errText);
          return json({ error: 'subscribe failed' }, 502);
        }
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

function timingSafeStringEqual(a, b) {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) {
    crypto.subtle.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

function addSecurityHeaders(response) {
  const res = new Response(response.body, response);
  Object.entries(securityHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}
