import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { SuperAdminToolbar } from "@/components/SuperAdminToolbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flag, Trash2 } from "lucide-react";

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

interface FlaggedPostItem {
  postId: string;
  count: number;
  content: string;
  authorEmail: string | null;
  createdAt: string;
}

interface FlaggedCommentItem {
  commentId: string;
  count: number;
  content: string;
  authorEmail: string | null;
  createdAt: string;
}

export default function AdminModeration() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  const [loadingData, setLoadingData] = useState(true);
  const [flaggedPosts, setFlaggedPosts] = useState<FlaggedPostItem[]>([]);
  const [flaggedComments, setFlaggedComments] = useState<FlaggedCommentItem[]>([]);

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

  useEffect(() => {
    if (!allowed) return;
    const load = async () => {
      try {
        // Load post flags
        const { data: postFlags, error: pfErr } = await supabase
          .from('post_flags')
          .select('post_id, reason, created_at');
        if (pfErr) throw pfErr;

        const postMap = new Map<string, { count: number }>();
        (postFlags || []).forEach(f => {
          postMap.set(f.post_id, { count: (postMap.get(f.post_id)?.count || 0) + 1 });
        });

        const postItems: FlaggedPostItem[] = [];
        for (const [postId, { count }] of postMap.entries()) {
          const { data: post } = await supabase
            .from('posts')
            .select('id, content, created_at, user_id')
            .eq('id', postId)
            .maybeSingle();
          let authorEmail: string | null = null;
          if (post?.user_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('email')
              .eq('user_id', post.user_id)
              .maybeSingle();
            authorEmail = profile?.email || null;
          }
          if (post) {
            postItems.push({
              postId,
              count,
              content: post.content,
              authorEmail,
              createdAt: post.created_at,
            });
          }
        }

        // Load comment flags
        const { data: commentFlags, error: cfErr } = await supabase
          .from('comment_flags')
          .select('comment_id, reason, created_at');
        if (cfErr) throw cfErr;

        const commentMap = new Map<string, { count: number }>();
        (commentFlags || []).forEach(f => {
          commentMap.set(f.comment_id, { count: (commentMap.get(f.comment_id)?.count || 0) + 1 });
        });

        const commentItems: FlaggedCommentItem[] = [];
        for (const [commentId, { count }] of commentMap.entries()) {
          const { data: comment } = await supabase
            .from('comments')
            .select('id, content, created_at, user_id')
            .eq('id', commentId)
            .maybeSingle();
          let authorEmail: string | null = null;
          if (comment?.user_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('email')
              .eq('user_id', comment.user_id)
              .maybeSingle();
            authorEmail = profile?.email || null;
          }
          if (comment) {
            commentItems.push({
              commentId,
              count,
              content: comment.content,
              authorEmail,
              createdAt: comment.created_at,
            });
          }
        }

        setFlaggedPosts(postItems.sort((a,b) => b.count - a.count));
        setFlaggedComments(commentItems.sort((a,b) => b.count - a.count));
      } catch (e) {
        console.error('Error loading moderation data:', e);
        toast({ title: 'Error', description: 'Failed to load flagged content', variant: 'destructive' });
      } finally {
        setLoadingData(false);
      }
    };

    load();
  }, [allowed, toast]);

  const clearPostFlags = async (postId: string) => {
    const { error } = await supabase.from('post_flags').delete().eq('post_id', postId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to clear flags', variant: 'destructive' });
      return;
    }
    setFlaggedPosts(prev => prev.filter(p => p.postId !== postId));
    toast({ title: 'Cleared', description: 'Flags removed for the post' });
  };

  const clearCommentFlags = async (commentId: string) => {
    const { error } = await supabase.from('comment_flags').delete().eq('comment_id', commentId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to clear flags', variant: 'destructive' });
      return;
    }
    setFlaggedComments(prev => prev.filter(c => c.commentId !== commentId));
    toast({ title: 'Cleared', description: 'Flags removed for the comment' });
  };

  const handleDeletePost = async (postId: string) => {
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete post', variant: 'destructive' });
      return;
    }
    await supabase.from('post_flags').delete().eq('post_id', postId);
    setFlaggedPosts(prev => prev.filter(p => p.postId !== postId));
    toast({ title: 'Post deleted', description: 'The post has been removed.' });
  };

  const handleDeleteComment = async (commentId: string) => {
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) {
      toast({ title: 'Error', description: 'Failed to delete comment', variant: 'destructive' });
      return;
    }
    await supabase.from('comment_flags').delete().eq('comment_id', commentId);
    setFlaggedComments(prev => prev.filter(c => c.commentId !== commentId));
    toast({ title: 'Comment deleted', description: 'The comment has been removed.' });
  };

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
            {loadingData ? (
              <p className="text-muted-foreground">Loading flagged content…</p>
            ) : (
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Flag className="h-4 w-4 text-primary" /> Flagged Posts
                  </h3>
                  {flaggedPosts.length === 0 ? (
                    <p className="text-muted-foreground">No flagged posts.</p>
                  ) : (
                    <ul className="space-y-3">
                      {flaggedPosts.map((p) => (
                        <li key={p.postId} className="border rounded-md p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-muted-foreground">{new Date(p.createdAt).toLocaleString()}</div>
                              <div className="font-medium">{p.authorEmail || 'Unknown User'}</div>
                              <p className="text-sm mt-1 line-clamp-3">{p.content}</p>
                              <div className="text-xs text-muted-foreground mt-1">{p.count} flag(s)</div>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => clearPostFlags(p.postId)}>Unflag</Button>
                              <Button variant="destructive" size="sm" onClick={() => handleDeletePost(p.postId)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Flag className="h-4 w-4 text-primary" /> Flagged Comments
                  </h3>
                  {flaggedComments.length === 0 ? (
                    <p className="text-muted-foreground">No flagged comments.</p>
                  ) : (
                    <ul className="space-y-3">
                      {flaggedComments.map((c) => (
                        <li key={c.commentId} className="border rounded-md p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</div>
                              <div className="font-medium">{c.authorEmail || 'Unknown User'}</div>
                              <p className="text-sm mt-1 line-clamp-3">{c.content}</p>
                              <div className="text-xs text-muted-foreground mt-1">{c.count} flag(s)</div>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => clearCommentFlags(c.commentId)}>Unflag</Button>
                              <Button variant="destructive" size="sm" onClick={() => handleDeleteComment(c.commentId)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
