import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Shield, LayoutDashboard, Scale, Users2, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const SuperAdminToolbar: React.FC = () => {
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase.rpc("has_role", {
          _user_id: user.id,
          _role: "super_admin",
        } as any);
        if (error) throw error;
        setIsSuperAdmin(!!data);
      } catch (e) {
        // Silently fail; toolbar just won't render
        setIsSuperAdmin(false);
      } finally {
        setChecked(true);
      }
    };
    checkRole();
  }, [user]);

  if (!checked || !isSuperAdmin) return null;

  return (
    <nav aria-label="Super Admin toolbar" className="mb-4">
      <div className="w-full border rounded-md bg-muted/50">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Shield className="h-4 w-4 text-primary" />
            <span>Super Admin</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link to="/admin" aria-label="Admin overview">
                <LayoutDashboard className="h-4 w-4 mr-2" /> Overview
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/moderation" aria-label="Moderation dashboard">
                <Scale className="h-4 w-4 mr-2" /> Moderation
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/roles" aria-label="Manage roles">
                <Users2 className="h-4 w-4 mr-2" /> Roles
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/audit" aria-label="Audit logs">
                <FileText className="h-4 w-4 mr-2" /> Audit
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};
