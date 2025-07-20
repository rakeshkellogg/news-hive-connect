import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Users, LogOut } from "lucide-react";

interface Group {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  created_at: string;
  member_count?: number;
}

const Feed = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }

    if (user) {
      fetchUserGroups();
    }
  }, [user, loading, navigate]);

  const fetchUserGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('group_memberships')
        .select(`
          group_id,
          groups (
            id,
            name,
            description,
            invite_code,
            created_at
          )
        `)
        .eq('user_id', user?.id);

      if (error) throw error;

      const userGroups = data?.map(membership => membership.groups).filter(Boolean) as Group[];
      setGroups(userGroups);
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast({
        title: "Error",
        description: "Failed to load your groups",
        variant: "destructive",
      });
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/auth");
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const copyInviteLink = (inviteCode: string) => {
    const inviteUrl = `${window.location.origin}/auth?invite=${inviteCode}`;
    navigator.clipboard.writeText(inviteUrl);
    toast({
      title: "Invite link copied!",
      description: "Share this link with others to invite them to the group.",
    });
  };

  if (loading || loadingGroups) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <h1 className="text-xl font-semibold">NewsBuzz</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Welcome, {user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2">Your Groups</h2>
            <p className="text-muted-foreground">
              Collaborate on news with your teams
            </p>
          </div>
          <Button onClick={() => navigate("/create-group")}>
            <Plus className="h-4 w-4 mr-2" />
            Create Group
          </Button>
        </div>

        {groups.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No groups yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first group to start collaborating on news
            </p>
            <Button onClick={() => navigate("/create-group")}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Group
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <Card key={group.id} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {group.name}
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Created {new Date(group.created_at).toLocaleDateString()}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => copyInviteLink(group.invite_code)}
                    >
                      Share Invite
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Feed;