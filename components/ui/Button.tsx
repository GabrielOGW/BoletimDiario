import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-ink font-semibold hover:brightness-105 active:brightness-95',
  secondary: 'bg-surface-raised text-zinc-100 border border-line hover:bg-surface-hover',
  ghost: 'text-zinc-300 hover:bg-surface-hover hover:text-white',
  danger: 'bg-red-600 text-white font-semibold hover:bg-red-500 active:bg-red-700',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-[38px] px-3 text-sm gap-1.5',
  md: 'min-h-[46px] px-4 text-[15px] gap-2',
  lg: 'min-h-[54px] px-5 text-base gap-2.5',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth,
  leftIcon,
  rightIcon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-xl transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </button>
  );
}
