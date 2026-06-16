import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-action text-white shadow-soft active:translate-y-px',
  secondary: 'border border-line bg-white text-ink active:translate-y-px',
  danger: 'bg-danger text-white active:translate-y-px',
  ghost: 'bg-transparent text-slate-700 active:translate-y-px'
};

export function Button({ className = '', variant = 'primary', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      {...props}
      className={`min-h-11 min-w-0 rounded-md px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}
