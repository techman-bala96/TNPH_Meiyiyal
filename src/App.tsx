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
import Wallet from "./pages/Wallet";
import Earnings from "./pages/Earnings";
import WorkerProfile from "@/pages/WorkerProfile";
import { ConsultProvider } from "@/features/consult/ConsultProvider";
import { BottomNav } from "@/components/app/BottomNav";
import { VoiceProvider } from "@/features/voice/VoiceProvider";
import Notifications from "@/pages/Notifications";
import Messages from "@/pages/Messages";
import { NotificationsSync } from "@/features/push/NotificationsSync";

const qc = new QueryClient();

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="meiyiyal-theme" disableTransitionOnChange>
    <QueryClientProvider client={qc}>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <PrefsSync />
          <NotificationsSync />
          <ConsultProvider>
          <VoiceProvider>
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
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/wallet" element={<Wallet />} />
              <Route path="/earnings" element={<Earnings />} />
              <Route path="/w/:id" element={<WorkerProfile />} />
              <Route element={<RequireLocation />}>
                <Route path="/" element={<Home />} />
                <Route path="/browse/:slug" element={<Browse />} />
                <Route path="/worker/register" element={<WorkerRegister />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <BottomNav />
          </VoiceProvider>
          </ConsultProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </ThemeProvider>
  );
}
