import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useWorkerProfile } from '@/hooks/useWorkerProfile';
import { useWallet } from '@/hooks/useWallet';
import { supabase } from '@/integrations/supabase/client';
import { PageLayout } from '@/components/layout/PageLayout';
import { BottomNav } from '@/components/layout/BottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Users, 
  Briefcase, 
  CheckCircle, 
  XCircle, 
  MessageSquare,
  Wallet,
  Eye,
  ArrowRight,
  Plus,
  Star,
  TrendingUp,
  LogOut,
  Settings
} from 'lucide-react';

interface RequestStats {
  pending: number;
  accepted: number;
  completed: number;
  cancelled: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut, loading: authLoading } = useAuth();
  const { isWorker, workerProfile, userProfile, loading: profileLoading } = useWorkerProfile();
  const { wallet } = useWallet();
  const [requestStats, setRequestStats] = useState<RequestStats>({
    pending: 0,
    accepted: 0,
    completed: 0,
    cancelled: 0
  });
  const [recentVisitors, setRecentVisitors] = useState<number>(0);
  const [viewingWorkerDashboard, setViewingWorkerDashboard] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user, viewingWorkerDashboard]);

  async function fetchStats() {
    if (!user) return;

    try {
      // Fetch request stats based on view mode
      if (viewingWorkerDashboard && workerProfile) {
        const { data: requests } = await supabase
          .from('service_requests')
          .select('status')
          .eq('worker_id', workerProfile.id);

        if (requests) {
          setRequestStats({
            pending: requests.filter(r => r.status === 'pending').length,
            accepted: requests.filter(r => r.status === 'accepted' || r.status === 'in_progress').length,
            completed: requests.filter(r => r.status === 'completed').length,
            cancelled: requests.filter(r => r.status === 'cancelled' || r.status === 'rejected').length
          });
        }
      } else {
        const { data: requests } = await supabase
          .from('service_requests')
          .select('status')
          .eq('user_id', user.id);

        if (requests) {
          setRequestStats({
            pending: requests.filter(r => r.status === 'pending').length,
            accepted: requests.filter(r => r.status === 'accepted' || r.status === 'in_progress').length,
            completed: requests.filter(r => r.status === 'completed').length,
            cancelled: requests.filter(r => r.status === 'cancelled' || r.status === 'rejected').length
          });
        }
      }

      // Fetch profile visitors
      const { count } = await supabase
        .from('profile_visitors')
        .select('*', { count: 'exact', head: true })
        .eq('profile_user_id', user.id);

      setRecentVisitors(count || 0);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  const userName = userProfile?.first_name || user.user_metadata?.first_name || 'User';

  return (
    <>
      <PageLayout
        title={viewingWorkerDashboard ? "Worker Dashboard" : "Dashboard"}
        subtitle={`Welcome back, ${userName}`}
        showBackButton={false}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate('/profile')}>
              <Settings className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => signOut()}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        }
      >
        <div className="space-y-6 pb-24">
          {/* Role Toggle for Workers */}
          {isWorker && (
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <Button
                variant={!viewingWorkerDashboard ? "default" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setViewingWorkerDashboard(false)}
              >
                User Dashboard
              </Button>
              <Button
                variant={viewingWorkerDashboard ? "default" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={() => setViewingWorkerDashboard(true)}
              >
                Worker Dashboard
              </Button>
            </div>
          )}

          {/* Profile Activity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="w-4 h-4 text-primary" />
                Profile Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">{recentVisitors}</p>
                  <p className="text-sm text-muted-foreground">Profile Views</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/profile')}>
                  View Profile
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Request Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                {viewingWorkerDashboard ? "Job Analytics" : "Request Analytics"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => navigate('/requests?status=pending')}
                  className="flex items-center gap-3 p-3 rounded-lg bg-warning/10 hover:bg-warning/20 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
                    <Briefcase className="w-5 h-5 text-warning" />
                  </div>
                  <div className="text-left">
                    <p className="text-xl font-bold">{requestStats.pending}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/requests?status=accepted')}
                  className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-xl font-bold">{requestStats.accepted}</p>
                    <p className="text-xs text-muted-foreground">In Progress</p>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/requests?status=completed')}
                  className="flex items-center gap-3 p-3 rounded-lg bg-success/10 hover:bg-success/20 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-success" />
                  </div>
                  <div className="text-left">
                    <p className="text-xl font-bold">{requestStats.completed}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                </button>

                <button
                  onClick={() => navigate('/requests?status=cancelled')}
                  className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div className="text-left">
                    <p className="text-xl font-bold">{requestStats.cancelled}</p>
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Wallet Summary */}
          <Card className="gradient-primary text-white">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Wallet Balance</p>
                  <p className="text-3xl font-bold">₹{wallet?.balance?.toFixed(2) || '0.00'}</p>
                </div>
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={() => navigate('/wallet')}
                  className="bg-white/20 hover:bg-white/30 text-white border-0"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Money
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => navigate('/feeds')}
            >
              <Users className="w-6 h-6 text-primary" />
              <span>Find Workers</span>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col items-center gap-2"
              onClick={() => navigate('/requests')}
            >
              <MessageSquare className="w-6 h-6 text-primary" />
              <span>My Requests</span>
            </Button>

            {!isWorker && (
              <Button
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2 col-span-2"
                onClick={() => navigate('/worker-registration')}
              >
                <Briefcase className="w-6 h-6 text-primary" />
                <span>Become a Worker</span>
              </Button>
            )}

            {viewingWorkerDashboard && isWorker && (
              <>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => navigate('/worker/requests')}
                >
                  <Briefcase className="w-6 h-6 text-primary" />
                  <span>Incoming Jobs</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => navigate('/worker/earnings')}
                >
                  <Wallet className="w-6 h-6 text-primary" />
                  <span>Earnings</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => navigate('/certificates')}
                >
                  <Star className="w-6 h-6 text-primary" />
                  <span>Certificates</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2"
                  onClick={() => navigate('/worker/profile')}
                >
                  <Settings className="w-6 h-6 text-primary" />
                  <span>Worker Profile</span>
                </Button>
              </>
            )}
          </div>

          {/* Chat History Teaser */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  Recent Chats
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => navigate('/requests')}>
                  View All <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-6 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No recent conversations</p>
                <Button 
                  variant="link" 
                  className="text-primary"
                  onClick={() => navigate('/feeds')}
                >
                  Find a worker to start chatting
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
      <BottomNav isWorker={isWorker} />
    </>
  );
}
