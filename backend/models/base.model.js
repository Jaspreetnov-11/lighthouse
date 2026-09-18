'use strict';

const db = require('../config/db');

const IDENTIFIER_REGEX = /^[a-zA-Z0-9_]+$/;
const ORDER_BY_REGEX = /^[a-zA-Z0-9_]+(\s+(?:ASC|DESC))?$/i;

function assertSafeIdentifier(name) {
  if (!IDENTIFIER_REGEX.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

function assertSafeOrderBy(orderBy) {
  if (!ORDER_BY_REGEX.test(orderBy.trim())) {
    throw new Error(`Invalid ORDER BY clause: ${orderBy}`);
  }
  return orderBy.trim();
}

/**
 * Base Model implementing generic async CRUD with strict SQL-injection defence.
 * Every domain model inherits parameterised, identifier-validated SQL execution.
 */
class BaseModel {
  constructor(tableName, primaryKey = 'id') {
    this.table = assertSafeIdentifier(tableName);
    this.pk = assertSafeIdentifier(primaryKey);
    this._columns = null;
  }

  async findById(id) {
    return db.get(`SELECT * FROM ${this.table} WHERE ${this.pk} = ?`, [id]);
  }

  async findOne(conditions = {}) {
    const keys = Object.keys(conditions);
    if (keys.length === 0) return null;
    const where = keys.map(k => `${assertSafeIdentifier(k)} = ?`).join(' AND ');
    const vals = keys.map(k => conditions[k]);
    return db.get(`SELECT * FROM ${this.table} WHERE ${where} LIMIT 1`, vals);
  }

  async findAll(conditions = {}, options = {}) {
    const keys = Object.keys(conditions);
    let sql = `SELECT * FROM ${this.table}`;
    const vals = [];

    if (keys.length > 0) {
      const where = keys.map(k => {
        const safeCol = assertSafeIdentifier(k);
        const v = conditions[k];
        if (v === null) return `${safeCol} IS NULL`;
        vals.push(v);
        return `${safeCol} = ?`;
      }).join(' AND ');
      sql += ` WHERE ${where}`;
    }

    if (options.orderBy) sql += ` ORDER BY ${assertSafeOrderBy(options.orderBy)}`;

    if (options.limit !== undefined) {
      sql += ' LIMIT ?';
      vals.push(Math.max(0, parseInt(options.limit, 10) || 0));
      if (options.offset !== undefined) {
        sql += ' OFFSET ?';
        vals.push(Math.max(0, parseInt(options.offset, 10) || 0));
      }
    }

    return db.all(sql, vals);
  }

  async getTableColumns() {
    if (!this._columns) {
      try {
        const cols = await db.columns(this.table);
        if (cols && cols.size > 0) this._columns = cols;
      } catch (e) {
        this._columns = null;
      }
    }
    return this._columns;
  }

  async filterKnownColumns(data) {
    const cols = await this.getTableColumns();
    if (!cols) return { ...data };
    const clean = {};
    for (const key of Object.keys(data)) {
      if (cols.has(key)) clean[key] = data[key] === undefined ? null : data[key];
    }
    return clean;
  }

  async create(data) {
    const now = new Date().toISOString();
    const record = await this.filterKnownColumns(data);
    if (!record[this.pk]) {
      record[this.pk] = this.table.replace(/^lh_/, '').slice(0, 3) + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    }
    if (!record.created_at) record.created_at = now;
    if (!record.updated_at) record.updated_at = now;

    const keys = Object.keys(record);
    const cols = keys.map(assertSafeIdentifier).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const vals = keys.map(k => record[k]);

    await db.run(`INSERT INTO ${this.table} (${cols}) VALUES (${placeholders})`, vals);
    return this.findById(record[this.pk]);
  }

  async update(id, data) {
    const record = await this.filterKnownColumns(data);
    record.updated_at = new Date().toISOString();

    const keys = Object.keys(record).filter(k => k !== this.pk);
    if (keys.length === 0) return this.findById(id);

    const setClause = keys.map(k => `${assertSafeIdentifier(k)} = ?`).join(', ');
    const vals = [...keys.map(k => record[k]), id];

    await db.run(`UPDATE ${this.table} SET ${setClause} WHERE ${this.pk} = ?`, vals);
    return this.findById(id);
  }

  async delete(id) {
    const r = await db.run(`DELETE FROM ${this.table} WHERE ${this.pk} = ?`, [id]);
    return r.changes > 0;
  }

  async count(conditions = {}) {
    const keys = Object.keys(conditions);
    let sql = `SELECT COUNT(*) as total FROM ${this.table}`;
    const vals = [];
    if (keys.length > 0) {
      const where = keys.map(k => {
        vals.push(conditions[k]);
        return `${assertSafeIdentifier(k)} = ?`;
      }).join(' AND ');
      sql += ` WHERE ${where}`;
    }
    const row = await db.get(sql, vals);
    return row ? Number(row.total) || 0 : 0;
  }
}

module.exports = BaseModel;
