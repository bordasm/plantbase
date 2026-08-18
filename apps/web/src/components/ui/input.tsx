import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'flex h-10 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'
