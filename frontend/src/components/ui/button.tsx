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
    primary: 'bg-[#4255F0] hover:bg-[#3442D9] text-white shadow-[0_10px_20px_-12px_#4255F0CC]',
    secondary: 'bg-white hover:bg-[#F4F5FA] text-[#0F172A] border border-[#DADDE8]',
    danger: 'bg-[#DC2626] hover:bg-[#B91C1C] text-white',
    warning: 'bg-[#D97706] hover:bg-[#B45309] text-white',
    ghost: 'text-[#334155] hover:text-[#0F172A] hover:bg-[#F1F2F7] border border-transparent',
  }

  const sizes = {
    sm: 'px-3.5 py-1.5 text-xs min-h-[36px]',
    md: 'px-4 py-2 text-sm min-h-[44px]',
    lg: 'px-6 py-3 text-base min-h-[52px]',
  }

  return (
    <button
      className={cn(
        'rounded-[14px] font-semibold transition-[color,background-color,box-shadow,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4255F0] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2',
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
