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
import { LanguageProvider } from "@/lib/i18n";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/event/:id" element={<EventAdmin />} />
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
