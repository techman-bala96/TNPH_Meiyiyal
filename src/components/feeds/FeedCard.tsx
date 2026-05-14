import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Star, 
  MapPin, 
  Play,
  Image as ImageIcon,
  Volume2,
  User,
  Scale,
  Zap,
  Code,
  BookOpen,
  Eye,
  MessageSquare
} from 'lucide-react';

export interface FeedWorker {
  id: string;
  user_id: string;
  category: 'professional' | 'skilled' | 'freelancer' | 'educator';
  occupation_id: string | null;
  about: string | null;
  years_experience: number | null;
  hourly_rate: number | null;
  rating: number | null;
  total_reviews: number | null;
  is_active: boolean;
  is_verified: boolean;
  distance?: number;
  // Media content for feed
  media?: {
    type: 'image' | 'video' | 'audio';
    url: string;
    thumbnail?: string;
  }[];
  // Success story / feedback
  successStory?: {
    title: string;
    description: string;
    rating: number;
    clientName: string;
  };
  profiles?: {
    first_name?: string;
    last_name?: string;
    avatar_url?: string | null;
    location_lat?: number | null;
    location_lng?: number | null;
    location_address?: string | null;
  };
  occupations?: {
    name?: string;
    category?: string;
    payment_methodology?: string;
  };
}

const categoryConfig: Record<string, { icon: typeof Scale; color: string; label: string }> = {
  professional: { icon: Scale, color: 'bg-primary', label: 'Professional' },
  skilled: { icon: Zap, color: 'bg-orange-500', label: 'Skilled' },
  freelancer: { icon: Code, color: 'bg-purple-500', label: 'Freelancer' },
  educator: { icon: BookOpen, color: 'bg-green-500', label: 'Educator' },
};

interface FeedCardProps {
  worker: FeedWorker;
  onViewProfile: (workerId: string) => void;
  onSendRequest: (workerId: string) => void;
}

export function FeedCard({ worker, onViewProfile, onSendRequest }: FeedCardProps) {
  const catConfig = categoryConfig[worker.category] || categoryConfig.skilled;
  const Icon = catConfig.icon;
  
  return (
    <Card className="overflow-hidden hover:border-primary/50 transition-colors">
      {/* Media Section */}
      {worker.media && worker.media.length > 0 && (
        <div className="relative aspect-video bg-muted">
          {worker.media[0].type === 'image' && (
            <img 
              src={worker.media[0].url} 
              alt="Work showcase"
              className="w-full h-full object-cover"
            />
          )}
          {worker.media[0].type === 'video' && (
            <div className="relative w-full h-full">
              <img 
                src={worker.media[0].thumbnail || '/placeholder.svg'} 
                alt="Video thumbnail"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center">
                  <Play className="w-6 h-6 text-primary ml-1" />
                </div>
              </div>
            </div>
          )}
          {worker.media[0].type === 'audio' && (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <Volume2 className="w-16 h-16 text-primary/50" />
            </div>
          )}
          
          {/* Media count badge */}
          {worker.media.length > 1 && (
            <Badge className="absolute top-3 right-3 bg-black/60 text-white">
              <ImageIcon className="w-3 h-3 mr-1" />
              +{worker.media.length - 1}
            </Badge>
          )}
        </div>
      )}
      
      <CardContent className="p-4">
        {/* Worker Header */}
        <div className="flex gap-3 mb-3">
          {/* Avatar */}
          <div className={`w-12 h-12 rounded-full ${catConfig.color} flex items-center justify-center shrink-0`}>
            {worker.profiles?.avatar_url ? (
              <img 
                src={worker.profiles.avatar_url} 
                alt="" 
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <User className="w-6 h-6 text-white" />
            )}
          </div>
          
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground truncate">
                  {worker.profiles?.first_name} {worker.profiles?.last_name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {worker.occupations?.name || 'Service Provider'}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                <Icon className="w-3 h-3 mr-1" />
                {catConfig.label}
              </Badge>
            </div>
          </div>
        </div>
        
        {/* Success Story / Feedback */}
        {worker.successStory && (
          <div className="bg-muted/50 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star 
                    key={i} 
                    className={`w-3 h-3 ${i < worker.successStory!.rating ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground'}`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                by {worker.successStory.clientName}
              </span>
            </div>
            <p className="text-sm font-medium mb-1">{worker.successStory.title}</p>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {worker.successStory.description}
            </p>
          </div>
        )}
        
        {/* About (when no success story) */}
        {!worker.successStory && worker.about && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {worker.about}
          </p>
        )}
        
        {/* Stats Row */}
        <div className="flex items-center gap-4 text-sm flex-wrap mb-3">
          {worker.rating && worker.rating > 0 && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
              <span>{Number(worker.rating).toFixed(1)}</span>
              {worker.total_reviews && worker.total_reviews > 0 && (
                <span className="text-muted-foreground">
                  ({worker.total_reviews})
                </span>
              )}
            </div>
          )}
          {worker.years_experience && worker.years_experience > 0 && (
            <span className="text-muted-foreground">
              {worker.years_experience} yrs exp
            </span>
          )}
          {worker.hourly_rate && (
            <span className="text-primary font-medium">
              ₹{worker.hourly_rate}/hr
            </span>
          )}
        </div>
        
        {/* Location & Distance */}
        {worker.profiles?.location_address && (
          <div className="flex items-center gap-1 mb-4 text-sm text-muted-foreground">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{worker.profiles.location_address}</span>
            {worker.distance !== undefined && (
              <span className="text-primary font-medium ml-1 shrink-0">
                ({worker.distance < 1 
                  ? `${Math.round(worker.distance * 1000)}m` 
                  : `${worker.distance.toFixed(1)}km`})
              </span>
            )}
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={() => onViewProfile(worker.id)}
          >
            <Eye className="w-4 h-4 mr-2" />
            View Profile
          </Button>
          <Button 
            className="flex-1 gradient-primary"
            onClick={() => onSendRequest(worker.id)}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Send Request
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
