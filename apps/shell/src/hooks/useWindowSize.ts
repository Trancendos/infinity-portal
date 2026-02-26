/**
 * Infinity OS — Window Size Hook
 * Adopted from infinity-worker frontend hooks
 * Tracks viewport dimensions for responsive OS layout
 */

import { useState, useEffect } from 'react';

export interface WindowSize {
  width: number;
  height: number;
  isSmall: boolean;    // < 640px
  isMedium: boolean;   // 640-1024px
  isLarge: boolean;    // > 1024px
  isXLarge: boolean;   // > 1280px
}

export function useWindowSize(): WindowSize {
  const getSize = (): WindowSize => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    return {
      width,
      height,
      isSmall: width < 640,
      isMedium: width >= 640 && width < 1024,
      isLarge: width >= 1024 && width < 1280,
      isXLarge: width >= 1280,
    };
  };

  const [size, setSize] = useState<WindowSize>(getSize);

  useEffect(() => {
    const handleResize = () => setSize(getSize());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}