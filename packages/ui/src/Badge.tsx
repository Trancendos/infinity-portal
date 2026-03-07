import React from 'react';
import { cn } from './utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variant === 'default' && 'bg-gray-700 text-gray-200',
        variant === 'success' && 'bg-green-900/50 text-green-400',
        variant === 'warning' && 'bg-yellow-900/50 text-yellow-400',
        variant === 'danger' && 'bg-red-900/50 text-red-400',
        variant === 'info' && 'bg-blue-900/50 text-blue-400',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}