import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { disablePush } from "@/features/push/webPush";

type Result = { error: Error | null };
interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<Result>;
  sendEmailLink: (email: string, captchaToken?: string) => Promise<Result>;
  sendPhoneOtp: (phoneE164: string, captchaToken?: string) => Promise<Result>;
  verifyPhoneOtp: (phoneE164: string, token: string) => Promise<Result>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx | undefined>(undefined);
const callbackUrl = () => `${window.location.origin}/auth/callback`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    // A stored session can outlive the account (deleted, banned, or every session revoked): the access token
    // stays valid for up to an hour, so ask Auth on open and when the app comes back to the foreground.
    // Only a definite "no such user / session" answer signs out; network errors never do.
    const check = async () => {
      const { data } = await supabase.auth.getSession(); if (!data.session) return;
      const { error } = await supabase.auth.getUser();
      const e = error as (Error & { status?: number; code?: string }) | null;
      if (e && (e.status === 401 || e.status === 403 || /user_not_found|session_not_found|user_banned|does not exist/i.test(`${e.code ?? ""} ${e.message}`)))
        await supabase.auth.signOut({ scope: "local" });
    };
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); void check(); });
    const onVis = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { subscription.unsubscribe(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    loading,
    signInWithGoogle: async () => {
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl() } });
      return { error };
    },
    sendEmailLink: async (email, captchaToken) => {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true, captchaToken } });
      return { error };
    },
    sendPhoneOtp: async (phone, captchaToken) => {
      const { error } = await supabase.auth.signInWithOtp({ phone, options: { captchaToken } });
      return { error };
    },
    verifyPhoneOtp: async (phone, token) => {
      const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
      return { error };
    },
    // a shared phone must not keep showing the previous person's alerts
    signOut: async () => { await disablePush().catch(() => undefined); await supabase.auth.signOut(); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
