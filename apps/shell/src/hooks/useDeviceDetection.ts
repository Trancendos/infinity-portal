/**
 * Infinity OS — Device Detection Hook
 * Adopted from infinity-worker frontend hooks
 * Detects phone/tablet/desktop for responsive OS layout
 */

import { useState, useEffect } from 'react';

export type DeviceType = 'phone' | 'tablet' | 'desktop';

export interface DeviceInfo {
  type: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
  isLandscape: boolean;
  isPortrait: boolean;
  pixelRatio: number;
  touchEnabled: boolean;
}

export function useDeviceDetection(): DeviceInfo {
  const getDeviceInfo = (): DeviceInfo => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const type: DeviceType = width < 768 ? 'phone' : width < 1024 ? 'tablet' : 'desktop';

    return {
      type,
      isMobile: type === 'phone',
      isTablet: type === 'tablet',
      isDesktop: type === 'desktop',
      width,
      height,
      isLandscape: width > height,
      isPortrait: height >= width,
      pixelRatio: window.devicePixelRatio || 1,
      touchEnabled: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    };
  };

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(getDeviceInfo);

  useEffect(() => {
    const handleResize = () => setDeviceInfo(getDeviceInfo());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return deviceInfo;
}