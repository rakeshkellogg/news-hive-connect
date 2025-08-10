import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SuperAdminToolbar } from "@/components/SuperAdminToolbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Shield, Users, Ban, CheckCircle, XCircle } from "lucide-react";

interface UserProfile {
  user_id: string;
  email: string;
  username: string | null;
  is_suspended: boolean;
  suspended_reason: string | null;
  suspended_until: string | null;
  created_at: string;
  roles: string[];
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

export default function AdminRoles() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "suspended">("all");

  useEffect(() => {
    setSEO(
      "Roles | NewsBuzz",
      "Super Admin roles management for NewsBuzz",
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

    const loadUsers = async () => {
      try {
        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('user_id,email,username,is_suspended,suspended_reason,suspended_until,created_at')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const usersWithRoles = await Promise.all(
          (profiles || []).map(async (profile) => {
            const { data: roles } = await supabase
              .from('user_roles')
              .select('role')
              .eq('user_id', profile.user_id);

            return {
              ...profile,
              roles: roles?.map(r => r.role) || []
            } as UserProfile;
          })
        );

        setUsers(usersWithRoles);
      } catch (error) {
        console.error('Error loading users:', error);
        toast({ title: 'Error', description: 'Failed to load users', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, [allowed, toast]);

  const toggleSuperAdmin = async (userId: string, isSuperAdmin: boolean) => {
    try {
      if (isSuperAdmin) {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'super_admin');
        if (error) throw error;
        toast({ title: 'Success', description: 'Super admin role removed' });
      } else {
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: 'super_admin' });
        if (error) throw error;
        toast({ title: 'Success', description: 'Super admin role assigned' });
      }

      setUsers(prev => prev.map(u => 
        u.user_id === userId 
          ? { ...u, roles: isSuperAdmin ? u.roles.filter(r => r !== 'super_admin') : [...u.roles, 'super_admin'] }
          : u
      ));
    } catch (error) {
      console.error('Error toggling super admin:', error);
      toast({ title: 'Error', description: 'Failed to update role', variant: 'destructive' });
    }
  };

  const toggleSuspension = async (userId: string, isSuspended: boolean, reason?: string) => {
    try {
      const updateData = {
        is_suspended: !isSuspended,
        suspended_reason: !isSuspended ? reason ?? null : null,
        suspended_until: !isSuspended ? null : null,
        suspended_by: !isSuspended ? user?.id ?? null : null,
      } as const;

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('user_id', userId);

      if (error) throw error;

      toast({ 
        title: 'Success', 
        description: isSuspended ? 'User unsuspended' : 'User suspended' 
      });

      setUsers(prev => prev.map(u => 
        u.user_id === userId 
          ? { ...u, ...updateData }
          : u
      ));
    } catch (error) {
      console.error('Error toggling suspension:', error);
      toast({ title: 'Error', description: 'Failed to update suspension', variant: 'destructive' });
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.username && u.username.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'suspended' && u.is_suspended) ||
      (filterStatus === 'active' && !u.is_suspended);

    return matchesSearch && matchesFilter;
  });

  if (!checked || !allowed) return null;

  if (loading) {
    return (
      <main className="container py-8">
        <SuperAdminToolbar />
        <div className="mt-4">
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading users...</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="container py-8">
      <SuperAdminToolbar />

      <section className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email or name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('all')}
                >
                  All ({users.length})
                </Button>
                <Button
                  variant={filterStatus === 'active' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('active')}
                >
                  Active ({users.filter(u => !u.is_suspended).length})
                </Button>
                <Button
                  variant={filterStatus === 'suspended' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('suspended')}
                >
                  Suspended ({users.filter(u => u.is_suspended).length})
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {filteredUsers.map((u) => (
                <div key={u.user_id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.email}</span>
                          {u.roles.includes('super_admin') && (
                            <Badge variant="default" className="flex items-center gap-1">
                              <Shield className="h-3 w-3" />
                              Super Admin
                            </Badge>
                          )}
                          {u.is_suspended && (
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <Ban className="h-3 w-3" />
                              Suspended
                            </Badge>
                          )}
                        </div>
                        {u.username && (
                          <p className="text-sm text-muted-foreground">{u.username}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span>Joined: {new Date(u.created_at).toLocaleDateString()}</span>
                        </div>
                        {u.is_suspended && u.suspended_reason && (
                          <p className="text-xs text-destructive mt-1">
                            Reason: {u.suspended_reason}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant={u.roles.includes('super_admin') ? 'destructive' : 'outline'}
                        size="sm"
                        onClick={() => toggleSuperAdmin(u.user_id, u.roles.includes('super_admin'))}
                        disabled={u.user_id === user?.id}
                      >
                        {u.roles.includes('super_admin') ? (
                          <>
                            <XCircle className="h-4 w-4 mr-1" />
                            Remove Admin
                          </>
                        ) : (
                          <>
                            <Shield className="h-4 w-4 mr-1" />
                            Make Admin
                          </>
                        )}
                      </Button>

                      <Button
                        variant={u.is_suspended ? 'outline' : 'destructive'}
                        size="sm"
                        onClick={() => toggleSuspension(u.user_id, u.is_suspended)}
                        disabled={u.user_id === user?.id}
                      >
                        {u.is_suspended ? (
                          <>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Unsuspend
                          </>
                        ) : (
                          <>
                            <Ban className="h-4 w-4 mr-1" />
                            Suspend
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredUsers.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No users found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
