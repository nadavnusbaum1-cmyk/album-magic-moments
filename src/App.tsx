import { type MouseEvent } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Album from "./pages/Album.tsx";
import Person from "./pages/Person.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import EventAdmin from "./pages/EventAdmin.tsx";
import EventPublic from "./pages/EventPublic.tsx";
import Upload from "./pages/Upload.tsx";
import AdminPanel from "./pages/AdminPanel.tsx";
import PlanSelection from "./pages/PlanSelection.tsx";
import Accessibility from "./pages/Accessibility.tsx";
import { LanguageProvider, useI18n } from "@/lib/i18n";
import { AccessibilityWidget } from "@/components/AccessibilityWidget";

const queryClient = new QueryClient();

// "Skip to content" link — first thing keyboard/screen-reader users reach.
function SkipLink() {
  const { lang } = useI18n();
  const jump = (e: MouseEvent) => {
    e.preventDefault();
    const el = (document.getElementById("main-content") || document.querySelector("main") || document.getElementById("root")) as HTMLElement | null;
    if (el) { el.setAttribute("tabindex", "-1"); el.focus(); el.scrollIntoView(); }
  };
  return (
    <a href="#main-content" className="skip-link" onClick={jump}>
      {lang === "he" ? "דילוג לתוכן" : "Skip to content"}
    </a>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SkipLink />
          <AccessibilityWidget />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/event/:id" element={<EventAdmin />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/plan" element={<PlanSelection />} />
            <Route path="/accessibility" element={<Accessibility />} />
            <Route path="/e/:slug" element={<EventPublic />} />
            <Route path="/u/:slug" element={<Upload />} />
            <Route path="/album/:token" element={<Album />} />
            <Route path="/person/:id" element={<Person />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
