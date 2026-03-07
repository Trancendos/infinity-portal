import React from 'react';
import { cn } from './utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'bordered';
}

export function Card({ className, variant = 'default', children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl p-4',
        variant === 'default' && 'bg-gray-900 border border-gray-800',
        variant === 'glass' && 'bg-gray-900/60 backdrop-blur-xl border border-gray-700/50',
        variant === 'bordered' && 'bg-transparent border-2 border-gray-700',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}