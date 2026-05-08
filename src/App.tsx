import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "./pages/Landing";
import LandingFeatures from "./pages/LandingFeatures";
import LandingCommunity from "./pages/LandingCommunity";
import LandingPolicies from "./pages/LandingPolicies";
import LandingDownload from "./pages/LandingDownload";
import Auth from "./pages/Auth";
import AppLayout from "./app/AppLayout";
import Dashboard from "./app/Dashboard";
import Communities from "./app/Communities";
import Leaderboards from "./app/Leaderboards";
import SettingsPage from "./app/Settings";
import Trails from "./app/Trails";
import NotificationsPage from "./app/Notifications";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/features" element={<LandingFeatures />} />
          <Route path="/community" element={<LandingCommunity />} />
          <Route path="/policies" element={<LandingPolicies />} />
          <Route path="/download" element={<LandingDownload />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="trails" element={<Trails />} />
            <Route path="run" element={<Trails />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="communities" element={<Communities />} />
            <Route path="leaderboards" element={<Leaderboards />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
