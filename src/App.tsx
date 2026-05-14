import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import OtpLogin from "./pages/OtpLogin";
import ResetPassword from "./pages/ResetPassword";
import WorkerRegistration from "./pages/WorkerRegistration";
import Dashboard from "./pages/Dashboard";
import Feeds from "./pages/Feeds";
import WorkerDetail from "./pages/WorkerDetail";
import Requests from "./pages/Requests";
import RequestDetail from "./pages/RequestDetail";
import Wallet from "./pages/Wallet";
import Profile from "./pages/Profile";
import WorkerRequests from "./pages/WorkerRequests";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/otp-login" element={<OtpLogin />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/worker-registration" element={<WorkerRegistration />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/feeds" element={<Feeds />} />
            <Route path="/worker/:workerId" element={<WorkerDetail />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/request/:requestId" element={<RequestDetail />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/worker/requests" element={<WorkerRequests />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
