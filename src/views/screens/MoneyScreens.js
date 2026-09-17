'use client';
// Payments ledger, Payroll and Reports.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from '@/controllers/DataController';
import { useUi } from '@/controllers/UiController';
import { useModals } from '@/controllers/useModals';
import { PaymentModel, PayrollModel, ReportModel } from '@/models';
import { saveBlob } from '@/lib/download';
import { Avatar, Chip, DateBtn, Empty, Icon, Pills, SectionTitle, Sq } from '@/views/ui';
import { Pager, usePager } from '@/views/ui/Pager';
import { fmtD, inr, monthLabel, PAY_TYPES, round2, shiftMonth, thisMonth } from '@/lib/format';

function MonthNav({ month, setMonth }) {
  return (<><Sq onClick={() => setMonth(shiftMonth(month, -1))}>‹</Sq><span className="date-btn"><Icon name="cal" />{monthLabel(month)}</span><Sq onClick={() => { if (month < thisMonth()) setMonth(shiftMonth(month, 1)); }} style={{ opacity: month >= thisMonth() ? 0.4 : 1 }}>›</Sq></>);
}

export function PaymentsScreen() {
  const d = useData();
  const { toast, confirm } = useUi();
  const modals = useModals();
  const [month, setMonth] = useState(thisMonth());
  const [type, setType] = useState('');
  const [emp, setEmp] = useState('');
  const [rows, setRows] = useState([]);
  const pager = usePager(rows, 20);
  const load = useCallback(async () => { try { const r = await PaymentModel.list({ month, type, empId: emp }); setRows(r.data || []); } catch (err) { toast(err.message); } }, [month, type, emp, toast]);
  useEffect(() => { load(); }, [load, d.employees]);
  const totalPending = d.employees.reduce((a, e) => a + (Number(e.pendingBal) || 0), 0);
  const sum = t => rows.filter(p => p.type === t).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const paidOut = rows.filter(p => p.type !== 'Fine').reduce((a, p) => a + (Number(p.amount) || 0), 0);
  const del = async id => { if (!confirm('Delete this payment?')) return; try { await PaymentModel.remove(id); toast('Payment deleted.'); await Promise.all([load(), d.reload('employees')]); } catch (err) { toast(err.message); } };
  const exportCsv = async () => { try { saveBlob(await ReportModel.download('payments-ledger'), 'payments-all.csv'); } catch (err) { toast(err.message); } };

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><SectionTitle>Payments</SectionTitle><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><MonthNav month={month} setMonth={setMonth} /><DateBtn icon="down" onClick={exportCsv}>Export</DateBtn><button className="tb-btn solid" style={{ height: 34 }} onClick={() => modals.open('payment', null, { after: load })}>+ Add payment</button></div></div>
      <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', gap: 16, flexWrap: 'wrap' }}>
        <div><div style={{ fontWeight: 600, fontSize: 15 }}>Overall Balance</div><div className={'money ' + (totalPending > 0 ? 'neg' : 'pos')} style={{ fontSize: 22, marginTop: 6 }}>{totalPending > 0 ? '- ' : ''}{inr(Math.abs(totalPending))}</div><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Total Pending · {monthLabel(thisMonth())}</div></div>
        <div className="sum" style={{ padding: 0, flex: 1, maxWidth: 640 }}><div><span>Paid out</span><b className="money">{inr(paidOut)}</b></div><div><span>Salary</span><b className="money">{inr(sum('Salary'))}</b></div><div><span>Advances</span><b className="money">{inr(sum('Advance'))}</b></div><div><span>Fines</span><b className="money">{inr(sum('Fine'))}</b></div></div>
      </div>
      <div className="panel">
        <div style={{ display: 'flex', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}><select value={emp} onChange={e => setEmp(e.target.value)} style={{ height: 36, maxWidth: 220, fontSize: 12.5 }}><option value="">All staff</option>{d.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><Pills items={[['', 'All']].concat(PAY_TYPES.map(t => [t, t]))} value={type} onChange={setType} counts={{ '': rows.length }} /></div>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Date</th><th>Staff</th><th>Type</th><th>Note</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead><tbody>
          {pager.items.map(p => <tr key={p.id}><td>{fmtD(p.date)}</td><td style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={p.emp_name} av={p.av} ini={p.ini} />{p.emp_name || d.empName(p.emp)}</td><td><Chip tone={p.type === 'Fine' ? 'pk' : p.type === 'Advance' ? 'or' : 'gr'}>{p.type}</Chip></td><td style={{ color: 'var(--muted)' }}>{p.note || ''}</td><td className="money" style={{ textAlign: 'right', color: p.type === 'Fine' ? 'var(--danger)' : undefined }}>{p.type === 'Fine' ? '+ ' : ''}{inr(p.amount)}</td><td style={{ whiteSpace: 'nowrap' }}><button className="mini-btn" onClick={() => modals.open('payment', p.id, { row: p, after: load })} aria-label="Edit"><Icon name="file" /></button> <button className="mini-btn" onClick={() => del(p.id)} aria-label="Delete">✕</button></td></tr>)}
        </tbody></table>{!rows.length && <Empty>No payments in this period</Empty>}</div>
        <Pager pager={pager} />
      </div>
    </div>
  );
}

export function PayrollScreen() {
  const d = useData();
  const { toast, confirm } = useUi();
  const modals = useModals();
  const [month, setMonth] = useState(thisMonth());
  const [pr, setPr] = useState(null);
  const load = useCallback(async () => { try { setPr(await PayrollModel.get(month)); } catch (err) { toast(err.message); } }, [month, toast]);
  useEffect(() => { load(); }, [load, d.employees]);
  const rows = useMemo(() => (pr && pr.rows) || [], [pr]);
  const pager = usePager(rows, 20);
  const s = (pr && pr.summary) || { staffCount: 0, totalSalary: 0, totalEarned: 0, totalPaid: 0, totalPending: 0 };
  const payAll = async () => { const due = rows.filter(r => r.pending > 0); if (!due.length) { toast('Nothing pending.'); return; } if (!confirm('Record salary payments for ' + due.length + ' staff totalling ' + inr(s.totalPending) + '?')) return; try { const r = await PayrollModel.payAll(month); toast('Payroll recorded for ' + r.count + ' staff.'); await Promise.all([load(), d.reload('employees', 'activity')]); } catch (err) { toast(err.message); } };
  const exportCsv = async () => { try { saveBlob(await ReportModel.download('payroll-summary', { month }), 'payroll-' + month + '.csv'); } catch (err) { toast(err.message); } };

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div><SectionTitle>Payroll</SectionTitle><p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>Earned = salary ÷ {pr ? pr.workdaysTotal : '–'} working days × (present + ½ half-day + leave) ± overtime/fine hours. {pr ? pr.workdaysElapsed : '–'} of {pr ? pr.workdaysTotal : '–'} days elapsed.</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><MonthNav month={month} setMonth={setMonth} /><DateBtn icon="down" onClick={exportCsv}>Export</DateBtn><button className="tb-btn solid" style={{ height: 34 }} onClick={payAll}>Pay all pending</button></div>
      </div>
      <div className="sum panel"><div><span>Staff</span><b>{s.staffCount}</b></div><div><span>Monthly salary</span><b className="money">{inr(s.totalSalary)}</b></div><div><span>Earned so far</span><b className="money">{inr(s.totalEarned)}</b></div><div><span>Paid</span><b className="money pos">{inr(s.totalPaid)}</b></div><div><span>Pending</span><b className={'money' + (s.totalPending > 0 ? ' neg' : '')}>{inr(s.totalPending)}</b></div></div>
      <div className="panel" style={{ overflowX: 'auto' }}><table><thead><tr><th>Staff</th><th>Salary</th><th>P</th><th>HD</th><th>A</th><th>L</th><th>OT h</th><th>Fine h</th><th style={{ textAlign: 'right' }}>Earned</th><th style={{ textAlign: 'right' }}>Paid</th><th style={{ textAlign: 'right' }}>Pending</th><th></th></tr></thead><tbody>
        {pager.items.map(r => <tr key={r.employee.id}><td style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={r.employee.name} av={r.employee.av} ini={r.employee.ini} /><div><div style={{ fontWeight: 500 }}>{r.employee.name}</div><small style={{ color: 'var(--muted)' }}>{r.employee.empId || ''} · {r.employee.dept || ''}</small></div></td><td className="money">{inr(r.employee.salary)}</td><td>{r.stats.present}</td><td>{r.stats.half}</td><td style={{ color: r.stats.absent ? 'var(--danger)' : undefined }}>{r.stats.absent}</td><td>{r.stats.leave}</td><td>{round2(r.stats.otHours)}</td><td>{round2(r.stats.fineHours)}</td><td className="money" style={{ textAlign: 'right' }}>{inr(r.earned)}</td><td className="money pos" style={{ textAlign: 'right' }}>{inr(r.paid)}</td><td className={'money ' + (r.pending > 0 ? 'neg' : r.pending < 0 ? 'pos' : '')} style={{ textAlign: 'right' }}>{inr(r.pending)}</td><td style={{ whiteSpace: 'nowrap' }}>{r.pending > 0 ? <DateBtn icon={null} style={{ height: 30 }} onClick={() => modals.open('payment', null, { emp: r.employee.id, amount: Math.round(r.pending), type: 'Salary', after: load })}>Pay {inr(r.pending)}</DateBtn> : <Chip tone="gr">Settled</Chip>}</td></tr>)}
      </tbody></table>{!rows.length && <Empty>{pr ? 'Add staff to run payroll' : 'Loading payroll…'}</Empty>}<Pager pager={pager} /></div>
    </div>
  );
}

export function ReportsScreen() {
  const { toast } = useUi();
  const m = thisMonth();
  const cards = [
    ['Attendance register', monthLabel(m) + ' · day-wise status for every staff', 'cal', 'attendance-register', { month: m }, 'attendance-register-' + m + '.csv'],
    ['Staff performance', monthLabel(m) + ' · avg working hours, hours vs expected, OT, late days, tasks delivered', 'chart', 'staff-performance', { month: m }, 'staff-performance-' + m + '.csv'],
    ['Payroll summary', monthLabel(m) + ' · earned, paid and pending per staff', 'file', 'payroll-summary', { month: m }, 'payroll-' + m + '.csv'],
    ['Payments ledger', 'All payments ever recorded', 'file', 'payments-ledger', undefined, 'payments-all.csv'],
    ['Staff directory', 'Contact, role, department and salary', 'users', 'staff-directory', undefined, 'staff.csv'],
    ['Tasks export', 'Every task with status and time spent', 'check', 'tasks', undefined, 'tasks.csv'],
    ['Project hours', 'Allocated vs consumed per project', 'brief', 'projects', undefined, 'projects.csv']
  ];
  const dl = async c => { try { saveBlob(await ReportModel.download(c[3], c[4]), c[5]); toast('Downloaded ' + c[5]); } catch (err) { toast(err.message); } };
  return (
    <div className="content">
      <SectionTitle>Reports</SectionTitle>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        {cards.map(c => <div className="panel" key={c[3]} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}><span className="ic pu" style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center' }}><Icon name={c[2]} size={18} /></span><b style={{ fontSize: 15 }}>{c[0]}</b><span style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1 }}>{c[1]}</span><DateBtn icon="down" style={{ alignSelf: 'flex-start' }} onClick={() => dl(c)}>Download CSV</DateBtn></div>)}
      </div>
    </div>
  );
}
