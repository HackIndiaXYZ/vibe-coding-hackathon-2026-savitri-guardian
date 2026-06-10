import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "patient" | "emt" | "hospital";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  isReady: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null, session: null, role: null, loading: true, isReady: false,
  signOut: async () => {}, refreshRole: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

  const loadRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["patient", "emt", "hospital"]);
    const r = data?.[0]?.role as AppRole | undefined;
    setRole(r ?? null);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadRole(s.user.id), 0);
      } else {
        setRole(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      const done = () => { setLoading(false); setIsReady(true); };
      if (data.session?.user) loadRole(data.session.user.id).finally(done);
      else done();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{
      user: session?.user ?? null,
      session, role, loading, isReady,
      signOut: async () => { await supabase.auth.signOut(); },
      refreshRole: async () => { if (session?.user) await loadRole(session.user.id); },
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);

/** Returns true when auth state is hydrated AND a user is signed in. Use to gate protected queries. */
export const useAuthReady = () => {
  const { isReady, user } = useAuth();
  return isReady && !!user;
};

