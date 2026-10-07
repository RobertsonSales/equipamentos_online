/**
 * Vercel Serverless Function — proxy seguro para a API do Google Apps Script.
 * A URL /exec e o token NUNCA chegam ao navegador: são lidos das variáveis de
 * ambiente da Vercel (Settings › Environment Variables).
 *
 *   APPS_SCRIPT_URL   (obrigatória) URL do Web App terminada em /exec
 *   APPS_SCRIPT_TOKEN (obrigatória) mesmo valor da propriedade API_TOKEN do Apps Script
 *   ALLOWED_ORIGIN    (opcional)    ex.: https://patrimonio.vercel.app — bloqueia POST de outras origens
 */
const ACTIONS = new Set(['create', 'update', 'delete']);

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body));
}

async function callScript(url, init) {
  const r = await fetch(url, { redirect: 'follow', ...init });
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: `Apps Script respondeu HTTP ${r.status} (não-JSON). Verifique a implantação.` }; }
}

module.exports = async (req, res) => {
  const URL_ = process.env.APPS_SCRIPT_URL;
  const TOKEN = process.env.APPS_SCRIPT_TOKEN;
  const configured = Boolean(URL_ && TOKEN);

  if (req.method === 'GET' && req.query && req.query.ping) return send(res, 200, { ok: true, configured });
  if (!configured) return send(res, 503, { ok: false, configured: false, error: 'Variáveis APPS_SCRIPT_URL / APPS_SCRIPT_TOKEN não configuradas na Vercel.' });

  try {
    if (req.method === 'GET') {
      const j = await callScript(`${URL_}?token=${encodeURIComponent(TOKEN)}`);
      return send(res, j.ok ? 200 : 502, j);
    }

    if (req.method === 'POST') {
      const allowed = process.env.ALLOWED_ORIGIN;
      const origin = req.headers.origin || '';
      if (allowed && origin && origin !== allowed) return send(res, 403, { ok: false, error: 'Origem não autorizada' });

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (!ACTIONS.has(body.action)) return send(res, 400, { ok: false, error: 'Ação inválida' });
      if (body.action === 'delete' && !body.id) return send(res, 400, { ok: false, error: 'ID ausente' });
      if (body.action !== 'delete' && (typeof body.record !== 'object' || !body.record)) return send(res, 400, { ok: false, error: 'Registro ausente' });

      const payload = { action: body.action, id: body.id, record: body.record, token: TOKEN };
      const j = await callScript(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      return send(res, j.ok ? 200 : 502, j);
    }

    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { ok: false, error: 'Método não permitido' });
  } catch (err) {
    console.error('Proxy error:', err);
    return send(res, 500, { ok: false, error: 'Falha ao contatar o Google Apps Script' });
  }
};

