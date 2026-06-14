import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './client';
import { isLocalDemoMode } from './client';

export function useRealtimeSync(orgId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isLocalDemoMode) {
      const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['inventory', orgId] });
        queryClient.invalidateQueries({ queryKey: ['history', orgId] });
        queryClient.invalidateQueries({ queryKey: ['events', orgId] });
        queryClient.invalidateQueries({ queryKey: ['settings', orgId] });
        queryClient.invalidateQueries({ queryKey: ['memberships'] });
      };
      window.addEventListener('cardpulse-local-change', refresh);
      window.addEventListener('storage', refresh);
      return () => {
        window.removeEventListener('cardpulse-local-change', refresh);
        window.removeEventListener('storage', refresh);
      };
    }

    const channel = supabase
      .channel(`org-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `org_id=eq.${orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['inventory', orgId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `org_id=eq.${orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['history', orgId] });
        queryClient.invalidateQueries({ queryKey: ['inventory', orgId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'show_events', filter: `org_id=eq.${orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['events', orgId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `org_id=eq.${orgId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['settings', orgId] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);
}
