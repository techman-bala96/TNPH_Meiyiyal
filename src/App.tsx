import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { GuestOnly, RequireAuth, RequireLocation } from "@/components/app/Guards";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import LocationPage from "@/pages/LocationPage";

const qc = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route element={<GuestOnly />}><Route path="/login" element={<Login />} /></Route>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route element={<RequireAuth />}>
              <Route path="/location" element={<LocationPage />} />
              <Route element={<RequireLocation />}><Route path="/" element={<Home />} /></Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
