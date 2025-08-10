import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, FileText, MessageCircle, ThumbsUp } from "lucide-react";

interface GroupStatsProps {
  groupId: string;
  isAdmin: boolean;
  onViewMembers?: () => void;
}

export const GroupStats: React.FC<GroupStatsProps> = ({ groupId, isAdmin, onViewMembers }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [membersCount, setMembersCount] = useState<number | null>(null);
  const [groupPosts7, setGroupPosts7] = useState(0);
  const [groupComments7, setGroupComments7] = useState(0);
  const [groupLikes7, setGroupLikes7] = useState(0);
  const [yourPosts7, setYourPosts7] = useState(0);
  const [yourComments7, setYourComments7] = useState(0);

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, [groupId]);

  useEffect(() => {
    let isCancelled = false;

    const fetchStats = async () => {
      try {
        setLoading(true);

        // Fetch all post ids for this group (used by comment/like counts & user comment counts)
        const { data: postRows, error: postsErr } = await supabase
          .from('posts')
          .select('id')
          .eq('group_id', groupId);

        if (postsErr) throw postsErr;

        const postIds = (postRows || []).map(r => r.id);

        // Admin metrics
        if (isAdmin) {
          // Members count
          const { count: membersCnt, error: membersErr } = await supabase
            .from('group_memberships')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId);
          if (membersErr) throw membersErr;

          // Group posts last 7 days
          const { count: posts7Cnt, error: posts7Err } = await supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .gte('created_at', since);
          if (posts7Err) throw posts7Err;

          // Group comments last 7 days
          let comments7Cnt = 0;
          if (postIds.length > 0) {
            const { count, error } = await supabase
              .from('comments')
              .select('id', { count: 'exact', head: true })
              .gte('created_at', since)
              .in('post_id', postIds);
            if (error) throw error;
            comments7Cnt = count || 0;
          }

          // Group likes last 7 days
          let likes7Cnt = 0;
          if (postIds.length > 0) {
            const { count, error } = await supabase
              .from('likes')
              .select('id', { count: 'exact', head: true })
              .gte('created_at', since)
              .in('post_id', postIds);
            if (error) throw error;
            likes7Cnt = count || 0;
          }

          if (!isCancelled) {
            setMembersCount(membersCnt ?? 0);
            setGroupPosts7(posts7Cnt ?? 0);
            setGroupComments7(comments7Cnt);
            setGroupLikes7(likes7Cnt);
          }
        }

        // Regular user metrics
        if (user?.id) {
          // Your posts last 7 days
          const { count: yourPostsCnt, error: yourPostsErr } = await supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .eq('user_id', user.id)
            .gte('created_at', since);
          if (yourPostsErr) throw yourPostsErr;

          // Your comments last 7 days (within group)
          let yourCommentsCnt = 0;
          if (postIds.length > 0) {
            const { count, error } = await supabase
              .from('comments')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .gte('created_at', since)
              .in('post_id', postIds);
            if (error) throw error;
            yourCommentsCnt = count || 0;
          }

          // Total group posts last 7 days (same as groupPosts7 for admins)
          const { count: totalPostsCnt, error: totalPostsErr } = await supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .gte('created_at', since);
          if (totalPostsErr) throw totalPostsErr;

          if (!isCancelled) {
            setYourPosts7(yourPostsCnt ?? 0);
            setYourComments7(yourCommentsCnt);
            setGroupPosts7(prev => isAdmin ? prev : (totalPostsCnt ?? 0));
          }
        }
      } catch (e) {
        console.error('Failed to load group stats', e);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    if (groupId) fetchStats();
    return () => { isCancelled = true; };
  }, [groupId, isAdmin, since, user?.id]);

  const StatCard = ({
    icon: Icon,
    value,
    label,
    extra,
  }: { icon: any; value: number | string; label: string; extra?: React.ReactNode }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold leading-none tracking-tight">{loading ? '—' : value}</div>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
            {extra}
          </div>
          <div className="rounded-full border bg-card text-primary p-2">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <section aria-label="Group statistics" className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {isAdmin ? (
        <>
          <StatCard
            icon={Users}
            value={membersCount ?? '—'}
            label="Total members"
            extra={onViewMembers ? (
              <Button variant="link" size="sm" className="px-0 mt-1" onClick={onViewMembers}>
                View members
              </Button>
            ) : null}
          />
          <StatCard icon={FileText} value={groupPosts7} label="Posts (7d)" />
          <StatCard icon={MessageCircle} value={groupComments7} label="Comments (7d)" />
          <StatCard icon={ThumbsUp} value={groupLikes7} label="Likes (7d)" />
        </>
      ) : (
        <>
          <StatCard icon={FileText} value={yourPosts7} label="Your posts (7d)" />
          <StatCard icon={MessageCircle} value={yourComments7} label="Your comments (7d)" />
          <StatCard icon={FileText} value={groupPosts7} label="Group posts (7d)" />
        </>
      )}
    </section>
  );
};
