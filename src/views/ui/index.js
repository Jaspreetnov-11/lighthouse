'use client';
// Reusable UI building blocks (View layer). Class names come from globals.css.
import Link from 'next/link';
import { Icon } from './Icons';
import { avFor, ini as initials, STATUS_CHIP, STATUS_LABEL } from '@/lib/format';

export { Icon };

export function Avatar({ e, name, av, ini, cls = 'sm' }) {
  const n = name || (e && e.name) || '';
  const a = av || (e && e.av) || avFor(n);
  const i = ini || (e && e.ini) || initials(n);
  if (!n && !e) return <span className={'avatar ' + cls + ' gy'}>?</span>;
  return <span className={'avatar ' + cls + ' ' + a}>{i}</span>;
}

export function Chip({ tone = 'gy', children, style }) {
  return <span className={'chip ' + tone} style={style}>{children}</span>;
}

export function Panel({ title, right, children, className, style, bodyStyle, noBody }) {
  return (
    <div className={'panel ' + (className || '')} style={style}>
      {title !== undefined && <div className="panel-h">{title}{right}</div>}
      {noBody ? children : <div className="panel-b" style={bodyStyle}>{children}</div>}
    </div>
  );
}

export function SectionTitle({ children }) {
  return <h2 className="sec-title">{children} <span className="i">i</span></h2>;
}

export function Stat({ icon, tone = 'pu', value, label, onClick, valueClass }) {
  return (
    <div className={'panel stat' + (onClick ? ' click' : '')} onClick={onClick}>
      <span className={'ic ' + tone}><Icon name={icon} /></span>
      <div><b className={valueClass}>{value}</b><span>{label}</span></div>
    </div>
  );
}

export function Empty({ icon = 'circle-check', title, children, ring }) {
  return (
    <div className="empty">
      {ring ? <span className="ring"><Icon name={icon} /></span> : <Icon name={icon} size={28} style={{ color: 'var(--dim)' }} />}
      {title && <b>{title}</b>}{children}
    </div>
  );
}

export function Donut({ parts, center, size = 120 }) {
  const sw = size * 0.12, r = (size - sw) / 2, C = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + p[1], 0) || 1;
  let off = 0;
  const segs = parts.some(p => p[1] > 0)
    ? parts.map(([col, val], i) => { const len = (C * val) / total; const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={sw} strokeDasharray={len + ' ' + (C - len)} strokeDashoffset={-off} />; off += len; return el; })
    : <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A2A30" strokeWidth={sw} />;
  const [big, small] = String(center || '|').split('|');
  return (
    <div className="donut">
      <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size}>{segs}</svg>
      <div className="c"><b style={{ fontSize: size * 0.18 }}>{big}</b><span>{small || ''}</span></div>
    </div>
  );
}

export function Legend({ items, style }) {
  return <div className="legend" style={style}>{items.map(([col, label, val], i) => <span key={i}><i style={{ background: col }}></i>{label}{val !== undefined && <b style={{ marginLeft: 10 }}>{val}</b>}</span>)}</div>;
}

export function StatusBars({ tasks }) {
  const n = s => tasks.filter(t => t.status === s).length, tot = tasks.length || 1;
  const rows = [['Completed', 'completed', '#4ADE95'], ['Pending Approval', 'approval', '#B48CFF'], ['In Progress', 'progress', '#FFB84D'], ['In Pipeline', 'pipeline', '#6FA8FF'], ['Changes', 'changes', '#FF7AB3']];
  return <div className="bars">{rows.map(([l, s, c]) => <div className="bar-row" key={s}><div className="l"><span>{l}</span><span>{n(s)}</span></div><div className="t"><div className="f" style={{ width: Math.round((n(s) / tot) * 100) + '%', background: c }}></div></div></div>)}</div>;
}

export function Pills({ items, value, onChange, counts }) {
  return (
    <div className="pill-tabs">
      {items.map(([k, l]) => <button key={k} type="button" className={'pill' + (value === k ? ' on' : '')} onClick={() => onChange(k)}>{l} {counts && counts[k] !== undefined && <span className="n">{counts[k]}</span>}</button>)}
    </div>
  );
}

export function Tabs({ items, value, onChange, className, style }) {
  return <div className={'tabs ' + (className || '')} style={style}>{items.map(([k, l]) => <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export function Seg({ items, value, onChange }) {
  return <div className="seg">{items.map(([k, l]) => <button key={k} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export function DateBtn({ children, onClick, icon = 'cal', style, disabled, title }) {
  return <button type="button" className="date-btn" onClick={onClick} style={style} disabled={disabled} title={title}>{icon && <Icon name={icon} />}{children}</button>;
}

export function Sq({ icon, onClick, label, on, style, children }) {
  return <button type="button" className={'sq' + (on ? ' on' : '')} onClick={onClick} aria-label={label} style={style}>{icon ? <Icon name={icon} /> : children}</button>;
}

export function LinkBtn({ children, onClick, href, style }) {
  if (href) return <Link href={href} className="link-btn" style={style}>{children}</Link>;
  return <button type="button" className="link-btn" onClick={onClick} style={style}>{children}</button>;
}

export function Search({ value, onChange, placeholder, style }) {
  return (
    <div className="search" style={style}>
      <Icon name="search" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Search'}
        style={{ paddingLeft: 42 }}
      />
    </div>
  );
}

export function TaskChip({ status }) {
  const cls = STATUS_CHIP[status] || 'gy';
  return <Chip tone={cls}>{STATUS_LABEL[status] || status}</Chip>;
}

export function GeoLink({ lat, lng, addr, acc }) {
  if (!lat) return null;
  return <a className="geo-link" target="_blank" rel="noopener noreferrer" href={'https://maps.google.com/?q=' + lat + ',' + lng}>📍 {addr || ('±' + Math.round(acc || 0) + ' m')}</a>;
}

export { DeductLeaveModal } from './DeductLeaveModal';
export { ReassignTaskModal } from './ReassignTaskModal';


