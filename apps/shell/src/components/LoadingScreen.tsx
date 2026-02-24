/**
 * LoadingScreen — Infinity OS boot screen
 * Shown while the kernel initialises and session restores
 */

import React from 'react';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Initialising Infinity OS...' }: LoadingScreenProps) {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-label={message}>
      <div className="loading-logo" aria-hidden="true">∞</div>
      <p className="loading-text">{message}</p>
    </div>
  );
}