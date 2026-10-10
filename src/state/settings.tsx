import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Lang } from '../types';

export interface Settings {
  ageConfirmed: boolean;
  guest: boolean;
  language: Lang | null;
  voice: string | null;
}
const DEFAULT: Settings = { ageConfirmed: false, guest: false, language: null, voice: null };
const KEY = 'onefm.settings.v1';

interface Ctx { s: Settings; loaded: boolean; update: (p: Partial<Settings>) => void }
const SettingsCtx = createContext<Ctx>({ s: DEFAULT, loaded: false, update: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => { if (raw) setS({ ...DEFAULT, ...JSON.parse(raw) }); })
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
