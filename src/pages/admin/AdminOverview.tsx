import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SuperAdminToolbar } from "@/components/SuperAdminToolbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, MessageSquare, FolderOpen, Flag, Activity } from "lucide-react";

interface PlatformStats {
  totalUsers: number;
  totalGroups: number;
  totalPosts: number;
  totalComments: number;
  flaggedPosts: number;
  flaggedComments: number;
  suspendedUsers: number;
  activeUsers24h: number;
}

interface RecentActivity {
  id: string;
  action: string;
  table_name: string;
  actor_email: string | null;
  created_at: string;
}

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

export default function AdminOverview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  useEffect(() => {
    setSEO(
      "Admin Overview | NewsBuzz",
      "Super Admin overview dashboard for NewsBuzz",
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

  useEffect(() => {
    if (!allowed) return;

    const loadDashboardData = async () => {
      try {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const [
          { count: users },
          { count: groups },
          { count: posts },
          { count: comments },
          { count: flaggedPosts },
          { count: flaggedComments },
          { count: suspendedUsers },
        ] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('groups').select('*', { count: 'exact', head: true }),
          supabase.from('posts').select('*', { count: 'exact', head: true }),
          supabase.from('comments').select('*', { count: 'exact', head: true }),
          supabase.from('post_flags').select('*', { count: 'exact', head: true }),
          supabase.from('comment_flags').select('*', { count: 'exact', head: true }),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_suspended', true),
        ]);

        // Approximate active users in last 24h using audit logs (distinct actor_id)
        const { data: recentLogs } = await supabase
          .from('audit_logs')
          .select('actor_id')
          .gte('created_at', dayAgo)
          .not('actor_id', 'is', null)
          .limit(1000);
        const activeUsers24h = recentLogs ? new Set(recentLogs.map(l => l.actor_id as string)).size : 0;

        setStats({
          totalUsers: users || 0,
          totalGroups: groups || 0,
          totalPosts: posts || 0,
          totalComments: comments || 0,
          flaggedPosts: flaggedPosts || 0,
          flaggedComments: flaggedComments || 0,
          suspendedUsers: suspendedUsers || 0,
          activeUsers24h,
        });

        // Load recent activity
        const { data: activity } = await supabase
          .from('audit_logs')
          .select(`
            id,
            action,
            table_name,
            created_at,
            actor_id
          `)
          .order('created_at', { ascending: false })
          .limit(10);

        if (activity) {
          const activityWithEmails = await Promise.all(
            activity.map(async (item) => {
              let actorEmail: string | null = null;
              if (item.actor_id) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('email')
                  .eq('user_id', item.actor_id)
                  .maybeSingle();
                actorEmail = profile?.email || null;
              }
              return { ...item, actor_email: actorEmail } as RecentActivity;
            })
          );
          setRecentActivity(activityWithEmails);
        }
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        toast({ title: 'Error', description: 'Failed to load dashboard data', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, [allowed, toast]);

  if (!checked || !allowed) return null;

  if (loading) {
    return (
      <main className="container py-8">
        <SuperAdminToolbar />
        <div className="mt-4">
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading dashboard...</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="container py-8">
      <SuperAdminToolbar />

      <section className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.activeUsers24h} active in 24h
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Groups</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalGroups}</div>
            <p className="text-xs text-muted-foreground">Active communities</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Content</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalPosts}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.totalComments} comments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flags</CardTitle>
            <Flag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats?.flaggedPosts || 0) + (stats?.flaggedComments || 0)}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.flaggedPosts} posts, {stats?.flaggedComments} comments
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button 
                variant="outline" 
                onClick={() => navigate('/admin/moderation')}
                className="flex items-center gap-2"
              >
                <Flag className="h-4 w-4" />
                Review Flags
                {stats && ((stats.flaggedPosts + stats.flaggedComments) > 0) && (
                  <Badge variant="destructive">
                    {stats.flaggedPosts + stats.flaggedComments}
                  </Badge>
                )}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => navigate('/admin/roles')}
                className="flex items-center gap-2"
              >
                <Users className="h-4 w-4" />
                Manage Users
                {stats && stats.suspendedUsers > 0 && (
                  <Badge variant="secondary">
                    {stats.suspendedUsers} suspended
                  </Badge>
                )}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={() => navigate('/admin/audit')}
                className="flex items-center gap-2"
              >
                <Activity className="h-4 w-4" />
                View Audit Logs
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-muted-foreground">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {activity.action}
                        </Badge>
                        <span className="text-sm font-medium">
                          {activity.table_name}
                        </span>
                      </div>
                      {activity.actor_email && (
                        <span className="text-sm text-muted-foreground">
                          by {activity.actor_email}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(activity.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
