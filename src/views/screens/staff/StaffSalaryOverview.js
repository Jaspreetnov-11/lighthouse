'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/controllers/AuthController';
import { useUi } from '@/controllers/UiController';
import { useData } from '@/controllers/DataController';
import { SalarySlipModel, PaymentModel } from '@/models';
import { Chip } from '@/views/ui';
import { Icon } from '@/views/ui/Icons';
import { inr, fmtD } from '@/lib/format';

function formatMonthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function getPreviousMonthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  const prev = new Date(y, m - 2, 1);
  return prev.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function getMonthDateRange(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const fDay = String(first.getDate()).padStart(2, '0');
  const lDay = String(last.getDate()).padStart(2, '0');
  const mName = first.toLocaleDateString('en-GB', { month: 'long' });
  return `${fDay} ${mName} ${y} - ${lDay} ${mName} ${y}`;
}

export function StaffSalaryOverview({ employee, onNavigateToStructure }) {
  const { isAdmin } = useAuth();
  const { toast, confirm } = useUi();
  const d = useData();

  // Financial years list
  const currentYear = new Date().getFullYear();
  const fyList = [
    `FY ${currentYear}-${currentYear + 1}`,
    `FY ${currentYear - 1}-${currentYear}`,
    `FY ${currentYear - 2}-${currentYear - 1}`
  ];

  const [selectedFY, setSelectedFY] = useState(fyList[0]);
  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState({});
  const [showAddMonthModal, setShowAddMonthModal] = useState(false);
  const [selectedAddMonth, setSelectedAddMonth] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showVariablesModal, setShowVariablesModal] = useState(null); // slip object
  const [showActionsMenu, setShowActionsMenu] = useState(false);

  const fetchSlips = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);
    try {
      const fyRaw = selectedFY.replace('FY ', '');
      const res = await SalarySlipModel.list(employee.id, fyRaw);
      const dataObj = res?.data || res;
      const list = dataObj?.slips || (Array.isArray(dataObj) ? dataObj : []);
      setSlips(list);
      // Auto-expand latest month by default if not set
      if (list.length > 0) {
        setExpandedMonths(prev => {
          if (Object.keys(prev).length === 0) {
            return { [list[0].month]: true };
          }
          return prev;
        });
      }
    } catch (err) {
      toast(err.message || 'Failed to fetch salary slips');
    } finally {
      setLoading(false);
    }
  }, [employee?.id, selectedFY, toast]);

  useEffect(() => {
    fetchSlips();
  }, [fetchSlips]);

  const toggleMonth = (month) => {
    setExpandedMonths(prev => ({ ...prev, [month]: !prev[month] }));
  };

  const handleExportCSV = () => {
    if (!slips.length) {
      toast('No salary records to export');
      return;
    }
    const headers = ['Month', 'Employee', 'Emp ID', 'Gross Earnings', 'Total Deductions', 'Net Payable', 'Paid Amount', 'Due Amount', 'Payable Days', 'Status'];
    const rows = slips.map(s => [
      formatMonthLabel(s.month),
      `"${employee.name}"`,
      employee.emp_id || '',
      s.gross_earnings || 0,
      s.total_deductions || 0,
      s.net_payable || 0,
      s.paid_amount || 0,
      s.due_amount || 0,
      s.payable_days || 0,
      s.status || 'pending'
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Salary_Overview_${employee.name.replace(/\s+/g, '_')}_${selectedFY.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Salary records exported to CSV.');
    setShowActionsMenu(false);
  };

  const handleGenerateSlip = async (monthToGen) => {
    if (!isAdmin) {
      toast('Only administrators can generate salary slips.');
      return;
    }
    const curMonth = new Date().toISOString().slice(0, 7);
    const targetMonth = monthToGen || (slips.length > 0 ? slips[0].month : curMonth);
    if (!targetMonth) {
      toast('No month available to generate slip.');
      return;
    }
    setGenerating(true);
    try {
      await SalarySlipModel.generate({
        emp: employee.id,
        month: targetMonth
      });
      toast(`Salary slip for ${formatMonthLabel(targetMonth)} generated successfully.`);
      await fetchSlips();
      setShowAddMonthModal(false);
    } catch (err) {
      toast(err.message || 'Failed to generate salary slip');
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkAsPaid = async (slip) => {
    if (!isAdmin) return;
    const ok = await confirm({
      title: 'Mark Salary Slip as Paid',
      message: `Record full payment settlement for ${formatMonthLabel(slip.month)}?`,
      sub: `Due amount of ${inr(slip.due_amount)} will be recorded in the payments ledger.`,
      okText: 'Confirm & Settle',
      cancelText: 'Cancel'
    });
    if (!ok) return;

    try {
      await PaymentModel.create({
        emp: employee.id,
        date: new Date().toISOString().slice(0, 10),
        amount: slip.due_amount,
        type: 'Salary',
        note: `Salary settlement for ${formatMonthLabel(slip.month)}`
      });
      await SalarySlipModel.update(slip.id, {
        status: 'paid',
        paid_amount: slip.net_payable,
        due_amount: 0
      });
      toast(`Salary for ${formatMonthLabel(slip.month)} marked as Paid.`);
      await d.reload('payments');
      await fetchSlips();
    } catch (err) {
      toast(err.message || 'Failed to settle salary');
    }
  };

  const handlePrintSlip = (slip) => {
    const printWin = window.open('', '_blank');
    if (!printWin) {
      toast('Pop-up blocked. Please allow pop-ups to print slip.');
      return;
    }
    const earningsRows = (slip.earnings_breakdown || []).map(e => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">${e.name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right;">${inr(e.amount)}</td>
      </tr>
    `).join('');

    const deductionsRows = (slip.deductions_breakdown || []).map(dItem => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">${dItem.name}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right;">${inr(dItem.amount)}</td>
      </tr>
    `).join('');

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Salary Slip - ${employee.name} - ${slip.month}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #111; max-width: 800px; margin: auto; }
          .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
          .title { font-size: 22px; font-weight: bold; }
          .subtitle { font-size: 14px; color: #555; }
          .emp-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 24px; font-size: 13px; }
          .tables { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #f2f2f2; padding: 10px 12px; text-align: left; }
          .totals { background: #fafafa; border: 1px solid #ddd; padding: 16px; border-radius: 6px; margin-top: 20px; font-size: 14px; }
          .tot-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
          .tot-row.bold { font-weight: bold; font-size: 16px; border-top: 1px solid #ccc; padding-top: 8px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">LIMELIGHT STUDIO</div>
          <div class="subtitle">Salary Slip for ${formatMonthLabel(slip.month)}</div>
        </div>
        <div class="emp-info">
          <div><b>Employee:</b> ${employee.name}</div>
          <div><b>Employee ID:</b> ${employee.emp_id || '—'}</div>
          <div><b>Designation:</b> ${employee.role || '—'}</div>
          <div><b>Department:</b> ${employee.dept || '—'}</div>
          <div><b>Payable Days:</b> ${slip.payable_days}</div>
          <div><b>Payment Status:</b> ${slip.status.toUpperCase()}</div>
        </div>
        <div class="tables">
          <div>
            <table>
              <thead><tr><th>EARNINGS</th><th style="text-align: right;">AMOUNT</th></tr></thead>
              <tbody>
                ${earningsRows}
                <tr style="font-weight: bold; background: #f8f8f8;">
                  <td style="padding: 10px 12px;">Gross Earnings</td>
                  <td style="padding: 10px 12px; text-align: right;">${inr(slip.gross_earnings)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <table>
              <thead><tr><th>DEDUCTIONS</th><th style="text-align: right;">AMOUNT</th></tr></thead>
              <tbody>
                ${deductionsRows}
                <tr style="font-weight: bold; background: #f8f8f8;">
                  <td style="padding: 10px 12px;">Total Deductions</td>
                  <td style="padding: 10px 12px; text-align: right;">${inr(slip.total_deductions)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="totals">
          <div class="tot-row"><span>Gross Earnings:</span><span>${inr(slip.gross_earnings)}</span></div>
          <div class="tot-row"><span>Total Deductions:</span><span>${inr(slip.total_deductions)}</span></div>
          <div class="tot-row"><span>Advance Deducted:</span><span>${inr(slip.advance_payments)}</span></div>
          <div class="tot-row bold"><span>Net Payable Amount:</span><span>${inr(slip.net_payable)}</span></div>
          <div class="tot-row" style="margin-top: 8px; color: ${slip.due_amount > 0 ? '#b91c1c' : '#15803d'}; font-weight: bold;">
            <span>Due Amount:</span><span>${inr(slip.due_amount)}</span>
          </div>
        </div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `);
    printWin.document.close();
  };

  return (
    <div className="salary-overview-screen" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Controls Bar (Snapshot 2) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        padding: '14px 18px',
        background: 'var(--panel)',
        borderRadius: 'var(--radius-field, 14px)',
        border: '1px solid var(--line-soft)'
      }}>
        {/* Left: FY Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>Period:</span>
          <select
            value={selectedFY}
            onChange={(e) => setSelectedFY(e.target.value)}
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--line)',
              color: 'var(--text)',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 13.5,
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {fyList.map(fy => (
              <option key={fy} value={fy}>{fy}</option>
            ))}
          </select>
        </div>

        {/* Right: Actions, Add Previous Month, Generate Salary Slip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', position: 'relative' }}>
          {isAdmin && (
            <>
              <button
                type="button"
                className="tb-btn"
                onClick={() => setShowAddMonthModal(true)}
                style={{ height: 36, padding: '0 14px', fontSize: 13, gap: 6, display: 'inline-flex', alignItems: 'center' }}
              >
                <span>+</span> Add Previous Month
              </button>

              <button
                type="button"
                className="tb-btn solid"
                disabled={generating}
                onClick={() => handleGenerateSlip(slips[0]?.month)}
                style={{ height: 36, padding: '0 16px', fontSize: 13, gap: 6, display: 'inline-flex', alignItems: 'center' }}
              >
                <Icon name="file" size={14} />
                {generating ? 'Generating...' : 'Generate Salary Slip'}
              </button>
            </>
          )}

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="tb-btn"
              onClick={() => setShowActionsMenu(prev => !prev)}
              title="More actions"
              style={{ height: 36, padding: '0 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="download" size={14} />
              Actions ▾
            </button>

            {showActionsMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  marginTop: 6,
                  background: 'var(--panel)',
                  border: '1px solid var(--line-soft)',
                  borderRadius: 10,
                  padding: '6px',
                  minWidth: 200,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
                  zIndex: 30,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowActionsMenu(false);
                    if (slips.length > 0) handlePrintSlip(slips[0]);
                    else toast('No slips to print');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: 'var(--text)',
                    background: 'none',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--field)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  <Icon name="file" size={14} />
                  Print Latest Slip
                </button>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: 'var(--text)',
                    background: 'none',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--field)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  <Icon name="download" size={14} />
                  Export CSV ({selectedFY})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowActionsMenu(false);
                    fetchSlips();
                    toast('Reloaded salary slips');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: 'var(--text)',
                    background: 'none',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--field)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  <Icon name="cal" size={14} />
                  Refresh All Months
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Monthly Salary Cards List (Snapshot 3) */}
      {loading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
          Loading salary overview...
        </div>
      ) : slips.length === 0 ? (
        <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
          <Icon name="cal" size={36} style={{ color: 'var(--dim)', marginBottom: 12 }} />
          <h4 style={{ margin: '0 0 6px', fontSize: 16 }}>No Salary Records Found</h4>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            No salary records exist for {selectedFY}. Click &quot;Add Previous Month&quot; or &quot;Generate Salary Slip&quot; to calculate.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {slips.map((slip) => {
            const isOpen = Boolean(expandedMonths[slip.month]);
            const isPaid = slip.status === 'paid' || (Number(slip.due_amount) === 0 && Number(slip.paid_amount) > 0 && Number(slip.net_payable) > 0);
            const isPartiallyPaid = !isPaid && Number(slip.paid_amount) > 0;
            const statusText = isPaid ? 'Paid' : isPartiallyPaid ? 'Partially Paid' : 'Pending';
            const statusDotColor = isPaid ? '#4ADE95' : isPartiallyPaid ? '#FFB84D' : '#F59E0B';
            const statusBg = isPaid ? 'rgba(74,222,149,0.12)' : isPartiallyPaid ? 'rgba(255,184,77,0.12)' : 'rgba(245,158,11,0.12)';
            const statusBorder = isPaid ? 'rgba(74,222,149,0.28)' : isPartiallyPaid ? 'rgba(255,184,77,0.28)' : 'rgba(245,158,11,0.28)';
            const prevMonthLabel = getPreviousMonthLabel(slip.month);

            return (
              <div
                key={slip.month}
                className="panel"
                style={{
                  borderRadius: 'var(--radius-card, 18px)',
                  overflow: 'hidden',
                  border: '1px solid var(--line-soft)',
                  background: 'var(--card-2, rgba(20,20,23,0.85))'
                }}
              >
                {/* Card Header (Matching Reference Image) */}
                <div
                  onClick={() => toggleMonth(slip.month)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '18px 24px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background 0.2s',
                    flexWrap: 'wrap',
                    gap: 16
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Left: Blue Icon Badge + Month + Pill + Subtitle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: 'rgba(79, 139, 255, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#4F8BFF',
                      flexShrink: 0
                    }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2.5" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                        <circle cx="7" cy="15" r="1.2" fill="currentColor" />
                        <circle cx="17" cy="15" r="1.2" fill="currentColor" />
                      </svg>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
                          {formatMonthLabel(slip.month)}
                        </span>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2.5px 10px',
                          borderRadius: 100,
                          fontSize: 12,
                          fontWeight: 600,
                          background: statusBg,
                          color: statusDotColor,
                          border: `1px solid ${statusBorder}`
                        }}>
                          <span style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: statusDotColor
                          }} />
                          {statusText}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                        Duration: {getMonthDateRange(slip.month)}
                      </div>
                    </div>
                  </div>

                  {/* Right: Due Amount Label + Bold Value + Chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>Due Amount</div>
                      <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>
                        {inr(slip.due_amount || 0)}
                      </div>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--muted)',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      marginLeft: 4
                    }}>
                      <Icon name="chev" size={16} />
                    </div>
                  </div>
                </div>

                {/* Card Body (Detailed Breakdown Matching Reference Image) */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--line-soft)' }}>
                    {/* Two Columns: Earnings and Deductions */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      gap: 40,
                      padding: '24px 24px 20px 24px'
                    }}>
                      {/* Left: Earnings */}
                      <div>
                        {/* Table Header: Earnings | Actual */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingBottom: 10,
                          marginBottom: 12,
                          borderBottom: '1px solid var(--line-soft)'
                        }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                            Earnings
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
                            Actual
                          </span>
                        </div>

                        {/* Earnings list fallback to default 3 components */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          {((slip.earnings_breakdown && slip.earnings_breakdown.length > 0)
                            ? slip.earnings_breakdown
                            : [
                                { name: 'Basic + DA', amount: 0 },
                                { name: 'HRA', amount: 0 },
                                { name: 'Special Allowance', amount: 0 }
                              ]
                          ).map((e, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                              <span style={{ color: 'var(--text)' }}>{e.name}</span>
                              <span style={{ color: 'var(--text)', fontWeight: 500 }}>{inr(e.amount || 0)}</span>
                            </div>
                          ))}
                        </div>

                        {/* Gross Earnings Subtotal Row */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 18,
                          paddingTop: 12,
                          borderTop: '1px solid var(--line-soft)',
                          fontSize: 14,
                          fontWeight: 700,
                          color: 'var(--text)'
                        }}>
                          <span>Gross Earnings</span>
                          <span>{inr(slip.gross_earnings || 0)}</span>
                        </div>
                      </div>

                      {/* Right: Deductions */}
                      <div>
                        {/* Table Header: Deductions | Actual */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingBottom: 10,
                          marginBottom: 12,
                          borderBottom: '1px solid var(--line-soft)'
                        }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                            Deductions
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
                            Actual
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 70 }}>
                          {(slip.deductions_breakdown || [])
                            .filter(dItem => Number(dItem.amount) > 0)
                            .map((dItem, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                                <span style={{ color: 'var(--text)' }}>{dItem.name}</span>
                                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{inr(dItem.amount || 0)}</span>
                              </div>
                            ))}
                        </div>

                        {/* Total Deductions Subtotal Row */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: 18,
                          paddingTop: 12,
                          borderTop: '1px solid var(--line-soft)',
                          fontSize: 14,
                          fontWeight: 700,
                          color: 'var(--text)'
                        }}>
                          <span>Total Deductions</span>
                          <span>{inr(slip.total_deductions || 0)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Full-Width Rows (Matching Reference Image 2nd Snap) */}
                    <div style={{ padding: '0 24px 8px 24px' }}>
                      {/* Carry (Previous Month) Row */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 0',
                        borderTop: '1px solid var(--line-soft)',
                        fontSize: 14
                      }}>
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                          Carry ({prevMonthLabel})
                        </span>
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                          {inr(slip.carry_forward || 0)}
                        </span>
                      </div>

                      {/* Net Payable Amount Row */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 0',
                        borderTop: '1px solid var(--line-soft)',
                        fontSize: 14,
                        flexWrap: 'wrap',
                        gap: 10
                      }}>
                        <span style={{ color: 'var(--text)', fontWeight: 700 }}>
                          Net Payable Amount <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 13 }}>(Gross Earnings - Total Deductions)</span>
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
                            {slip.payable_days || 0} Payable Days
                          </span>
                          <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15 }}>
                            {inr(slip.net_payable || 0)}
                          </span>
                        </div>
                      </div>

                      {/* Advance Payments Row */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '14px 0',
                        borderTop: '1px solid var(--line-soft)',
                        fontSize: 14
                      }}>
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                          Advance Payments
                        </span>
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>
                          {inr(slip.advance_payments || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Footer Bar (Matching Reference Image) */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px 24px',
                      background: 'rgba(255,255,255,0.02)',
                      borderTop: '1px solid var(--line-soft)',
                      flexWrap: 'wrap',
                      gap: 12
                    }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>
                        Due Amount : {inr(slip.due_amount || 0)}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
                        {isAdmin && Number(slip.due_amount) > 0 && (
                          <button
                            type="button"
                            className="tb-btn"
                            onClick={() => handleMarkAsPaid(slip)}
                            style={{
                              height: 30,
                              padding: '0 12px',
                              fontSize: 12.5,
                              color: 'var(--success, #4ADE95)',
                              borderColor: 'rgba(74,222,149,0.3)',
                              background: 'rgba(74,222,149,0.08)'
                            }}
                          >
                            Mark Paid
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handlePrintSlip(slip)}
                          title="Print Salary Slip"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--muted)',
                            cursor: 'pointer',
                            padding: '4px 6px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontSize: 13
                          }}
                        >
                          <Icon name="file" size={14} />
                          Print Slip
                        </button>

                        {onNavigateToStructure && (
                          <button
                            type="button"
                            onClick={onNavigateToStructure}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#3B82F6',
                              fontSize: 13.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            Edit Salary Structure
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setShowVariablesModal(slip)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#3B82F6',
                            fontSize: 13.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0
                          }}
                        >
                          View Variables
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Previous Month Modal */}
      {showAddMonthModal && (
        <div className="scrim open" onClick={(e) => { if (e.target === e.currentTarget) setShowAddMonthModal(false); }} role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" style={{ maxWidth: 440 }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 600 }}>Add / Backfill Month</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
              Select a past month in {selectedFY} to calculate or finalize a salary slip.
            </p>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', marginBottom: 6, display: 'block' }}>
                Month
              </label>
              <input
                type="month"
                value={selectedAddMonth}
                onChange={(e) => setSelectedAddMonth(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--field)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 14,
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="tb-btn"
                onClick={() => setShowAddMonthModal(false)}
                style={{ height: 36, padding: '0 16px', fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tb-btn solid"
                disabled={!selectedAddMonth || generating}
                onClick={() => handleGenerateSlip(selectedAddMonth)}
                style={{ height: 36, padding: '0 18px', fontSize: 13 }}
              >
                {generating ? 'Calculating...' : 'Calculate Slip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Variables Modal */}
      {showVariablesModal && (
        <div className="scrim open" onClick={(e) => { if (e.target === e.currentTarget) setShowVariablesModal(null); }} role="presentation">
          <div className="dialog" role="dialog" aria-modal="true" style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
                Salary Calculation Variables
              </h2>
              <button
                type="button"
                onClick={() => setShowVariablesModal(null)}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
              Parameters used to calculate salary for {formatMonthLabel(showVariablesModal.month)}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--field)', borderRadius: 8 }}>
                <span>Employee Name</span>
                <b>{employee.name}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--field)', borderRadius: 8 }}>
                <span>Base Total Salary</span>
                <b>{inr(employee.salary)} / Month</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--field)', borderRadius: 8 }}>
                <span>Payable Days</span>
                <b>{showVariablesModal.payable_days} Days</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--field)', borderRadius: 8 }}>
                <span>Gross Monthly Earnings</span>
                <b>{inr(showVariablesModal.gross_earnings)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--field)', borderRadius: 8 }}>
                <span>Fixed + Leave Deductions</span>
                <b>{inr(showVariablesModal.total_deductions)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--field)', borderRadius: 8 }}>
                <span>Advance Payments Settled</span>
                <b>{inr(showVariablesModal.advance_payments)}</b>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--field)', borderRadius: 8 }}>
                <span>Formula Applied</span>
                <code style={{ color: 'var(--accent)', fontSize: 12 }}>Net = Gross - Deductions</code>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                type="button"
                className="tb-btn solid"
                onClick={() => setShowVariablesModal(null)}
                style={{ height: 36, padding: '0 20px', fontSize: 13 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
