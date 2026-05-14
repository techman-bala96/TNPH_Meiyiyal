import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkerProfile } from '@/hooks/useWorkerProfile';
import { PageLayout } from '@/components/layout/PageLayout';
import { BottomNav } from '@/components/layout/BottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  PlayCircle,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  User,
  Calendar,
  MapPin,
  IndianRupee,
  MessageSquare,
  Briefcase,
  ChevronRight
} from 'lucide-react';

interface ServiceRequest {
  id: string;
  title: string;
  description: string | null;
  status: string;
  payment_status: string;
  created_at: string;
  scheduled_at: string | null;
  proposed_price: number | null;
  user_id: string;
  user?: {
    first_name: string;
    last_name: string;
    avatar_url: string | null;
    location_address: string | null;
  };
}

// Dummy data for testing
const DUMMY_REQUESTS: ServiceRequest[] = [
  {
    id: 'dummy-1',
    title: 'Need help with legal documents',
    description: 'I need assistance reviewing and preparing legal documents for my new business registration.',
    status: 'pending',
    payment_status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
    scheduled_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    proposed_price: 2500,
    user_id: 'dummy-user-1',
    user: {
      first_name: 'Rahul',
      last_name: 'Sharma',
      avatar_url: null,
      location_address: 'Mumbai, Maharashtra'
    }
  },
  {
    id: 'dummy-2',
    title: 'Home electrical repair',
    description: 'Need to fix wiring issues in kitchen and install new switches.',
    status: 'pending',
    payment_status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 minutes ago
    scheduled_at: null,
    proposed_price: 1500,
    user_id: 'dummy-user-2',
    user: {
      first_name: 'Priya',
      last_name: 'Patel',
      avatar_url: null,
      location_address: 'Pune, Maharashtra'
    }
  },
  {
    id: 'dummy-3',
    title: 'Website development consultation',
    description: 'Looking for guidance on building an e-commerce website for my business.',
    status: 'accepted',
    payment_status: 'pending',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    scheduled_at: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
    proposed_price: 5000,
    user_id: 'dummy-user-3',
    user: {
      first_name: 'Amit',
      last_name: 'Kumar',
      avatar_url: null,
      location_address: 'Delhi'
    }
  },
  {
    id: 'dummy-4',
    title: 'Math tutoring for Class 10',
    description: 'Need help with mathematics for board exam preparation.',
    status: 'in_progress',
    payment_status: 'authorized',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    scheduled_at: null,
    proposed_price: 800,
    user_id: 'dummy-user-4',
    user: {
      first_name: 'Sneha',
      last_name: 'Gupta',
      avatar_url: null,
      location_address: 'Bangalore, Karnataka'
    }
  },
  {
    id: 'dummy-5',
    title: 'Plumbing work completed',
    description: 'Fixed bathroom pipes and installed new fittings.',
    status: 'completed',
    payment_status: 'completed',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), // 3 days ago
    scheduled_at: null,
    proposed_price: 3000,
    user_id: 'dummy-user-5',
    user: {
      first_name: 'Vikram',
      last_name: 'Singh',
      avatar_url: null,
      location_address: 'Chennai, Tamil Nadu'
    }
  }
];

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'bg-warning text-warning-foreground', icon: Clock },
  accepted: { label: 'Accepted', color: 'bg-primary text-primary-foreground', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-destructive text-destructive-foreground', icon: XCircle },
  in_progress: { label: 'In Progress', color: 'bg-primary text-primary-foreground', icon: PlayCircle },
  completed: { label: 'Completed', color: 'bg-success text-white', icon: CheckCircle },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground', icon: XCircle },
};

// Create beep sound using Web Audio API
function createBeepSound() {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 880; // A5 note
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

export default function WorkerRequests() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isWorker, workerProfile, loading: profileLoading } = useWorkerProfile();
  const [requests, setRequests] = useState<ServiceRequest[]>(DUMMY_REQUESTS);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [isAvailable, setIsAvailable] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newRequestCount, setNewRequestCount] = useState(0);
  const lastRequestCountRef = useRef(DUMMY_REQUESTS.filter(r => r.status === 'pending').length);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Simulate new request notification
  useEffect(() => {
    if (!isAvailable || !soundEnabled) return;

    const interval = setInterval(() => {
      // Simulate a new request coming in (20% chance every 30 seconds)
      if (Math.random() < 0.2) {
        const newRequest: ServiceRequest = {
          id: `dummy-new-${Date.now()}`,
          title: 'New urgent service request!',
          description: 'This is a simulated new request to test the notification system.',
          status: 'pending',
          payment_status: 'pending',
          created_at: new Date().toISOString(),
          scheduled_at: null,
          proposed_price: Math.floor(Math.random() * 5000) + 500,
          user_id: 'dummy-new-user',
          user: {
            first_name: 'New',
            last_name: 'Customer',
            avatar_url: null,
            location_address: 'Nearby Location'
          }
        };

        setRequests(prev => [newRequest, ...prev]);
        setNewRequestCount(prev => prev + 1);
        
        // Play beep sound
        try {
          createBeepSound();
        } catch (e) {
          console.log('Could not play sound:', e);
        }

        toast({
          title: "🔔 New Request!",
          description: `${newRequest.user?.first_name} needs your help with: ${newRequest.title}`,
        });
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [isAvailable, soundEnabled]);

  // Alert when pending count increases
  useEffect(() => {
    const currentPending = requests.filter(r => r.status === 'pending').length;
    if (currentPending > lastRequestCountRef.current && isAvailable && soundEnabled) {
      try {
        createBeepSound();
      } catch (e) {
        console.log('Could not play sound:', e);
      }
    }
    lastRequestCountRef.current = currentPending;
  }, [requests, isAvailable, soundEnabled]);

  const handleAccept = useCallback((requestId: string) => {
    setRequests(prev => prev.map(r => 
      r.id === requestId ? { ...r, status: 'accepted' } : r
    ));
    setNewRequestCount(prev => Math.max(0, prev - 1));
    
    toast({
      title: "Request Accepted!",
      description: "You have accepted this service request. The user will be notified.",
    });
  }, []);

  const handleReject = useCallback((requestId: string) => {
    setRequests(prev => prev.map(r => 
      r.id === requestId ? { ...r, status: 'rejected' } : r
    ));
    setNewRequestCount(prev => Math.max(0, prev - 1));
    
    toast({
      title: "Request Rejected",
      description: "You have rejected this service request.",
      variant: "destructive"
    });
  }, []);

  const handleStartWork = useCallback((requestId: string) => {
    setRequests(prev => prev.map(r => 
      r.id === requestId ? { ...r, status: 'in_progress' } : r
    ));
    
    toast({
      title: "Work Started!",
      description: "You've started working on this request.",
    });
  }, []);

  const handleComplete = useCallback((requestId: string) => {
    setRequests(prev => prev.map(r => 
      r.id === requestId ? { ...r, status: 'completed', payment_status: 'completed' } : r
    ));
    
    toast({
      title: "Work Completed!",
      description: "Great job! The service has been marked as completed.",
    });
  }, []);

  const filteredRequests = requests.filter(request => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') {
      return ['accepted', 'in_progress'].includes(request.status);
    }
    return request.status === activeTab;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const activeCount = requests.filter(r => ['accepted', 'in_progress'].includes(r.status)).length;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short'
    });
  };

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <PageLayout
        title="Worker Requests"
        subtitle="Manage your incoming service requests"
        backPath="/dashboard"
      >
        <div className="space-y-4 pb-24">
          {/* Availability Toggle */}
          <Card className="gradient-primary text-white">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isAvailable ? (
                    <Bell className="w-6 h-6" />
                  ) : (
                    <BellOff className="w-6 h-6 opacity-50" />
                  )}
                  <div>
                    <p className="font-semibold">
                      {isAvailable ? 'Available for Work' : 'Not Available'}
                    </p>
                    <p className="text-sm text-white/80">
                      {isAvailable 
                        ? 'You will receive alerts for new requests' 
                        : 'You won\'t receive new request alerts'}
                    </p>
                  </div>
                </div>
                <Switch 
                  checked={isAvailable} 
                  onCheckedChange={setIsAvailable}
                  className="data-[state=checked]:bg-white data-[state=checked]:text-primary"
                />
              </div>

              {/* Sound Toggle */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/20">
                <div className="flex items-center gap-3">
                  {soundEnabled ? (
                    <Volume2 className="w-5 h-5" />
                  ) : (
                    <VolumeX className="w-5 h-5 opacity-50" />
                  )}
                  <span className="text-sm">Sound Alerts</span>
                </div>
                <Switch 
                  checked={soundEnabled} 
                  onCheckedChange={setSoundEnabled}
                  className="data-[state=checked]:bg-white data-[state=checked]:text-primary"
                />
              </div>
            </CardContent>
          </Card>

          {/* New Request Alert */}
          {newRequestCount > 0 && (
            <Card className="border-warning bg-warning/10 animate-pulse">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-warning animate-bounce" />
                    <span className="font-medium text-warning-foreground">
                      {newRequestCount} new request{newRequestCount > 1 ? 's' : ''}!
                    </span>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setActiveTab('pending');
                      setNewRequestCount(0);
                    }}
                  >
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="pending" className="flex-1 relative">
                Pending
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="active" className="flex-1 relative">
                Active
                {activeCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                    {activeCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="completed" className="flex-1">History</TabsTrigger>
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
                  <Briefcase className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Requests Found</h3>
                  <p className="text-muted-foreground mb-4">
                    {activeTab === 'pending' 
                      ? "No pending requests at the moment."
                      : activeTab === 'active'
                      ? "No active jobs right now."
                      : "No completed requests yet."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRequests.map(request => {
                    const status = statusConfig[request.status] || statusConfig.pending;
                    const StatusIcon = status.icon;
                    const isPending = request.status === 'pending';
                    const isAccepted = request.status === 'accepted';
                    const isInProgress = request.status === 'in_progress';
                    
                    return (
                      <Card 
                        key={request.id}
                        className={`transition-all ${isPending ? 'border-warning shadow-md' : ''}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            {/* User Avatar */}
                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              {request.user?.avatar_url ? (
                                <img 
                                  src={request.user.avatar_url} 
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
                                  <h3 className="font-semibold text-foreground">
                                    {request.title}
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    {request.user 
                                      ? `${request.user.first_name} ${request.user.last_name}`
                                      : 'User'
                                    }
                                  </p>
                                </div>
                                <Badge className={status.color}>
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  {status.label}
                                </Badge>
                              </div>

                              {request.description && (
                                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                  {request.description}
                                </p>
                              )}

                              <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(request.created_at)}
                                </span>
                                {request.user?.location_address && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {request.user.location_address}
                                  </span>
                                )}
                                {request.proposed_price && (
                                  <span className="flex items-center gap-1 font-semibold text-foreground">
                                    <IndianRupee className="w-3 h-3" />
                                    {request.proposed_price}
                                  </span>
                                )}
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-2 mt-4">
                                {isPending && (
                                  <>
                                    <Button 
                                      size="sm" 
                                      onClick={() => handleAccept(request.id)}
                                      className="flex-1"
                                    >
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Accept
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="destructive"
                                      onClick={() => handleReject(request.id)}
                                      className="flex-1"
                                    >
                                      <XCircle className="w-4 h-4 mr-1" />
                                      Reject
                                    </Button>
                                  </>
                                )}
                                
                                {isAccepted && (
                                  <>
                                    <Button 
                                      size="sm"
                                      onClick={() => handleStartWork(request.id)}
                                      className="flex-1"
                                    >
                                      <PlayCircle className="w-4 h-4 mr-1" />
                                      Start Work
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => navigate(`/request/${request.id}`)}
                                    >
                                      <MessageSquare className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}

                                {isInProgress && (
                                  <>
                                    <Button 
                                      size="sm"
                                      onClick={() => handleComplete(request.id)}
                                      className="flex-1"
                                    >
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      Mark Complete
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      onClick={() => navigate(`/request/${request.id}`)}
                                    >
                                      <MessageSquare className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}

                                {(request.status === 'completed' || request.status === 'rejected' || request.status === 'cancelled') && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => navigate(`/request/${request.id}`)}
                                    className="w-full"
                                  >
                                    View Details
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                  </Button>
                                )}
                              </div>
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
      <BottomNav isWorker={true} />
    </>
  );
}
