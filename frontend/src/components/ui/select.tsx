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
        <label className="text-sm font-medium text-[#0F172A]">{label}</label>
      )}
      <select
        className={cn(
          'w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-md text-sm text-[#0F172A]',
          'focus:outline-none focus:ring-2 focus:ring-[#0077FF] focus:border-[#0077FF] transition-colors',
          error && 'border-[#E63000]',
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
      {error && <p className="text-xs text-[#E63000]">{error}</p>}
    </div>
  )
}
