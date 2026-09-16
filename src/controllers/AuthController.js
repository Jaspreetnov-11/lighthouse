'use client';
// Auth controller: owns the session (JWT + current employee) and exposes login/register/logout.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthModel } from '@/models';
import { AUTH_KEY, getToken, setToken } from '@/models/api.client';
import { avFor, ini } from '@/lib/format';

const AuthContext = createContext(null);

function normalizeEmployee(user, employee) {
  const e = employee || {};
  const name = e.name || (user && user.email ? user.email.split('@')[0] : 'User');
  return {
    id: e.id || (user ? user.employeeId : '') || '',
    name,
    email: e.email || (user ? user.email : ''),
    role: e.role || '',
    dept: e.dept || '',
    empId: e.emp_id || e.empId || '',
    access: e.access || (user ? user.role : 'staff') || 'staff',
    shift: e.shift || 'day',
    salary: Number(e.salary) || 0,
    av: e.av || avFor(name),
    ini: e.ini || ini(name)
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // {user, me}
  const [ready, setReady] = useState(false);

  // Restore the session on first load, then verify it with /auth/me.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = getToken();
      if (!token) { setReady(true); return; }
      try {
        const cached = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
        if (cached && !cancelled) setSession(cached);
      } catch (e) { /* ignore */ }
      try {
        const res = await AuthModel.me();
        if (!cancelled) {
          const s = { user: res.user, me: normalizeEmployee(res.user, res.employee) };
          setSession(s);
          localStorage.setItem(AUTH_KEY, JSON.stringify(s));
        }
      } catch (err) {
        if (err && err.status === 401) { setToken(''); localStorage.removeItem(AUTH_KEY); if (!cancelled) setSession(null); }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const applyLogin = useCallback(result => {
    setToken(result.token);
    const s = { user: result.user, me: normalizeEmployee(result.user, result.employee) };
    localStorage.setItem(AUTH_KEY, JSON.stringify(s));
    setSession(s);
    return s;
  }, []);

  const login = useCallback(async (email, password) => applyLogin(await AuthModel.login(email, password)), [applyLogin]);
  const register = useCallback(async payload => applyLogin(await AuthModel.register(payload)), [applyLogin]);
  const logout = useCallback(() => { setToken(''); try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* ignore */ } setSession(null); }, []);
  const refreshMe = useCallback(async () => { try { const res = await AuthModel.me(); const s = { user: res.user, me: normalizeEmployee(res.user, res.employee) }; setSession(s); localStorage.setItem(AUTH_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ } }, []);

  const value = useMemo(() => {
    const isAdm = !!session && (session.me.access === 'admin' || (session.user && session.user.role === 'admin'));
    const isHr = !!session && (
      session.me.access === 'hr' ||
      (session.user && session.user.role === 'hr') ||
      (session.me.dept || '').toLowerCase() === 'hr' ||
      (session.me.dept || '').toLowerCase().includes('human resource') ||
      (session.me.role || '').toLowerCase() === 'hr' ||
      (session.me.role || '').toLowerCase().includes('human resource') ||
      (session.me.role || '').toLowerCase().includes('hr manager') ||
      (session.me.role || '').toLowerCase().includes('hr executive')
    );
    return {
      ready,
      isAuthed: !!session,
      user: session ? session.user : null,
      me: session ? session.me : null,
      isAdmin: isAdm,
      isHR: isHr,
      canManageStaff: isAdm || isHr,
      login, register, logout, refreshMe
    };
  }, [ready, session, login, register, logout, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
