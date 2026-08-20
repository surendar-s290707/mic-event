import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../store/session';
import { ApiError } from '../lib/api';
import { Banner, Button, Card, Field, Input } from '../components/ui';

const DEMO = {
  organizer: { email: 'aditi@mic.dev', password: 'mic12345' },
  attendee: { email: 'sneha@student.mic.dev', password: 'mic12345' },
};

export function Login() {
  const { user, status, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from;

  if (status === 'ready' && user) {
    return <Navigate to={from ?? (user.role === 'ORGANIZER' ? '/organizer' : '/attendee')} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = 'Enter your email';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      nextErrors.email = 'That doesn’t look like an email';
    if (!password) nextErrors.password = 'Enter your password';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const account = await signIn(email.trim(), password);
      navigate(from ?? (account.role === 'ORGANIZER' ? '/organizer' : '/attendee'), { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.details) setErrors(error.details);
      setFormError(error instanceof Error ? error.message : 'Could not sign you in');
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(which: keyof typeof DEMO) {
    setEmail(DEMO[which].email);
    setPassword(DEMO[which].password);
    setErrors({});
    setFormError(null);
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__head">
          <h1 style={{ fontSize: '1.9rem' }}>Welcome back</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Log in to run your events or pick up your ticket.
          </p>
        </div>

        <Card>
          <form className="stack" onSubmit={onSubmit} noValidate>
            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@mic.dev"
                value={email}
                invalid={Boolean(errors.email)}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field label="Password" htmlFor="password" error={errors.password}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                invalid={Boolean(errors.password)}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {formError && <Banner tone="error">{formError}</Banner>}

            <Button type="submit" variant="primary" size="lg" block loading={submitting}>
              {submitting ? 'Signing you in…' : 'Log in'}
            </Button>
          </form>

          {/* Seeded demo accounts — see prisma/seed.ts. */}
          <div className="demo-hint">
            <div className="spread" style={{ marginBottom: 8 }}>
              <strong>Demo accounts</strong>
              <span className="muted">password: mic12345</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Button size="sm" type="button" onClick={() => fillDemo('organizer')}>
                Organizer
              </Button>
              <Button size="sm" type="button" onClick={() => fillDemo('attendee')}>
                Attendee
              </Button>
            </div>
          </div>
        </Card>

        <p className="auth__foot">
          New here? <Link to="/signup" style={{ textDecoration: 'underline' }}>Create an account</Link>
        </p>
      </div>
    </div>
  );
}
