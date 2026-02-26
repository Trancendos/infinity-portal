/**
 * Infinity OS — Network Status Hook
 * Adopted from infinity-worker frontend hooks
 * Shows network connectivity and speed in OS taskbar
 */

import { useState, useEffect } from 'react';

export type EffectiveConnectionType = '2g' | '3g' | '4g' | 'slow-2g' | 'unknown';

export interface NetworkStatus {
  online: boolean;
  effectiveType: EffectiveConnectionType;
  downlink: number | null;   // Mbps
  rtt: number | null;        // ms round-trip time
  saveData: boolean;
  icon: string;
  label: string;
  quality: 'excellent' | 'good' | 'fair' | 'poor' | 'offline';
}

function getNetworkQuality(
  online: boolean,
  effectiveType: EffectiveConnectionType,
  rtt: number | null,
): NetworkStatus['quality'] {
  if (!online) return 'offline';
  if (effectiveType === '4g' && (rtt === null || rtt < 100)) return 'excellent';
  if (effectiveType === '4g' || effectiveType === '3g') return 'good';
  if (effectiveType === '3g') return 'fair';
  return 'poor';
}

function getNetworkIcon(quality: NetworkStatus['quality']): string {
  switch (quality) {
    case 'excellent': return '📶';
    case 'good': return '📶';
    case 'fair': return '📶';
    case 'poor': return '📵';
    case 'offline': return '🔴';
    default: return '📶';
  }
}

function getNetworkLabel(online: boolean, effectiveType: EffectiveConnectionType, downlink: number | null): string {
  if (!online) return 'Offline';
  if (downlink !== null) return `${downlink} Mbps`;
  return effectiveType.toUpperCase();
}

export function useNetworkStatus(): NetworkStatus {
  const getStatus = (): NetworkStatus => {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const conn = (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    const effectiveType: EffectiveConnectionType = conn?.effectiveType || 'unknown';
    const downlink = conn?.downlink ?? null;
    const rtt = conn?.rtt ?? null;
    const saveData = conn?.saveData ?? false;
    const quality = getNetworkQuality(online, effectiveType, rtt);

    return {
      online,
      effectiveType,
      downlink,
      rtt,
      saveData,
      icon: getNetworkIcon(quality),
      label: getNetworkLabel(online, effectiveType, downlink),
      quality,
    };
  };

  const [status, setStatus] = useState<NetworkStatus>(getStatus);

  useEffect(() => {
    const updateOnline = () => setStatus(getStatus());
    const updateNetwork = () => setStatus(getStatus());

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    const conn = (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;

    if (conn) {
      conn.addEventListener('change', updateNetwork);
    }

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      if (conn) conn.removeEventListener('change', updateNetwork);
    };
  }, []);

  return status;
}