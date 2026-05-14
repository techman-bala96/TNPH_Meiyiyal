import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  PlayCircle,
  MessageSquare,
  Send,
  User,
  Phone,
  Video,
  Star
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender_id: string;
  message: string;
  message_type: string;
  created_at: string;
  is_read: boolean;
}

interface RequestDetails {
  id: string;
  title: string;
  description: string | null;
  status: string;
  payment_status: string;
  proposed_price: number | null;
  final_price: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  user_id: string;
  worker_id: string;
  worker?: {
    id: string;
    user_id: string;
    category: string;
    occupation?: { name: string } | null;
    profile?: { first_name: string; last_name: string; avatar_url: string | null } | null;
  };
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock; step: number }> = {
  pending: { label: 'Pending', color: 'bg-warning', icon: Clock, step: 1 },
  accepted: { label: 'Accepted', color: 'bg-primary', icon: CheckCircle, step: 2 },
  rejected: { label: 'Rejected', color: 'bg-destructive', icon: XCircle, step: 0 },
  in_progress: { label: 'In Progress', color: 'bg-primary', icon: PlayCircle, step: 3 },
  completed: { label: 'Completed', color: 'bg-success', icon: CheckCircle, step: 4 },
  cancelled: { label: 'Cancelled', color: 'bg-muted', icon: XCircle, step: 0 },
};

const statusSteps = ['pending', 'accepted', 'in_progress', 'completed'];

export default function RequestDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [request, setRequest] = useState<RequestDetails | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (requestId) {
      fetchRequestDetails();
      fetchMessages();
      subscribeToMessages();
    }
  }, [requestId, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function fetchRequestDetails() {
    if (!requestId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_requests')
        .select(`
          *,
          workers:worker_id (
            id,
            user_id,
            category,
            occupations:occupation_id (name)
          )
        `)
        .eq('id', requestId)
        .single();

      if (error) throw error;

      // Fetch worker profile
      if (data?.workers) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', data.workers.user_id)
          .single();

        setRequest({
          ...data,
          worker: {
            ...data.workers,
            occupation: data.workers.occupations,
            profile
          }
        });
      } else {
        setRequest(data);
      }
    } catch (error) {
      console.error('Error fetching request:', error);
      toast({
        title: 'Error',
        description: 'Failed to load request details',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchMessages() {
    if (!requestId) return;

    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });

    setMessages(data || []);
  }

  function subscribeToMessages() {
    if (!requestId) return;

    const channel = supabase
      .channel(`messages:${requestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `request_id=eq.${requestId}`
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as ChatMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async function sendMessage() {
    if (!newMessage.trim() || !user || !requestId) return;

    setSending(true);
    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          request_id: requestId,
          sender_id: user.id,
          message: newMessage.trim(),
          message_type: 'text'
        });

      if (error) throw error;
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  }

  async function cancelRequest() {
    if (!requestId) return;

    try {
      const { error } = await supabase
        .from('service_requests')
        .update({ 
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;
      
      toast({ title: 'Request cancelled' });
      fetchRequestDetails();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to cancel request',
        variant: 'destructive'
      });
    }
  }

  if (loading) {
    return (
      <PageLayout title="Request Details" backPath="/requests">
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </PageLayout>
    );
  }

  if (!request) {
    return (
      <PageLayout title="Request Details" backPath="/requests">
        <div className="text-center py-20">
          <p className="text-muted-foreground">Request not found</p>
        </div>
      </PageLayout>
    );
  }

  const status = statusConfig[request.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const currentStep = status.step;
  const isUserRequest = request.user_id === user?.id;
  const canChat = ['accepted', 'in_progress'].includes(request.status);

  return (
    <PageLayout title="Request Details" backPath="/requests">
      <div className="space-y-4 pb-24">
        {/* Status Stepper */}
        {currentStep > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                {statusSteps.map((step, index) => {
                  const stepNum = index + 1;
                  const isCompleted = currentStep >= stepNum;
                  const isCurrent = currentStep === stepNum;
                  
                  return (
                    <div key={step} className="flex-1 flex items-center">
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          isCompleted ? 'bg-primary text-primary-foreground' : 
                          isCurrent ? 'bg-primary/20 text-primary border-2 border-primary' : 
                          'bg-muted text-muted-foreground'
                        }`}>
                          {isCompleted ? <CheckCircle className="w-4 h-4" /> : stepNum}
                        </div>
                        <span className={`text-xs mt-1 ${isCurrent ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                          {statusConfig[step].label}
                        </span>
                      </div>
                      {index < statusSteps.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-2 ${isCompleted && index < currentStep - 1 ? 'bg-primary' : 'bg-muted'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Request Info */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg">{request.title}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(request.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
              </div>
              <Badge className={`${status.color} text-white`}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {status.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {request.description && (
              <p className="text-muted-foreground mb-4">{request.description}</p>
            )}

            {/* Worker Info */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
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
              <div className="flex-1">
                <p className="font-medium">
                  {request.worker?.profile 
                    ? `${request.worker.profile.first_name} ${request.worker.profile.last_name}`
                    : 'Worker'
                  }
                </p>
                <p className="text-sm text-muted-foreground">
                  {request.worker?.occupation?.name || 'Service Provider'}
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate(`/worker/${request.worker_id}`)}
              >
                View Profile
              </Button>
            </div>

            {/* Price Info */}
            {(request.proposed_price || request.final_price) && (
              <div className="mt-4 p-3 bg-primary/5 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  {request.final_price ? 'Final Price' : 'Proposed Price'}
                </p>
                <p className="text-2xl font-bold text-primary">
                  ₹{request.final_price || request.proposed_price}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              {request.status === 'pending' && isUserRequest && (
                <Button 
                  variant="destructive" 
                  className="flex-1"
                  onClick={cancelRequest}
                >
                  Cancel Request
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Chat Section */}
        {canChat && (
          <Card className="flex flex-col h-[400px]">
            <CardHeader className="pb-3 border-b shrink-0">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No messages yet</p>
                  <p className="text-sm">Start the conversation!</p>
                </div>
              ) : (
                messages.map(msg => {
                  const isOwn = msg.sender_id === user?.id;
                  return (
                    <div 
                      key={msg.id}
                      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                        isOwn 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}>
                        <p className="text-sm">{msg.message}</p>
                        <p className={`text-xs mt-1 ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {new Date(msg.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </CardContent>
            <div className="p-4 border-t shrink-0">
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  disabled={sending}
                />
                <Button 
                  size="icon" 
                  onClick={sendMessage}
                  disabled={sending || !newMessage.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
