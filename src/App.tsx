import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { GuestOnly, RequireAuth, RequireLocation } from "@/components/app/Guards";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import Browse from "@/pages/Browse";
import Profile from "@/pages/Profile";
import Settings from "@/pages/Settings";
import WorkerRegister from "@/pages/WorkerRegister";
import Admin from "@/pages/Admin";
import { ThemeProvider } from "next-themes";
import { PrefsSync } from "@/components/app/PrefsSync";
import LocationPage from "@/pages/LocationPage";
import Session from "@/pages/Session";
import History from "@/pages/History";
import { ConsultProvider } from "@/features/consult/ConsultProvider";

const qc = new QueryClient();

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="meiyiyal-theme" disableTransitionOnChange>
    <QueryClientProvider client={qc}>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <PrefsSync />
          <ConsultProvider>
          <Routes>
            <Route element={<GuestOnly />}><Route path="/login" element={<Login />} /></Route>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route element={<RequireAuth />}>
              <Route path="/location" element={<LocationPage />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/session/:id" element={<Session />} />
              <Route path="/history" element={<History />} />
              <Route element={<RequireLocation />}>
                <Route path="/" element={<Home />} />
                <Route path="/browse/:slug" element={<Browse />} />
                <Route path="/worker/register" element={<WorkerRegister />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ConsultProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </ThemeProvider>
  );
}
