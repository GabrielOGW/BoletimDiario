'use client';

import { SearchIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/utils/cn';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
}: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
        <SearchIcon size={18} />
      </span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          'h-12 w-full rounded-xl border border-line bg-surface pl-11 pr-11 text-base text-zinc-100',
          'transition placeholder:text-zinc-600',
          'focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/30',
        )}
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 hover:bg-surface-hover hover:text-white"
        >
          <XIcon size={18} />
        </button>
      ) : null}
    </div>
  );
}
