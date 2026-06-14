import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { removeMembership } from '../lib/supabase/api';
import { useMembershipsQuery, useOrg } from '../lib/org/OrgProvider';
import { useAuth } from '../lib/supabase/AuthProvider';

export function UsersScreen() {
  const { organization, isOwner } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const membershipsQuery = useMembershipsQuery();
  const removeMutation = useMutation({
    mutationFn: (id: string) => removeMembership(organization.id, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['memberships'] })
  });

  return (
    <div className="grid gap-4">
      <h2 className="text-2xl font-black">Users</h2>
      {!isOwner && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Only owners can remove admins.</p>}
      <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700">Accounts are provisioned centrally. Public account creation is disabled.</p>
      <div className="grid gap-2">
        {(membershipsQuery.data || []).map((membership) => (
          <div key={membership.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-line bg-white p-3">
            <div className="min-w-0">
              <p className="break-all font-black">{membership.displayName || (membership.userId === user?.id ? 'You' : membership.userId)}</p>
              <p className="text-sm text-slate-600">{membership.role}</p>
            </div>
            {isOwner && membership.userId !== user?.id && (
              <Button variant="danger" onClick={() => removeMutation.mutate(membership.id)}>Remove</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
