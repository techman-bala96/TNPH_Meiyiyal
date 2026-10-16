import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function Splash() {
  return <div className="grid min-h-dvh place-items-center"><img src="/icon-192.png" alt="" className="h-16 w-16 animate-pulse rounded-2xl" /></div>;
}
/** Only signed-in users pass; others go to /login and return afterwards. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Outlet />;
}
/** Signed-in users skip the login page. */
export function GuestOnly() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
