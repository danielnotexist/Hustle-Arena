import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, PropsWithChildren, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

export function Button({
  className,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'primary' && 'bg-signal-orange text-ink-950 shadow-lg shadow-signal-orange/20 hover:bg-signal-orange-strong',
        variant === 'secondary' && 'bg-panel-900 text-white hover:bg-panel-800',
        variant === 'ghost' && 'bg-transparent text-zinc-300 hover:bg-white/5 hover:text-white',
        variant === 'danger' && 'bg-red-500/90 text-white hover:bg-red-500',
        className,
      )}
      {...props}
    />
  )
}

export function Panel({ className, children }: PropsWithChildren<{ className?: string }>) {
  return (
    <section className={cn('rounded-[28px] border border-white/10 bg-panel-950/90 p-5 shadow-[0_24px_70px_rgba(6,9,15,0.42)] backdrop-blur', className)}>
      {children}
    </section>
  )
}

export function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string
  value: string
  detail?: string
  accent: string
}) {
  return (
    <Panel className="relative overflow-hidden">
      <div className={cn('absolute inset-x-6 top-0 h-1 rounded-full', accent)} />
      <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">{label}</p>
      <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm text-zinc-400">{detail}</p> : null}
    </Panel>
  )
}

export function StatusBadge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
        tone === 'neutral' && 'bg-white/5 text-zinc-300',
        tone === 'success' && 'bg-emerald-500/15 text-emerald-300',
        tone === 'warning' && 'bg-amber-500/15 text-amber-300',
        tone === 'danger' && 'bg-red-500/15 text-red-300',
        tone === 'brand' && 'bg-signal-cyan/15 text-signal-cyan',
      )}
    >
      {children}
    </span>
  )
}

const fieldClassName =
  'w-full rounded-2xl border border-white/10 bg-panel-900/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-signal-cyan focus:ring-2 focus:ring-signal-cyan/30'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(fieldClassName, className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(fieldClassName, 'min-h-[120px] resize-y', className)} {...props} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn(fieldClassName, className)} {...props} />
})

export function SectionTitle({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-signal-cyan">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold text-white">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  )
}

export function LoadingState({ label = 'Loading arena data...' }: { label?: string }) {
  return (
    <Panel className="flex min-h-[240px] items-center justify-center">
      <div className="flex items-center gap-3 text-zinc-300">
        <Loader2 className="h-5 w-5 animate-spin text-signal-cyan" />
        <span>{label}</span>
      </div>
    </Panel>
  )
}

export function ErrorState({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <Panel className="flex min-h-[240px] flex-col items-center justify-center gap-4 text-center">
      <AlertCircle className="h-9 w-9 text-red-400" />
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <p className="max-w-xl text-sm text-zinc-400">{message}</p>
      </div>
      {action}
    </Panel>
  )
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: React.ReactNode
}) {
  return (
    <Panel className="border-dashed border-white/15 text-center">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-zinc-400">{message}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </Panel>
  )
}
