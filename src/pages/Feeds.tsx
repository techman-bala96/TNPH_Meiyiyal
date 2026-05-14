import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { PageLayout } from '@/components/layout/PageLayout';
import { BottomNav } from '@/components/layout/BottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { FeedCard, type FeedWorker } from '@/components/feeds/FeedCard';
import { FeedFilters } from '@/components/feeds/FeedFilters';
import { SuccessStoriesSection } from '@/components/feeds/SuccessStoriesSection';
import { Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// Dummy workers data with media content
const dummyWorkers: FeedWorker[] = [
  // Professional workers
  {
    id: 'dummy-1',
    user_id: 'dummy-user-1',
    category: 'professional',
    occupation_id: '07b7bd64-96be-45e2-84fa-89cb8ea9e816',
    about: 'Experienced corporate lawyer with 15+ years in business law, contracts, and litigation. Handled 500+ cases successfully.',
    years_experience: 15,
    hourly_rate: 2500,
    rating: 4.9,
    total_reviews: 127,
    is_active: true,
    is_verified: true,
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400' },
    ],
    successStory: {
      title: 'Property Dispute Resolved',
      description: 'Helped me win a 3-year long property case. Very professional and knowledgeable.',
      rating: 5,
      clientName: 'Ramesh K.'
    },
    profiles: {
      first_name: 'Adv. Priya',
      last_name: 'Sharma',
      location_lat: 28.6139,
      location_lng: 77.2090,
      location_address: 'Connaught Place, New Delhi'
    },
    occupations: { name: 'Lawyer', category: 'professional', payment_methodology: 'per_session' }
  },
  {
    id: 'dummy-2',
    user_id: 'dummy-user-2',
    category: 'professional',
    occupation_id: '22382222-c916-4f6b-ab07-ac6eb26c2bba',
    about: 'MBBS, MD (General Medicine). 20 years experience in treating chronic conditions and preventive healthcare.',
    years_experience: 20,
    hourly_rate: 1500,
    rating: 4.8,
    total_reviews: 342,
    is_active: true,
    is_verified: true,
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400' },
    ],
    successStory: {
      title: 'Excellent Consultation',
      description: 'Dr. Patel diagnosed my condition correctly when others couldn\'t. Highly recommended!',
      rating: 5,
      clientName: 'Sunita M.'
    },
    profiles: {
      first_name: 'Dr. Rajesh',
      last_name: 'Patel',
      location_lat: 19.0760,
      location_lng: 72.8777,
      location_address: 'Bandra, Mumbai'
    },
    occupations: { name: 'Doctor', category: 'professional', payment_methodology: 'per_session' }
  },
  {
    id: 'dummy-3',
    user_id: 'dummy-user-3',
    category: 'professional',
    occupation_id: 'ce81d80f-2ebe-4a85-a906-19762574e7eb',
    about: 'Chartered Accountant specializing in tax planning, audits, and financial consulting for businesses and individuals.',
    years_experience: 12,
    hourly_rate: 2000,
    rating: 4.7,
    total_reviews: 89,
    is_active: true,
    is_verified: true,
    profiles: {
      first_name: 'CA Meera',
      last_name: 'Gupta',
      location_lat: 12.9716,
      location_lng: 77.5946,
      location_address: 'MG Road, Bangalore'
    },
    occupations: { name: 'Chartered Accountant', category: 'professional', payment_methodology: 'per_session' }
  },
  // Skilled workers
  {
    id: 'dummy-4',
    user_id: 'dummy-user-4',
    category: 'skilled',
    occupation_id: '7da0cc22-dba4-49fc-8164-5bcfd0d65ce2',
    about: 'Licensed electrician with expertise in residential and commercial wiring, repairs, and smart home installations.',
    years_experience: 8,
    hourly_rate: 500,
    rating: 4.6,
    total_reviews: 234,
    is_active: true,
    is_verified: true,
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400' },
    ],
    successStory: {
      title: 'Complete Home Rewiring',
      description: 'Did complete rewiring of my 30 year old house. Work was neat and finished on time.',
      rating: 5,
      clientName: 'Ajay P.'
    },
    profiles: {
      first_name: 'Raju',
      last_name: 'Kumar',
      location_lat: 28.6280,
      location_lng: 77.2170,
      location_address: 'Karol Bagh, New Delhi'
    },
    occupations: { name: 'Electrician', category: 'skilled', payment_methodology: 'task_based' }
  },
  {
    id: 'dummy-5',
    user_id: 'dummy-user-5',
    category: 'skilled',
    occupation_id: 'bd50bbb1-f8c7-4d33-95dd-c510f8bf5a7a',
    about: 'Professional plumber handling all types of plumbing work - pipe fitting, leak repairs, bathroom installations.',
    years_experience: 10,
    hourly_rate: 450,
    rating: 4.5,
    total_reviews: 178,
    is_active: true,
    is_verified: true,
    profiles: {
      first_name: 'Suresh',
      last_name: 'Yadav',
      location_lat: 19.0820,
      location_lng: 72.8410,
      location_address: 'Andheri, Mumbai'
    },
    occupations: { name: 'Plumber', category: 'skilled', payment_methodology: 'task_based' }
  },
  {
    id: 'dummy-6',
    user_id: 'dummy-user-6',
    category: 'skilled',
    occupation_id: 'b8c6e94f-b698-4d1e-be02-aacd59a4c8dd',
    about: 'Master carpenter specializing in custom furniture, modular kitchens, and wood restoration work.',
    years_experience: 15,
    hourly_rate: 600,
    rating: 4.8,
    total_reviews: 156,
    is_active: true,
    is_verified: true,
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400' },
    ],
    profiles: {
      first_name: 'Mohan',
      last_name: 'Singh',
      location_lat: 12.9352,
      location_lng: 77.6245,
      location_address: 'Indiranagar, Bangalore'
    },
    occupations: { name: 'Carpenter', category: 'skilled', payment_methodology: 'task_based' }
  },
  // Freelancer workers
  {
    id: 'dummy-7',
    user_id: 'dummy-user-7',
    category: 'freelancer',
    occupation_id: '33aac631-21f7-4ed2-9fb7-4e4180732a9e',
    about: 'Creative graphic designer with expertise in branding, UI/UX, and marketing materials. Adobe certified.',
    years_experience: 6,
    hourly_rate: 800,
    rating: 4.9,
    total_reviews: 98,
    is_active: true,
    is_verified: true,
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=400' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=400' },
      { type: 'image', url: 'https://images.unsplash.com/photo-1626785774573-4b799315345d?w=400' },
    ],
    successStory: {
      title: 'Brand Identity Design',
      description: 'Created amazing logo and brand identity for our startup. Exceeded all expectations!',
      rating: 5,
      clientName: 'TechStart Inc.'
    },
    profiles: {
      first_name: 'Sneha',
      last_name: 'Reddy',
      location_lat: 17.3850,
      location_lng: 78.4867,
      location_address: 'Hitech City, Hyderabad'
    },
    occupations: { name: 'Graphic Designer', category: 'freelancer', payment_methodology: 'task_based' }
  },
  {
    id: 'dummy-8',
    user_id: 'dummy-user-8',
    category: 'freelancer',
    occupation_id: '302396ae-f9d9-4012-9e87-388629273099',
    about: 'Full-stack web developer specializing in React, Node.js, and cloud technologies. Built 50+ web applications.',
    years_experience: 7,
    hourly_rate: 1200,
    rating: 4.7,
    total_reviews: 67,
    is_active: true,
    is_verified: true,
    media: [
      { type: 'video', url: 'https://example.com/demo.mp4', thumbnail: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400' },
    ],
    profiles: {
      first_name: 'Amit',
      last_name: 'Verma',
      location_lat: 28.5355,
      location_lng: 77.3910,
      location_address: 'Noida Sector 62'
    },
    occupations: { name: 'Web Developer', category: 'freelancer', payment_methodology: 'task_based' }
  },
  {
    id: 'dummy-9',
    user_id: 'dummy-user-9',
    category: 'freelancer',
    occupation_id: 'af082295-da84-4048-ba9d-1e0b8c7a51e2',
    about: 'Professional content writer and copywriter. SEO expert with experience writing for top brands and publications.',
    years_experience: 5,
    hourly_rate: 600,
    rating: 4.6,
    total_reviews: 145,
    is_active: true,
    is_verified: true,
    profiles: {
      first_name: 'Kavita',
      last_name: 'Nair',
      location_lat: 13.0827,
      location_lng: 80.2707,
      location_address: 'T Nagar, Chennai'
    },
    occupations: { name: 'Content Writer', category: 'freelancer', payment_methodology: 'task_based' }
  },
  // Educator workers
  {
    id: 'dummy-10',
    user_id: 'dummy-user-10',
    category: 'educator',
    occupation_id: '5e501d15-f243-4290-974e-34f37b91034f',
    about: 'IIT graduate offering coaching for JEE, NEET, and board exams. 1000+ students mentored.',
    years_experience: 10,
    hourly_rate: 1000,
    rating: 4.9,
    total_reviews: 289,
    is_active: true,
    is_verified: true,
    media: [
      { type: 'video', url: 'https://example.com/lecture.mp4', thumbnail: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=400' },
    ],
    successStory: {
      title: 'JEE Advanced AIR 50',
      description: 'My son scored AIR 50 in JEE Advanced after coaching from Prof. Menon. Best decision ever!',
      rating: 5,
      clientName: 'Parent of Arjun S.'
    },
    profiles: {
      first_name: 'Prof. Arjun',
      last_name: 'Menon',
      location_lat: 18.5204,
      location_lng: 73.8567,
      location_address: 'Kothrud, Pune'
    },
    occupations: { name: 'Tutor', category: 'educator', payment_methodology: 'hybrid' }
  },
  {
    id: 'dummy-11',
    user_id: 'dummy-user-11',
    category: 'educator',
    occupation_id: '5c66d78a-06c7-492c-bbe8-402b414bf58b',
    about: 'Classical vocalist and music teacher. Trinity College certified. Teaching Hindustani and Western vocals.',
    years_experience: 12,
    hourly_rate: 800,
    rating: 4.8,
    total_reviews: 134,
    is_active: true,
    is_verified: true,
    profiles: {
      first_name: 'Deepa',
      last_name: 'Iyer',
      location_lat: 22.5726,
      location_lng: 88.3639,
      location_address: 'Salt Lake, Kolkata'
    },
    occupations: { name: 'Music Teacher', category: 'educator', payment_methodology: 'hybrid' }
  },
  {
    id: 'dummy-12',
    user_id: 'dummy-user-12',
    category: 'educator',
    occupation_id: '8c9f3fad-7865-41d1-85ea-4b9f61b7335c',
    about: 'Certified fitness trainer and nutritionist. Specializing in weight loss, muscle building, and sports training.',
    years_experience: 8,
    hourly_rate: 700,
    rating: 4.7,
    total_reviews: 201,
    is_active: true,
    is_verified: true,
    media: [
      { type: 'image', url: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400' },
    ],
    profiles: {
      first_name: 'Vikram',
      last_name: 'Joshi',
      location_lat: 26.9124,
      location_lng: 75.7873,
      location_address: 'Malviya Nagar, Jaipur'
    },
    occupations: { name: 'Fitness Trainer', category: 'educator', payment_methodology: 'hybrid' }
  }
];

// Calculate distance between two coordinates in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export default function Feeds() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [workers, setWorkers] = useState<FeedWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(searchParams.get('category'));
  const [selectedSort, setSelectedSort] = useState('recent');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationEnabled, setLocationEnabled] = useState(false);

  useEffect(() => {
    fetchWorkers();
  }, [selectedCategory]);

  async function fetchWorkers() {
    setLoading(true);
    try {
      let query = supabase
        .from('workers')
        .select(`
          *,
          occupations (*)
        `)
        .eq('is_active', true)
        .eq('is_verified', true);

      if (selectedCategory) {
        query = query.eq('category', selectedCategory as 'professional' | 'skilled' | 'freelancer' | 'educator');
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      let realWorkers: FeedWorker[] = [];
      if (data && data.length > 0) {
        const userIds = data.map(w => w.user_id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('user_id', userIds);

        realWorkers = data.map(worker => ({
          ...worker,
          profiles: profiles?.find(p => p.user_id === worker.user_id) || {},
          occupations: worker.occupations || {}
        })) as FeedWorker[];
      }

      let filteredDummy = dummyWorkers;
      if (selectedCategory) {
        filteredDummy = dummyWorkers.filter(w => w.category === selectedCategory);
      }

      setWorkers([...filteredDummy, ...realWorkers]);
    } catch (error) {
      console.error('Error fetching workers:', error);
      let filteredDummy = dummyWorkers;
      if (selectedCategory) {
        filteredDummy = dummyWorkers.filter(w => w.category === selectedCategory);
      }
      setWorkers(filteredDummy);
    } finally {
      setLoading(false);
    }
  }

  function getCurrentLocation() {
    setLocationLoading(true);
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser');
      setLocationLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationEnabled(true);
        setLocationLoading(false);
        toast.success('Location detected! Showing nearby workers first.');
      },
      (error) => {
        console.error('Location error:', error);
        toast.error('Unable to get your location. Please enable location services.');
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Filter and sort workers
  const filteredWorkers = workers
    .filter(worker => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      const name = `${worker.profiles?.first_name || ''} ${worker.profiles?.last_name || ''}`.toLowerCase();
      const occupation = worker.occupations?.name?.toLowerCase() || '';
      const about = worker.about?.toLowerCase() || '';
      const successTitle = worker.successStory?.title?.toLowerCase() || '';
      return name.includes(query) || occupation.includes(query) || about.includes(query) || successTitle.includes(query);
    })
    .map(worker => {
      if (userLocation && worker.profiles?.location_lat && worker.profiles?.location_lng) {
        const distance = calculateDistance(
          userLocation.lat,
          userLocation.lng,
          worker.profiles.location_lat,
          worker.profiles.location_lng
        );
        return { ...worker, distance };
      }
      return { ...worker, distance: undefined };
    })
    .sort((a, b) => {
      // Sort by distance if location is enabled
      if (locationEnabled && a.distance !== undefined && b.distance !== undefined) {
        return a.distance - b.distance;
      }
      // Sort by selected option
      switch (selectedSort) {
        case 'trending':
          return (b.total_reviews || 0) - (a.total_reviews || 0);
        case 'top-rated':
          return (b.rating || 0) - (a.rating || 0);
        case 'recent':
        default:
          return 0; // Keep original order for recent
      }
    });

  const handleCategorySelect = (category: string | null) => {
    setSelectedCategory(category);
    if (category) {
      setSearchParams({ category });
    } else {
      setSearchParams({});
    }
  };

  const handleViewProfile = (workerId: string) => {
    navigate(`/worker/${workerId}`);
  };

  const handleSendRequest = (workerId: string) => {
    navigate(`/worker/${workerId}?action=request`);
  };

  return (
    <>
      <PageLayout
        title={t('feeds.title')}
        subtitle={t('feeds.subtitle')}
        backPath="/"
      >
        <div className="space-y-6 pb-24">
          {/* Filters */}
          <FeedFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedCategory={selectedCategory}
            onCategoryChange={handleCategorySelect}
            selectedSort={selectedSort}
            onSortChange={setSelectedSort}
            locationEnabled={locationEnabled}
            locationLoading={locationLoading}
            onLocationClick={getCurrentLocation}
          />

          {/* Success Stories Section */}
          <SuccessStoriesSection />

          {/* Workers Feed */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="animate-pulse">
                  <div className="aspect-video bg-muted" />
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div className="w-12 h-12 bg-muted rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-1/2" />
                        <div className="h-3 bg-muted rounded w-1/3" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="text-center py-12">
              <Briefcase className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('feeds.noWorkers')}</h3>
              <p className="text-muted-foreground mb-4">
                {t('feeds.noWorkersDesc')}
              </p>
              <Button variant="outline" onClick={() => handleCategorySelect(null)}>
                {t('feeds.clearFilters')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredWorkers.map(worker => (
                <FeedCard 
                  key={worker.id}
                  worker={worker}
                  onViewProfile={handleViewProfile}
                  onSendRequest={handleSendRequest}
                />
              ))}
            </div>
          )}
        </div>
      </PageLayout>
      <BottomNav />
    </>
  );
}
