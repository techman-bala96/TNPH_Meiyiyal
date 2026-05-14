import { Plus, Trash2, Image, FileText, Video, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface PortfolioEntry {
  id: string;
  title: string;
  description: string;
  mediaType: 'image' | 'video' | 'document' | 'audio';
  mediaUrl: string;
}

interface PortfolioStepProps {
  portfolio: PortfolioEntry[];
  onPortfolioChange: (portfolio: PortfolioEntry[]) => void;
}

const mediaTypeIcons = {
  image: Image,
  video: Video,
  document: FileText,
  audio: Music,
};

export function PortfolioStep({ portfolio, onPortfolioChange }: PortfolioStepProps) {
  const addPortfolio = () => {
    const newEntry: PortfolioEntry = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      mediaType: 'image',
      mediaUrl: '',
    };
    onPortfolioChange([...portfolio, newEntry]);
  };

  const removePortfolio = (id: string) => {
    onPortfolioChange(portfolio.filter((p) => p.id !== id));
  };

  const updatePortfolio = (id: string, field: keyof PortfolioEntry, value: string) => {
    onPortfolioChange(
      portfolio.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Portfolio & Projects</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Showcase your best work with photos, videos, or documents to attract more customers.
        </p>
      </div>

      {portfolio.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Image className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No portfolio items added yet</p>
            <Button type="button" variant="outline" onClick={addPortfolio}>
              <Plus className="w-4 h-4 mr-2" />
              Add Portfolio Item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {portfolio.map((entry, index) => {
            const IconComponent = mediaTypeIcons[entry.mediaType];
            return (
              <Card key={entry.id} className="relative">
                <CardContent className="pt-6">
                  <div className="absolute top-2 right-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removePortfolio(entry.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-4">
                    <IconComponent className="w-4 h-4" />
                    Portfolio Item #{index + 1}
                  </div>

                  <div className="grid gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Title</Label>
                        <Input
                          placeholder="e.g., Kitchen Renovation"
                          value={entry.title}
                          onChange={(e) => updatePortfolio(entry.id, 'title', e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Media Type</Label>
                        <Select
                          value={entry.mediaType}
                          onValueChange={(value) => updatePortfolio(entry.id, 'mediaType', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="image">Image</SelectItem>
                            <SelectItem value="video">Video</SelectItem>
                            <SelectItem value="document">Document</SelectItem>
                            <SelectItem value="audio">Audio</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Media URL</Label>
                      <Input
                        placeholder="https://example.com/image.jpg"
                        value={entry.mediaUrl}
                        onChange={(e) => updatePortfolio(entry.id, 'mediaUrl', e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Paste a link to your work (Google Drive, Dropbox, YouTube, etc.)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Description (Optional)</Label>
                      <Textarea
                        placeholder="Describe this project or work..."
                        className="min-h-[60px] resize-none"
                        value={entry.description}
                        onChange={(e) => updatePortfolio(entry.id, 'description', e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Button type="button" variant="outline" onClick={addPortfolio} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Another Item
          </Button>
        </div>
      )}
    </div>
  );
}
