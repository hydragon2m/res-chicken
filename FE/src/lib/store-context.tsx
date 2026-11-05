'use client';

import { usePathname } from 'next/navigation';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, getActor } from './auth';

export type StoreScope = { id: string; name: string; timezone: string };

type StoreContextType = {
  stores: StoreScope[];
  currentStoreId: string;
  currentStore: StoreScope | null;
  setCurrentStoreId: (id: string) => void;
  refreshStores: () => Promise<void>;
  loading: boolean;
};

const StoreContext = createContext<StoreContextType>({
  stores: [],
  currentStoreId: '',
  currentStore: null,
  setCurrentStoreId: () => {},
  refreshStores: async () => {},
  loading: true,
});

const STORE_STORAGE_KEY = 'chickres_active_store_id';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [stores, setStores] = useState<StoreScope[]>([]);
  const [currentStoreId, setCurrentStoreIdState] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const refreshStores = useCallback(async () => {
    try {
      const actor = await getActor();
      if (!actor || (!actor.isPlatformAdmin && !actor.storeIds?.length)) {
        setStores([]);
        setCurrentStoreIdState('');
        return;
      }

      const allStores = await apiRequest<StoreScope[]>('/auth/stores').catch(() => []);
      const scoped = actor.isPlatformAdmin
        ? allStores
        : allStores.filter((s) => actor.storeIds.includes(s.id));
      setStores(scoped);

      const saved = typeof window !== 'undefined' ? localStorage.getItem(STORE_STORAGE_KEY) : null;
      if (saved && scoped.some((s) => s.id === saved)) {
        setCurrentStoreIdState(saved);
      } else if (scoped.length > 0) {
        const preferred = scoped.find((s) => s.name === 'Chick Res Main') ?? scoped[0];
        setCurrentStoreIdState(preferred.id);
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORE_STORAGE_KEY, preferred.id);
        }
      } else {
        setCurrentStoreIdState('');
      }
    } catch {
      setStores([]);
      setCurrentStoreIdState('');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void refreshStores();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, refreshStores]);

  const setCurrentStoreId = (id: string) => {
    setCurrentStoreIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORE_STORAGE_KEY, id);
    }
  };

  const currentStore = stores.find((s) => s.id === currentStoreId) ?? null;

  return (
    <StoreContext.Provider
      value={{
        stores,
        currentStoreId,
        currentStore,
        setCurrentStoreId,
        refreshStores,
        loading,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useActiveStore() {
  return useContext(StoreContext);
}
