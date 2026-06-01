const ALLOWED_ORIGIN = 'https://360sprng.com';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ── CORS preflight ── */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
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
        return json({ error: e.message }, 500);
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
    return env.ASSETS.fetch(request);
  }
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
