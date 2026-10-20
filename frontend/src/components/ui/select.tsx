import React from 'react'
import { cn } from '../../lib/utils'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
}

export function Select({ label, error, options, className, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-sm font-semibold text-[#0F172A]">{label}</label>
      )}
      <select
        className={cn(
          'w-full px-3.5 py-2.5 min-h-[44px] bg-white border border-[#DADDE8] rounded-xl text-sm text-[#0F172A]',
          'focus:outline-none focus:ring-4 focus:ring-[#4255F0]/15 focus:border-[#4255F0] transition-colors',
          error && 'border-[#DC2626]',
          className,
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-[#DC2626]">{error}</p>}
    </div>
  )
}
