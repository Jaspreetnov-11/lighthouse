'use client';
// Events: upcoming birthdays, work anniversaries and holidays (admins add / remove holidays).
import { useMemo } from 'react';
import { useAuth } from '@/controllers/AuthController';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useModals } from '@/controllers/useModals';
import { HolidayModel } from '@/models';
import { Avatar, Chip, Empty, Icon, SectionTitle } from '@/views/ui';
import { daysUntil, fmtDY, nextOccurrence, todayISO, whenLabel } from '@/lib/format';

const WINDOW_DAYS = 90;

export function EventsScreen() {
  const d = useData();
  const { isAdmin } = useAuth();
  const { toast, confirm } = useUi();
  const modals = useModals();
  const year = new Date().getFullYear();
  const today = todayISO();

  const bdays = useMemo(() => d.employees.filter(e => e.dob).map(e => ({ e, d: nextOccurrence(String(e.dob).slice(5, 10)) })).filter(x => daysUntil(x.d) <= WINDOW_DAYS).sort((a, b) => a.d - b.d), [d.employees]);
  const anniv = useMemo(() => d.employees.filter(e => e.joined && String(e.joined).slice(0, 4) !== String(year)).map(e => ({ e, d: nextOccurrence(String(e.joined).slice(5, 10)), years: year - Number(String(e.joined).slice(0, 4)) })).filter(x => daysUntil(x.d) <= WINDOW_DAYS).sort((a, b) => a.d - b.d), [d.employees, year]);
  const hols = useMemo(() => d.holidays.filter(h => h.date >= today).sort((a, b) => a.date.localeCompare(b.date)), [d.holidays, today]);

  const delHoliday = async h => {
    const ok = await confirm({
      title: 'Remove Holiday',
      message: `Remove holiday "${h.name}"?`,
      sub: 'This action cannot be undone.',
      okText: 'Remove',
      cancelText: 'Cancel',
      danger: true
    });
    if (!ok) return;
    try { await HolidayModel.remove(h.id); await d.reload('holidays'); toast('Holiday removed.'); } catch (err) { toast(err.message); }
  };

  const Row = ({ av, title, sub, when, tone, right }) => (
    <div className="row" style={{ alignItems: 'center' }}>
      {av}
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 500 }}>{title}</div>{sub && <small style={{ color: 'var(--muted)' }}>{sub}</small>}</div>
      <Chip tone={tone}>{when}</Chip>
      {right}
    </div>
  );

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SectionTitle>Events</SectionTitle>
        {isAdmin && <button className="tb-btn solid" style={{ height: 34 }} onClick={() => modals.open('holiday')}>+ Add holiday</button>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <div className="panel"><div className="panel-h"><span><Icon name="leaf" size={14} style={{ verticalAlign: -2, marginRight: 8 }} />Birthdays</span><Chip tone="pk">{bdays.length}</Chip></div>
          <div className="panel-b list" style={{ paddingTop: 4 }}>
            {bdays.map(x => <Row key={x.e.id} av={<Avatar e={x.e} />} title={x.e.name} sub={x.e.role || x.e.dept} when={whenLabel(x.d)} tone={daysUntil(x.d) <= 7 ? 'pk' : 'gy'} />)}
            {!bdays.length && <Empty>No birthdays in the next {WINDOW_DAYS} days</Empty>}
          </div>
        </div>
        <div className="panel"><div className="panel-h"><span><Icon name="flag" size={14} style={{ verticalAlign: -2, marginRight: 8 }} />Work anniversaries</span><Chip tone="pu">{anniv.length}</Chip></div>
          <div className="panel-b list" style={{ paddingTop: 4 }}>
            {anniv.map(x => <Row key={x.e.id} av={<Avatar e={x.e} />} title={x.e.name} sub={x.years + (x.years === 1 ? ' year' : ' years') + ' · joined ' + fmtDY(x.e.joined)} when={whenLabel(x.d)} tone={daysUntil(x.d) <= 7 ? 'pu' : 'gy'} />)}
            {!anniv.length && <Empty>No anniversaries in the next {WINDOW_DAYS} days</Empty>}
          </div>
        </div>
        <div className="panel"><div className="panel-h"><span><Icon name="cal" size={14} style={{ verticalAlign: -2, marginRight: 8 }} />Holidays</span><Chip tone="or">{hols.length}</Chip></div>
          <div className="panel-b list" style={{ paddingTop: 4 }}>
            {hols.map(h => <Row key={h.id} av={<span className="ic or" style={{ width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center' }}><Icon name="cal" size={13} /></span>} title={h.name} sub={fmtDY(h.date)} when={whenLabel(new Date(h.date + 'T00:00:00'))} tone="or" right={isAdmin ? <button className="mini-btn" onClick={() => delHoliday(h)} aria-label="Remove">✕</button> : null} />)}
            {!hols.length && <Empty>No upcoming holidays{isAdmin ? ' — add one above' : ''}</Empty>}
          </div>
        </div>
      </div>
    </div>
  );
}
