import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react'
import { cx } from './classNames'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-fg hover:bg-brand-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-sunken',
  ghost: 'text-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
}

export function Button({ variant = 'secondary', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...rest}
    />
  )
}

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger' | 'info'

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-muted border-line',
  brand: 'bg-brand-subtle text-brand border-transparent',
  ok: 'bg-ok-subtle text-ok border-transparent',
  warn: 'bg-warn-subtle text-warn border-transparent',
  danger: 'bg-danger-subtle text-danger border-transparent',
  info: 'bg-info-subtle text-info border-transparent',
}

export interface BadgeProps {
  readonly tone?: Tone
  readonly children: ReactNode
  readonly className?: string
  readonly title?: string
  readonly 'data-testid'?: string
}

export function Badge({ tone = 'neutral', children, className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap',
        BADGE_TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}

/** A rendered UK number plate. Costs nothing and says a lot. */
export function RegPlate({
  reg,
  className,
}: {
  readonly reg: string
  readonly className?: string
}) {
  return (
    <span className={cx('reg-plate', className)} data-testid="reg-plate">
      {reg}
    </span>
  )
}

export function Skeleton({ className }: { readonly className?: string }) {
  return <div className={cx('animate-pulse rounded bg-surface-sunken', className)} aria-hidden />
}

export interface EmptyStateProps {
  readonly title: string
  readonly description?: string
  readonly action?: ReactNode
  readonly 'data-testid'?: string
}

export function EmptyState({ title, description, action, ...rest }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line px-6 py-12 text-center"
      {...rest}
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      {description !== undefined && <p className="max-w-sm text-sm text-subtle">{description}</p>}
      {action}
    </div>
  )
}

export interface FieldProps {
  readonly label: string
  readonly htmlFor: string
  readonly hint?: string
  readonly error?: string
  readonly children: ReactNode
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {error !== undefined ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : (
        hint !== undefined && <p className="text-xs text-subtle">{hint}</p>
      )}
    </div>
  )
}

const CONTROL =
  'w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm text-ink ' +
  'placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-0'

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, className)} {...rest} />
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, 'min-h-20 resize-y', className)} {...rest} />
}

/** A labelled statistic. Renders an em dash for null, never a misleading zero. */
export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
  ...rest
}: {
  readonly label: string
  readonly value: string | null
  readonly hint?: string
  readonly tone?: Tone
  readonly 'data-testid'?: string
}) {
  const toneClass: Record<Tone, string> = {
    neutral: 'text-ink',
    brand: 'text-brand',
    ok: 'text-ok',
    warn: 'text-warn',
    danger: 'text-danger',
    info: 'text-info',
  }
  return (
    <div className="rounded-lg border border-line bg-surface p-3" {...rest}>
      <p className="text-[11px] tracking-wide text-subtle uppercase">{label}</p>
      <p data-numeric className={cx('mt-0.5 text-xl font-semibold', toneClass[tone])}>
        {value ?? '—'}
      </p>
      {hint !== undefined && <p className="mt-0.5 text-[11px] text-subtle">{hint}</p>}
    </div>
  )
}
