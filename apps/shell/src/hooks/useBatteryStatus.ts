/**
 * Infinity OS — Battery Status Hook
 * Adopted from infinity-worker frontend hooks
 * Shows battery level in OS taskbar like a real OS
 */

import { useState, useEffect } from 'react';

export interface BatteryStatus {
  supported: boolean;
  level: number | null;        // 0-1
  levelPct: number | null;     // 0-100
  charging: boolean | null;
  chargingTime: number | null; // seconds to full
  dischargingTime: number | null; // seconds to empty
  status: 'charging' | 'discharging' | 'full' | 'unknown';
  icon: string; // emoji icon
}

function getBatteryIcon(level: number | null, charging: boolean | null): string {
  if (charging) return '⚡';
  if (level === null) return '🔋';
  if (level > 0.8) return '🔋';
  if (level > 0.5) return '🔋';
  if (level > 0.2) return '🪫';
  return '🪫';
}

function getBatteryStatus(level: number | null, charging: boolean | null): BatteryStatus['status'] {
  if (charging) return 'charging';
  if (level !== null && level >= 1.0) return 'full';
  if (level !== null) return 'discharging';
  return 'unknown';
}

export function useBatteryStatus(): BatteryStatus {
  const [status, setStatus] = useState<BatteryStatus>({
    supported: false,
    level: null,
    levelPct: null,
    charging: null,
    chargingTime: null,
    dischargingTime: null,
    status: 'unknown',
    icon: '🔋',
  });

  useEffect(() => {
    if (!('getBattery' in navigator)) {
      setStatus(prev => ({ ...prev, supported: false }));
      return;
    }

    let battery: any = null;

    const update = () => {
      if (!battery) return;
      const level = battery.level;
      const charging = battery.charging;
      setStatus({
        supported: true,
        level,
        levelPct: Math.round(level * 100),
        charging,
        chargingTime: battery.chargingTime === Infinity ? null : battery.chargingTime,
        dischargingTime: battery.dischargingTime === Infinity ? null : battery.dischargingTime,
        status: getBatteryStatus(level, charging),
        icon: getBatteryIcon(level, charging),
      });
    };

    (navigator as any).getBattery().then((b: any) => {
      battery = b;
      update();
      battery.addEventListener('levelchange', update);
      battery.addEventListener('chargingchange', update);
      battery.addEventListener('chargingtimechange', update);
      battery.addEventListener('dischargingtimechange', update);
    }).catch(() => {
      setStatus(prev => ({ ...prev, supported: false }));
    });

    return () => {
      if (battery) {
        battery.removeEventListener('levelchange', update);
        battery.removeEventListener('chargingchange', update);
        battery.removeEventListener('chargingtimechange', update);
        battery.removeEventListener('dischargingtimechange', update);
      }
    };
  }, []);

  return status;
}