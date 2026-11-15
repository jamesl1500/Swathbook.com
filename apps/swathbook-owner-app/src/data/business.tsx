import { deviceStorage } from '@swathbook/mobile/device-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { useMemberships, type Membership } from './api';
import { useAuth } from './auth';

/**
 * Which business the app is showing. Remembered on the device, and falls back
 * to the first live business when the remembered one is gone.
 */

const ACTIVE_KEY = 'swathbook-business-active';

type BusinessState = {
  memberships: Membership[];
  active: Membership | null;
  setActive: (id: string) => void;
  /** Memberships have loaded (or failed). */
  ready: boolean;
  error: boolean;
  retry: () => void;
};

const BusinessContext = createContext<BusinessState | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const memberships = useMemberships(user?.id);
  const [preferred, setPreferred] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    deviceStorage.getItem(ACTIVE_KEY).then((id) => {
      if (current) setPreferred(id);
    });
    return () => {
      current = false;
    };
  }, []);

  const list = memberships.data ?? [];
  const active = list.find((membership) => membership.id === preferred) ?? list[0] ?? null;

  const value: BusinessState = {
    memberships: list,
    active,
    setActive: (id) => {
      setPreferred(id);
      void deviceStorage.setItem(ACTIVE_KEY, id);
    },
    ready: !user || memberships.isSuccess || memberships.isError,
    error: memberships.isError,
    retry: () => void memberships.refetch(),
  };
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness() {
  const value = useContext(BusinessContext);
  if (!value) throw new Error('useBusiness() needs <BusinessProvider>.');
  return value;
}

/** The active business, for screens that only render once there is one. */
export function useActiveBusiness() {
  const { active } = useBusiness();
  if (!active) throw new Error('No active business.');
  return { business: active, canManage: active.role !== 'crew' };
}
