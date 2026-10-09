/**
 * API de Patrimônio — Google Apps Script (backend único das duas aplicações)
 *   - Atualizador da planilha  (equipamentosonline.vercel.app) → API_TOKEN  → leitura + gravação
 *   - Gerenciador de Patrimônio (patrimonio-ten.vercel.app)   → READ_TOKEN → somente leitura
 *
 * Propriedades do script (Configurações do projeto › Propriedades do script):
 *   API_TOKEN  (obrigatória) — lê e grava. Fica só no projeto Vercel do Atualizador.
 *   READ_TOKEN (recomendada) — só lê. Fica no projeto Vercel do Gerenciador.
 *              Se não existir, o Gerenciador pode usar o API_TOKEN (compatibilidade).
 *
 * Planilha: aba "Patrimônio aferido" com cabeçalho na linha 1.
 * A coluna "ID" (coluna A) é criada/preenchida automaticamente.
 *
 * v2.1 — mudanças em relação à v2:
 *   • cabeçalhos com espaços extras são aparados (evita "CNPJ " ≠ "CNPJ");
 *   • linhas digitadas DIRETAMENTE na planilha (sem ID) recebem um ID na
 *     próxima leitura — antes elas apareciam no app mas não podiam ser
 *     editadas/excluídas ("Registro não encontrado");
 *   • ação "ping" no GET para diagnóstico de token/implantação;
 *   • token somente leitura (READ_TOKEN): aceito no GET, recusado no POST.
 *
 * Contrato da API inalterado (doGet/doPost) — não exige mudanças nos apps.
 * Os apps leem as colunas PELO NOME do cabeçalho; reordenar ou inserir
 * colunas na planilha não quebra a leitura (renomear, sim).
 */
const SHEET_NAME = 'Patrimônio aferido';
const ID_COL = 'ID';

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '';
}

function getReadToken_() {
  return PropertiesService.getScriptProperties().getProperty('READ_TOKEN') || '';
}

/** Leitura: aceita o token de gravação ou o de leitura. Tokens vazios nunca são aceitos. */
function canRead_(token) {
  const t = String(token || '');
  if (!t) return false;
  return t === getToken_() || (getReadToken_() !== '' && t === getReadToken_());
}

/** Gravação: somente o API_TOKEN. */
function canWrite_(token) {
  const t = String(token || '');
  return t !== '' && t === getToken_();
}

function sheet_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Aba "' + SHEET_NAME + '" não encontrada');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (String(headers[0]).trim() !== ID_COL) {
    sh.insertColumnBefore(1);
    sh.getRange(1, 1).setValue(ID_COL);
  }
  backfillIds_(sh);
  return sh;
}

/** Garante ID em toda linha com conteúdo (inclusive linhas incluídas à mão na planilha). */
function backfillIds_(sh) {
  const last = sh.getLastRow();
  if (last < 2) return;
  const width = sh.getLastColumn();
  const vals = sh.getRange(2, 1, last - 1, width).getValues();
  const missing = [];
  vals.forEach((r, i) => {
    const hasData = r.slice(1).some(c => c !== '' && c !== null);
    if (hasData && String(r[0]).trim() === '') missing.push(i);
  });
  if (!missing.length) return;

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return; // outra execução já está gravando; tenta na próxima leitura
  try {
    const idRange = sh.getRange(2, 1, last - 1, 1);
    const ids = idRange.getValues();
    missing.forEach(i => { if (String(ids[i][0]).trim() === '') ids[i][0] = Utilities.getUuid(); });
    idRange.setValues(ids);
  } finally { lock.releaseLock(); }
}

function headers_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
}

function fmt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : v;
}

function list_() {
  const sh = sheet_();
  const h = headers_(sh);
  const last = sh.getLastRow();
  if (last < 2) return { headers: h, rows: [] };
  const vals = sh.getRange(2, 1, last - 1, h.length).getValues();
  const rows = vals
    .filter(r => r.slice(1).some(c => c !== '' && c !== null))
    .map(r => Object.fromEntries(h.map((k, i) => [k, fmt_(r[i])])));
  return { headers: h, rows };
}

function toCell_(key, v) {
  if (v === '' || v === null || v === undefined) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
    const [y, m, d] = String(v).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return v;
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(id));
  return i < 0 ? -1 : i + 2;
}

function create_(rec) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet_(); const h = headers_(sh);
    rec[ID_COL] = Utilities.getUuid();
    sh.appendRow(h.map(k => toCell_(k, rec[k])));
    return rec;
  } finally { lock.releaseLock(); }
}

function update_(rec) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet_(); const h = headers_(sh);
    const row = findRow_(sh, rec[ID_COL]);
    if (row < 0) throw new Error('Registro não encontrado');
    sh.getRange(row, 1, 1, h.length).setValues([h.map(k => k === ID_COL ? rec[ID_COL] : toCell_(k, rec[k]))]);
    return rec;
  } finally { lock.releaseLock(); }
}

function remove_(id) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet_();
    const row = findRow_(sh, id);
    if (row < 0) throw new Error('Registro não encontrado');
    sh.deleteRow(row);
    return { id };
  } finally { lock.releaseLock(); }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (!canRead_(p.token)) return json_({ ok: false, error: 'Token inválido' });
    if (p.action === 'ping') return json_({ ok: true, data: { sheet: SHEET_NAME, at: new Date().toISOString() } });
    return json_({ ok: true, data: list_() });
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!canWrite_(body.token)) return json_({ ok: false, error: 'Token sem permissão de gravação' });
    let data;
    switch (body.action) {
      case 'create': data = create_(body.record); break;
      case 'update': data = update_(body.record); break;
      case 'delete': data = remove_(body.id); break;
      default: throw new Error('Ação inválida');
    }
    return json_({ ok: true, data });
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}
