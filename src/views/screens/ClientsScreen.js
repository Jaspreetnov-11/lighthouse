'use client';
// Clients (admin): monthly profit / loss per client = retainer + project fees − staff time cost.
import { Fragment, useCallback, useEffect, useState } from 'react';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useModals } from '@/controllers/useModals';
import { ClientModel } from '@/models';
import { Chip, Empty, Icon, LinkBtn, SectionTitle, Sq } from '@/views/ui';
import { hrs1, inr, monthLabel, shiftMonth, thisMonth } from '@/lib/format';

function Kpi({ label, value, sub, tone }) {
  return <div className={'kpi ' + (tone || '')}><span>{label}</span><b>{value}</b>{sub && <small>{sub}</small>}</div>;
}

export function ClientsScreen() {
  const d = useData();
  const { toast, confirm } = useUi();
  const modals = useModals();
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ revenue: 0, cost: 0, profit: 0, minutes: 0 });
  const [open, setOpen] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await ClientModel.list(month); setRows(r.data || []); setTotals((r.meta && r.meta.totals) || { revenue: 0, cost: 0, profit: 0, minutes: 0 }); }
    catch (err) { toast(err.message); }
    finally { setLoading(false); }
  }, [month, toast]);
  useEffect(() => { load(); }, [load, d.clients, d.projects, d.tasks]);

  const remove = async c => {
    if (!confirm('Remove client "' + c.name + '"?')) return;
    try { await ClientModel.remove(c.id); toast('Client removed.'); await d.reload('clients'); } catch (err) { toast(err.message); }
  };
  const tone = n => (n > 0 ? 'ok' : n < 0 ? 'bad' : '');
  const isCur = month === thisMonth();

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SectionTitle>Clients</SectionTitle>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Sq onClick={() => setMonth(shiftMonth(month, -1))}>‹</Sq>
          <span className="date-btn" style={{ cursor: 'default' }}>{monthLabel(month)}</span>
          <Sq onClick={() => !isCur && setMonth(shiftMonth(month, 1))} style={{ opacity: isCur ? 0.4 : 1 }}>›</Sq>
          <button className="tb-btn solid" style={{ height: 36 }} onClick={() => modals.open('client')}>+ Add client</button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Revenue this month" value={inr(totals.revenue)} sub="retainers + project fees" />
        <Kpi label="Staff cost" value={inr(totals.cost)} sub={hrs1(totals.minutes) + ' on client work'} />
        <Kpi label="Profit / loss" value={(totals.profit < 0 ? '- ' : '') + inr(Math.abs(totals.profit))} sub={totals.revenue > 0 ? Math.round((totals.profit / totals.revenue) * 100) + '% margin' : 'no revenue yet'} tone={tone(totals.profit)} />
        <Kpi label="Clients" value={rows.length} sub={rows.filter(c => c.billing !== 'non-billable').length + ' billable'} />
      </div>

      <div className="panel" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Client</th><th>Billing</th><th>Projects</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Profit</th><th>Margin</th><th></th></tr></thead>
          <tbody>
            {rows.map(c => (
              <Fragment key={c.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => setOpen(open === c.id ? '' : c.id)}>
                  <td><b>{c.name}</b>{c.contact_name && <small style={{ display: 'block', color: 'var(--muted)' }}>{c.contact_name}{c.phone ? ' · ' + c.phone : ''}</small>}</td>
                  <td><Chip tone={c.billing === 'non-billable' ? 'gy' : 'gr'}>{c.billing === 'non-billable' ? 'Non-billable' : 'Billable'}</Chip>{c.retainer > 0 && <small style={{ display: 'block', color: 'var(--muted)' }}>{inr(c.retainer)} / month</small>}</td>
                  <td>{c.project_count}</td>
                  <td style={{ textAlign: 'right' }} className="money">{inr(c.revenue)}</td>
                  <td style={{ textAlign: 'right' }} className="money">{inr(c.cost)}<small style={{ display: 'block', color: 'var(--muted)' }}>{hrs1(c.minutes)}</small></td>
                  <td style={{ textAlign: 'right' }} className={'money ' + (c.profit > 0 ? 'pos' : c.profit < 0 ? 'neg' : '')}>{c.profit < 0 ? '- ' : ''}{inr(Math.abs(c.profit))}</td>
                  <td><Chip tone={c.profit > 0 ? 'gr' : c.profit < 0 ? 'pk' : 'gy'}>{c.revenue > 0 || c.cost > 0 ? c.margin + '%' : '—'}</Chip></td>
                  <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <LinkBtn onClick={() => modals.open('project', null, { client_id: c.id })}>+ Project</LinkBtn>
                      <Sq icon="edit" label="Edit" onClick={() => modals.open('client', c.id)} />
                      <Sq label="Remove" onClick={() => remove(c)} style={{ color: 'var(--danger)' }}>✕</Sq>
                    </span>
                  </td>
                </tr>
                {open === c.id && (
                  <tr>
                    <td colSpan={8} style={{ background: 'var(--ov-03)', padding: '10px 16px 14px' }}>
                      {c.projects.length ? (
                        <table style={{ fontSize: 12.5 }}>
                          <thead><tr><th>Project</th><th>Status</th><th>Start</th><th style={{ textAlign: 'right' }}>Fee</th><th style={{ textAlign: 'right' }}>Hours this month</th><th style={{ textAlign: 'right' }}>Cost</th><th>Who</th></tr></thead>
                          <tbody>{c.projects.map(p => <tr key={p.id}><td><b>{p.name}</b>{!p.billable && <Chip tone="gy" style={{ marginLeft: 6 }}>non-billable</Chip>}</td><td>{p.status}</td><td>{p.start || '—'}</td><td style={{ textAlign: 'right' }}>{p.fee ? inr(p.fee) + (p.feeThisMonth ? '' : ' (earlier)') : '—'}</td><td style={{ textAlign: 'right' }}>{hrs1(p.mins)}<small style={{ color: 'var(--muted)' }}> · {p.tasks} task{p.tasks === 1 ? '' : 's'}</small></td><td style={{ textAlign: 'right' }} className="money">{inr(p.cost)}</td><td><small style={{ color: 'var(--muted)' }}>{p.people.map(x => x.name + ' ' + hrs1(x.mins)).join(', ') || '—'}</small></td></tr>)}</tbody>
                        </table>
                      ) : <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No projects yet. <LinkBtn onClick={() => modals.open('project', null, { client_id: c.id })}>Add the first project</LinkBtn></div>}
                      {c.notes && <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}><Icon name="file" size={12} style={{ verticalAlign: -2, marginRight: 6 }} />{c.notes}</div>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!rows.length && !loading && <Empty ring icon="brief" title="No clients yet">Add a client, then create its projects. Profit is worked out from staff time on those projects.</Empty>}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Cost = time staff spent on the client&apos;s tasks this month × their hourly cost (monthly salary ÷ working days ÷ 8 h). Revenue = monthly retainer + fees of projects that started this month. Click a client to see its projects.</p>
    </div>
  );
}
