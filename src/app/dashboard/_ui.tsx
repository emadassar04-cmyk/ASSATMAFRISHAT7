import type { ReactNode } from 'react';

export type SP = Record<string, string | string[] | undefined>;
export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}

/** رسائل النجاح/الخطأ القادمة من الـ Server Actions عبر ?ok= و ?error= */
export function Flash({ sp }: { sp: SP }) {
  const ok = first(sp.ok);
  const error = first(sp.error);
  if (!ok && !error) return null;
  return (
    <p role={error ? 'alert' : 'status'}
      className={`mb-4 rounded-card border p-3 text-sm ${error ? 'border-danger/40 bg-danger/10 text-danger' : 'border-ok/40 bg-ok/10 text-ok'}`}>
      {error || ok}
    </p>
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-9 items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-[var(--primary)]" />
      {label}
    </label>
  );
}
