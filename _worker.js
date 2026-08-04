const ALLOWED_ORIGINS = ['https://360sprng.com', 'https://www.360sprng.com'];

/* ── Kill switch — flip to false to redirect all traffic to coming-soon ── */
const SITE_LIVE = true;

const cors = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
};

function getCorsOrigin(request) {
  const origin = request.headers.get('Origin');
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

/* ── Security headers added to every response ── */
const securityHeaders = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://js.paystack.co https://paystack.com https://omnisnippet1.com",
    "connect-src 'self' https://api.paystack.co https://checkout.paystack.com https://paystack.com https://api.brevo.com https://omnisnippet1.com https://tracking.omnisend.com",
    "img-src 'self' data: blob: https://omnisnippet1.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://paystack.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-src https://js.paystack.co https://checkout.paystack.com https://paystack.com",
  ].join('; '),
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ── CORS preflight ── */
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, ...securityHeaders, 'Access-Control-Allow-Origin': getCorsOrigin(request) },
      });
    }

    /* ── Kill switch — server-side enforcement ── */
    if (!SITE_LIVE && !url.pathname.includes('coming-soon')) {
      return Response.redirect('https://360sprng.com/coming-soon.html', 302);
    }

    /* ── POST /api/orders — write confirmed order to D1 ── */
    if (url.pathname === '/api/orders' && request.method === 'POST') {
      try {
        const b = await request.json();

        if (!b.ref || !b.email || !b.items || !b.total) {
          return json({ error: 'missing required fields' }, 400, request);
        }

        await env.DB.prepare(`
          INSERT OR IGNORE INTO orders
            (ref, created_at, name, email, phone, country, address,
             city, region, postal, digital_address, notes, items, total)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `).bind(
          b.ref,
          new Date().toISOString(),
          b.name          || '',
          b.email,
          b.phone         || '',
          b.country       || '',
          b.address       || '',
          b.city          || '',
          b.region        || '',
          b.postal        || '',
          b.digital_address || '',
          b.notes         || '',
          typeof b.items === 'string' ? b.items : JSON.stringify(b.items),
          Number(b.total)
        ).run();

        return json({ ok: true }, 200, request);
      } catch (e) {
        console.error('Order insert failed:', e);
        return json({ error: 'order submission failed' }, 500, request);
      }
    }

    /* ── POST /api/newsletter — subscribe an email via Brevo ── */
    if (url.pathname === '/api/newsletter' && request.method === 'POST') {
      try {
        const b = await request.json();
        const email = (b.email || '').trim();
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        if (!emailOk) return json({ error: 'invalid email' }, 400, request);
        if (!env.BREVO_API_KEY) {
          console.error('BREVO_API_KEY is not configured');
          return json({ error: 'newsletter signup is temporarily unavailable' }, 500, request);
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
          return json({ error: 'subscribe failed' }, 502, request);
        }
        // Brevo returns 400 "duplicate_parameter" if the contact already exists — treat as success.
        return json({ ok: true }, 200, request);
      } catch (e) {
        console.error('Newsletter subscribe failed:', e);
        return json({ error: 'subscribe failed' }, 500, request);
      }
    }

    /* ── GET /api/orders — list all orders (admin only) ── */
    if (url.pathname === '/api/orders' && request.method === 'GET') {
      const key = request.headers.get('X-Admin-Key');
      if (!env.ADMIN_SECRET || key !== env.ADMIN_SECRET) {
        return json({ error: 'unauthorized' }, 401, request);
      }
      const { results } = await env.DB
        .prepare('SELECT * FROM orders ORDER BY created_at DESC')
        .all();
      return json(results, 200, request);
    }

    /* ── everything else → static assets ── */
    const assetRes = await env.ASSETS.fetch(request);
    return addSecurityHeaders(assetRes);
  }
};

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      ...securityHeaders,
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': request ? getCorsOrigin(request) : ALLOWED_ORIGINS[0],
    },
  });
}

/* ── Attach security headers to any Response without mutating the original ── */
function addSecurityHeaders(response) {
  const res = new Response(response.body, response);
  Object.entries(securityHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}


