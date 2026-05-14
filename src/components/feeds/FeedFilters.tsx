import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  Navigation,
  Scale,
  Zap,
  Code,
  BookOpen,
  Clock,
  TrendingUp,
  Award,
  Loader2
} from 'lucide-react';

interface FeedFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  selectedSort: string;
  onSortChange: (sort: string) => void;
  locationEnabled: boolean;
  locationLoading: boolean;
  onLocationClick: () => void;
}

export function FeedFilters({
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedSort,
  onSortChange,
  locationEnabled,
  locationLoading,
  onLocationClick,
}: FeedFiltersProps) {
  const { t } = useTranslation();

  const sortTabs = [
    { key: 'recent', label: t('feeds.recent'), icon: Clock },
    { key: 'trending', label: t('feeds.trending'), icon: TrendingUp },
    { key: 'top-rated', label: t('feeds.topRated'), icon: Award },
  ];

  const categoryConfig: Record<string, { icon: typeof Scale; label: string }> = {
    professional: { icon: Scale, label: t('categories.professional') },
    skilled: { icon: Zap, label: t('categories.skilled') },
    freelancer: { icon: Code, label: t('categories.freelancer') },
    educator: { icon: BookOpen, label: t('categories.educator') },
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          placeholder={t('feeds.search')}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      <Button
        variant={locationEnabled ? "default" : "outline"}
        className="w-full"
        onClick={onLocationClick}
        disabled={locationLoading}
      >
        {locationLoading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Navigation className="w-4 h-4 mr-2" />
        )}
        {locationLoading 
          ? t('feeds.detecting')
          : locationEnabled 
            ? t('feeds.nearMe') + ' ✓'
            : t('feeds.nearMe')}
      </Button>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        {sortTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.key}
              variant={selectedSort === tab.key ? "default" : "outline"}
              size="sm"
              onClick={() => onSortChange(tab.key)}
              className="shrink-0"
            >
              <Icon className="w-4 h-4 mr-1" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        <Button
          variant={selectedCategory === null ? "default" : "outline"}
          size="sm"
          onClick={() => onCategoryChange(null)}
          className="shrink-0"
        >
          {t('feeds.allCategories')}
        </Button>
        {Object.entries(categoryConfig).map(([key, config]) => {
          const Icon = config.icon;
          return (
            <Button
              key={key}
              variant={selectedCategory === key ? "default" : "outline"}
              size="sm"
              onClick={() => onCategoryChange(key)}
              className="shrink-0"
            >
              <Icon className="w-4 h-4 mr-1" />
              {config.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
