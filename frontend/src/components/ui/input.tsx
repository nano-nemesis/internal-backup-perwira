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
        <label htmlFor={inputId} className="text-sm font-medium text-[#0F172A]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-md text-sm text-[#0F172A] placeholder-[#94A3B8]',
          'focus:outline-none focus:ring-2 focus:ring-[#0077FF] focus:border-[#0077FF] transition-colors',
          error && 'border-[#E63000]',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-[#E63000]">{error}</p>}
    </div>
  )
}
