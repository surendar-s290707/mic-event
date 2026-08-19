import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

/* Buttons ----------------------------------------------------------------- */

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  loading?: boolean;
}

export function Button({
  variant = 'default',
  size = 'md',
  block,
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    size !== 'md' ? `btn--${size}` : '',
    block ? 'btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* Fields ------------------------------------------------------------------ */

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field__hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function Input({
  invalid,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={`input ${invalid ? 'input--invalid' : ''} ${className}`} {...rest} />;
}

export function Textarea({
  invalid,
  className = '',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={`input ${invalid ? 'input--invalid' : ''} ${className}`} {...rest} />;
}

/* Card -------------------------------------------------------------------- */

export function Card({
  children,
  tint,
  padSm,
  className = '',
}: {
  children: ReactNode;
  tint?: boolean;
  padSm?: boolean;
  className?: string;
}) {
  return (
    <div className={`card ${tint ? 'card--tint' : ''} ${padSm ? 'card--pad-sm' : ''} ${className}`}>
      {children}
    </div>
  );
}

/* Badge ------------------------------------------------------------------- */

export function Badge({
  children,
  tone = 'neutral',
  dot,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warn' | 'danger' | 'outline';
  dot?: boolean;
}) {
  return (
    <span className={`badge ${tone !== 'neutral' ? `badge--${tone}` : ''}`}>
      {dot && <span className="dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* Progress + stats -------------------------------------------------------- */

export function Progress({ value, max, complete }: { value: number; max: number; complete?: boolean }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={`progress ${complete ? 'progress--success' : ''}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div className="progress__bar" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

/* Banner ------------------------------------------------------------------ */

export function Banner({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warn' | 'error';
  children: ReactNode;
}) {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/* Loading / empty / error states ------------------------------------------ */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner spinner--lg" aria-hidden="true" />
      <span className="state__body">{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <span className="state__title">{title}</span>
      {body && <p className="state__body">{body}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  body,
  action,
}: {
  title?: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state state--error" role="alert">
      <span className="state__title">{title}</span>
      {body && <p className="state__body">{body}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/* Dialog ------------------------------------------------------------------ */

export function Dialog({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.2rem' }}>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </div>
        {children}
        {footer && (
          <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* Dev note — marks anything still running on mock data ---------------------- */

export function DevNote({ children }: { children: ReactNode }) {
  return (
    <p className="devnote">
      <span className="devnote__tag">Mock</span>
      <span>{children}</span>
    </p>
  );
}
