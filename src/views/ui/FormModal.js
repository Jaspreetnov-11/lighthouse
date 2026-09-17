'use client';
// Generic form modal driven by UiController.openModal({title, sub, fields, ok, onSubmit}).
// fields: [{name, label, type, options:[{v,l}], optionsFor(values), lockedHint(values), value, required, span, placeholder, min, step, error, help}]
import { useEffect, useState } from 'react';
import { useUi } from '@/controllers/UiController';

const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
const urlOk = v => /^https?:\/\/[^\s]+\.[^\s]+$/i.test(String(v).trim());

export function FormModal() {
  const { modal, closeModal } = useUi();
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!modal) return;
    const v = {};
    (modal.fields || []).forEach(f => { v[f.name] = f.value == null ? '' : f.value; });
    setValues(v); setErrors({}); setBusy(false);
  }, [modal]);

  useEffect(() => {
    if (!modal) return;
    const onKey = e => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal, closeModal]);

  if (!modal) return null;

  const set = (name, val) => {
    setValues(v => {
      const next = { ...v, [name]: val };
      const f = (modal.fields || []).find(x => x.name === name);
      if (f && f.onChange) Object.assign(next, f.onChange(val, next) || {});
      return next;
    });
    setErrors(e => ({ ...e, [name]: '' }));
  };
  const optionsOf = f => (f.optionsFor ? f.optionsFor(values) : (f.options || []));

  const submit = async e => {
    e.preventDefault();
    const errs = {};
    (modal.fields || []).forEach(f => {
      const raw = values[f.name];
      const v = Array.isArray(raw) ? (raw.length ? 'list' : '') : typeof raw === 'object' && raw ? 'file' : String(raw == null ? '' : raw).trim();
      if (f.required && !v) errs[f.name] = f.error || 'This field is required.';
      else if (v && f.type === 'email' && !emailOk(v)) errs[f.name] = 'Enter a valid email.';
      else if (v && f.type === 'url' && !urlOk(v)) errs[f.name] = 'Enter a valid URL.';
      else if (f.validate) { const r = f.validate(v, values); if (r !== true && r) errs[f.name] = r; }
    });
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setBusy(true);
    try {
      const data = {};
      Object.keys(values).forEach(k => { data[k] = typeof values[k] === 'string' ? values[k].trim() : values[k]; });
      await modal.onSubmit(data);
      closeModal();
    } catch (err) {
      setErrors({ _form: err.message || 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scrim open" onClick={e => { if (e.target === e.currentTarget) closeModal(); }} role="presentation">
      <div className="dialog wide" role="dialog" aria-modal="true">
        <div className="dialog-handle" onClick={closeModal} title="Minimise sheet" role="button" tabIndex={0} />
        <div className="dialog-h">
          <h2>{modal.title}</h2>
          <button type="button" className="dialog-close" onClick={closeModal} aria-label="Close modal" title="Close">✕</button>
        </div>
        {modal.sub && <p>{modal.sub}</p>}
        <form onSubmit={submit} noValidate>
          {modal.custom ? modal.custom : (
            <div className="grid2">
              {(modal.fields || []).filter(f => !f.hidden || !f.hidden(values)).map(f => {
                const locked = f.lockedHint ? f.lockedHint(values) : '';
                const opts = optionsOf(f);
                return (
                <div key={f.name} className={'field' + (f.span ? ' span' : '') + (errors[f.name] ? ' invalid' : '')}>
                  <label htmlFor={'m-' + f.name}>{f.label}{!f.required && <span className="opt"> (optional)</span>}</label>
                  <div className="control">
                    {f.type === 'select' ? (
                      <select id={'m-' + f.name} value={values[f.name] ?? ''} disabled={!!locked} onChange={e => set(f.name, e.target.value)}>
                        {f.placeholder && <option value="">{f.placeholder}</option>}
                        {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    ) : f.type === 'textarea' ? (
                      <textarea id={'m-' + f.name} value={values[f.name] ?? ''} placeholder={f.placeholder} onChange={e => set(f.name, e.target.value)} />
                    ) : f.type === 'multiselect' ? (
                      <div>
                        <div className={'ms-box' + (locked ? ' locked' : '')} id={'m-' + f.name}>
                          {locked ? <div className="ms-count">{locked}</div> : opts.map(o => { const sel = Array.isArray(values[f.name]) && values[f.name].includes(o.v); return (
                            <label key={o.v}><input type="checkbox" checked={!!sel} onChange={e => { const cur = Array.isArray(values[f.name]) ? values[f.name] : []; set(f.name, e.target.checked ? [...cur, o.v] : cur.filter(x => x !== o.v)); }} />{o.av && <span className={'avatar ' + o.av}>{o.ini}</span>}{o.l}{o.sub && <small>{o.sub}</small>}</label>
                          ); })}
                          {!locked && !opts.length && <div className="ms-count">Nothing to choose from</div>}
                        </div>
                        {!locked && <div className="ms-count">{(Array.isArray(values[f.name]) ? values[f.name].length : 0)} selected</div>}
                      </div>
                    ) : f.type === 'file' ? (
                      <input id={'m-' + f.name} type="file" accept={f.accept} onChange={e => set(f.name, e.target.files && e.target.files[0] ? e.target.files[0] : '')} />
                    ) : (
                      <input id={'m-' + f.name} type={f.type || 'text'} value={values[f.name] ?? ''} placeholder={f.placeholder} min={f.min} max={f.max} step={f.step} autoComplete="off" onChange={e => set(f.name, e.target.value)} />
                    )}
                  </div>
                  {f.help && !errors[f.name] && <div className="help">{typeof f.help === 'function' ? f.help(values) : f.help}</div>}
                  <div className="error">{errors[f.name]}</div>
                </div>
              ); })}
            </div>
          )}
          {errors._form && <div className="error" style={{ display: 'block' }}>{errors._form}</div>}
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={closeModal}>Cancel</button>
            <button type="submit" className={'btn btn-primary' + (busy ? ' loading' : '')} disabled={busy}><span className="spinner"></span>{modal.ok || 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Toast() {
  const { toastState } = useUi();
  return <div className={'toast' + (toastState.show ? ' show' : '')} role="status" aria-live="polite">{toastState.msg}</div>;
}

export function ConfirmModal() {
  const { confirmDialog, closeConfirm } = useUi();

  useEffect(() => {
    if (!confirmDialog) return;
    const onKey = e => { if (e.key === 'Escape') closeConfirm(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [confirmDialog, closeConfirm]);

  if (!confirmDialog) return null;

  return (
    <div className="scrim open" onClick={e => { if (e.target === e.currentTarget) closeConfirm(false); }} role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" style={{ maxWidth: 460, padding: '24px 26px 22px', textAlign: 'left' }}>
        <div className="dialog-handle" onClick={() => closeConfirm(false)} title="Minimise sheet" role="button" tabIndex={0} />
        <div className="dialog-h">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: confirmDialog.danger ? 'rgba(255, 92, 122, 0.15)' : 'rgba(111, 168, 255, 0.15)',
              border: `1px solid ${confirmDialog.danger ? 'rgba(255, 92, 122, 0.3)' : 'rgba(111, 168, 255, 0.3)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              flexShrink: 0
            }}>
              {confirmDialog.danger ? '⚠️' : 'ℹ️'}
            </div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{confirmDialog.title}</h2>
          </div>
          <button type="button" className="dialog-close" onClick={() => closeConfirm(false)} aria-label="Close dialog" title="Close">✕</button>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--text-soft)', lineHeight: 1.55 }}>
          {confirmDialog.message}
        </p>

        {confirmDialog.sub && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 12,
            color: 'var(--muted)',
            lineHeight: 1.5,
            marginBottom: 16
          }}>
            {confirmDialog.sub}
          </div>
        )}

        <div className="row" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" onClick={() => closeConfirm(false)}>
            {confirmDialog.cancelText || 'Cancel'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={confirmDialog.danger ? { background: 'var(--danger, #FF5C7A)', borderColor: 'var(--danger, #FF5C7A)', color: '#fff' } : {}}
            onClick={() => closeConfirm(true)}
          >
            {confirmDialog.okText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
