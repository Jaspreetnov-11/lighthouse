'use strict';

const salarySlipModel = require('../models/salarySlip.model');
const employeeModel = require('../models/employee.model');
const paymentModel = require('../models/payment.model');
const attendanceService = require('../services/attendance.service');
const { workdaysIn, weekOffOf, thisMonth, todayISO } = require('../utils/calculations');

const DEFAULT_EARNINGS = [
  { id: 'basic', name: 'Basic + DA', percent: 0.5 },
  { id: 'hra', name: 'HRA', percent: 0.3 },
  { id: 'special', name: 'Special Allowance', percent: 0.2 }
];

const DEFAULT_DEDUCTIONS = [
  { id: 'epf', name: 'EPF', amount: 0 },
  { id: 'esi', name: 'ESI', amount: 0 },
  { id: 'pt', name: 'Professional Tax', amount: 0 }
];

function parseStructure(raw, totalSalary) {
  const sal = Number(totalSalary) || 0;
  if (raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && Array.isArray(parsed.earnings)) {
        return {
          earnings: parsed.earnings.map(e => ({
            id: e.id || e.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            name: e.name,
            amount: Number(e.amount) || 0
          })),
          deductions: Array.isArray(parsed.deductions)
            ? parsed.deductions.map(d => ({
                id: d.id || d.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                name: d.name,
                amount: Number(d.amount) || 0
              }))
            : DEFAULT_DEDUCTIONS
        };
      }
    } catch (e) {
      // fallback
    }
  }

  return {
    earnings: DEFAULT_EARNINGS.map(d => ({
      id: d.id,
      name: d.name,
      amount: Math.round(sal * d.percent)
    })),
    deductions: DEFAULT_DEDUCTIONS
  };
}

function getCurrentFY() {
  const cur = thisMonth(); // 'YYYY-MM'
  const [y, m] = cur.split('-').map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
}

function getMonthsForFY(fy) {
  const parts = (fy || getCurrentFY()).split('-');
  const startYear = parseInt(parts[0], 10);
  const months = [];
  for (let m = 4; m <= 12; m++) {
    months.push(`${startYear}-${String(m).padStart(2, '0')}`);
  }
  for (let m = 1; m <= 3; m++) {
    months.push(`${startYear + 1}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

class SalarySlipController {
  async getEmployeeSlips(req, res) {
    try {
      const empId = req.params.empId || req.query.emp;
      if (!empId) {
        return res.status(400).json({ error: 'Employee ID required' });
      }

      // Permissions check
      if (req.user && req.user.role !== 'admin' && req.user.role !== 'owner' && req.user.id !== empId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const employee = await employeeModel.findById(empId);
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const fy = req.query.fy || req.query.year || getCurrentFY();
      const fyMonths = getMonthsForFY(fy);
      const curMonth = thisMonth();

      // Retrieve all saved slips for employee
      const savedSlips = await salarySlipModel.findAllByEmp(empId);
      const slipMap = {};
      for (const slip of savedSlips) {
        let earnings = slip.earnings_breakdown;
        let deductions = slip.deductions_breakdown;
        if (typeof earnings === 'string') {
          try { earnings = JSON.parse(earnings); } catch (e) { earnings = []; }
        }
        if (typeof deductions === 'string') {
          try { deductions = JSON.parse(deductions); } catch (e) { deductions = []; }
        }
        slipMap[slip.month] = {
          ...slip,
          earnings_breakdown: earnings,
          deductions_breakdown: deductions,
          is_generated: true
        };
      }

      const structure = parseStructure(employee.salary_structure, employee.salary);
      const grossEarnings = structure.earnings.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const fixedDeductions = structure.deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

      // We only include months up to the current month or months that have saved slips
      const resultSlips = [];
      for (const month of fyMonths) {
        if (slipMap[month]) {
          resultSlips.push(slipMap[month]);
          continue;
        }

        // Only compute preview for months up to current month
        if (month > curMonth) {
          continue;
        }

        // Compute preview
        const st = await attendanceService.getMonthStats(empId, month);
        const totalWorkdays = workdaysIn(month, false, weekOffOf(employee));
        const payableDays = Math.min(totalWorkdays, st.present + 0.5 * st.half + st.leave);
        
        let leaveDeduction = 0;
        if (totalWorkdays > 0 && payableDays < totalWorkdays) {
          leaveDeduction = Math.max(0, Math.round(grossEarnings * (totalWorkdays - payableDays) / totalWorkdays));
        }

        const deductionsList = [
          ...structure.deductions,
          { id: 'leave_deduction', name: 'Leave Deduction', amount: leaveDeduction }
        ];
        const totalDeductions = fixedDeductions + leaveDeduction;
        const netPayable = Math.max(0, grossEarnings - totalDeductions);

        // Check advance/salary payments made for this month
        const payments = await paymentModel.findByEmp(empId);
        const monthPayments = (payments || []).filter(p => p.date && p.date.startsWith(month));
        const advancePayments = monthPayments
          .filter(p => (p.type || '').toLowerCase() === 'advance')
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
        const salaryPayments = monthPayments
          .filter(p => (p.type || '').toLowerCase() !== 'advance')
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        const dueAmount = Math.max(0, netPayable - advancePayments - salaryPayments);
        const status = dueAmount === 0 && netPayable > 0 ? 'paid' : (salaryPayments > 0 || advancePayments > 0 ? 'partially_paid' : 'pending');

        resultSlips.push({
          id: `preview_${empId}_${month.replace('-', '')}`,
          emp: empId,
          month,
          year: month.split('-')[0],
          status,
          gross_earnings: grossEarnings,
          total_deductions: totalDeductions,
          net_payable: netPayable,
          paid_amount: salaryPayments,
          due_amount: dueAmount,
          payable_days: payableDays,
          carry_forward: 0,
          advance_payments: advancePayments,
          earnings_breakdown: structure.earnings,
          deductions_breakdown: deductionsList,
          is_generated: false
        });
      }

      // Sort descending (latest month first)
      resultSlips.sort((a, b) => b.month.localeCompare(a.month));

      const payload = {
        fy,
        empId,
        salary_structure: structure,
        slips: resultSlips
      };

      return res.status(200).json({
        success: true,
        message: 'Salary slips retrieved successfully',
        data: payload,
        ...payload
      });
    } catch (err) {
      console.error('getEmployeeSlips error:', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch salary slips' });
    }
  }

  async generateSlip(req, res) {
    try {
      const { emp, month, earnings_breakdown, deductions_breakdown, payable_days, carry_forward, advance_payments, status } = req.body;
      if (!emp || !month) {
        return res.status(400).json({ error: 'Employee ID and Month are required' });
      }

      const employee = await employeeModel.findById(emp);
      if (!employee) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const structure = parseStructure(employee.salary_structure, employee.salary);
      const earnings = Array.isArray(earnings_breakdown) ? earnings_breakdown : structure.earnings;
      const deductions = Array.isArray(deductions_breakdown) ? deductions_breakdown : structure.deductions;

      const grossEarnings = earnings.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const totalDeductions = deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const netPayable = Math.max(0, grossEarnings - totalDeductions);

      const totalWorkdays = workdaysIn(month, false, weekOffOf(employee));
      const payableDaysVal = payable_days !== undefined ? Number(payable_days) : totalWorkdays;
      const carryForwardVal = Number(carry_forward) || 0;
      const advanceVal = Number(advance_payments) || 0;

      // Check payments made
      const payments = await paymentModel.findByEmp(emp);
      const monthPayments = (payments || []).filter(p => p.date && p.date.startsWith(month));
      const paidVal = monthPayments
        .filter(p => (p.type || '').toLowerCase() !== 'advance')
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const dueAmount = Math.max(0, netPayable - advanceVal - paidVal);

      const slipData = {
        emp,
        month,
        year: month.split('-')[0],
        status: status || (dueAmount === 0 ? 'paid' : 'pending'),
        gross_earnings: grossEarnings,
        total_deductions: totalDeductions,
        net_payable: netPayable,
        paid_amount: paidVal,
        due_amount: dueAmount,
        payable_days: payableDaysVal,
        carry_forward: carryForwardVal,
        advance_payments: advanceVal,
        earnings_breakdown: JSON.stringify(earnings),
        deductions_breakdown: JSON.stringify(deductions)
      };

      const saved = await salarySlipModel.upsert(slipData);
      const slipResponse = {
        ...saved,
        earnings_breakdown: earnings,
        deductions_breakdown: deductions,
        is_generated: true
      };
      return res.status(201).json({
        success: true,
        message: 'Salary slip generated successfully',
        data: slipResponse,
        ...slipResponse
      });
    } catch (err) {
      console.error('generateSlip error:', err);
      return res.status(500).json({ success: false, error: 'Failed to generate salary slip' });
    }
  }

  async updateSlip(req, res) {
    try {
      const { id } = req.params;
      const updates = { ...req.body };
      if (updates.earnings_breakdown && typeof updates.earnings_breakdown !== 'string') {
        updates.earnings_breakdown = JSON.stringify(updates.earnings_breakdown);
      }
      if (updates.deductions_breakdown && typeof updates.deductions_breakdown !== 'string') {
        updates.deductions_breakdown = JSON.stringify(updates.deductions_breakdown);
      }
      updates.updated_at = new Date().toISOString();

      const updated = await salarySlipModel.update(id, updates);
      if (!updated) {
        return res.status(404).json({ success: false, error: 'Salary slip not found' });
      }

      let earnings = updated.earnings_breakdown;
      let deductions = updated.deductions_breakdown;
      if (typeof earnings === 'string') {
        try { earnings = JSON.parse(earnings); } catch (e) { earnings = []; }
      }
      if (typeof deductions === 'string') {
        try { deductions = JSON.parse(deductions); } catch (e) { deductions = []; }
      }

      const slipResponse = {
        ...updated,
        earnings_breakdown: earnings,
        deductions_breakdown: deductions,
        is_generated: true
      };
      return res.status(200).json({
        success: true,
        message: 'Salary slip updated successfully',
        data: slipResponse,
        ...slipResponse
      });
    } catch (err) {
      console.error('updateSlip error:', err);
      return res.status(500).json({ success: false, error: 'Failed to update salary slip' });
    }
  }

  async deleteSlip(req, res) {
    try {
      const { id } = req.params;
      await salarySlipModel.delete(id);
      return res.json({ success: true, message: 'Salary slip removed' });
    } catch (err) {
      console.error('deleteSlip error:', err);
      return res.status(500).json({ error: 'Failed to delete salary slip' });
    }
  }
}

module.exports = new SalarySlipController();
