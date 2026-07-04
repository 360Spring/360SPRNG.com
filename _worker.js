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
    "frame-src https://js.paystack.co",
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

    /* ── POST /api/orders — write confirmed order to D1 ── */
    if (url.pathname === '/api/orders' && request.method === 'POST') {
      try {
        const b = await request.json();

        if (!b.ref || !b.email || !b.items || !b.total) {
          return json({ error: 'missing required fields' }, 400);
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
      const key = request.headers.get('X-Admin-Key');
      if (!env.ADMIN_SECRET || key !== env.ADMIN_SECRET) {
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

/* ── Attach security headers to any Response without mutating the original ── */
function addSecurityHeaders(response) {
  const res = new Response(response.body, response);
  Object.entries(securityHeaders).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}


