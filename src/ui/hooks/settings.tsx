import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SETTINGS_KEY, loadSettings, parseSettings, saveSettings, type Settings } from '../../persistence/settings';
import { getBrowserStorage } from '../../persistence/storage';

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reducedMotion: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const storage = getBrowserStorage();
  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage));
  const reducedMotion = usePrefersReducedMotion();

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        saveSettings(storage, next);
        return next;
      });
    },
    [storage],
  );

  // Keep settings in sync across tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) setSettings(parseSettings(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Apply colour theme to the document.
  useEffect(() => {
    const root = document.documentElement;
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && !!mql?.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      root.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    mql?.addEventListener('change', apply);
    return () => mql?.removeEventListener('change', apply);
  }, [settings.theme]);

  const value = useMemo(() => ({ settings, update, reducedMotion }), [settings, update, reducedMotion]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
