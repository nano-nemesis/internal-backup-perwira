import React from 'react'
import { cn } from '../../lib/utils'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-[#0077FF] hover:bg-[#0060CC] text-white',
    secondary: 'bg-white hover:bg-[#F8FAFC] text-[#0F172A] border border-[#E2E8F0]',
    danger: 'bg-[#E63000] hover:bg-[#C02800] text-white',
    warning: 'bg-[#FF8C00] hover:bg-[#E07800] text-white',
    ghost: 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F8FAFC] border border-transparent',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs min-h-[36px]',
    md: 'px-4 py-2 text-sm min-h-[40px]',
    lg: 'px-6 py-3 text-base min-h-[44px]',
  }

  return (
    <button
      className={cn(
        'rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin flex-shrink-0" />
      )}
      {children}
    </button>
  )
}
