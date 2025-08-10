import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SuperAdminToolbar } from "@/components/SuperAdminToolbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const setSEO = (title: string, description: string, canonical: string) => {
  document.title = title;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", description);
  else {
    const m = document.createElement("meta");
    m.setAttribute("name", "description");
    m.setAttribute("content", description);
    document.head.appendChild(m);
  }
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = canonical;
};

export default function AdminModeration() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setSEO(
      "Moderation | NewsBuzz",
      "Super Admin moderation dashboard for NewsBuzz",
      window.location.href
    );
  }, []);

  useEffect(() => {
    const check = async () => {
      if (!user) {
        navigate("/auth");
        return;
      }
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "super_admin",
      } as any);
      if (error || !data) {
        toast({ title: "Access denied", description: "Super admin privileges required." });
        navigate("/feed");
      } else {
        setAllowed(true);
      }
      setChecked(true);
    };
    check();
  }, [user, navigate, toast]);

  if (!checked || !allowed) return null;

  return (
    <main className="container py-8">
      <SuperAdminToolbar />
      <section className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>Moderation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Moderation tools will appear here.</p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
