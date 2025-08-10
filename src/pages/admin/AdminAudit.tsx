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
import { 
  Search, 
  Download,
  User,
  Database,
  Activity,
  MessageSquare
} from "lucide-react";

interface AuditLog {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: string;
  table_name: string;
  row_id: string | null;
  old_data: any;
  new_data: any;
  metadata: any;
  actor_email?: string | null;
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

export default function AdminAudit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterTable, setFilterTable] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    setSEO(
      "Audit Logs | NewsBuzz",
      "Super Admin audit logs for NewsBuzz",
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

    const loadAuditLogs = async () => {
      try {
        let query = supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (dateRange.from) {
          query = query.gte('created_at', dateRange.from + 'T00:00:00Z');
        }
        if (dateRange.to) {
          query = query.lte('created_at', dateRange.to + 'T23:59:59Z');
        }
        if (filterAction !== 'all') {
          query = query.eq('action', filterAction);
        }
        if (filterTable !== 'all') {
          query = query.eq('table_name', filterTable);
        }

        const { data, error } = await query;
        if (error) throw error;

        const logsWithEmails = await Promise.all(
          (data || []).map(async (log) => {
            let actorEmail = null;
            if (log.actor_id) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('user_id', log.actor_id)
                .maybeSingle();
              actorEmail = profile?.email || null;
            }
            return { ...log, actor_email: actorEmail } as AuditLog;
          })
        );

        setAuditLogs(logsWithEmails);
      } catch (error) {
        console.error('Error loading audit logs:', error);
        toast({ title: 'Error', description: 'Failed to load audit logs', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    loadAuditLogs();
  }, [allowed, dateRange, filterAction, filterTable, toast]);

  const exportAuditLogs = () => {
    const csvContent = [
      ['Date', 'Action', 'Table', 'Actor', 'Row ID', 'Details'].join(','),
      ...auditLogs.map(log => [
        new Date(log.created_at).toISOString(),
        log.action,
        log.table_name,
        log.actor_email || 'System',
        log.row_id || '',
        JSON.stringify({ old_data: log.old_data, new_data: log.new_data, metadata: log.metadata })
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast({ title: 'Success', description: 'Audit logs exported' });
  };

  const getActionVariant = (action: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (action) {
      case 'INSERT': return 'secondary';
      case 'UPDATE': return 'outline';
      case 'DELETE': return 'destructive';
      default: return 'outline';
    }
  };

  const getTableIcon = (tableName: string) => {
    switch (tableName) {
      case 'profiles': return <User className="h-4 w-4" />;
      case 'groups': return <Database className="h-4 w-4" />;
      case 'posts': return <Activity className="h-4 w-4" />;
      case 'comments': return <MessageSquare className="h-4 w-4" />;
      default: return <Database className="h-4 w-4" />;
    }
  };

  const filteredLogs = auditLogs.filter(log => {
    if (!searchTerm) return true;
    return (
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.table_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.actor_email && log.actor_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.row_id && log.row_id.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  if (!checked || !allowed) return null;

  if (loading) {
    return (
      <main className="container py-8">
        <SuperAdminToolbar />
        <div className="mt-4">
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading audit logs...</p>
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
            <div className="flex items-center justify-between">
              <CardTitle>Audit Logs</CardTitle>
              <Button onClick={exportAuditLogs} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="border rounded-md px-3 py-2"
              >
                <option value="all">All Actions</option>
                <option value="INSERT">Insert</option>
                <option value="UPDATE">Update</option>
                <option value="DELETE">Delete</option>
              </select>
              
              <select
                value={filterTable}
                onChange={(e) => setFilterTable(e.target.value)}
                className="border rounded-md px-3 py-2"
              >
                <option value="all">All Tables</option>
                <option value="profiles">Profiles</option>
                <option value="groups">Groups</option>
                <option value="posts">Posts</option>
                <option value="comments">Comments</option>
                <option value="likes">Likes</option>
                <option value="group_memberships">Memberships</option>
              </select>
              
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                  className="text-sm"
                />
                <Input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                  className="text-sm"
                />
              </div>
            </div>

            <div className="space-y-3">
              {filteredLogs.map((log) => (
                <div key={log.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={getActionVariant(log.action)}>
                          {log.action}
                        </Badge>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          {getTableIcon(log.table_name)}
                          <span className="text-sm font-medium">{log.table_name}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </div>
                      {log.actor_email && (
                        <div className="text-sm font-medium">{log.actor_email}</div>
                      )}
                    </div>
                  </div>
                  
                  {log.row_id && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      Row ID: {log.row_id}
                    </div>
                  )}
                  
                  {(log.old_data || log.new_data || log.metadata) && (
                    <details className="mt-2">
                      <summary className="text-sm font-medium cursor-pointer">View Details</summary>
                      <div className="mt-2 p-3 bg-muted rounded-md text-xs">
                        <pre className="whitespace-pre-wrap">
                          {JSON.stringify({ old_data: log.old_data, new_data: log.new_data, metadata: log.metadata }, null, 2)}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              ))}
              
              {filteredLogs.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No audit logs found</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
