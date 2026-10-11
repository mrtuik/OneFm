import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lang } from '../types';
import { DEFAULT_PROVIDER, ProviderSettings } from '../ai/provider';

export type TextSize = 'small' | 'medium' | 'large';

export interface Settings {
  ageConfirmed: boolean;
  guest: boolean;
  language: Lang | null;
  /** Chosen system voice id per reading language. Empty means the device default. */
  voices: Partial<Record<Lang, string>>;
  autoPlay: boolean;
  textSize: TextSize;
  provider: ProviderSettings;
}
const DEFAULT: Settings = {
  ageConfirmed: false, guest: false, language: null,
  voices: {}, autoPlay: true, textSize: 'medium', provider: DEFAULT_PROVIDER,
};
const KEY = 'onefm.settings.v1';

interface Ctx { s: Settings; loaded: boolean; update: (p: Partial<Settings>) => void }
const SettingsCtx = createContext<Ctx>({ s: DEFAULT, loaded: false, update: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const p = JSON.parse(raw);
        setS({ ...DEFAULT, ...p, voices: { ...(p.voices ?? {}) }, provider: { ...DEFAULT.provider, ...(p.provider ?? {}) } });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const update = (p: Partial<Settings>) =>
    setS((prev) => {
      const next = { ...prev, ...p };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });

  return <SettingsCtx.Provider value={{ s, loaded, update }}>{children}</SettingsCtx.Provider>;
}
export const useSettings = () => useContext(SettingsCtx);
