import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{title}</h1>
      {description ? (
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
      {footer ? <div className="mt-6 text-sm text-zinc-400">{footer}</div> : null}
    </section>
  );
}

/** Mensagem de erro do formulário inteiro — não de um campo. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300"
    >
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-xl border border-brand/30 bg-brand/10 px-3.5 py-2.5 text-sm text-zinc-200"
    >
      {children}
    </p>
  );
}
