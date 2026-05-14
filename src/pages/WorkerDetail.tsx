import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  Star, 
  MapPin, 
  Briefcase, 
  GraduationCap, 
  Award,
  MessageSquare,
  Phone,
  Video,
  User,
  Scale,
  Zap,
  Code,
  BookOpen,
  Send,
  Clock,
  CheckCircle
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { ServicesPricing } from '@/components/worker/ServicesPricing';

type Worker = Tables<'workers'>;
type Occupation = Tables<'occupations'>;
type Profile = Tables<'profiles'>;
type Education = Tables<'worker_education'>;
type Experience = Tables<'worker_experience'>;
type Portfolio = Tables<'worker_portfolio'>;

// Dummy worker data matching Feeds page
const dummyWorkersData: Record<string, {
  worker: Partial<Worker>;
  profile: Partial<Profile>;
  occupation: Partial<Occupation>;
}> = {
  'dummy-1': {
    worker: { id: 'dummy-1', user_id: 'dummy-user-1', category: 'professional', about: 'Experienced corporate lawyer with 15+ years in business law, contracts, and litigation. Handled 500+ cases successfully.', years_experience: 15, hourly_rate: 2500, rating: 4.9, total_reviews: 127, is_active: true, is_verified: true },
    profile: { first_name: 'Adv. Priya', last_name: 'Sharma', location_address: 'Connaught Place, New Delhi', location_lat: 28.6139, location_lng: 77.2090 },
    occupation: { name: 'Lawyer', category: 'professional', payment_methodology: 'per_session' }
  },
  'dummy-2': {
    worker: { id: 'dummy-2', user_id: 'dummy-user-2', category: 'professional', about: 'MBBS, MD (General Medicine). 20 years experience in treating chronic conditions and preventive healthcare.', years_experience: 20, hourly_rate: 1500, rating: 4.8, total_reviews: 342, is_active: true, is_verified: true },
    profile: { first_name: 'Dr. Rajesh', last_name: 'Patel', location_address: 'Bandra, Mumbai', location_lat: 19.0760, location_lng: 72.8777 },
    occupation: { name: 'Doctor', category: 'professional', payment_methodology: 'per_session' }
  },
  'dummy-3': {
    worker: { id: 'dummy-3', user_id: 'dummy-user-3', category: 'professional', about: 'Chartered Accountant specializing in tax planning, audits, and financial consulting for businesses and individuals.', years_experience: 12, hourly_rate: 2000, rating: 4.7, total_reviews: 89, is_active: true, is_verified: true },
    profile: { first_name: 'CA Meera', last_name: 'Gupta', location_address: 'MG Road, Bangalore', location_lat: 12.9716, location_lng: 77.5946 },
    occupation: { name: 'Chartered Accountant', category: 'professional', payment_methodology: 'per_session' }
  },
  'dummy-4': {
    worker: { id: 'dummy-4', user_id: 'dummy-user-4', category: 'skilled', about: 'Licensed electrician with expertise in residential and commercial wiring, repairs, and smart home installations.', years_experience: 8, hourly_rate: 500, rating: 4.6, total_reviews: 234, is_active: true, is_verified: true },
    profile: { first_name: 'Raju', last_name: 'Kumar', location_address: 'Karol Bagh, New Delhi', location_lat: 28.6280, location_lng: 77.2170 },
    occupation: { name: 'Electrician', category: 'skilled', payment_methodology: 'task_based' }
  },
  'dummy-5': {
    worker: { id: 'dummy-5', user_id: 'dummy-user-5', category: 'skilled', about: 'Professional plumber handling all types of plumbing work - pipe fitting, leak repairs, bathroom installations.', years_experience: 10, hourly_rate: 450, rating: 4.5, total_reviews: 178, is_active: true, is_verified: true },
    profile: { first_name: 'Suresh', last_name: 'Yadav', location_address: 'Andheri, Mumbai', location_lat: 19.0820, location_lng: 72.8410 },
    occupation: { name: 'Plumber', category: 'skilled', payment_methodology: 'task_based' }
  },
  'dummy-6': {
    worker: { id: 'dummy-6', user_id: 'dummy-user-6', category: 'skilled', about: 'Master carpenter specializing in custom furniture, modular kitchens, and wood restoration work.', years_experience: 15, hourly_rate: 600, rating: 4.8, total_reviews: 156, is_active: true, is_verified: true },
    profile: { first_name: 'Mohan', last_name: 'Singh', location_address: 'Indiranagar, Bangalore', location_lat: 12.9352, location_lng: 77.6245 },
    occupation: { name: 'Carpenter', category: 'skilled', payment_methodology: 'task_based' }
  },
  'dummy-7': {
    worker: { id: 'dummy-7', user_id: 'dummy-user-7', category: 'freelancer', about: 'Creative graphic designer with expertise in branding, UI/UX, and marketing materials. Adobe certified.', years_experience: 6, hourly_rate: 800, rating: 4.9, total_reviews: 98, is_active: true, is_verified: true },
    profile: { first_name: 'Sneha', last_name: 'Reddy', location_address: 'Hitech City, Hyderabad', location_lat: 17.3850, location_lng: 78.4867 },
    occupation: { name: 'Graphic Designer', category: 'freelancer', payment_methodology: 'task_based' }
  },
  'dummy-8': {
    worker: { id: 'dummy-8', user_id: 'dummy-user-8', category: 'freelancer', about: 'Full-stack web developer specializing in React, Node.js, and cloud technologies. Built 50+ web applications.', years_experience: 7, hourly_rate: 1200, rating: 4.7, total_reviews: 67, is_active: true, is_verified: true },
    profile: { first_name: 'Amit', last_name: 'Verma', location_address: 'Noida Sector 62', location_lat: 28.5355, location_lng: 77.3910 },
    occupation: { name: 'Web Developer', category: 'freelancer', payment_methodology: 'task_based' }
  },
  'dummy-9': {
    worker: { id: 'dummy-9', user_id: 'dummy-user-9', category: 'freelancer', about: 'Professional content writer and copywriter. SEO expert with experience writing for top brands and publications.', years_experience: 5, hourly_rate: 600, rating: 4.6, total_reviews: 145, is_active: true, is_verified: true },
    profile: { first_name: 'Kavita', last_name: 'Nair', location_address: 'T Nagar, Chennai', location_lat: 13.0827, location_lng: 80.2707 },
    occupation: { name: 'Content Writer', category: 'freelancer', payment_methodology: 'task_based' }
  },
  'dummy-10': {
    worker: { id: 'dummy-10', user_id: 'dummy-user-10', category: 'educator', about: 'IIT graduate offering coaching for JEE, NEET, and board exams. 1000+ students mentored.', years_experience: 10, hourly_rate: 1000, rating: 4.9, total_reviews: 289, is_active: true, is_verified: true },
    profile: { first_name: 'Prof. Arjun', last_name: 'Menon', location_address: 'Kothrud, Pune', location_lat: 18.5204, location_lng: 73.8567 },
    occupation: { name: 'Tutor', category: 'educator', payment_methodology: 'hybrid' }
  },
  'dummy-11': {
    worker: { id: 'dummy-11', user_id: 'dummy-user-11', category: 'educator', about: 'Classical vocalist and music teacher. Trinity College certified. Teaching Hindustani and Western vocals.', years_experience: 12, hourly_rate: 800, rating: 4.8, total_reviews: 134, is_active: true, is_verified: true },
    profile: { first_name: 'Deepa', last_name: 'Iyer', location_address: 'Salt Lake, Kolkata', location_lat: 22.5726, location_lng: 88.3639 },
    occupation: { name: 'Music Teacher', category: 'educator', payment_methodology: 'hybrid' }
  },
  'dummy-12': {
    worker: { id: 'dummy-12', user_id: 'dummy-user-12', category: 'educator', about: 'Certified fitness trainer and nutritionist. Specializing in weight loss, muscle building, and sports training.', years_experience: 8, hourly_rate: 700, rating: 4.7, total_reviews: 201, is_active: true, is_verified: true },
    profile: { first_name: 'Vikram', last_name: 'Joshi', location_address: 'Malviya Nagar, Jaipur', location_lat: 26.9124, location_lng: 75.7873 },
    occupation: { name: 'Fitness Trainer', category: 'educator', payment_methodology: 'hybrid' }
  }
};

const categoryConfig: Record<string, { icon: typeof Scale; color: string; label: string }> = {
  professional: { icon: Scale, color: 'bg-primary', label: 'Professional' },
  skilled: { icon: Zap, color: 'bg-orange-500', label: 'Skilled' },
  freelancer: { icon: Code, color: 'bg-purple-500', label: 'Freelancer' },
  educator: { icon: BookOpen, color: 'bg-green-500', label: 'Educator' },
};

export default function WorkerDetail() {
  const { workerId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [worker, setWorker] = useState<Partial<Worker> | null>(null);
  const [occupation, setOccupation] = useState<Partial<Occupation> | null>(null);
  const [profile, setProfile] = useState<Partial<Profile> | null>(null);
  const [education, setEducation] = useState<Education[]>([]);
  const [experience, setExperience] = useState<Experience[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestTitle, setRequestTitle] = useState('');
  const [requestDescription, setRequestDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isDummyWorker, setIsDummyWorker] = useState(false);

  useEffect(() => {
    if (workerId) {
      // Check if it's a dummy worker
      if (workerId.startsWith('dummy-')) {
        loadDummyWorker(workerId);
      } else {
        fetchWorkerDetails();
        recordVisit();
      }
    }
  }, [workerId]);

  function loadDummyWorker(id: string) {
    const dummyData = dummyWorkersData[id];
    if (dummyData) {
      setWorker(dummyData.worker);
      setProfile(dummyData.profile as Profile);
      setOccupation(dummyData.occupation as Occupation);
      setIsDummyWorker(true);
      // Add sample education and experience for dummy workers
      setEducation([]);
      setExperience([]);
      setPortfolio([]);
    }
    setLoading(false);
  }

  async function recordVisit() {
    if (!user || !workerId || workerId.startsWith('dummy-')) return;
    
    // Get the worker's user_id to record the visit
    const { data: workerData } = await supabase
      .from('workers')
      .select('user_id')
      .eq('id', workerId)
      .single();

    if (workerData && workerData.user_id !== user.id) {
      await supabase
        .from('profile_visitors')
        .insert({
          profile_user_id: workerData.user_id,
          visitor_user_id: user.id
        });
    }
  }

  async function fetchWorkerDetails() {
    if (!workerId) return;
    
    setLoading(true);
    try {
      // Fetch worker
      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .select('*')
        .eq('id', workerId)
        .single();

      if (workerError) throw workerError;
      setWorker(workerData);

      // Fetch related data in parallel
      const [occupationRes, profileRes, eduRes, expRes, portfolioRes] = await Promise.all([
        workerData.occupation_id 
          ? supabase.from('occupations').select('*').eq('id', workerData.occupation_id).single()
          : Promise.resolve({ data: null }),
        supabase.from('profiles').select('*').eq('user_id', workerData.user_id).single(),
        supabase.from('worker_education').select('*').eq('worker_id', workerId),
        supabase.from('worker_experience').select('*').eq('worker_id', workerId),
        supabase.from('worker_portfolio').select('*').eq('worker_id', workerId)
      ]);

      setOccupation(occupationRes.data);
      setProfile(profileRes.data);
      setEducation(eduRes.data || []);
      setExperience(expRes.data || []);
      setPortfolio(portfolioRes.data || []);
    } catch (error) {
      console.error('Error fetching worker:', error);
      toast({
        title: 'Error',
        description: 'Failed to load worker profile',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSendRequest() {
    if (!user || !worker) {
      toast({
        title: 'Please login',
        description: 'You need to be logged in to send a request',
        variant: 'destructive'
      });
      navigate('/auth');
      return;
    }

    if (!requestTitle.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter a title for your request',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('service_requests')
        .insert({
          user_id: user.id,
          worker_id: worker.id,
          occupation_id: worker.occupation_id,
          title: requestTitle,
          description: requestDescription,
          status: 'pending',
          payment_status: 'pending'
        });

      if (error) throw error;

      toast({
        title: 'Request Sent!',
        description: 'The worker will be notified of your request',
      });
      setRequestDialogOpen(false);
      setRequestTitle('');
      setRequestDescription('');
      navigate('/requests');
    } catch (error) {
      console.error('Error sending request:', error);
      toast({
        title: 'Error',
        description: 'Failed to send request. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <PageLayout title="Worker Profile" backPath="/feeds">
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </PageLayout>
    );
  }

  if (!worker) {
    return (
      <PageLayout title="Worker Profile" backPath="/feeds">
        <div className="text-center py-20">
          <p className="text-muted-foreground">Worker not found</p>
          <Button variant="link" onClick={() => navigate('/feeds')}>
            Browse other workers
          </Button>
        </div>
      </PageLayout>
    );
  }

  const catConfig = categoryConfig[worker.category] || categoryConfig.skilled;
  const CategoryIcon = catConfig.icon;

  return (
    <PageLayout title="Worker Profile" backPath="/feeds">
      <div className="space-y-6 pb-24">
        {/* Hero Section */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
              {/* Avatar */}
              <div className={`w-24 h-24 rounded-full ${catConfig.color} flex items-center justify-center shrink-0`}>
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt="" 
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <User className="w-12 h-12 text-white" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                  <h1 className="text-2xl font-bold">
                    {profile?.first_name} {profile?.last_name}
                  </h1>
                  {worker.is_verified && (
                    <Badge className="bg-success text-white w-fit mx-auto sm:mx-0">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>
                
                <p className="text-lg text-muted-foreground mb-2">
                  {occupation?.name || 'Service Provider'}
                </p>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-sm">
                  <Badge variant="secondary">
                    <CategoryIcon className="w-3 h-3 mr-1" />
                    {catConfig.label}
                  </Badge>
                  
                  {worker.rating && Number(worker.rating) > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-warning fill-warning" />
                      <span className="font-medium">{Number(worker.rating).toFixed(1)}</span>
                      {worker.total_reviews && (
                        <span className="text-muted-foreground">
                          ({worker.total_reviews} reviews)
                        </span>
                      )}
                    </div>
                  )}

                  {worker.years_experience && worker.years_experience > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      {worker.years_experience} years exp
                    </div>
                  )}

                  {profile?.location_address && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {profile.location_address}
                    </div>
                  )}
                </div>

                {worker.hourly_rate && (
                  <p className="text-xl font-bold text-primary mt-3">
                    ₹{worker.hourly_rate}/hr
                  </p>
                )}
              </div>
            </div>

            {worker.about && (
              <p className="mt-4 text-muted-foreground">{worker.about}</p>
            )}

            {/* Action Button */}
            <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
              <DialogTrigger asChild>
                <Button className="w-full mt-6 gradient-primary" size="lg">
                  <Send className="w-4 h-4 mr-2" />
                  Send Request
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send Service Request</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="title">Request Title *</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Need help with legal consultation"
                      value={requestTitle}
                      onChange={(e) => setRequestTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      placeholder="Describe what you need help with..."
                      value={requestDescription}
                      onChange={(e) => setRequestDescription(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <Button 
                    className="w-full gradient-primary" 
                    onClick={handleSendRequest}
                    disabled={submitting}
                  >
                    {submitting ? 'Sending...' : 'Send Request'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Tabs for Details */}
        <Tabs defaultValue="services" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="services" className="flex-1">Services</TabsTrigger>
            <TabsTrigger value="about" className="flex-1">About</TabsTrigger>
            <TabsTrigger value="portfolio" className="flex-1">Portfolio</TabsTrigger>
            <TabsTrigger value="reviews" className="flex-1">Reviews</TabsTrigger>
          </TabsList>

          <TabsContent value="services" className="mt-4">
            <ServicesPricing occupationId={worker.occupation_id} />
          </TabsContent>

          <TabsContent value="about" className="space-y-4 mt-4">
            {/* Education */}
            {education.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-primary" />
                    Education
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {education.map(edu => (
                    <div key={edu.id} className="border-l-2 border-primary pl-4">
                      <p className="font-medium">{edu.degree_name}</p>
                      <p className="text-sm text-muted-foreground">{edu.institution}</p>
                      {edu.year_completed && (
                        <p className="text-xs text-muted-foreground">{edu.year_completed}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Experience */}
            {experience.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-primary" />
                    Experience
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {experience.map(exp => (
                    <div key={exp.id} className="border-l-2 border-primary pl-4">
                      <p className="font-medium">{exp.role}</p>
                      <p className="text-sm text-muted-foreground">{exp.company_name}</p>
                      {exp.start_year && (
                        <p className="text-xs text-muted-foreground">
                          {exp.start_year} - {exp.end_year || 'Present'}
                        </p>
                      )}
                      {exp.description && (
                        <p className="text-sm mt-1">{exp.description}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {education.length === 0 && experience.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No additional details available</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="portfolio" className="mt-4">
            {portfolio.length > 0 ? (
              <div className="grid grid-cols-2 gap-4">
                {portfolio.map(item => (
                  <Card key={item.id} className="overflow-hidden">
                    {item.media_type.startsWith('image') && item.media_url && (
                      <img 
                        src={item.media_url} 
                        alt={item.title}
                        className="w-full h-32 object-cover"
                      />
                    )}
                    <CardContent className="p-3">
                      <p className="font-medium text-sm truncate">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Award className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No portfolio items yet</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="reviews" className="mt-4">
            <div className="text-center py-8 text-muted-foreground">
              <Star className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No reviews yet</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
