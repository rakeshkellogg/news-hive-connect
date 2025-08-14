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
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Plus, Users, LogOut, ChevronDown, MessageSquare, Bot, Heart, Send, Settings, Trash2, UserMinus, Crown, Share2, Copy, Newspaper, ExternalLink, UserPlus, Clock, User, Edit, Search, Flag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SavedPrompts } from "@/components/SavedPrompts";
import { GroupStats } from "@/components/GroupStats";
import { SuperAdminToolbar } from "@/components/SuperAdminToolbar";
import { Badge } from "@/components/ui/badge";
interface Group {
  id: string;
  name: string;
  description: string;
  created_at: string;
  created_by: string;
  member_count?: number;
  automated_news_enabled?: boolean;
  news_prompt?: string;
  update_frequency?: number;
  news_count?: number;
  news_sources?: string[];
  last_news_generation?: string;
  news_generation_status?: string;
  last_generation_error?: string;
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
  image_url?: string;
  url?: string;
  user_id?: string; // Add user_id to check post ownership
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
  name: string;
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
    name: '',
    automated_news_enabled: false,
    news_prompt: '',
    update_frequency: 1,
    news_count: 10,
    news_sources: [] as string[]
  });
  const [editingPost, setEditingPost] = useState<{ id: string; content: string } | null>(null);
const [searchKeyword, setSearchKeyword] = useState("");
const [timelineFilter, setTimelineFilter] = useState("all");
const [inviteCode, setInviteCode] = useState<string | null>(null);

  const [rateLimitInfo, setRateLimitInfo] = useState<{
    can_generate: boolean;
    remaining_count: number;
    limit_count: number;
    message: string;
  } | null>(null);


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
      // Step 1: Get user's group memberships
      const { data: memberships, error: membershipError } = await supabase
        .from('group_memberships')
        .select('group_id')
        .eq('user_id', user?.id);

      if (membershipError) throw membershipError;

      if (!memberships || memberships.length === 0) {
        setGroups([]);
        setLoadingGroups(false);
        return;
      }

      // Step 2: Get group details for each membership
      const groupIds = memberships.map((m: { group_id: string }) => m.group_id);
      const { data: groupsData, error: groupsError } = await supabase
        .from('groups')
        .select(`
          id,
          name,
          description,
          created_at,
          created_by,
          automated_news_enabled,
          news_prompt,
          update_frequency,
          news_count,
          news_sources,
          last_news_generation,
          news_generation_status,
          last_generation_error
        `)
        .in('id', groupIds)
        .order('created_at', { ascending: false });

      if (groupsError) throw groupsError;

      const userGroups = (groupsData || []) as Group[];
      setGroups(userGroups);
      
      // Set first group as selected by default
      if (userGroups.length > 0) {
        setSelectedGroup(userGroups[0]);
        fetchGroupMembers(userGroups[0].id);
        // Initialize settings form with group data
        setSettingsForm({
          name: userGroups[0].name || '',
          automated_news_enabled: userGroups[0].automated_news_enabled || false,
          news_prompt: userGroups[0].news_prompt || '',
          update_frequency: userGroups[0].update_frequency || 1,
          news_count: userGroups[0].news_count || 10,
          news_sources: userGroups[0].news_sources || []
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

// Then get public usernames via RPC to avoid exposing emails
      const memberIds = (memberships || []).map(m => m.user_id);
      const { data: publicProfiles, error: profilesError } = await (supabase as any).rpc('get_public_profiles', { ids: memberIds });
      if (profilesError) throw profilesError;
      const profilesArray = (publicProfiles || []) as { user_id: string; username: string }[];
      const nameMap = new Map(profilesArray.map(p => [p.user_id, p.username]));

      const members: GroupMember[] = (memberships || []).map(membership => ({
        id: membership.id,
        user_id: membership.user_id,
        name: nameMap.get(membership.user_id) || 'Member',
        role: membership.role as 'admin' | 'member',
        joined_at: membership.joined_at
      }));

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

const fetchInviteCode = async (groupId: string) => {
  try {
    const { data, error } = await supabase
      .from('group_invites')
      .select('invite_code')
      .eq('group_id', groupId)
      .maybeSingle();

    if (error) throw error;
    setInviteCode(data?.invite_code || null);
  } catch (e) {
    setInviteCode(null);
    toast({ title: 'Cannot load invite code', description: 'You might not have permission.', variant: 'destructive' });
  }
};

  const checkRateLimit = async (groupId: string) => {
    try {
      const { data, error } = await supabase.rpc('can_generate_news', {
        p_group_id: groupId,
        p_user_id: user?.id || ''
      });
      if (error) throw error;
      const info = (data && (data as any[])[0]) || null;
      setRateLimitInfo(info);
      return info;
    } catch (error) {
      console.error('Error checking rate limit:', error);
      return null;
    }
  };


  // Fetch posts for selected group with optional filtering
  const fetchPosts = async (groupId: string) => {
    try {
      let query = supabase
        .from('posts')
        .select(`
          id,
          content,
          url,
          image_url,
          created_at,
          user_id,
          profiles!posts_user_id_fkey (
            username
          )
        `)
        .eq('group_id', groupId);

      // Apply search filter if keyword exists
      if (searchKeyword.trim()) {
        query = query.ilike('content', `%${searchKeyword.trim()}%`);
      }

      // Apply timeline filter
      if (timelineFilter !== "all") {
        const now = new Date();
        const monthsAgo = parseInt(timelineFilter);
        const filterDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo, now.getDate());
        query = query.gte('created_at', filterDate.toISOString());
      }

      const { data: posts, error } = await query.order('created_at', { ascending: false });

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
                username
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

          // Detect if this is an automated post
          const isAutomatedPost = post.content.includes('🤖 AI News Bot') || post.content.includes('AI News Bot');
          
          return {
            id: post.id,
            content: post.content,
            url: post.url,
            image_url: post.image_url,
            author: isAutomatedPost ? 'AI News Bot' : (post.profiles?.username || 'Member'),
            created_at: post.created_at,
            type: isAutomatedPost ? 'automated' as const : 'user' as const,
            likes: likesCount || 0,
            liked: !!userLike,
            user_id: post.user_id, // Include user_id for ownership check
            comments: (comments || []).map(comment => ({
              id: comment.id,
              content: comment.content,
              author: comment.profiles?.username || 'Member',
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
  }, [selectedGroup, user?.id, searchKeyword, timelineFilter]);

  useEffect(() => {
    if (selectedGroup && user) {
      checkRateLimit(selectedGroup.id);
    }
  }, [selectedGroup, user]);

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

  const flagPost = async (postId: string, reason: string = 'Inappropriate content') => {
    try {
      const { error } = await supabase
        .from('post_flags')
        .insert({ post_id: postId, user_id: user?.id, reason });

      if (error) {
        // Unique violation means already flagged by this user
        if ((error as any).code === '23505') {
          toast({ title: 'Already flagged', description: 'You have already flagged this post.' });
          return;
        }
        throw error;
      }

      toast({ title: 'Post flagged', description: 'Thanks. A moderator will review it.' });
    } catch (error) {
      console.error('Error flagging post:', error);
      toast({ title: 'Error', description: 'Failed to flag post', variant: 'destructive' });
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

  const deletePost = async (postId: string) => {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      setPosts(prevPosts => prevPosts.filter(post => post.id !== postId));
      toast({
        title: "Post deleted",
        description: "The post has been removed successfully.",
      });
    } catch (error) {
      console.error('Error deleting post:', error);
      toast({
        title: "Error",
        description: "Failed to delete post",
        variant: "destructive",
      });
    }
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

  const deleteGroup = async (groupId: string) => {
    try {
      // Delete the group (this will cascade to delete posts, comments, likes, and memberships)
      const { error } = await supabase
        .from('groups')
        .delete()
        .eq('id', groupId);

      if (error) throw error;

      // Remove the group from user's groups and refresh
      setGroups(prev => prev.filter(group => group.id !== groupId));
      
      // If this was the selected group, clear selection
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
        setPosts([]);
      }

      toast({
        title: "Group deleted",
        description: "The group and all its content have been permanently deleted.",
      });
    } catch (error) {
      console.error('Error deleting group:', error);
      toast({
        title: "Error",
        description: "Failed to delete the group.",
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


  const editPost = async (postId: string, newContent: string) => {
    try {
      const { error } = await supabase
        .from('posts')
        .update({ content: newContent.trim() })
        .eq('id', postId);

      if (error) throw error;

      setPosts(prevPosts => 
        prevPosts.map(post => 
          post.id === postId 
            ? { ...post, content: newContent.trim() }
            : post
        )
      );

      setEditingPost(null);
      toast({
        title: "Post updated!",
        description: "Your post has been updated successfully.",
      });
    } catch (error) {
      console.error('Error updating post:', error);
      toast({
        title: "Error",
        description: "Failed to update post",
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
            username
          )
        `)
        .single();

      if (error) throw error;

      const postToAdd: Post = {
        id: newPost.id,
        content: newPost.content,
        author: newPost.profiles?.username || 'You',
        created_at: newPost.created_at,
        type: 'user',
        likes: 0,
        liked: false,
        user_id: newPost.user_id,
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
            username
          )
        `)
        .single();

      if (error) throw error;

      const commentToAdd: Comment = {
        id: newComment.id,
        content: newComment.content,
        author: newComment.profiles?.username || 'You',
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
          name: settingsForm.name,
          automated_news_enabled: settingsForm.automated_news_enabled,
          news_prompt: settingsForm.news_prompt,
          update_frequency: settingsForm.update_frequency,
          news_count: settingsForm.news_count,
          news_sources: settingsForm.news_sources
        })
        .eq('id', selectedGroup.id);

      if (error) throw error;

      // Update the selected group in state
      setSelectedGroup(prev => prev ? {
        ...prev,
        name: settingsForm.name,
        automated_news_enabled: settingsForm.automated_news_enabled,
        news_prompt: settingsForm.news_prompt,
        update_frequency: settingsForm.update_frequency,
        news_count: settingsForm.news_count,
        news_sources: settingsForm.news_sources
      } : null);

      // Update the group in the groups array
      setGroups(prev => prev.map(group => 
        group.id === selectedGroup.id 
          ? {
              ...group,
              name: settingsForm.name,
              automated_news_enabled: settingsForm.automated_news_enabled,
              news_prompt: settingsForm.news_prompt,
              update_frequency: settingsForm.update_frequency,
              news_count: settingsForm.news_count,
              news_sources: settingsForm.news_sources
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

  const generateNews = async () => {
    if (!selectedGroup || !selectedGroup.automated_news_enabled) {
      toast({
        title: "Cannot generate news",
        description: "Automated news is not enabled for this group.",
        variant: "destructive",
      });
      return;
    }

    // Check rate limit first
    const info = await checkRateLimit(selectedGroup.id);
    if (info && !info.can_generate) {
      toast({
        title: "Daily limit reached",
        description: info.message,
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('Starting manual news generation for group:', selectedGroup.id);
      console.log('Group settings:', {
        automated_news_enabled: selectedGroup.automated_news_enabled,
        news_prompt: selectedGroup.news_prompt,
        news_count: selectedGroup.news_count
      });

      toast({
        title: "Generating news...",
        description: "Please wait while we fetch the latest updates.",
      });

      const { data, error } = await supabase.functions.invoke('generate-news', {
        body: { 
          groupId: selectedGroup.id,
          isManualRequest: true,
          userId: user?.id
        }
      });

      console.log('Generate news response:', { data, error });

      if (error) {
        console.error('Supabase function error:', error);
        throw error;
      }

      if (!data) {
        throw new Error('No data returned from function');
      }

      console.log('Function returned data:', data);

      // Refresh posts and groups to show the new news and updated status
      await fetchPosts(selectedGroup.id);
      await fetchUserGroups();
      await checkRateLimit(selectedGroup.id);

      const message = data?.results?.[0]?.message || 'news posts';
      console.log('News generation completed successfully:', message);

      toast({
        title: "News generated!",
        description: `Latest news has been added to the group. ${message}`,
      });
    } catch (error: any) {
      console.error('Error generating news:', error);

      let errorMessage = "Failed to generate news. Please try again.";

      if (error?.message) {
        if (error.message.includes('timeout')) {
          errorMessage = "Request timed out. Please try again.";
        } else if (error.message.includes('rate limit')) {
          errorMessage = "Rate limit exceeded. Please wait a moment and try again.";
        } else if (error.message.includes('API')) {
          errorMessage = "API service temporarily unavailable. Please try again.";
        }
      }

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleMentionSelect = (postId: string, name: string) => {
    const currentText = commentInputs[postId] || '';
    const cursorPos = getMentionStartPosition(currentText);
    if (cursorPos !== -1) {
      const beforeMention = currentText.substring(0, cursorPos);
      const afterMention = currentText.substring(cursorPos).replace(/@\w*/, `@${name} `);
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
        member.name.toLowerCase().includes(mentionText.toLowerCase())
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
                              name: group.name || '',
                              automated_news_enabled: group.automated_news_enabled || false,
                              news_prompt: group.news_prompt || '',
                              update_frequency: group.update_frequency || 1,
                              news_count: group.news_count || 10,
                              news_sources: group.news_sources || []
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
        <SuperAdminToolbar />
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
                  {/* Invite Button - Only visible to group owner */}
                  {isGroupAdmin(selectedGroup) && (
                    <Dialog open={showInviteDialog} onOpenChange={(open) => {
                      setShowInviteDialog(open);
                      if (open) fetchInviteCode(selectedGroup.id);
                    }}>
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
                              value={`${window.location.origin}/auth?invite=${inviteCode ?? ''}`}
                              readOnly
                              className="flex-1 px-3 py-2 border rounded text-sm bg-muted"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!inviteCode}
                              onClick={() => inviteCode && copyInviteLink(inviteCode)}
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
                  )}


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
                                      <span className="font-medium">{member.name}</span>
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
                                            Are you sure you want to remove {member.name} from the group?
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
                                <div className="space-y-2">
                                  <Label htmlFor="group-name">Group Name</Label>
                                  <Input
                                    id="group-name"
                                    value={settingsForm.name}
                                    onChange={(e) => 
                                      setSettingsForm(prev => ({
                                        ...prev,
                                        name: e.target.value
                                      }))
                                    }
                                    placeholder="Enter group name"
                                  />
                                </div>
                                
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
                                       <div className="flex items-center justify-between">
                                         <Label htmlFor="news-prompt">News Topic/Field</Label>
                                         <SavedPrompts
                                           groupId={selectedGroup.id}
                                           currentPrompt={settingsForm.news_prompt}
                                           onPromptSelect={(prompt) => 
                                             setSettingsForm(prev => ({
                                               ...prev,
                                               news_prompt: prompt
                                             }))
                                           }
                                           isAdmin={isGroupAdmin(selectedGroup)}
                                         />
                                       </div>
                                       <Textarea
                                         id="news-prompt"
                                         placeholder="e.g., get top 10 news published in last 24 hrs from technology industry, healthcare innovations, financial markets analysis..."
                                         value={settingsForm.news_prompt}
                                         onChange={(e) => 
                                           setSettingsForm(prev => ({
                                             ...prev,
                                             news_prompt: e.target.value
                                           }))
                                         }
                                         className="min-h-[80px] resize-none"
                                         rows={3}
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
                                     <div className="text-xs text-muted-foreground">
                                       News will be automatically generated based on this frequency. You can also manually generate news anytime.
                                     </div>
                                   </div>

                                   <div className="space-y-2">
                                     <Label>News Generation Status</Label>
                                     <div className="text-sm text-muted-foreground">
                                       <div className="flex items-center gap-2">
                                         <span>
                                           Frequency: Every {settingsForm.update_frequency} day{settingsForm.update_frequency !== 1 ? 's' : ''}
                                         </span>
                                         <Badge variant={(selectedGroup.news_generation_status === 'running') ? 'secondary' : (selectedGroup.news_generation_status === 'failed') ? 'destructive' : (selectedGroup.news_generation_status === 'completed') ? 'default' : 'outline'}>
                                           {selectedGroup.news_generation_status || 'idle'}
                                         </Badge>
                                       </div>
                                       <div>
                                         Next generation: {selectedGroup.last_news_generation ? new Date(new Date(selectedGroup.last_news_generation).getTime() + (settingsForm.update_frequency || 1) * 24 * 60 * 60 * 1000).toLocaleDateString() : 'Not generated yet'}
                                       </div>
                                       {selectedGroup.last_generation_error && (
                                         <div className="text-destructive text-xs">
                                           Last error: {selectedGroup.last_generation_error}
                                         </div>
                                       )}
                                     </div>
                                   </div>

                                    <div className="space-y-2">
                                      <Label htmlFor="news-count">Number of News Articles</Label>
                                      <Input
                                        id="news-count"
                                        type="number"
                                        min="1"
                                        max="20"
                                        placeholder="10"
                                        value={settingsForm.news_count}
                                        onChange={(e) => 
                                          setSettingsForm(prev => ({
                                            ...prev,
                                            news_count: parseInt(e.target.value) || 10
                                          }))
                                        }
                                      />
                                    </div>

                                    <div className="space-y-3">
                                      <Label>News Sources</Label>
                                      <div className="text-sm text-muted-foreground mb-2">
                                        Add specific domains for Perplexity to prioritize when searching for news (e.g., "techcrunch.com", "reuters.com")
                                      </div>
                                      
                                       {/* Current Sources */}
                                       <div className="space-y-2">
                                         <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                           Current Sources ({settingsForm.news_sources.length})
                                         </div>
                                          {settingsForm.news_sources.length > 0 ? (
                                            <ScrollArea className="h-32">
                                              <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg border">
                                                {settingsForm.news_sources.map((source, index) => (
                                                  <div key={index} className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-medium border border-primary/20">
                                                    {source}
                                                    <button
                                                      type="button"
                                                      onClick={() => setSettingsForm(prev => ({
                                                        ...prev,
                                                        news_sources: prev.news_sources.filter((_, i) => i !== index)
                                                      }))}
                                                      className="ml-1 text-primary/60 hover:text-primary hover:bg-primary/20 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                                                    >
                                                      ×
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            </ScrollArea>
                                         ) : (
                                           <div className="p-3 bg-muted/30 rounded-lg border-dashed border-2 text-center text-sm text-muted-foreground">
                                             No news sources added yet. Add sources below to prioritize specific domains.
                                           </div>
                                         )}
                                       </div>

                                      {/* Add Source Input */}
                                      <div className="space-y-2">
                                        <div className="flex gap-2">
                                          <Input
                                            id="new-source"
                                            placeholder="domain.com, https://example.com/path, news.site.org"
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const input = e.currentTarget;
                                                const inputValue = input.value.trim();
                                                if (inputValue) {
                                                  // Split by comma and process each domain/URL
                                                  const entries = inputValue.split(',')
                                                    .map(d => d.trim())
                                                    .filter(d => d.length > 0);
                                                  
                                                  // Extract domains from URLs or use as-is if already domain
                                                  const extractDomain = (entry: string): string => {
                                                    try {
                                                      // Remove protocol if present
                                                      let cleanEntry = entry.replace(/^https?:\/\//, '');
                                                      // Extract just the hostname part (remove path, query, etc.)
                                                      let domain = cleanEntry.split('/')[0].split('?')[0].split('#')[0];
                                                      return domain.toLowerCase();
                                                    } catch {
                                                      return entry.toLowerCase();
                                                    }
                                                  };
                                                  
                                                  const domains = entries.map(extractDomain);
                                                  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
                                                  const validDomains = domains.filter(domain => 
                                                    domainRegex.test(domain) && !settingsForm.news_sources.includes(domain)
                                                  );
                                                  
                                                  if (validDomains.length > 0) {
                                                    setSettingsForm(prev => ({
                                                      ...prev,
                                                      news_sources: [...prev.news_sources, ...validDomains]
                                                    }));
                                                    input.value = '';
                                                    toast({
                                                      title: "Sources added",
                                                      description: `Added ${validDomains.length} news source${validDomains.length > 1 ? 's' : ''}`
                                                    });
                                                  } else {
                                                    toast({
                                                      title: "No valid sources",
                                                      description: "Please check the format of your URLs/domains",
                                                      variant: "destructive"
                                                    });
                                                  }
                                                }
                                              }
                                            }}
                                          />
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={(e) => {
                                              const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                              const inputValue = input.value.trim();
                                              if (inputValue) {
                                                // Split by comma and process each domain/URL
                                                const entries = inputValue.split(',')
                                                  .map(d => d.trim())
                                                  .filter(d => d.length > 0);
                                                
                                                // Extract domains from URLs or use as-is if already domain
                                                const extractDomain = (entry: string): string => {
                                                  try {
                                                    // Remove protocol if present
                                                    let cleanEntry = entry.replace(/^https?:\/\//, '');
                                                    // Extract just the hostname part (remove path, query, etc.)
                                                    let domain = cleanEntry.split('/')[0].split('?')[0].split('#')[0];
                                                    return domain.toLowerCase();
                                                  } catch {
                                                    return entry.toLowerCase();
                                                  }
                                                };
                                                
                                                const domains = entries.map(extractDomain);
                                                const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
                                                const validDomains = domains.filter(domain => 
                                                  domainRegex.test(domain) && !settingsForm.news_sources.includes(domain)
                                                );
                                                
                                                if (validDomains.length > 0) {
                                                  setSettingsForm(prev => ({
                                                    ...prev,
                                                    news_sources: [...prev.news_sources, ...validDomains]
                                                  }));
                                                  input.value = '';
                                                  toast({
                                                    title: "Sources added",
                                                    description: `Added ${validDomains.length} news source${validDomains.length > 1 ? 's' : ''}`
                                                  });
                                                } else {
                                                  toast({
                                                    title: "No valid sources",
                                                    description: "Please check the format of your URLs/domains",
                                                    variant: "destructive"
                                                  });
                                                }
                                              }
                                            }}
                                          >
                                            Add
                                          </Button>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          Add domains (example.com) or full URLs (https://example.com/path). Separate multiple entries with commas.
                                        </div>
                                      </div>

                                      {/* Quick Add Presets */}
                                      <div className="space-y-2">
                                        <div className="text-xs text-muted-foreground">Quick add:</div>
                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              const techSources = ['techcrunch.com', 'arstechnica.com', 'theverge.com'];
                                              setSettingsForm(prev => ({
                                                ...prev,
                                                news_sources: [...new Set([...prev.news_sources, ...techSources])]
                                              }));
                                            }}
                                          >
                                            Tech News
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              const businessSources = ['bloomberg.com', 'reuters.com', 'wsj.com'];
                                              setSettingsForm(prev => ({
                                                ...prev,
                                                news_sources: [...new Set([...prev.news_sources, ...businessSources])]
                                              }));
                                            }}
                                          >
                                            Business
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              const generalSources = ['cnn.com', 'bbc.com', 'npr.org'];
                                              setSettingsForm(prev => ({
                                                ...prev,
                                                news_sources: [...new Set([...prev.news_sources, ...generalSources])]
                                              }));
                                            }}
                                          >
                                            General News
                                          </Button>
                                        </div>
                                      </div>
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

                          {/* Delete Group Button */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Group
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Group</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to permanently delete "{selectedGroup.name}"? This will delete all posts, comments, and remove all members. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteGroup(selectedGroup.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete Group
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                       </>
                     )}
                  </div>
                </div>
              </div>
            )}

               {/* Posts Section */}
             <div className="space-y-4">
               {/* Search and Filter Controls */}
               <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                 <div className="flex items-center justify-between">
                   <h3 className="text-xl font-semibold">Latest Updates</h3>
                 </div>
                 
                 <div className="flex gap-3 items-center flex-wrap">
                   {/* Search Input */}
                   <div className="relative flex-1 min-w-[200px]">
                     <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                     <Input
                       placeholder="Search posts by keywords..."
                       value={searchKeyword}
                       onChange={(e) => setSearchKeyword(e.target.value)}
                       className="pl-10"
                     />
                   </div>
                   
                   {/* Timeline Filter */}
                   <Select value={timelineFilter} onValueChange={setTimelineFilter}>
                     <SelectTrigger className="w-[160px]">
                       <SelectValue placeholder="Timeline" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="all">All posts</SelectItem>
                       <SelectItem value="1">Last month</SelectItem>
                       <SelectItem value="2">Last 2 months</SelectItem>
                       <SelectItem value="3">Last 3 months</SelectItem>
                     </SelectContent>
                   </Select>
                   
                   {/* Clear Filters Button */}
                   {(searchKeyword || timelineFilter !== "all") && (
                     <Button 
                       variant="outline" 
                       size="sm"
                       onClick={() => {
                         setSearchKeyword("");
                         setTimelineFilter("all");
                       }}
                     >
                       Clear filters
                     </Button>
                   )}
                 </div>
               </div>

               <div className="flex items-center justify-between">
                 <div className="flex gap-2">
                   {/* Generate News Button - Only for admins with automated news enabled */}
                   {isGroupAdmin(selectedGroup) && selectedGroup?.automated_news_enabled && (
                     <>
                       <Button 
                         variant="outline"
                         onClick={generateNews}
                       >
                         <Newspaper className="h-4 w-4 mr-2" />
                         Generate News
                       </Button>
                       {rateLimitInfo && (
                         <span className="text-sm text-muted-foreground">
                           {rateLimitInfo.remaining_count} of {rateLimitInfo.limit_count} remaining today
                         </span>
                       )}
                     </>
                   )}
                   
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
               </div>
              
              {/* Minimalistic Group Stats */}/
              {selectedGroup && (
                <div className="mt-4">
                  <GroupStats 
                    groupId={selectedGroup.id}
                    isAdmin={isGroupAdmin(selectedGroup)}
                    onViewMembers={() => setShowMembersDialog(true)}
                  />
                </div>
              )}

              {posts.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No posts yet in this group</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {posts.map((post) => {
                    // Parse news post content for better formatting
                    const isNewsPost = post.type === 'automated' && post.content.includes('🤖 AI News Bot');
                    let postTitle = '';
                     let postSummary = '';
                     
                     if (isNewsPost) {
                       const lines = post.content.split('\n').filter(line => line.trim());
                       
                       // Extract title (look for lines starting with ** or 📰)
                       const titleLine = lines.find(line => 
                         (line.includes('**') && !line.includes('🤖') && !line.includes('AI News Bot')) ||
                         (line.includes('📰') && line.includes('**'))
                       );
                       if (titleLine) {
                         postTitle = titleLine.replace(/[\*📰]/g, '').trim();
                       }
                       
                       // Extract summary (content after title but before bot info and date)
                       const titleIndex = lines.findIndex(line => line === titleLine);
                       if (titleIndex >= 0) {
                         const contentLines = lines.slice(titleIndex + 1);
                         const summaryLines = contentLines.filter(line => 
                           !line.includes('🤖') && 
                           !line.includes('AI News Bot') &&
                           !line.includes('📅') &&
                           line.trim().length > 0
                         );
                         postSummary = summaryLines.join(' ').trim();
                       }
                     }
                    
                    return (
                      <div key={post.id} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/20 overflow-hidden hover:shadow-xl transition-all duration-300">
                        {/* Post Header */}
                        <div className="p-4 pb-3 bg-gradient-to-r from-indigo-50 to-purple-50">
                          <div className="flex items-center space-x-3">
                            {post.type === 'automated' ? (
                              <Bot className="w-10 h-10 text-primary ring-2 ring-indigo-200 rounded-full p-2 bg-white" />
                            ) : (
                              <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold text-sm ring-2 ring-indigo-200">
                                {post.author.charAt(0)}
                              </div>
                            )}
                             <div className="flex-1">
                               <h3 className="font-semibold text-indigo-900">
                                 {post.type === 'automated' ? 'AI News Bot' : post.author}
                               </h3>
                              <div className="flex items-center text-sm text-indigo-600">
                                <Clock className="w-4 h-4 mr-1" />
                                {new Date(post.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })} · {new Date(post.created_at).toLocaleTimeString('en-US', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </div>
                             </div>
                             
                             {/* Post Actions */}
                             <div className="ml-auto flex gap-1">
                               {/* Edit Button - For post author */}
                               {post.user_id === user?.id && post.type === 'user' && (
                                 <Button 
                                   variant="ghost" 
                                   size="sm" 
                                   onClick={() => setEditingPost({ id: post.id, content: post.content })}
                                   className="text-muted-foreground hover:text-foreground"
                                 >
                                   <Edit className="h-3 w-3" />
                                 </Button>
                               )}

                               {/* Delete Button - For admin or post author */}
                               {(isGroupAdmin(selectedGroup) || post.user_id === user?.id) && (
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
                               )}
                             </div>
                          </div>
                        </div>

                        {/* Post Content with Side Thumbnail */}
                        <div className="px-4 pb-3">
                          {isNewsPost ? (
                            <div className="flex gap-4">
                              {/* Text Content */}
                              <div className="flex-1">
                                <h2 className="text-lg font-semibold text-gray-800 mb-2 leading-tight">
                                  {postTitle}
                                </h2>
                                {postSummary && (
                                  <p className="text-gray-600 text-sm leading-relaxed mb-3">
                                    {postSummary}
                                  </p>
                                 )}
                                 {post.url && (
                                   <a 
                                     href={post.url} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="inline-flex items-center text-indigo-600 hover:text-purple-600 text-sm font-medium transition-colors duration-200"
                                   >
                                     <ExternalLink className="w-4 h-4 mr-1" />
                                     Read full article
                                   </a>
                                 )}
                              </div>

                              {/* Side Thumbnail */}
                              {post.image_url && (
                                <div className="flex-shrink-0">
                                  <img 
                                    src={post.image_url} 
                                    alt="Article thumbnail"
                                    className="w-32 h-24 sm:w-40 sm:h-28 object-cover rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                           ) : (
                             <div className="flex gap-4">
                               <div className="flex-1">
                                 {editingPost && editingPost.id === post.id ? (
                                   <div className="space-y-2">
                                     <Textarea
                                       value={editingPost.content}
                                       onChange={(e) => setEditingPost({ ...editingPost, content: e.target.value })}
                                       className="min-h-[80px]"
                                     />
                                     <div className="flex gap-2">
                                       <Button 
                                         size="sm" 
                                         onClick={() => editPost(editingPost.id, editingPost.content)}
                                         disabled={!editingPost.content.trim()}
                                       >
                                         Save
                                       </Button>
                                       <Button 
                                         size="sm" 
                                         variant="outline" 
                                         onClick={() => setEditingPost(null)}
                                       >
                                         Cancel
                                       </Button>
                                     </div>
                                   </div>
                                 ) : (
                                   <p className="text-gray-800 leading-relaxed">{post.content}</p>
                                 )}
                               </div>
                             </div>
                           )}
                        </div>

                        {/* Engagement Stats */}
                        <div className="px-4 py-2 text-sm text-indigo-600 bg-gradient-to-r from-indigo-50/50 to-purple-50/50">
                          <div className="flex items-center space-x-4">
                            <span className="font-medium">{post.likes} likes</span>
                            <span className="font-medium">{post.comments.length} comments</span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="px-4 py-3 bg-gradient-to-r from-gray-50/80 to-indigo-50/80">
                          <div className="flex items-center justify-around">
                            <button
                              onClick={() => toggleLike(post.id)}
                              className={`flex items-center space-x-2 px-4 py-2 rounded-xl transition-all duration-200 ${
                                post.liked 
                                  ? 'text-red-600 bg-red-100/80 hover:bg-red-200/80 shadow-md' 
                                  : 'text-gray-600 hover:bg-indigo-100/80 hover:text-indigo-600'
                              }`}
                            >
                              <Heart className={`w-5 h-5 ${post.liked ? 'fill-current' : ''}`} />
                              <span className="font-medium">Like</span>
                            </button>
                            
                            <button
                              onClick={() => toggleComments(post.id)}
                              className="flex items-center space-x-2 px-4 py-2 rounded-xl text-gray-600 hover:bg-indigo-100/80 hover:text-indigo-600 transition-all duration-200"
                            >
                              <MessageSquare className="w-5 h-5" />
                              <span className="font-medium">Comment</span>
                            </button>
                            
                            <button className="flex items-center space-x-2 px-4 py-2 rounded-xl text-gray-600 hover:bg-indigo-100/80 hover:text-indigo-600 transition-all duration-200">
                              <Share2 className="w-5 h-5" />
                              <span className="font-medium">Share</span>
                            </button>

                            <button
                              onClick={() => flagPost(post.id)}
                              className="flex items-center space-x-2 px-4 py-2 rounded-xl text-gray-600 hover:bg-red-100/80 hover:text-red-600 transition-all duration-200"
                            >
                              <Flag className="w-5 h-5" />
                              <span className="font-medium">Flag</span>
                            </button>
                          </div>
                        </div>

                        {/* Comments Section */}
                        {expandedComments.has(post.id) && (
                          <div className="px-4 pb-4 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 border-t border-indigo-100">
                            {/* Add Comment */}
                            <div className="py-3">
                              <div className="flex space-x-3">
                                <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center">
                                  <User className="w-4 h-4 text-white" />
                                </div>
                                <div className="flex-1">
                                  <input
                                    type="text"
                                    placeholder="Write a comment..."
                                    value={commentInputs[post.id] || ''}
                                    onChange={(e) => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                                    className="w-full px-3 py-2 border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent text-sm bg-white/70 backdrop-blur-sm"
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
                                  {commentInputs[post.id]?.trim() && (
                                    <button
                                      onClick={() => addComment(post.id)}
                                      className="mt-2 px-4 py-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 shadow-md hover:shadow-lg"
                                    >
                                      Post
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Existing Comments */}
                            <div className="space-y-3">
                              {post.comments.map((comment) => (
                                <div key={comment.id} className="flex space-x-3">
                                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-300 to-purple-400 rounded-full flex items-center justify-center">
                                    <User className="w-4 h-4 text-white" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="bg-white/70 backdrop-blur-sm px-3 py-2 rounded-xl shadow-sm border border-white/50">
                                      <p className="font-medium text-sm text-indigo-900">{comment.author}</p>
                                      <p className="text-sm text-gray-700 mt-1">{comment.content}</p>
                                    </div>
                                    <p className="text-xs text-indigo-500 mt-1 ml-3">
                                      {new Date(comment.created_at).toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                              ))}
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
                                          onSelect={() => handleMentionSelect(post.id, member.name)}
                                          className="flex items-center gap-2 cursor-pointer"
                                        >
                                          <div className="h-6 w-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-semibold">
                                            {member.name.charAt(0).toUpperCase()}
                                          </div>
                                          <span className="text-sm">{member.name}</span>
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
                        )}
                      </div>
                    );
                  })}
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
