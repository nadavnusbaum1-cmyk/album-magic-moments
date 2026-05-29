import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export const HomeButton = () => {
  const { t } = useI18n();
  return (
    <div className="fixed top-4 start-4 z-50">
      <Link to="/">
        <Button variant="secondary" size="sm" className="gap-2 shadow-md">
          <Home className="w-4 h-4" /> {t("home")}
        </Button>
      </Link>
    </div>
  );
};
