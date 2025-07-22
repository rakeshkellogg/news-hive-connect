import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Users, LogOut, ChevronDown, MessageSquare, Bot } from "lucide-react";

interface Group {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  created_at: string;
  member_count?: number;
}

interface Post {
  id: string;
  content: string;
  author: string;
  created_at: string;
  type: 'user' | 'automated';
}

const Feed = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);

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
      
      // Set first group as selected by default
      if (userGroups.length > 0) {
        setSelectedGroup(userGroups[0]);
      }
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

  // Mock posts data - replace with actual data fetching
  useEffect(() => {
    if (selectedGroup) {
      const mockPosts: Post[] = [
        {
          id: '1',
          content: 'Welcome to the group! This is a user post.',
          author: 'John Doe',
          created_at: new Date().toISOString(),
          type: 'user'
        },
        {
          id: '2',
          content: 'Breaking: AI developments continue to accelerate in 2024. Here are the latest insights from technology research.',
          author: 'AI News Bot',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          type: 'automated'
        }
      ];
      setPosts(mockPosts);
    }
  }, [selectedGroup]);

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
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">NewsBuzz</h1>
            
            {/* Groups Dropdown */}
            {groups.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    {selectedGroup?.name || "Select Group"}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {groups.map((group) => (
                    <DropdownMenuItem
                      key={group.id}
                      onClick={() => setSelectedGroup(group)}
                    >
                      {group.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate("/create-group")}>
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
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
          <div className="space-y-6">
            {/* Selected Group Info */}
            {selectedGroup && (
              <div className="bg-muted/50 rounded-lg p-4">
                <h2 className="text-2xl font-bold mb-2">{selectedGroup.name}</h2>
                <p className="text-muted-foreground">{selectedGroup.description}</p>
              </div>
            )}

            {/* Posts Section */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Latest Updates</h3>
              
              {posts.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No posts yet in this group</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <Card key={post.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0">
                            {post.type === 'automated' ? (
                              <Bot className="h-8 w-8 text-primary" />
                            ) : (
                              <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-semibold text-sm">
                                {post.author.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold">{post.author}</span>
                              {post.type === 'automated' && (
                                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                                  AI Generated
                                </span>
                              )}
                              <span className="text-sm text-muted-foreground">
                                {new Date(post.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-foreground">{post.content}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Feed;