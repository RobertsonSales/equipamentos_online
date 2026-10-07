/**
 * API de Patrimônio — Google Apps Script (backend do CRUD)
 * Planilha: aba "Patrimônio aferido" com cabeçalho na linha 1.
 * Uma coluna "ID" é criada automaticamente (coluna A) para identificar cada registro.
 */
const SHEET_NAME = 'Patrimônio aferido';
const ID_COL = 'ID';

function getToken_() {
  return PropertiesService.getScriptProperties().getProperty('API_TOKEN') || '';
}

function spreadsheet_() {
  // Script vinculado à planilha (Extensões › Apps Script): getActive() funciona.
  // Script avulso: defina a propriedade SHEET_ID (ID da planilha) em Propriedades do script.
  const active = SpreadsheetApp.getActive();
  if (active) return active;
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Script avulso: defina a propriedade SHEET_ID com o ID da planilha');
  return SpreadsheetApp.openById(id);
}

function sheet_() {
  const sh = spreadsheet_().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Aba "' + SHEET_NAME + '" não encontrada');
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (headers[0] !== ID_COL) {
    sh.insertColumnBefore(1);
    sh.getRange(1, 1).setValue(ID_COL);
    const n = sh.getLastRow() - 1;
    if (n > 0) sh.getRange(2, 1, n, 1).setValues(Array.from({ length: n }, () => [Utilities.getUuid()]));
  }
  return sh;
}

function headers_(sh) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
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
    .filter(r => r.some(c => c !== '' && c !== null))
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
    if ((e.parameter.token || '') !== getToken_()) return json_({ ok: false, error: 'Token inválido' });
    return json_({ ok: true, data: list_() });
  } catch (err) { return json_({ ok: false, error: String(err.message || err) }); }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if ((body.token || '') !== getToken_()) return json_({ ok: false, error: 'Token inválido' });
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
