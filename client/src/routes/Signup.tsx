import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSession } from '../store/session';
import { ApiError } from '../lib/api';
import type { Role } from '../lib/types';
import { Banner, Button, Card, Field, Input } from '../components/ui';

type Errors = Partial<Record<'name' | 'email' | 'password' | 'role', string>>;

export function Signup() {
  const { user, status, signUp } = useSession();
  const navigate = useNavigate();

  const [role, setRole] = useState<Role>('ATTENDEE');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'ready' && user) {
    return <Navigate to={user.role === 'ORGANIZER' ? '/organizer' : '/attendee'} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Cheap client-side pass for instant feedback; the API validates again.
    const next: Errors = {};
    if (name.trim().length < 2) next.name = 'Tell us your name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'That doesn’t look like an email';
    if (password.length < 8) next.password = 'Use at least 8 characters';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const account = await signUp({ name: name.trim(), email: email.trim(), password, role });
      navigate(account.role === 'ORGANIZER' ? '/organizer' : '/attendee', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.details) setErrors(error.details as Errors);
      setFormError(error instanceof Error ? error.message : 'Could not create your account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__head">
          <h1 style={{ fontSize: '1.9rem' }}>Create your account</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            One account, whether you’re running events or going to them.
          </p>
        </div>

        <Card>
          <form className="stack" onSubmit={onSubmit} noValidate>
            <div className="field">
              <span className="field__label">I’m here to</span>
              <div className="segmented" role="group" aria-label="Choose your role">
                <button
                  type="button"
                  className="segmented__option"
                  aria-pressed={role === 'ATTENDEE'}
                  onClick={() => setRole('ATTENDEE')}
                >
                  Go to events
                  <span className="segmented__note">Register & attend</span>
                </button>
                <button
                  type="button"
                  className="segmented__option"
                  aria-pressed={role === 'ORGANIZER'}
                  onClick={() => setRole('ORGANIZER')}
                >
                  Run events
                  <span className="segmented__note">Create & scan</span>
                </button>
              </div>
            </div>

            <Field label="Name" htmlFor="name" error={errors.name}>
              <Input
                id="name"
                autoComplete="name"
                placeholder="Sneha Iyer"
                value={name}
                invalid={Boolean(errors.name)}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label="Email" htmlFor="email" error={errors.email}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@student.mic.dev"
                value={email}
                invalid={Boolean(errors.email)}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              error={errors.password}
              hint="At least 8 characters"
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                invalid={Boolean(errors.password)}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {formError && <Banner tone="error">{formError}</Banner>}

            <Button type="submit" variant="primary" size="lg" block loading={submitting}>
              {submitting ? 'Creating your account…' : 'Create account'}
            </Button>
          </form>
        </Card>

        <p className="auth__foot">
          Already have one? <Link to="/login" style={{ textDecoration: 'underline' }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}
