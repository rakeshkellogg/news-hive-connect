import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Users, LogOut, ChevronDown, MessageSquare, Bot, Heart, Send, AtSign, Settings, Trash2, UserMinus, Crown, Share2, Copy } from "lucide-react";

interface Group {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  created_at: string;
  created_by: string;
  member_count?: number;
}

interface Post {
  id: string;
  content: string;
  author: string;
  created_at: string;
  type: 'user' | 'automated';
  likes: number;
  liked: boolean;
  comments: Comment[];
}

interface Comment {
  id: string;
  content: string;
  author: string;
  created_at: string;
}

interface GroupMember {
  id: string;
  user_id: string;
  email: string;
  role: 'admin' | 'member';
  joined_at: string;
}

const Feed = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);

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
            created_at,
            created_by
          )
        `)
        .eq('user_id', user?.id);

      if (error) throw error;

      const userGroups = data?.map(membership => membership.groups).filter(Boolean) as Group[];
      setGroups(userGroups);
      
      // Set first group as selected by default
      if (userGroups.length > 0) {
        setSelectedGroup(userGroups[0]);
        fetchGroupMembers(userGroups[0].id);
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

  const fetchGroupMembers = async (groupId: string) => {
    try {
      // First get group memberships
      const { data: memberships, error: membershipError } = await supabase
        .from('group_memberships')
        .select('id, user_id, role, joined_at')
        .eq('group_id', groupId);

      if (membershipError) throw membershipError;

      // Then get user profiles for each membership
      const members: GroupMember[] = [];
      
      for (const membership of memberships || []) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('user_id', membership.user_id)
          .single();

        members.push({
          id: membership.id,
          user_id: membership.user_id,
          email: profile?.email || 'Unknown User',
          role: membership.role as 'admin' | 'member',
          joined_at: membership.joined_at
        });
      }

      setGroupMembers(members);
    } catch (error) {
      console.error('Error fetching group members:', error);
      // Set mock data for now
      setGroupMembers([
        {
          id: '1',
          user_id: user?.id || '',
          email: user?.email || 'current-user@example.com',
          role: 'admin',
          joined_at: new Date().toISOString()
        }
      ]);
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
          content: 'Welcome to the group! This is a user post where we can discuss the latest news and share insights.',
          author: 'John Doe',
          created_at: new Date().toISOString(),
          type: 'user',
          likes: 5,
          liked: false,
          comments: [
            {
              id: 'c1',
              content: 'Thanks for the welcome! Looking forward to great discussions.',
              author: 'Jane Smith',
              created_at: new Date(Date.now() - 1800000).toISOString()
            }
          ]
        },
        {
          id: '2',
          content: 'Breaking: AI developments continue to accelerate in 2024. Here are the latest insights from technology research institutes around the world.',
          author: 'AI News Bot',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          type: 'automated',
          likes: 12,
          liked: true,
          comments: []
        }
      ];
      setPosts(mockPosts);
    }
  }, [selectedGroup]);

  const toggleLike = (postId: string) => {
    setPosts(prevPosts => 
      prevPosts.map(post => 
        post.id === postId 
          ? {
              ...post,
              liked: !post.liked,
              likes: post.liked ? post.likes - 1 : post.likes + 1
            }
          : post
      )
    );
  };

  const toggleComments = (postId: string) => {
    setExpandedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const isGroupAdmin = (group: Group | null): boolean => {
    return group?.created_by === user?.id;
  };

  const deletePost = (postId: string) => {
    setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
    toast({
      title: "Post deleted",
      description: "The post has been removed successfully.",
    });
  };

  const removeMember = async (memberId: string) => {
    try {
      const { error } = await supabase
        .from('group_memberships')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      setGroupMembers(prev => prev.filter(member => member.id !== memberId));
      toast({
        title: "Member removed",
        description: "The member has been removed from the group.",
      });
    } catch (error) {
      console.error('Error removing member:', error);
      toast({
        title: "Error",
        description: "Failed to remove member from group.",
        variant: "destructive",
      });
    }
  };

  const handleCommentInputChange = (postId: string, value: string) => {
    setCommentInputs(prev => ({
      ...prev,
      [postId]: value
    }));
  };

  const addComment = (postId: string) => {
    const commentText = commentInputs[postId]?.trim();
    if (!commentText) return;

    const newComment: Comment = {
      id: `c${Date.now()}`,
      content: commentText,
      author: user?.email?.split('@')[0] || 'You',
      created_at: new Date().toISOString()
    };

    setPosts(prevPosts =>
      prevPosts.map(post =>
        post.id === postId
          ? { ...post, comments: [...post.comments, newComment] }
          : post
      )
    );

    setCommentInputs(prev => ({
      ...prev,
      [postId]: ''
    }));

    toast({
      title: "Comment added!",
      description: "Your comment has been posted successfully.",
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
                      onClick={() => {
                        setSelectedGroup(group);
                        fetchGroupMembers(group.id);
                      }}
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
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="text-2xl font-bold">{selectedGroup.name}</h2>
                      {isGroupAdmin(selectedGroup) && (
                        <Crown className="h-5 w-5 text-yellow-500" />
                      )}
                    </div>
                    <p className="text-muted-foreground">{selectedGroup.description}</p>
                  </div>
                  
                  {/* Group Controls */}
                  <div className="flex gap-2">
                    {/* Invite Button - Available to all members */}
                    <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Share2 className="h-4 w-4 mr-2" />
                          Invite
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Invite to {selectedGroup.name}</DialogTitle>
                          <DialogDescription>
                            Share this link to invite others to join the group
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={`${window.location.origin}/auth?invite=${selectedGroup.invite_code}`}
                              readOnly
                              className="flex-1 px-3 py-2 border rounded text-sm bg-muted"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyInviteLink(selectedGroup.invite_code)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Anyone with this link can join the group and see all posts and updates.
                          </p>
                        </div>
                      </DialogContent>
                    </Dialog>

                    {/* Admin-only Controls */}
                    {isGroupAdmin(selectedGroup) && (
                      <>
                        <Dialog open={showMembersDialog} onOpenChange={setShowMembersDialog}>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              <Users className="h-4 w-4 mr-2" />
                              Manage Members ({groupMembers.length})
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Group Members</DialogTitle>
                              <DialogDescription>
                                Manage members of {selectedGroup.name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 max-h-60 overflow-y-auto">
                              {groupMembers.map((member) => (
                                <div key={member.id} className="flex items-center justify-between p-2 border rounded">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{member.email}</span>
                                      {member.role === 'admin' && (
                                        <Crown className="h-3 w-3 text-yellow-500" />
                                      )}
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      Joined {new Date(member.joined_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                  {member.user_id !== user?.id && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="sm">
                                          <UserMinus className="h-3 w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Remove Member</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to remove {member.email} from the group?
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction onClick={() => removeMember(member.id)}>
                                            Remove
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </div>
                              ))}
                            </div>
                          </DialogContent>
                        </Dialog>
                        
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4 mr-2" />
                          Settings
                        </Button>
                      </>
                    )}
                  </div>
                </div>
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
                    <Card key={post.id} className="overflow-hidden">
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
                              
                              {/* Admin Delete Button */}
                              {isGroupAdmin(selectedGroup) && (
                                <div className="ml-auto">
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Post</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Are you sure you want to delete this post? This action cannot be undone.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deletePost(post.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                          Delete
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              )}
                            </div>
                            <p className="text-foreground mb-4">{post.content}</p>
                            
                            {/* Action Buttons */}
                            <div className="flex items-center gap-4 pb-3 border-b">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleLike(post.id)}
                                className={`gap-2 ${post.liked ? 'text-red-500' : 'text-muted-foreground'}`}
                              >
                                <Heart className={`h-4 w-4 ${post.liked ? 'fill-current' : ''}`} />
                                {post.likes}
                              </Button>
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleComments(post.id)}
                                className="gap-2 text-muted-foreground"
                              >
                                <MessageSquare className="h-4 w-4" />
                                {post.comments.length}
                              </Button>
                              
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-2 text-muted-foreground"
                              >
                                <AtSign className="h-4 w-4" />
                                Tag
                              </Button>
                            </div>

                            {/* Comments Section */}
                            {expandedComments.has(post.id) && (
                              <div className="mt-4 space-y-3 animate-fade-in">
                                {/* Existing Comments */}
                                {post.comments.map((comment) => (
                                  <div key={comment.id} className="flex gap-3 pl-2">
                                    <div className="h-6 w-6 bg-muted rounded-full flex items-center justify-center text-xs font-semibold">
                                      {comment.author.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-medium">{comment.author}</span>
                                        <span className="text-xs text-muted-foreground">
                                          {new Date(comment.created_at).toLocaleString()}
                                        </span>
                                      </div>
                                      <p className="text-sm text-foreground">{comment.content}</p>
                                    </div>
                                  </div>
                                ))}
                                
                                {/* Comment Input */}
                                <div className="flex gap-2 mt-3">
                                  <Textarea
                                    placeholder="Write a comment... Use @username to tag someone"
                                    value={commentInputs[post.id] || ''}
                                    onChange={(e) => handleCommentInputChange(post.id, e.target.value)}
                                    className="min-h-[60px] resize-none"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        addComment(post.id);
                                      }
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => addComment(post.id)}
                                    disabled={!commentInputs[post.id]?.trim()}
                                  >
                                    <Send className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
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