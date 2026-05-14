import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PageLayout } from '@/components/layout/PageLayout';
import { BottomNav } from '@/components/layout/BottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  PlayCircle,
  MessageSquare,
  ChevronRight,
  Calendar,
  User
} from 'lucide-react';

interface ServiceRequest {
  id: string;
  title: string;
  description: string | null;
  status: string;
  payment_status: string;
  created_at: string;
  scheduled_at: string | null;
  worker_id: string;
  worker?: {
    id: string;
    category: string;
    occupation?: { name: string } | null;
    profile?: { first_name: string; last_name: string; avatar_url: string | null } | null;
  };
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'bg-warning text-warning-foreground', icon: Clock },
  accepted: { label: 'Accepted', color: 'bg-primary text-primary-foreground', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-destructive text-destructive-foreground', icon: XCircle },
  in_progress: { label: 'In Progress', color: 'bg-primary text-primary-foreground', icon: PlayCircle },
  completed: { label: 'Completed', color: 'bg-success text-white', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground', icon: XCircle },
};

export default function Requests() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('status') || 'all');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchRequests();
    }
  }, [user]);

  async function fetchRequests() {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_requests')
        .select(`
          *,
          workers:worker_id (
            id,
            category,
            occupations:occupation_id (name)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch worker profiles
      if (data && data.length > 0) {
        const workerIds = [...new Set(data.map(r => r.workers?.id).filter(Boolean))];
        
        // Get user_ids for workers first
        const { data: workers } = await supabase
          .from('workers')
          .select('id, user_id')
          .in('id', workerIds as string[]);

        if (workers) {
          const userIds = workers.map(w => w.user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('*')
            .in('user_id', userIds);

          const requestsWithProfiles = data.map(request => {
            const worker = workers.find(w => w.id === request.worker_id);
            const profile = worker ? profiles?.find(p => p.user_id === worker.user_id) : null;
            return {
              ...request,
              worker: request.workers ? {
                ...request.workers,
                occupation: request.workers.occupations,
                profile
              } : undefined
            };
          });

          setRequests(requestsWithProfiles);
        } else {
          setRequests(data.map(r => ({ ...r, worker: r.workers ? { ...r.workers, occupation: r.workers.occupations } : undefined })));
        }
      } else {
        setRequests([]);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredRequests = requests.filter(request => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') {
      return ['pending', 'accepted', 'in_progress'].includes(request.status);
    }
    return request.status === activeTab;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <PageLayout
        title="My Requests"
        subtitle="Track your service requests"
        backPath="/dashboard"
      >
        <div className="space-y-4 pb-24">
          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
              <TabsTrigger value="active" className="flex-1">Active</TabsTrigger>
              <TabsTrigger value="completed" className="flex-1">Completed</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              {loading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <div className="w-12 h-12 bg-muted rounded-full" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 bg-muted rounded w-3/4" />
                            <div className="h-3 bg-muted rounded w-1/2" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Requests Found</h3>
                  <p className="text-muted-foreground mb-4">
                    {activeTab === 'all' 
                      ? "You haven't made any service requests yet."
                      : `No ${activeTab} requests found.`}
                  </p>
                  <Button onClick={() => navigate('/feeds')}>
                    Find Workers
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRequests.map(request => {
                    const status = statusConfig[request.status] || statusConfig.pending;
                    const StatusIcon = status.icon;
                    
                    return (
                      <Card 
                        key={request.id}
                        className="cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => navigate(`/request/${request.id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            {/* Worker Avatar */}
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              {request.worker?.profile?.avatar_url ? (
                                <img 
                                  src={request.worker.profile.avatar_url} 
                                  alt="" 
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <User className="w-6 h-6 text-primary" />
                              )}
                            </div>

                            {/* Request Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <h3 className="font-semibold text-foreground truncate">
                                    {request.title}
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    {request.worker?.profile 
                                      ? `${request.worker.profile.first_name} ${request.worker.profile.last_name}`
                                      : 'Worker'
                                    }
                                    {request.worker?.occupation && ` • ${request.worker.occupation.name}`}
                                  </p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                              </div>

                              <div className="flex items-center gap-3 mt-2">
                                <Badge className={status.color}>
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  {status.label}
                                </Badge>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(request.created_at)}
                                </span>
                              </div>

                              {request.description && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
                                  {request.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </PageLayout>
      <BottomNav />
    </>
  );
}
