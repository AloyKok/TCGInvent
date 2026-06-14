import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '../components/Button';
import { Field, TextInput } from '../components/Field';
import { hasSupabaseConfig } from '../lib/supabase/client';
import { signIn } from '../lib/supabase/api';
import { useAuth } from '../lib/supabase/AuthProvider';

export function AuthScreen() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const next = searchParams.get('next') || '/';
  const mutation = useMutation({
    mutationFn: () => signIn(username, password)
  });

  if (user) return <Navigate to={next} replace />;

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-5 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-wide text-action">CardPulse</p>
        <h1 className="mt-1 text-2xl font-black">Sign in</h1>
        {!hasSupabaseConfig && (
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Set Supabase env vars before signing in.</p>
        )}
        <form
          className="mt-5 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <Field label="Username">
            <TextInput autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              autoComplete="current-password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          {mutation.error && <p className="text-sm text-danger">{mutation.error.message}</p>}
          <Button disabled={mutation.isPending}>{mutation.isPending ? 'Signing in...' : 'Sign in'}</Button>
        </form>
      </div>
    </div>
  );
}
