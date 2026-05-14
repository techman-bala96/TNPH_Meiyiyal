import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Tables } from '@/integrations/supabase/types';

type Worker = Tables<'workers'>;
type Profile = Tables<'profiles'>;

export function useWorkerProfile() {
  const { user } = useAuth();
  const [workerProfile, setWorkerProfile] = useState<Worker | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWorker, setIsWorker] = useState(false);

  useEffect(() => {
    if (!user) {
      setWorkerProfile(null);
      setUserProfile(null);
      setIsWorker(false);
      setLoading(false);
      return;
    }

    async function fetchProfiles() {
      setLoading(true);
      try {
        // Fetch user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user!.id)
          .single();

        setUserProfile(profile);

        // Check if user is also a worker
        const { data: worker } = await supabase
          .from('workers')
          .select('*')
          .eq('user_id', user!.id)
          .single();

        if (worker) {
          setWorkerProfile(worker);
          setIsWorker(true);
        } else {
          setWorkerProfile(null);
          setIsWorker(false);
        }
      } catch (error) {
        console.error('Error fetching profiles:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfiles();
  }, [user]);

  return {
    workerProfile,
    userProfile,
    isWorker,
    loading,
    refetch: () => {
      if (user) {
        setLoading(true);
        // Re-trigger effect by updating state
      }
    }
  };
}
