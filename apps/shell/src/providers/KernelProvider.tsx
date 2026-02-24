/**
 * KernelProvider — React context for the Infinity OS Kernel
 * Makes the kernel instance available throughout the shell
 */

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { InfinityKernel, getKernel } from '@infinity-os/kernel';

interface KernelContextValue {
  kernel: InfinityKernel;
  isReady: boolean;
  uptime: number;
}

const KernelContext = createContext<KernelContextValue | null>(null);

export function KernelProvider({ children }: { children: React.ReactNode }) {
  const kernel = useRef(getKernel()).current;
  const [isReady, setIsReady] = useState(false);
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    kernel.start().then(() => {
      setIsReady(true);
      console.log('[Shell] Kernel ready:', kernel.getStatus());
    });

    // Update uptime every second
    const interval = setInterval(() => {
      setUptime(kernel.uptime);
    }, 1000);

    return () => {
      clearInterval(interval);
      kernel.stop();
    };
  }, [kernel]);

  return (
    <KernelContext.Provider value={{ kernel, isReady, uptime }}>
      {children}
    </KernelContext.Provider>
  );
}

export function useKernel(): KernelContextValue {
  const ctx = useContext(KernelContext);
  if (!ctx) throw new Error('useKernel must be used within KernelProvider');
  return ctx;
}