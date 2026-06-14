import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMemberships } from '../supabase/api';
import type { Membership, Organization } from '../../types/domain';
import { useAuth } from '../supabase/AuthProvider';

interface OrgContextValue {
  organization: Organization;
  membership: Membership;
  isOwner: boolean;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

export function useMembershipsQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['memberships', user?.id],
    queryFn: listMemberships,
    enabled: Boolean(user)
  });
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const membershipsQuery = useMembershipsQuery();
  const membership = membershipsQuery.data?.[0];
  const organization = membership?.organization;

  const value = useMemo<OrgContextValue | undefined>(() => {
    if (!membership || !organization) return undefined;
    return { membership, organization, isOwner: membership.role === 'owner' };
  }, [membership, organization]);

  if (membershipsQuery.isLoading) {
    return <div className="grid min-h-dvh place-items-center bg-slate-50 p-6 text-slate-700">Loading organization...</div>;
  }

  if (!value) {
    return <>{children}</>;
  }

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const value = useContext(OrgContext);
  if (!value) throw new Error('useOrg must be used inside an organization route');
  return value;
}
