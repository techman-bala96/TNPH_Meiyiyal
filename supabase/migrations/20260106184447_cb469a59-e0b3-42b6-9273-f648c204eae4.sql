-- Create enum types for better data integrity
CREATE TYPE public.user_role AS ENUM ('user', 'worker', 'admin');
CREATE TYPE public.worker_category AS ENUM ('professional', 'skilled', 'freelancer', 'educator');
CREATE TYPE public.kyc_status AS ENUM ('pending', 'under_review', 'verified', 'rejected');
CREATE TYPE public.payment_methodology AS ENUM ('per_session', 'task_based', 'free_service', 'hybrid');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone_number TEXT,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'user',
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  location_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create occupations table
CREATE TABLE public.occupations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category worker_category NOT NULL,
  payment_methodology payment_methodology NOT NULL,
  description TEXT,
  icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create workers table for worker-specific data
CREATE TABLE public.workers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  occupation_id UUID REFERENCES public.occupations(id),
  category worker_category NOT NULL,
  about TEXT,
  years_experience INTEGER DEFAULT 0,
  hourly_rate DECIMAL(10,2),
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_verified BOOLEAN NOT NULL DEFAULT false,
  rating DECIMAL(3,2) DEFAULT 0.00,
  total_reviews INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create worker_education table
CREATE TABLE public.worker_education (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  degree_name TEXT NOT NULL,
  institution TEXT NOT NULL,
  year_completed INTEGER,
  document_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create worker_experience table
CREATE TABLE public.worker_experience (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  role TEXT NOT NULL,
  start_year INTEGER,
  end_year INTEGER,
  description TEXT,
  document_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create worker_portfolio table for projects/works/certifications
CREATE TABLE public.worker_portfolio (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  media_type TEXT NOT NULL, -- 'image', 'video', 'document', 'audio', 'certification'
  media_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create kyc_verification table
CREATE TABLE public.kyc_verification (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id UUID NOT NULL UNIQUE REFERENCES public.workers(id) ON DELETE CASCADE,
  aadhaar_number_hash TEXT, -- Store hashed for security
  aadhaar_verified BOOLEAN NOT NULL DEFAULT false,
  pan_number TEXT,
  pan_name TEXT,
  pan_verified BOOLEAN NOT NULL DEFAULT false,
  video_verification_url TEXT,
  video_verified BOOLEAN NOT NULL DEFAULT false,
  status kyc_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.occupations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_education ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_verification ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT USING (true);

-- Occupations policies (public read)
CREATE POLICY "Occupations are viewable by everyone" ON public.occupations
  FOR SELECT USING (true);

-- Workers policies
CREATE POLICY "Workers can view their own worker profile" ON public.workers
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Workers can update their own worker profile" ON public.workers
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Workers can insert their own worker profile" ON public.workers
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public can view active verified workers" ON public.workers
  FOR SELECT USING (is_active = true AND is_verified = true);

-- Worker education policies
CREATE POLICY "Workers can manage their education" ON public.worker_education
  FOR ALL USING (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()));

CREATE POLICY "Public can view verified workers education" ON public.worker_education
  FOR SELECT USING (worker_id IN (SELECT id FROM public.workers WHERE is_active = true AND is_verified = true));

-- Worker experience policies
CREATE POLICY "Workers can manage their experience" ON public.worker_experience
  FOR ALL USING (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()));

CREATE POLICY "Public can view verified workers experience" ON public.worker_experience
  FOR SELECT USING (worker_id IN (SELECT id FROM public.workers WHERE is_active = true AND is_verified = true));

-- Worker portfolio policies
CREATE POLICY "Workers can manage their portfolio" ON public.worker_portfolio
  FOR ALL USING (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()));

CREATE POLICY "Public can view verified workers portfolio" ON public.worker_portfolio
  FOR SELECT USING (worker_id IN (SELECT id FROM public.workers WHERE is_active = true AND is_verified = true));

-- KYC policies (private - only worker can see their own)
CREATE POLICY "Workers can view their own KYC" ON public.kyc_verification
  FOR SELECT USING (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()));

CREATE POLICY "Workers can manage their own KYC" ON public.kyc_verification
  FOR ALL USING (worker_id IN (SELECT id FROM public.workers WHERE user_id = auth.uid()));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kyc_updated_at
  BEFORE UPDATE ON public.kyc_verification
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, email, phone_number)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email,
    NEW.phone
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert default occupations
INSERT INTO public.occupations (name, category, payment_methodology, description, icon) VALUES
-- Professional Services
('Lawyer', 'professional', 'per_session', 'Legal consultation and representation', 'scale'),
('Doctor', 'professional', 'per_session', 'Medical consultation and treatment', 'stethoscope'),
('Chartered Accountant', 'professional', 'per_session', 'Financial and tax consultation', 'calculator'),
('Consultant', 'professional', 'per_session', 'Business and strategy consultation', 'briefcase'),
('Architect', 'professional', 'task_based', 'Building design and planning', 'home'),
-- Skilled Workers
('Electrician', 'skilled', 'task_based', 'Electrical installation and repair', 'zap'),
('Plumber', 'skilled', 'task_based', 'Plumbing installation and repair', 'droplet'),
('Carpenter', 'skilled', 'task_based', 'Woodwork and furniture', 'hammer'),
('Painter', 'skilled', 'task_based', 'Interior and exterior painting', 'palette'),
('Mechanic', 'skilled', 'task_based', 'Vehicle repair and maintenance', 'wrench'),
-- Freelancers
('Graphic Designer', 'freelancer', 'task_based', 'Visual design and branding', 'pen-tool'),
('Web Developer', 'freelancer', 'task_based', 'Website development', 'code'),
('Content Writer', 'freelancer', 'task_based', 'Content creation and copywriting', 'file-text'),
('Photographer', 'freelancer', 'task_based', 'Photography services', 'camera'),
('Video Editor', 'freelancer', 'task_based', 'Video editing and production', 'film'),
-- Educators
('Tutor', 'educator', 'hybrid', 'Academic tutoring', 'book-open'),
('Music Teacher', 'educator', 'hybrid', 'Music instruction', 'music'),
('Fitness Trainer', 'educator', 'hybrid', 'Fitness and exercise coaching', 'dumbbell'),
('Language Teacher', 'educator', 'hybrid', 'Language instruction', 'globe'),
('Dance Instructor', 'educator', 'hybrid', 'Dance training', 'user');