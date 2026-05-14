import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Trophy, TrendingUp } from 'lucide-react';

interface SuccessStory {
  id: string;
  workerName: string;
  occupation: string;
  title: string;
  description: string;
  rating: number;
  completedJobs: number;
  avatarUrl?: string;
}

const highlightedStories: SuccessStory[] = [
  {
    id: '1',
    workerName: 'Adv. Priya Sharma',
    occupation: 'Lawyer',
    title: 'Won Complex Property Dispute',
    description: 'Successfully resolved a 5-year old property case, helping the client recover their ancestral land.',
    rating: 5,
    completedJobs: 127,
  },
  {
    id: '2',
    workerName: 'Dr. Rajesh Patel',
    occupation: 'Doctor',
    title: 'Life-saving Emergency Care',
    description: 'Provided critical medical guidance during an emergency, potentially saving a life through telemedicine.',
    rating: 5,
    completedJobs: 342,
  },
  {
    id: '3',
    workerName: 'Raju Kumar',
    occupation: 'Electrician',
    title: 'Complete Home Rewiring',
    description: 'Modernized entire home electrical system, making it safer and more energy efficient.',
    rating: 5,
    completedJobs: 234,
  },
];

interface SuccessStoriesSectionProps {
  onStoryClick?: (storyId: string) => void;
}

export function SuccessStoriesSection({ onStoryClick }: SuccessStoriesSectionProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-yellow-500" />
        <h2 className="font-semibold text-lg">Success Stories & Highlights</h2>
      </div>
      
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4">
        {highlightedStories.map(story => (
          <Card 
            key={story.id}
            className="min-w-[280px] max-w-[280px] shrink-0 cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => onStoryClick?.(story.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Top Rated
                </Badge>
              </div>
              
              <h3 className="font-semibold text-sm mb-1 line-clamp-1">{story.title}</h3>
              <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                {story.description}
              </p>
              
              <div className="flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium">{story.workerName}</p>
                  <p className="text-muted-foreground">{story.occupation}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  <span>{story.rating.toFixed(1)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
