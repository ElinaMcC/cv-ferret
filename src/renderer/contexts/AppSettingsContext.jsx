import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { settingsAPI } from '../services/ipc';

const defaults = { aiEnabled: true, cvOrder: 'newest-first', pageSize: 'A4', cvLocale: 'en-GB' };

const AppSettingsContext = createContext(defaults);

export function AppSettingsProvider({ children }) {
  const [appSettings, setAppSettings] = useState(defaults);

  const refresh = useCallback(() => {
    settingsAPI.getSettings()
      .then(s => setAppSettings({
        aiEnabled: s.aiEnabled !== false,
        cvOrder:   s.cvOrder   || 'newest-first',
        pageSize:  s.pageSize  || 'A4',
        cvLocale:  s.cvLocale  || 'en-GB',
      }))
      .catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AppSettingsContext.Provider value={{ ...appSettings, refresh }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
