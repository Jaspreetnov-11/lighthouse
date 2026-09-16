'use client';
// Login / Sign up / Reset password views on the Limelight stage.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/controllers/AuthController';
import { useUi } from '@/controllers/UiController';
import { AuthModel } from '@/models';

function Stage({ children, bubble }) {
  return (
    <>
      <div className="sky" aria-hidden="true">
        <div className="spot"></div><div className="floor"></div>
        <div className="blob b1"></div><div className="blob b2"></div><div className="blob b3"></div>
        <div className="beam"></div><div className="grid"></div><div className="vignette"></div>
      </div>
      <main className="page">
        <Link href="/" className="logo" aria-label="Limelight home">
          <img className="logo-img" src="/logo.png" alt="limelight — Elevate & Illuminate" width="3096" height="774" />
        </Link>
        <section className="card">
          <div className="card-head">
            <svg className="mascot" role="img" aria-label="Limelight mascot"><use href="#i-mascot" /></svg>
            <div className="bubble" dangerouslySetInnerHTML={{ __html: bubble }} />
          </div>
          <div className="card-body">{children}</div>
        </section>
      </main>
    </>
  );
}

function Field({ id, label, type = 'text', value, onChange, placeholder, error, right, autoComplete }) {
  return (
    <div className={'field' + (error ? ' invalid' : '')}>
      <div className="label-row"><label htmlFor={id}>{label}</label>{right}</div>
      <div className="control"><input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} /></div>
      <div className="error">{error}</div>
    </div>
  );
}

export function LoginScreen() {
  const { login, ready, isAuthed } = useAuth();
  const { toast } = useUi();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState({});
  // Read the ?expired=1 flag after mount so server and client render the same markup.
  useEffect(() => { if (/[?&]expired=1/.test(window.location.search)) setErr({ pw: 'Your session has expired. Please log in again.' }); }, []);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  useEffect(() => { if (ready && isAuthed) router.replace('/dashboard'); }, [ready, isAuthed, router]);

  const submit = async e => {
    e.preventDefault();
    const errs = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!pw) errs.pw = 'Password is required.';
    if (Object.keys(errs).length) { setErr(errs); return; }
    setBusy(true);
    try { await login(email.trim(), pw); toast('Signed in. Welcome back to Limelight!'); router.replace('/dashboard'); }
    catch (ex) { setErr({ pw: ex.message || 'Sign in failed.' }); }
    finally { setBusy(false); }
  };

  const sendReset = async e => {
    e.preventDefault();
    try { const r = await AuthModel.forgotPassword(resetEmail.trim()); toast(r.message || 'If the account exists, reset instructions were sent.'); setReset(false); }
    catch (ex) { toast(ex.message); }
  };

  return (
    <Stage bubble="Welcome back 👋<br>Login to continue.">
      <form className="view active" onSubmit={submit} noValidate>
        <Field id="email" label="Email Address" type="email" value={email} onChange={v => { setEmail(v); setErr({}); }} placeholder="Enter email" error={err.email} autoComplete="email" />
        <div className={'field' + (err.pw ? ' invalid' : '')}>
          <div className="label-row"><label htmlFor="password">Password</label><button type="button" className="link" onClick={() => { setResetEmail(email); setReset(true); }}>Forgot Password?</button></div>
          <div className="control" style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
            <input id="password" className="pw" type={showPw ? 'text' : 'password'} value={pw} onChange={e => { setPw(e.target.value); setErr({}); }} placeholder="Enter password" autoComplete="current-password" />
            <button type="button" className="eye" aria-label={showPw ? 'Hide password' : 'Show password'} onClick={() => setShowPw(s => !s)} style={{ color: showPw ? 'var(--accent)' : undefined }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            </button>
          </div>
          <div className="error">{err.pw}</div>
        </div>
        <div className="actions">
          <button className={'btn btn-primary' + (busy ? ' loading' : '')} type="submit" disabled={busy}><span className="spinner"></span>Login</button>
          <div className="demo">
            <div className="demo-title">Limelight workspace</div>
            <div className="auth-note" style={{ textAlign: 'left' }}>Sign in with the email and password your admin created for you. You stay signed in on this device.</div>
          </div>
        </div>
      </form>

      {reset && (
        <div className="scrim open" onClick={e => { if (e.target === e.currentTarget) setReset(false); }} role="presentation">
          <div className="dialog" role="dialog" aria-modal="true">
            <h2>Reset Password</h2>
            <p>Enter your email address and we&apos;ll send you a link to reset your password.</p>
            <form onSubmit={sendReset} noValidate>
              <Field id="reset-email" label="Email Address" type="email" value={resetEmail} onChange={setResetEmail} placeholder="Enter your email" />
              <div className="row"><button type="button" className="btn btn-ghost" onClick={() => setReset(false)}>Cancel</button><button type="submit" className="btn btn-primary">Send Reset Email</button></div>
            </form>
          </div>
        </div>
      )}
    </Stage>
  );
}

export function SignupScreen() {
  const { register } = useAuth();
  const { toast } = useUi();
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', phone: '', company: '', password: '', role: '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = k => v => { setF(x => ({ ...x, [k]: v })); setErr({}); };

  const submit = async e => {
    e.preventDefault();
    const errs = {};
    if (f.name.trim().length < 2) errs.name = 'Full name is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errs.email = 'Enter a valid email address.';
    if (f.password.length < 6) errs.password = 'Password must be at least 6 characters.';
    if (Object.keys(errs).length) { setErr(errs); return; }
    setBusy(true);
    try { await register({ name: f.name.trim(), email: f.email.trim(), password: f.password, phone: f.phone.trim(), company: f.company.trim(), role: f.role.trim() }); toast('Account created. Welcome to Limelight!'); router.replace('/dashboard'); }
    catch (ex) { setErr({ _form: ex.message || 'Sign up failed.' }); }
    finally { setBusy(false); }
  };

  return (
    <Stage bubble="Create your account 🚀<br>Let's get you started.">
      <form className="view active" onSubmit={submit} noValidate>
        <Field id="su-name" label="Full Name" value={f.name} onChange={set('name')} placeholder="Enter your full name" error={err.name} autoComplete="name" />
        <Field id="su-email" label="Email Address" type="email" value={f.email} onChange={set('email')} placeholder="Enter your email" error={err.email} autoComplete="email" />
        <Field id="su-password" label="Password" type="password" value={f.password} onChange={set('password')} placeholder="Min 6 characters" error={err.password} autoComplete="new-password" />
        <Field id="su-phone" label="Phone Number" type="tel" value={f.phone} onChange={set('phone')} placeholder="Enter your phone number" autoComplete="tel" />
        <Field id="su-company" label="Company Name" value={f.company} onChange={set('company')} placeholder="Enter your company name" autoComplete="organization" />
        <Field id="su-role" label="Designation" value={f.role} onChange={set('role')} placeholder="e.g. HR Manager, CEO" />
        {err._form && <div className="error" style={{ display: 'block' }}>{err._form}</div>}
        <div className="actions">
          <button className={'btn btn-primary' + (busy ? ' loading' : '')} type="submit" disabled={busy}><span className="spinner"></span>Sign Up</button>
          <div className="foot">Already have an account? <Link href="/login" className="link">Login</Link></div>
        </div>
      </form>
    </Stage>
  );
}
