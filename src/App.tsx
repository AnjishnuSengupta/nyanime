
import React, { useEffect, useRef } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import AnimeDetails from "./pages/AnimeDetails";
import VideoPage from "./pages/VideoPage";
import NotFound from "./pages/NotFound";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AnimeList from "./pages/AnimeList";
import CliLogin from "./pages/CliLogin";
import Notifications from "./pages/Notifications";
import NetworkStatus from "./components/NetworkStatus";
import InstallPrompt from "./components/InstallPrompt";
import { HelmetProvider } from "react-helmet-async";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: 1000,
      staleTime: 300000, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Wraps each page with a CSS-only fade + slide-up entrance on route change.
 * Uses tailwindcss-animate classes (already installed via tailwindcss-animate).
 * Must be rendered inside <BrowserRouter> so useLocation is available.
 */
const PageTransition = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Force re-trigger by removing then re-adding the animate-in classes
    el.classList.remove('animate-in', 'fade-in', 'slide-in-from-bottom-2');
    void el.offsetWidth; // force reflow
    el.classList.add('animate-in', 'fade-in', 'slide-in-from-bottom-2');
  }, [location.pathname]);

  return (
    <div
      ref={ref}
      className="animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{ animationFillMode: 'both' }}
    >
      {children}
    </div>
  );
};

const App = () => (
  <HelmetProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <NetworkStatus />
        <InstallPrompt />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PageTransition><Index /></PageTransition>} />
            <Route path="/anime" element={<PageTransition><AnimeList /></PageTransition>} />
            <Route path="/anime/:id" element={<PageTransition><AnimeDetails /></PageTransition>} />
            <Route path="/anime/:id/watch" element={<PageTransition><VideoPage /></PageTransition>} />
            <Route path="/signin" element={<PageTransition><SignIn /></PageTransition>} />
            <Route path="/signup" element={<PageTransition><SignUp /></PageTransition>} />
            <Route path="/forgot-password" element={<PageTransition><ForgotPassword /></PageTransition>} />
            <Route path="/reset-password" element={<PageTransition><ResetPassword /></PageTransition>} />
            <Route path="/profile" element={<PageTransition><Profile /></PageTransition>} />
            <Route path="/settings" element={<PageTransition><Settings /></PageTransition>} />
            <Route path="/history" element={<PageTransition><Profile /></PageTransition>} />
            <Route path="/cli-login" element={<PageTransition><CliLogin /></PageTransition>} />
            <Route path="/notifications" element={<PageTransition><Notifications /></PageTransition>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </HelmetProvider>
);

export default App;
