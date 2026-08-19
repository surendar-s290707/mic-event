import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useApp } from '../store/context';
import { demoCredentials } from '../mock/data';
import type { Role } from '../lib/types';
import { Banner, Button, Card, Field, Input } from '../components/ui';

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = 'Enter your email';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'That doesn’t look like an email';
  if (!password) errors.password = 'Enter your password';
  return errors;
}

export function Login() {
  const { user, signIn } = useApp();
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>('ORGANIZER');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={user.role === 'ORGANIZER' ? '/organizer' : '/attendee'} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const nextErrors = validate(email, password);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const account = await signIn(email, password, role);
      navigate(account.role === 'ORGANIZER' ? '/organizer' : '/attendee', { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not sign you in');
    } finally {
      setSubmitting(false);
    }
  }

  function useDemoAccount() {
    const demo = demoCredentials[role];
    setEmail(demo.email);
    setPassword(demo.password);
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
            <div className="field">
              <span className="field__label">I’m here as</span>
              <div className="segmented" role="group" aria-label="Choose your role">
                <button
                  type="button"
                  className="segmented__option"
                  aria-pressed={role === 'ORGANIZER'}
                  onClick={() => setRole('ORGANIZER')}
                >
                  Organizer
                  <span className="segmented__note">Create & scan</span>
                </button>
                <button
                  type="button"
                  className="segmented__option"
                  aria-pressed={role === 'ATTENDEE'}
                  onClick={() => setRole('ATTENDEE')}
                >
                  Attendee
                  <span className="segmented__note">Register & attend</span>
                </button>
              </div>
            </div>

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

          {/* Development-mode hint. Removed once real auth lands. */}
          <div className="demo-hint">
            <div className="spread" style={{ marginBottom: 6 }}>
              <strong>Demo login</strong>
              <Button size="sm" onClick={useDemoAccount} type="button">
                Fill for me
              </Button>
            </div>
            <div className="demo-hint__row">
              <span className="muted">Email</span>
              <span className="mono">{demoCredentials[role].email}</span>
            </div>
            <div className="demo-hint__row">
              <span className="muted">Password</span>
              <span className="mono">{demoCredentials[role].password}</span>
            </div>
          </div>
        </Card>

        <p className="auth__foot">
          Mock sign-in for development — no accounts, passwords or tokens are stored yet.
        </p>
      </div>
    </div>
  );
}
