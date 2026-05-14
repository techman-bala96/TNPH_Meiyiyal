import { useEffect, useState } from 'react';
import { Briefcase, Wrench, Palette, GraduationCap, Loader2 } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type WorkerCategory = Database['public']['Enums']['worker_category'];
type Occupation = Database['public']['Tables']['occupations']['Row'];

interface CategoryStepProps {
  selectedCategory: WorkerCategory | null;
  selectedOccupation: string | null;
  onCategoryChange: (category: WorkerCategory) => void;
  onOccupationChange: (occupationId: string) => void;
}

const categoryConfig = {
  professional: {
    name: 'Professional Services',
    icon: Briefcase,
    description: 'Lawyers, Doctors, CAs, Consultants',
    color: 'bg-primary',
  },
  skilled: {
    name: 'Skilled Workers',
    icon: Wrench,
    description: 'Electricians, Plumbers, Technicians',
    color: 'bg-primary/90',
  },
  freelancer: {
    name: 'Freelancers',
    icon: Palette,
    description: 'Designers, Developers, Writers',
    color: 'bg-primary/80',
  },
  educator: {
    name: 'Educators',
    icon: GraduationCap,
    description: 'Tutors, Coaches, Trainers',
    color: 'bg-primary/70',
  },
};

export function CategoryStep({
  selectedCategory,
  selectedOccupation,
  onCategoryChange,
  onOccupationChange,
}: CategoryStepProps) {
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedCategory) {
      fetchOccupations(selectedCategory);
    }
  }, [selectedCategory]);

  const fetchOccupations = async (category: WorkerCategory) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('occupations')
      .select('*')
      .eq('category', category)
      .order('name');
    
    if (!error && data) {
      setOccupations(data);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Select Your Category</h3>
        <div className="grid grid-cols-2 gap-4">
          {(Object.entries(categoryConfig) as [WorkerCategory, typeof categoryConfig.professional][]).map(
            ([key, config]) => (
              <Card
                key={key}
                className={`cursor-pointer transition-all hover:shadow-lg border-2 ${
                  selectedCategory === key ? 'border-primary ring-2 ring-primary/20' : 'border-border'
                }`}
                onClick={() => onCategoryChange(key)}
              >
                <CardHeader className="p-4">
                  <div className={`w-10 h-10 rounded-lg ${config.color} flex items-center justify-center mb-2`}>
                    <config.icon className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-sm">{config.name}</CardTitle>
                  <CardDescription className="text-xs">{config.description}</CardDescription>
                </CardHeader>
              </Card>
            )
          )}
        </div>
      </div>

      {selectedCategory && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          <h3 className="text-lg font-semibold text-foreground mb-4">Select Your Occupation</h3>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-2">
              {occupations.map((occupation) => (
                <button
                  key={occupation.id}
                  type="button"
                  className={`p-3 rounded-lg border-2 text-left transition-all hover:border-primary ${
                    selectedOccupation === occupation.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card'
                  }`}
                  onClick={() => onOccupationChange(occupation.id)}
                >
                  <p className="font-medium text-sm text-foreground">{occupation.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{occupation.description}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
