// Root route — redirect straight to dashboard / auth (no marketing).
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useSession } from "@/lib/auth";

export default function Index() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    navigate(session ? "/dashboard" : "/auth", { replace: true });
  }, [loading, session, navigate]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}
