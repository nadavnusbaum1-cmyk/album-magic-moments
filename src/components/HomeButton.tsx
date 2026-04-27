import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export const HomeButton = () => (
  <div className="fixed top-4 left-4 z-50">
    <Link to="/">
      <Button variant="secondary" size="sm" className="gap-2 shadow-md">
        <Home className="w-4 h-4" /> Home
      </Button>
    </Link>
  </div>
);
