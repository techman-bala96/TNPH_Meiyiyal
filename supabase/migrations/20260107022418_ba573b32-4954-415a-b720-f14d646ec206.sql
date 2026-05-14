-- Create request status enum
CREATE TYPE public.request_status AS ENUM (
  'pending',
  'accepted',
  'rejected',
  'in_progress',
  'completed',
  'cancelled'
);

-- Create payment status enum
CREATE TYPE public.payment_status AS ENUM (
  'pending',
  'authorized',
  'completed',
  'refunded',
  'failed'
);

-- Create transaction type enum
CREATE TYPE public.transaction_type AS ENUM (
  'credit',
  'debit',
  'refund',
  'payout',
  'top_up'
);

-- Create service requests table
CREATE TABLE public.service_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  occupation_id UUID REFERENCES public.occupations(id),
  title TEXT NOT NULL,
  description TEXT,
  status request_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  proposed_price NUMERIC,
  final_price NUMERIC,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  user_review TEXT,
  worker_rating INTEGER CHECK (worker_rating >= 1 AND worker_rating <= 5),
  worker_review TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create wallet table
CREATE TABLE public.wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create wallet transactions table
CREATE TABLE public.wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL,
  type transaction_type NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT,
  reference_id TEXT,
  status payment_status NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create chat messages table
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create certificates table
CREATE TABLE public.certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE REFERENCES public.service_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  certificate_number TEXT NOT NULL UNIQUE,
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  verification_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create support tickets table
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  attachments TEXT[],
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create profile visitors table
CREATE TABLE public.profile_visitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_user_id UUID NOT NULL,
  visitor_user_id UUID NOT NULL,
  visited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_visitors ENABLE ROW LEVEL SECURITY;

-- Service requests policies
CREATE POLICY "Users can view their own requests" ON public.service_requests
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Workers can view requests assigned to them" ON public.service_requests
  FOR SELECT USING (
    worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create requests" ON public.service_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own requests" ON public.service_requests
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Workers can update requests assigned to them" ON public.service_requests
  FOR UPDATE USING (
    worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid())
  );

-- Wallets policies
CREATE POLICY "Users can view their own wallet" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own wallet" ON public.wallets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wallet" ON public.wallets
  FOR UPDATE USING (auth.uid() = user_id);

-- Wallet transactions policies
CREATE POLICY "Users can view their own transactions" ON public.wallet_transactions
  FOR SELECT USING (
    wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can create transactions on their wallet" ON public.wallet_transactions
  FOR INSERT WITH CHECK (
    wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
  );

-- Chat messages policies
CREATE POLICY "Request participants can view messages" ON public.chat_messages
  FOR SELECT USING (
    request_id IN (
      SELECT id FROM public.service_requests 
      WHERE user_id = auth.uid() 
      OR worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Request participants can send messages" ON public.chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    request_id IN (
      SELECT id FROM public.service_requests 
      WHERE user_id = auth.uid() 
      OR worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "Users can mark their messages as read" ON public.chat_messages
  FOR UPDATE USING (
    request_id IN (
      SELECT id FROM public.service_requests 
      WHERE user_id = auth.uid() 
      OR worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid())
    )
  );

-- Certificates policies
CREATE POLICY "Users can view their certificates" ON public.certificates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Workers can view their issued certificates" ON public.certificates
  FOR SELECT USING (
    worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid())
  );

-- Support tickets policies
CREATE POLICY "Users can view their own tickets" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tickets" ON public.support_tickets
  FOR UPDATE USING (auth.uid() = user_id);

-- Profile visitors policies
CREATE POLICY "Users can view who visited their profile" ON public.profile_visitors
  FOR SELECT USING (auth.uid() = profile_user_id);

CREATE POLICY "Logged in users can record visits" ON public.profile_visitors
  FOR INSERT WITH CHECK (auth.uid() = visitor_user_id);

-- Create indexes for performance
CREATE INDEX idx_service_requests_user_id ON public.service_requests(user_id);
CREATE INDEX idx_service_requests_worker_id ON public.service_requests(worker_id);
CREATE INDEX idx_service_requests_status ON public.service_requests(status);
CREATE INDEX idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX idx_chat_messages_request_id ON public.chat_messages(request_id);
CREATE INDEX idx_profile_visitors_profile_user_id ON public.profile_visitors(profile_user_id);

-- Create trigger for updating timestamps
CREATE TRIGGER update_service_requests_updated_at
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;