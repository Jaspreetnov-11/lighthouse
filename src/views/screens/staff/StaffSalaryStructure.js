'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/controllers/AuthController';
import { useUi } from '@/controllers/UiController';
import { useData } from '@/controllers/DataController';
import { EmployeeModel } from '@/models';
import { Icon } from '@/views/ui/Icons';
import { inr } from '@/lib/format';

const DEFAULT_EARNINGS_SUGGESTIONS = [
  'Basic + DA',
  'HRA',
  'Medical Allowance',
  'Travel Allowance',
  'Special Allowance',
  'Meal Allowance',
  'Leave Travel Allowance',
  'Bonus',
  'Performance Allowance',
  'Overtime Allowance'
];

const DEFAULT_DEDUCTIONS_SUGGESTIONS = [
  'EPF (Provident Fund)',
  'ESI',
  'Professional Tax',
  'TDS / Tax',
  'Security Deposit',
  'Loan Recovery',
  'Health Insurance'
];

export function StaffSalaryStructure({ employee, onUpdated, onCancel }) {
  const { isAdmin } = useAuth();
  const { toast } = useUi();
  const d = useData();

  // Parse initial structure
  const initialStructure = useMemo(() => {
    let raw = employee?.salary_structure;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch (e) { raw = null; }
    }
    const sal = Number(employee?.salary) || 0;
    if (raw && Array.isArray(raw.earnings)) {
      return {
        earnings: raw.earnings.map(e => ({ name: e.name, amount: Number(e.amount) || 0 })),
        deductions: Array.isArray(raw.deductions)
          ? raw.deductions.map(d => ({ name: d.name, amount: Number(d.amount) || 0 }))
          : [
              { name: 'EPF', amount: 0 },
              { name: 'ESI', amount: 0 },
              { name: 'Professional Tax', amount: 0 }
            ]
      };
    }
    return {
      earnings: [
        { name: 'Basic + DA', amount: Math.round(sal * 0.5) },
        { name: 'HRA', amount: Math.round(sal * 0.3) },
        { name: 'Special Allowance', amount: Math.round(sal * 0.2) }
      ],
      deductions: [
        { name: 'EPF', amount: 0 },
        { name: 'ESI', amount: 0 },
        { name: 'Professional Tax', amount: 0 }
      ]
    };
  }, [employee]);

  const [earnings, setEarnings] = useState(initialStructure.earnings);
  const [deductions, setDeductions] = useState(initialStructure.deductions);
  const [earningsOpen, setEarningsOpen] = useState(true);
  const [deductionsOpen, setDeductionsOpen] = useState(true);
  const [modalType, setModalType] = useState(null); // 'earnings' | 'deductions' | null
  const [selectedSuggestions, setSelectedSuggestions] = useState([]);
  const [customName, setCustomName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const totalEarnings = useMemo(() => earnings.reduce((sum, e) => sum + (Number(e.amount) || 0), 0), [earnings]);
  const totalDeductions = useMemo(() => deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0), [deductions]);
  const netSalary = Math.max(0, totalEarnings - totalDeductions);

  const handleEarningAmountChange = (index, val) => {
    const next = [...earnings];
    next[index] = { ...next[index], amount: val === '' ? '' : Math.max(0, Number(val) || 0) };
    setEarnings(next);
  };

  const handleDeductionAmountChange = (index, val) => {
    const next = [...deductions];
    next[index] = { ...next[index], amount: val === '' ? '' : Math.max(0, Number(val) || 0) };
    setDeductions(next);
  };

  const removeEarning = (index) => {
    setEarnings(earnings.filter((_, i) => i !== index));
  };

  const removeDeduction = (index) => {
    setDeductions(deductions.filter((_, i) => i !== index));
  };

  const openPickerModal = (type) => {
    setModalType(type);
    const curList = type === 'earnings' ? earnings : deductions;
    setSelectedSuggestions(curList.map(item => item.name));
    setCustomName('');
    setSearchQuery('');
  };

  const toggleSuggestion = (name) => {
    setSelectedSuggestions(prev => {
      const exists = prev.some(n => n.toLowerCase() === name.toLowerCase());
      if (exists) {
        return prev.filter(n => n.toLowerCase() !== name.toLowerCase());
      } else {
        return [...prev, name];
      }
    });
  };

  const addCustomComponent = () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    if (!selectedSuggestions.some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setSelectedSuggestions(prev => [...prev, trimmed]);
    }
    setCustomName('');
  };

  const applySuggestions = () => {
    const selectedLowerSet = new Set(selectedSuggestions.map(n => n.toLowerCase()));
    if (modalType === 'earnings') {
      // Preserve existing amounts for items that remain checked
      const kept = earnings.filter(e => selectedLowerSet.has(e.name.toLowerCase()));
      const keptNames = new Set(kept.map(e => e.name.toLowerCase()));
      // Add newly selected items with default 0 amount
      const toAdd = selectedSuggestions
        .filter(n => !keptNames.has(n.toLowerCase()))
        .map(n => ({ name: n, amount: 0 }));
      setEarnings([...kept, ...toAdd]);
    } else if (modalType === 'deductions') {
      // Preserve existing amounts for items that remain checked
      const kept = deductions.filter(d => selectedLowerSet.has(d.name.toLowerCase()));
      const keptNames = new Set(kept.map(d => d.name.toLowerCase()));
      // Add newly selected items with default 0 amount
      const toAdd = selectedSuggestions
        .filter(n => !keptNames.has(n.toLowerCase()))
        .map(n => ({ name: n, amount: 0 }));
      setDeductions([...kept, ...toAdd]);
    }
    setModalType(null);
  };

  const handleSave = async () => {
    if (!isAdmin) {
      toast('Only administrators can edit salary structures.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        salary_structure: {
          earnings: earnings.map(e => ({ name: e.name, amount: Number(e.amount) || 0 })),
          deductions: deductions.map(d => ({ name: d.name, amount: Number(d.amount) || 0 }))
        },
        salary: totalEarnings
      };
      await EmployeeModel.update(employee.id, payload);
      toast('Salary structure saved successfully.');
      await d.reload('employees');
      if (onUpdated) onUpdated();
    } catch (err) {
      toast(err.message || 'Failed to save salary structure');
    } finally {
      setSaving(false);
    }
  };

  const allSuggestions = modalType === 'earnings' ? DEFAULT_EARNINGS_SUGGESTIONS : DEFAULT_DEDUCTIONS_SUGGESTIONS;
  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return allSuggestions;
    const q = searchQuery.toLowerCase();
    return allSuggestions.filter(n => n.toLowerCase().includes(q));
  }, [allSuggestions, searchQuery]);
  const existingList = modalType === 'earnings' ? earnings : deductions;
  const existingNames = new Set(existingList.map(item => item.name.toLowerCase()));

  return (
    <div className="salary-structure-screen" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
            Edit Salary Structure
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Configure fixed monthly allowances and deductions for {employee?.name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {onCancel && (
            <button
              type="button"
              className="tb-btn"
              onClick={onCancel}
              style={{ height: 36, padding: '0 16px', fontSize: 13 }}
            >
              Cancel
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              className="tb-btn solid"
              disabled={saving}
              onClick={handleSave}
              style={{ height: 36, padding: '0 20px', fontSize: 13, minWidth: 100 }}
            >
              {saving ? 'Saving...' : 'Save Structure'}
            </button>
          )}
        </div>
      </div>

      {/* Salary Overview Metric Ribbon */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 12,
        padding: '16px 20px',
        background: 'var(--panel)',
        borderRadius: 'var(--radius-field, 14px)',
        border: '1px solid var(--line-soft)'
      }}>
        <div>
          <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Gross Earnings
          </span>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--ok, #4ADE95)', marginTop: 2 }}>
            {inr(totalEarnings)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>/ month</span>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Deductions
          </span>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--danger, #FF5C7A)', marginTop: 2 }}>
            {inr(totalDeductions)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>/ month</span>
          </div>
        </div>
        <div>
          <span style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Net In-Hand Salary
          </span>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent, #FFD21F)', marginTop: 2 }}>
            {inr(netSalary)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>/ month</span>
          </div>
        </div>
      </div>

      {/* Section 1: Earnings */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div
          className="panel-h"
          onClick={() => setEarningsOpen(!earningsOpen)}
          style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ transform: earningsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>
              ›
            </span>
            <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '0.02em' }}>EARNINGS</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>({earnings.length} components)</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ok, #4ADE95)' }}>
            Total: {inr(totalEarnings)} / Month
          </span>
        </div>

        {earningsOpen && (
          <div className="panel-b" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {earnings.map((e, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '10px 14px',
                  background: 'var(--field, rgba(255,255,255,0.03))',
                  borderRadius: 10,
                  border: '1px solid var(--line-soft)'
                }}
              >
                <div style={{ flex: '1 1 240px', fontWeight: 500, fontSize: 14 }}>
                  {e.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 200px' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 15 }}>₹</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={e.amount}
                    disabled={!isAdmin}
                    onChange={(ev) => handleEarningAmountChange(idx, ev.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 14,
                      outline: 'none',
                      fontFamily: 'inherit',
                      textAlign: 'right'
                    }}
                  />
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    title="Remove component"
                    onClick={() => removeEarning(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      padding: 6,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'color 0.15s'
                    }}
                    onMouseEnter={(ev) => ev.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={(ev) => ev.currentTarget.style.color = 'var(--muted)'}
                  >
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
              {isAdmin && (
                <button
                  type="button"
                  className="tb-btn"
                  onClick={() => openPickerModal('earnings')}
                  style={{ height: 34, padding: '0 14px', fontSize: 13, gap: 6, display: 'inline-flex', alignItems: 'center' }}
                >
                  <span>+</span> Add More
                </button>
              )}
              <div style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                Total: <span style={{ color: 'var(--ok, #4ADE95)' }}>{inr(totalEarnings)}</span> / Month
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Deductions */}
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div
          className="panel-h"
          onClick={() => setDeductionsOpen(!deductionsOpen)}
          style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ transform: deductionsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>
              ›
            </span>
            <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '0.02em' }}>DEDUCTIONS</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>({deductions.length} components)</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger, #FF5C7A)' }}>
            Total: {inr(totalDeductions)} / Month
          </span>
        </div>

        {deductionsOpen && (
          <div className="panel-b" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {deductions.map((dItem, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '10px 14px',
                  background: 'var(--field, rgba(255,255,255,0.03))',
                  borderRadius: 10,
                  border: '1px solid var(--line-soft)'
                }}
              >
                <div style={{ flex: '1 1 240px', fontWeight: 500, fontSize: 14 }}>
                  {dItem.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 200px' }}>
                  <span style={{ color: 'var(--muted)', fontSize: 15 }}>₹</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={dItem.amount}
                    disabled={!isAdmin}
                    onChange={(ev) => handleDeductionAmountChange(idx, ev.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid var(--line)',
                      color: 'var(--text)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontSize: 14,
                      outline: 'none',
                      fontFamily: 'inherit',
                      textAlign: 'right'
                    }}
                  />
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    title="Remove component"
                    onClick={() => removeDeduction(idx)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      padding: 6,
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'color 0.15s'
                    }}
                    onMouseEnter={(ev) => ev.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={(ev) => ev.currentTarget.style.color = 'var(--muted)'}
                  >
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
              {isAdmin && (
                <button
                  type="button"
                  className="tb-btn"
                  onClick={() => openPickerModal('deductions')}
                  style={{ height: 34, padding: '0 14px', fontSize: 13, gap: 6, display: 'inline-flex', alignItems: 'center' }}
                >
                  <span>+</span> Add More
                </button>
              )}
              <div style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                Total: <span style={{ color: 'var(--danger, #FF5C7A)' }}>{inr(totalDeductions)}</span> / Month
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Component Picker Modal (Snapshot 5) */}
      {modalType && (
        <div className="scrim open" onClick={(e) => { if (e.target === e.currentTarget) setModalType(null); }} role="presentation">
          <div className="dialog wide" role="dialog" aria-modal="true" style={{ maxWidth: 520 }}>
            <div className="dialog-handle" onClick={() => setModalType(null)} title="Minimise sheet" role="button" tabIndex={0} />
            <div className="dialog-h">
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>
                {modalType === 'earnings' ? 'Earnings Default List' : 'Deductions Default List'}
              </h2>
              <button
                type="button"
                className="dialog-close"
                onClick={() => setModalType(null)}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px' }}>
              Select suggested components or type a custom name to add to the structure.
            </p>

            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                type="text"
                placeholder="Search components..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: 38,
                  padding: '0 12px 0 34px',
                  fontSize: 13,
                  background: 'var(--field)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  color: 'var(--text)',
                  outline: 'none'
                }}
              />
              <Icon name="search" size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            </div>

            {/* Checklist Container using .ms-box */}
            <div
              className="ms-box"
              style={{
                maxHeight: 230,
                overflowY: 'auto',
                overflowX: 'hidden',
                border: '1px solid var(--line)',
                borderRadius: 12,
                background: 'rgba(20,20,23,0.5)',
                padding: '6px',
                marginBottom: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}
            >
              {filteredSuggestions.map((name) => {
                const wasOriginallyAdded = existingNames.has(name.toLowerCase());
                const isChecked = selectedSuggestions.some(s => s.toLowerCase() === name.toLowerCase());
                return (
                  <label
                    key={name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '9px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: isChecked ? 'rgba(255,210,31,0.08)' : 'transparent',
                      border: isChecked ? '1px solid rgba(255,210,31,0.2)' : '1px solid transparent',
                      transition: 'background 0.15s, border-color 0.15s'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSuggestion(name)}
                      style={{
                        width: '16px',
                        height: '16px',
                        minWidth: '16px',
                        maxWidth: '16px',
                        margin: 0,
                        padding: 0,
                        flexShrink: 0,
                        accentColor: 'var(--accent)',
                        cursor: 'pointer'
                      }}
                    />
                    <span style={{
                      fontSize: 13.5,
                      flex: 1,
                      color: isChecked ? 'var(--text)' : 'var(--t2)',
                      fontWeight: isChecked ? 600 : 400
                    }}>
                      {name}
                    </span>
                    {wasOriginallyAdded && isChecked && (
                      <span style={{
                        fontSize: 11,
                        color: 'var(--muted)',
                        background: 'rgba(255,255,255,0.06)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontWeight: 500,
                        flexShrink: 0
                      }}>
                        In Structure
                      </span>
                    )}
                    {!wasOriginallyAdded && isChecked && (
                      <span style={{
                        fontSize: 11,
                        color: 'var(--accent)',
                        background: 'rgba(255,210,31,0.14)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontWeight: 600,
                        flexShrink: 0
                      }}>
                        New
                      </span>
                    )}
                  </label>
                );
              })}
              {filteredSuggestions.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No components match &quot;{searchQuery}&quot;
                </div>
              )}
            </div>

            {/* Custom Component Input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)', marginBottom: 6, display: 'block' }}>
                Custom Component
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  placeholder="e.g. Incentive, Retention Bonus..."
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomComponent(); } }}
                  style={{
                    flex: 1,
                    height: 38,
                    background: 'var(--field)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    borderRadius: 8,
                    padding: '0 12px',
                    fontSize: 13,
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  className="tb-btn"
                  onClick={addCustomComponent}
                  style={{ height: 38, padding: '0 16px', fontSize: 13, whiteSpace: 'nowrap' }}
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Selected Custom chips */}
            {selectedSuggestions.filter(s => !allSuggestions.includes(s)).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {selectedSuggestions.filter(s => !allSuggestions.includes(s)).map(s => (
                  <span
                    key={s}
                    style={{
                      background: 'rgba(255,210,31,0.15)',
                      color: 'var(--accent)',
                      border: '1px solid rgba(255,210,31,0.3)',
                      borderRadius: 14,
                      padding: '3px 10px',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {s}
                    <span
                      onClick={() => toggleSuggestion(s)}
                      style={{ cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ×
                    </span>
                  </span>
                ))}
              </div>
            )}

            {/* Modal actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setModalType(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="tb-btn solid"
                onClick={applySuggestions}
                disabled={selectedSuggestions.length === 0}
                style={{ minHeight: 42, padding: '0 18px', fontSize: 13.5, fontWeight: 600 }}
              >
                Apply ({selectedSuggestions.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
