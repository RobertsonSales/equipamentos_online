/**
 * Vercel Serverless Function — proxy seguro para a API do Google Apps Script.
 * A URL /exec e o token NUNCA chegam ao navegador (variáveis de ambiente da Vercel).
 *
 *   APPS_SCRIPT_URL   (obrigatória) URL do Web App terminada em /exec
 *   APPS_SCRIPT_TOKEN (obrigatória) mesmo valor da propriedade API_TOKEN do Apps Script
 *   ALLOWED_ORIGIN    (opcional)    ex.: https://patrimonio.vercel.app
 *
 * Diagnóstico: GET /api/patrimonio?ping=1&deep=1 testa a conexão real com o Apps Script.
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
  catch {
    const login = /accounts\.google\.com|ServiceLogin|Sign in/i.test(text);
    return {
      ok: false,
      error: login
        ? 'Apps Script exigiu login Google: reimplante o Web App com acesso "Qualquer pessoa" (Anyone).'
        : `Apps Script respondeu HTTP ${r.status} (não-JSON). Confira se a URL é a do Web App (/exec) e se a implantação está atualizada.`
    };
  }
}

module.exports = async (req, res) => {
  // .trim() evita falha por espaço/quebra de linha colados junto da variável
  const URL_ = (process.env.APPS_SCRIPT_URL || '').trim();
  const TOKEN = (process.env.APPS_SCRIPT_TOKEN || '').trim();
  const configured = Boolean(URL_ && TOKEN);
  const q = req.query || {};

  if (req.method === 'GET' && q.ping) {
    if (!(configured && q.deep)) return send(res, 200, { ok: true, configured });
    try {
      const j = await callScript(`${URL_}${URL_.includes('?') ? '&' : '?'}token=${encodeURIComponent(TOKEN)}`);
      return send(res, 200, { ok: true, configured, script: j.ok ? { ok: true, rows: j.data.rows.length } : { ok: false, error: j.error } });
    } catch (err) {
      return send(res, 200, { ok: true, configured, script: { ok: false, error: String(err.message || err) } });
    }
  }

  if (!configured) return send(res, 503, { ok: false, configured: false, error: 'Variáveis APPS_SCRIPT_URL / APPS_SCRIPT_TOKEN não configuradas na Vercel.' });

  try {
    if (req.method === 'GET') {
      const j = await callScript(`${URL_}${URL_.includes('?') ? '&' : '?'}token=${encodeURIComponent(TOKEN)}`);
      return send(res, j.ok ? 200 : 502, j);
    }

    if (req.method === 'POST') {
      const allowed = (process.env.ALLOWED_ORIGIN || '').trim().replace(/\/$/, '');
      const origin = req.headers.origin || '';
      if (allowed && origin && origin !== allowed) return send(res, 403, { ok: false, error: 'Origem não autorizada (ALLOWED_ORIGIN)' });

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
    return send(res, 500, { ok: false, error: 'Falha ao contatar o Google Apps Script: ' + String(err.message || err) });
  }
};
