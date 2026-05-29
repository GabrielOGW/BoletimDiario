'use client';

import { useId } from 'react';
import { cn } from '@/utils/cn';

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
}: TextAreaFieldProps) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wide text-zinc-400"
      >
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 text-base text-zinc-100',
          'transition placeholder:text-zinc-600',
          'focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30',
        )}
      />
    </div>
  );
}
