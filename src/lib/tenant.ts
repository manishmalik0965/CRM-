import { createContext, useContext } from 'react';

export interface ClientTenant {
  id: string;
  name: string;
  domain: string;
  isActive: boolean;
  createdAt: any;
}

interface TenantContextType {
  clientId: string | null;
  activeClient: ClientTenant | null;
  setClientId: (id: string | null) => void;
}

export const TenantContext = createContext<TenantContextType>({
  clientId: null,
  activeClient: null,
  setClientId: () => {},
});

export const useTenant = () => useContext(TenantContext);

export function getDbPath(basePath: string, clientId: string | null) {
  if (!clientId || clientId === 'default') return basePath;
  return `clients/${clientId}/${basePath}`;
}
