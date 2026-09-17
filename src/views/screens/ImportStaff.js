'use client';
// Staff -> Import from Excel: pick the filled template, check every row, then import.
import { useState } from 'react';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { EmployeeModel } from '@/models';
import { Chip } from '@/views/ui';

const COLS = ['name', 'email', 'password', 'phone', 'designation', 'department', 'shift', 'access', 'salary', 'joined', 'dob', 'reporting_manager'];
const ALIAS = { 'full name': 'name', 'email (login)': 'email', role: 'designation', dept: 'department', 'monthly salary': 'salary', 'monthly salary (₹)': 'salary', 'joining date': 'joined', 'date of birth': 'dob', manager: 'reporting_manager', 'reporting manager': 'reporting_manager' };
const norm = h => { const k = String(h || '').trim().toLowerCase(); return COLS.includes(k) ? k : (ALIAS[k] || k); };
const excelDate = v => { if (v instanceof Date) { const p = n => String(n).padStart(2, '0'); return v.getFullYear() + '-' + p(v.getMonth() + 1) + '-' + p(v.getDate()); } return v; };

async function parseFile(file) {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets['Staff'] || wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  if (!grid.length) return [];
  const headers = grid[0].map(norm);
  const rows = [];
  grid.slice(1).forEach((r, i) => {
    if (!r.some(v => String(v).trim() !== '')) return;
    const o = { _row: i + 2 };
    headers.forEach((h, j) => { if (h) o[h] = excelDate(r[j]); });
    rows.push(o);
  });
  return rows;
}

export function ImportStaff({ onClose }) {
  const d = useData();
  const { toast } = useUi();
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState(null);
  const [phase, setPhase] = useState('pick'); // pick | checked | done
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');

  const pick = async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true); setFileName(file.name);
    try {
      const parsed = await parseFile(file);
      if (!parsed.length) { toast('No rows found in the Staff sheet.'); setBusy(false); return; }
      setRows(parsed);
      const r = await EmployeeModel.import(parsed, true);
      setReport(r); setPhase('checked');
    } catch (err) { toast(err.message); }
    finally { setBusy(false); }
  };
  const run = async () => {
    setBusy(true);
    try { const r = await EmployeeModel.import(rows, false); setReport(r); setPhase('done'); await d.reload('employees', 'departments', 'activity'); toast(r.summary.added + ' staff added.'); }
    catch (err) { toast(err.message); }
    finally { setBusy(false); }
  };
  const tone = s => ({ ok: 'gr', added: 'gr', skipped: 'gy', error: 'pk' }[s] || 'gy');
  const s = report ? report.summary : null;

  return (
    <div className="scrim open" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }} role="presentation">
      <div className="dialog wide" role="dialog" aria-modal="true" style={{ maxWidth: 820 }}>
        <div className="dialog-handle" onClick={onClose} title="Minimise sheet" role="button" tabIndex={0} />
        <div className="dialog-h">
          <h2 style={{ margin: 0 }}>Import staff from Excel</h2>
          <button type="button" className="dialog-close" onClick={onClose} disabled={busy} aria-label="Close modal" title="Close">✕</button>
        </div>
        <p>Use the template (Staff sheet, row 1 = column names). Logins are created for new emails; existing Limelight logins are linked. Departments that do not exist are created.</p>
        {phase === 'pick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={pick} disabled={busy} />
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Need the template? <a href="/templates/staff-import-template.xlsx" className="link">Download staff-import-template.xlsx</a></div>
          </div>
        )}
        {report && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }}>
              <b>{fileName}</b> · {rows.length} rows
              {phase === 'checked' && <><Chip tone="gr">{s.ok} ready</Chip>{s.skipped > 0 && <Chip tone="gy">{s.skipped} already exist</Chip>}{s.error > 0 && <Chip tone="pk">{s.error} with problems</Chip>}</>}
              {phase === 'done' && <><Chip tone="gr">{s.added} added</Chip>{s.skipped > 0 && <Chip tone="gy">{s.skipped} skipped</Chip>}{s.error > 0 && <Chip tone="pk">{s.error} failed</Chip>}</>}
            </div>
            <div style={{ maxHeight: '48vh', overflow: 'auto', border: '1px solid var(--line)', borderRadius: 14 }}>
              <table style={{ fontSize: 12.5 }}>
                <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Result</th></tr></thead>
                <tbody>{report.rows.map(r => <tr key={r.line}><td>{r.line}</td><td>{r.name || '—'}</td><td>{r.email || '—'}</td><td><Chip tone={tone(r.status)}>{r.status}</Chip> <span style={{ color: r.status === 'error' ? 'var(--danger)' : 'var(--muted)' }}>{r.message}</span></td></tr>)}</tbody>
              </table>
            </div>
            {phase === 'checked' && s.error > 0 && <div style={{ fontSize: 12.5, color: 'var(--warn)' }}>Rows with problems are skipped. Fix them in the file and import again, or continue with the rest.</div>}
          </div>
        )}
        <div className="row" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{phase === 'done' ? 'Close' : 'Cancel'}</button>
          {phase === 'checked' && <button type="button" className={'btn btn-primary' + (busy ? ' loading' : '')} onClick={run} disabled={busy || !s.ok}><span className="spinner"></span>Import {s.ok} staff</button>}
          {phase === 'pick' && busy && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Checking rows…</span>}
        </div>
      </div>
    </div>
  );
}
