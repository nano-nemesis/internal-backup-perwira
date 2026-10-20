import React from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-semibold text-[#0F172A]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full px-3.5 py-2.5 min-h-[44px] bg-white border border-[#DADDE8] rounded-xl text-sm text-[#0F172A] placeholder-[#94A3B8]',
          'focus:outline-none focus:ring-4 focus:ring-[#4255F0]/15 focus:border-[#4255F0] transition-colors',
          error && 'border-[#DC2626]',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
    </div>
  )
}
