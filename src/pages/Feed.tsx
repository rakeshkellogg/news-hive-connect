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
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
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
import { Plus, Users, LogOut, ChevronDown, MessageSquare, Bot, Heart, Send, Settings, Trash2, UserMinus, Crown, Share2, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface Group {
  id: string;
  name: string;
  description: string;
  invite_code: string;
  created_at: string;
  created_by: string;
  member_count?: number;
  automated_news_enabled?: boolean;
  news_prompt?: string;
  update_frequency?: number;
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
  const [newPostContent, setNewPostContent] = useState('');
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<{ postId: string; suggestions: GroupMember[]; position: { top: number; left: number } } | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    automated_news_enabled: false,
    news_prompt: '',
    update_frequency: 1
  });

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
            created_by,
            automated_news_enabled,
            news_prompt,
            update_frequency
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
        // Initialize settings form with group data
        setSettingsForm({
          automated_news_enabled: userGroups[0].automated_news_enabled || false,
          news_prompt: userGroups[0].news_prompt || '',
          update_frequency: userGroups[0].update_frequency || 1
        });
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
          .maybeSingle();

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
      toast({
        title: "Error",
        description: "Failed to load group members",
        variant: "destructive",
      });
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

  // Fetch posts for selected group
  const fetchPosts = async (groupId: string) => {
    try {
      const { data: posts, error } = await supabase
        .from('posts')
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles!posts_user_id_fkey (
            email
          )
        `)
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch comments and likes for each post
      const postsWithDetails = await Promise.all(
        (posts || []).map(async (post) => {
          // Fetch comments
          const { data: comments } = await supabase
            .from('comments')
            .select(`
              id,
              content,
              created_at,
              user_id,
              profiles!comments_user_id_fkey (
                email
              )
            `)
            .eq('post_id', post.id)
            .order('created_at', { ascending: true });

          // Fetch likes count
          const { count: likesCount } = await supabase
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', post.id);

          // Check if current user liked this post
          const { data: userLike } = await supabase
            .from('likes')
            .select('id')
            .eq('post_id', post.id)
            .eq('user_id', user?.id)
            .maybeSingle();

          return {
            id: post.id,
            content: post.content,
            author: post.profiles?.email || 'Unknown User',
            created_at: post.created_at,
            type: 'user' as const,
            likes: likesCount || 0,
            liked: !!userLike,
            comments: (comments || []).map(comment => ({
              id: comment.id,
              content: comment.content,
              author: comment.profiles?.email || 'Unknown User',
              created_at: comment.created_at,
            }))
          };
        })
      );

      setPosts(postsWithDetails);
    } catch (error) {
      console.error('Error fetching posts:', error);
      toast({
        title: "Error",
        description: "Failed to load posts",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (selectedGroup) {
      fetchPosts(selectedGroup.id);
    }
  }, [selectedGroup, user?.id]);

  const toggleLike = async (postId: string) => {
    try {
      const post = posts.find(p => p.id === postId);
      if (!post) return;

      if (post.liked) {
        // Remove like
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user?.id);

        if (error) throw error;
      } else {
        // Add like
        const { error } = await supabase
          .from('likes')
          .insert({
            post_id: postId,
            user_id: user?.id
          });

        if (error) throw error;
      }

      // Update UI optimistically
      setPosts(prevPosts => 
        prevPosts.map(p => 
          p.id === postId 
            ? {
                ...p,
                liked: !p.liked,
                likes: p.liked ? p.likes - 1 : p.likes + 1
              }
            : p
        )
      );
    } catch (error) {
      console.error('Error toggling like:', error);
      toast({
        title: "Error",
        description: "Failed to update like",
        variant: "destructive",
      });
    }
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

  const leaveGroup = async (groupId: string) => {
    try {
      const { error } = await supabase
        .from('group_memberships')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', user?.id);

      if (error) throw error;

      // Remove the group from user's groups and refresh
      setGroups(prev => prev.filter(group => group.id !== groupId));
      
      // If this was the selected group, clear selection
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
        setPosts([]);
      }

      toast({
        title: "Left group",
        description: "You have successfully left the group.",
      });
    } catch (error) {
      console.error('Error leaving group:', error);
      toast({
        title: "Error",
        description: "Failed to leave the group.",
        variant: "destructive",
      });
    }
  };


  const createPost = async () => {
    if (!newPostContent.trim() || !selectedGroup) return;

    try {
      const { data: newPost, error } = await supabase
        .from('posts')
        .insert({
          group_id: selectedGroup.id,
          user_id: user?.id,
          content: newPostContent.trim()
        })
        .select(`
          id,
          content,
          created_at,
          user_id,
          profiles!posts_user_id_fkey (
            email
          )
        `)
        .single();

      if (error) throw error;

      const postToAdd: Post = {
        id: newPost.id,
        content: newPost.content,
        author: newPost.profiles?.email || 'You',
        created_at: newPost.created_at,
        type: 'user',
        likes: 0,
        liked: false,
        comments: []
      };

      setPosts(prevPosts => [postToAdd, ...prevPosts]);
      setNewPostContent('');
      setShowCreatePost(false);

      toast({
        title: "Post created!",
        description: "Your post has been published to the group.",
      });
    } catch (error) {
      console.error('Error creating post:', error);
      toast({
        title: "Error",
        description: "Failed to create post",
        variant: "destructive",
      });
    }
  };

  const addComment = async (postId: string) => {
    const commentText = commentInputs[postId]?.trim();
    if (!commentText) return;

    try {
      const { data: newComment, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user?.id,
          content: commentText
        })
        .select(`
          id,
          content,
          created_at,
          profiles!comments_user_id_fkey (
            email
          )
        `)
        .single();

      if (error) throw error;

      const commentToAdd: Comment = {
        id: newComment.id,
        content: newComment.content,
        author: newComment.profiles?.email || 'You',
        created_at: newComment.created_at
      };

      setPosts(prevPosts =>
        prevPosts.map(post =>
          post.id === postId
            ? { ...post, comments: [...post.comments, commentToAdd] }
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
    } catch (error) {
      console.error('Error adding comment:', error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    }
  };

  const updateGroupSettings = async () => {
    if (!selectedGroup) return;

    try {
      const { error } = await supabase
        .from('groups')
        .update({
          automated_news_enabled: settingsForm.automated_news_enabled,
          news_prompt: settingsForm.news_prompt,
          update_frequency: settingsForm.update_frequency
        })
        .eq('id', selectedGroup.id);

      if (error) throw error;

      // Update the selected group in state
      setSelectedGroup(prev => prev ? {
        ...prev,
        automated_news_enabled: settingsForm.automated_news_enabled,
        news_prompt: settingsForm.news_prompt,
        update_frequency: settingsForm.update_frequency
      } : null);

      // Update the group in the groups array
      setGroups(prev => prev.map(group => 
        group.id === selectedGroup.id 
          ? {
              ...group,
              automated_news_enabled: settingsForm.automated_news_enabled,
              news_prompt: settingsForm.news_prompt,
              update_frequency: settingsForm.update_frequency
            }
          : group
      ));

      setShowGroupSettings(false);
      toast({
        title: "Settings updated!",
        description: "Group automated news settings have been saved successfully.",
      });
    } catch (error) {
      console.error('Error updating group settings:', error);
      toast({
        title: "Error",
        description: "Failed to update group settings",
        variant: "destructive",
      });
    }
  };

  const handleMentionSelect = (postId: string, email: string) => {
    const currentText = commentInputs[postId] || '';
    const cursorPos = getMentionStartPosition(currentText);
    if (cursorPos !== -1) {
      const beforeMention = currentText.substring(0, cursorPos);
      const afterMention = currentText.substring(cursorPos).replace(/@\w*/, `@${email} `);
      const newText = beforeMention + afterMention;
      
      setCommentInputs(prev => ({
        ...prev,
        [postId]: newText
      }));
    }
    setMentionSuggestions(null);
  };

  const getMentionStartPosition = (text: string) => {
    const lastAtIndex = text.lastIndexOf('@');
    if (lastAtIndex === -1) return -1;
    
    // Check if there's a space after the @ (meaning it's a complete mention)
    const textAfterAt = text.substring(lastAtIndex + 1);
    if (textAfterAt.includes(' ')) return -1;
    
    return lastAtIndex;
  };

  const handleCommentInputChange = (postId: string, value: string, textareaElement?: HTMLTextAreaElement) => {
    setCommentInputs(prev => ({
      ...prev,
      [postId]: value
    }));

    // Check for mention trigger
    const mentionStartPos = getMentionStartPosition(value);
    if (mentionStartPos !== -1) {
      const mentionText = value.substring(mentionStartPos + 1);
      const filteredMembers = groupMembers.filter(member => 
        member.email.toLowerCase().includes(mentionText.toLowerCase())
      );

      if (filteredMembers.length > 0 && textareaElement) {
        const rect = textareaElement.getBoundingClientRect();
        setMentionSuggestions({
          postId,
          suggestions: filteredMembers,
          position: {
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX
          }
        });
      } else {
        setMentionSuggestions(null);
      }
    } else {
      setMentionSuggestions(null);
    }
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
                         // Update settings form when group changes
                         setSettingsForm({
                           automated_news_enabled: group.automated_news_enabled || false,
                           news_prompt: group.news_prompt || '',
                           update_frequency: group.update_frequency || 1
                         });
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

                    {/* Leave Group Button - Available to non-admin members */}
                    {!isGroupAdmin(selectedGroup) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <LogOut className="h-4 w-4 mr-2" />
                            Leave Group
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Leave Group</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to leave "{selectedGroup.name}"? You will no longer receive updates from this group.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => leaveGroup(selectedGroup.id)}>
                              Leave Group
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

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
                        
                         <Dialog open={showGroupSettings} onOpenChange={setShowGroupSettings}>
                           <DialogTrigger asChild>
                             <Button variant="outline" size="sm">
                               <Settings className="h-4 w-4 mr-2" />
                               Settings
                             </Button>
                           </DialogTrigger>
                           <DialogContent className="max-w-md">
                             <DialogHeader>
                               <DialogTitle>Group Settings</DialogTitle>
                               <DialogDescription>
                                 Configure automated news settings for {selectedGroup.name}
                               </DialogDescription>
                             </DialogHeader>
                             <div className="space-y-4">
                               <div className="flex items-center space-x-2">
                                 <Checkbox 
                                   id="automated-news"
                                   checked={settingsForm.automated_news_enabled}
                                   onCheckedChange={(checked) => 
                                     setSettingsForm(prev => ({
                                       ...prev,
                                       automated_news_enabled: checked as boolean
                                     }))
                                   }
                                 />
                                 <Label htmlFor="automated-news">Enable Automated News</Label>
                               </div>
                               
                               {settingsForm.automated_news_enabled && (
                                 <>
                                   <div className="space-y-2">
                                     <Label htmlFor="news-prompt">News Topic/Field</Label>
                                     <Input
                                       id="news-prompt"
                                       placeholder="e.g., Technology, Healthcare, Sports"
                                       value={settingsForm.news_prompt}
                                       onChange={(e) => 
                                         setSettingsForm(prev => ({
                                           ...prev,
                                           news_prompt: e.target.value
                                         }))
                                       }
                                     />
                                   </div>
                                   
                                   <div className="space-y-3">
                                     <Label>Update Frequency</Label>
                                     <RadioGroup 
                                       value={settingsForm.update_frequency.toString()}
                                       onValueChange={(value) => 
                                         setSettingsForm(prev => ({
                                           ...prev,
                                           update_frequency: parseInt(value)
                                         }))
                                       }
                                     >
                                       <div className="flex items-center space-x-2">
                                         <RadioGroupItem value="1" id="freq-1" />
                                         <Label htmlFor="freq-1">Every day</Label>
                                       </div>
                                       <div className="flex items-center space-x-2">
                                         <RadioGroupItem value="2" id="freq-2" />
                                         <Label htmlFor="freq-2">Every 2 days</Label>
                                       </div>
                                       <div className="flex items-center space-x-2">
                                         <RadioGroupItem value="3" id="freq-3" />
                                         <Label htmlFor="freq-3">Every 3 days</Label>
                                       </div>
                                     </RadioGroup>
                                   </div>
                                 </>
                               )}
                               
                               <div className="flex justify-end gap-2 pt-4">
                                 <Button variant="outline" onClick={() => setShowGroupSettings(false)}>
                                   Cancel
                                 </Button>
                                 <Button onClick={() => updateGroupSettings()}>
                                   Save Settings
                                 </Button>
                               </div>
                             </div>
                           </DialogContent>
                         </Dialog>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Posts Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold">Latest Updates</h3>
                <Dialog open={showCreatePost} onOpenChange={setShowCreatePost}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Post
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Post</DialogTitle>
                      <DialogDescription>
                        Share something with {selectedGroup?.name}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Textarea
                        placeholder="What's on your mind?"
                        value={newPostContent}
                        onChange={(e) => setNewPostContent(e.target.value)}
                        className="min-h-[120px]"
                      />
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowCreatePost(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={createPost}
                          disabled={!newPostContent.trim()}
                        >
                          Post
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              
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
                                <div className="relative">
                                  <div className="flex gap-2 mt-3">
                                    <Textarea
                                      placeholder="Write a comment... Type @ to tag someone"
                                      value={commentInputs[post.id] || ''}
                                      onChange={(e) => handleCommentInputChange(post.id, e.target.value, e.target)}
                                      className="min-h-[60px] resize-none"
                                      onKeyDown={(e) => {
                                        if (mentionSuggestions && mentionSuggestions.postId === post.id) {
                                          if (e.key === 'Escape') {
                                            setMentionSuggestions(null);
                                            return;
                                          }
                                        }
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          if (!mentionSuggestions || mentionSuggestions.postId !== post.id) {
                                            addComment(post.id);
                                          }
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
                                  
                                  {/* Mention Suggestions */}
                                  {mentionSuggestions && mentionSuggestions.postId === post.id && (
                                    <div 
                                      className="absolute z-50 w-64 bg-background border border-border rounded-md shadow-lg mt-1"
                                      style={{
                                        top: '100%',
                                        left: 0
                                      }}
                                    >
                                      <Command>
                                        <CommandList>
                                          <CommandEmpty>No members found.</CommandEmpty>
                                          <CommandGroup>
                                            {mentionSuggestions.suggestions.map((member) => (
                                              <CommandItem
                                                key={member.id}
                                                onSelect={() => handleMentionSelect(post.id, member.email)}
                                                className="flex items-center gap-2 cursor-pointer"
                                              >
                                                <div className="h-6 w-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-semibold">
                                                  {member.email.charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-sm">{member.email}</span>
                                                {member.role === 'admin' && (
                                                  <Crown className="h-3 w-3 text-yellow-500 ml-auto" />
                                                )}
                                              </CommandItem>
                                            ))}
                                          </CommandGroup>
                                        </CommandList>
                                      </Command>
                                    </div>
                                  )}
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