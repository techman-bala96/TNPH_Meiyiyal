import { useState } from 'react';
import { Plus, Trash2, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';

export interface ExperienceEntry {
  id: string;
  companyName: string;
  role: string;
  startYear: string;
  endYear: string;
  description: string;
}

interface ExperienceStepProps {
  experience: ExperienceEntry[];
  onExperienceChange: (experience: ExperienceEntry[]) => void;
}

export function ExperienceStep({ experience, onExperienceChange }: ExperienceStepProps) {
  const addExperience = () => {
    const newEntry: ExperienceEntry = {
      id: crypto.randomUUID(),
      companyName: '',
      role: '',
      startYear: '',
      endYear: '',
      description: '',
    };
    onExperienceChange([...experience, newEntry]);
  };

  const removeExperience = (id: string) => {
    onExperienceChange(experience.filter((e) => e.id !== id));
  };

  const updateExperience = (id: string, field: keyof ExperienceEntry, value: string) => {
    onExperienceChange(
      experience.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Work Experience</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Optional: Add your professional experience to showcase your expertise.
        </p>
      </div>

      {experience.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Briefcase className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No experience added yet</p>
            <Button type="button" variant="outline" onClick={addExperience}>
              <Plus className="w-4 h-4 mr-2" />
              Add Experience
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {experience.map((entry, index) => (
            <Card key={entry.id} className="relative">
              <CardContent className="pt-6">
                <div className="absolute top-2 right-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeExperience(entry.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="text-sm font-medium text-muted-foreground mb-4">
                  Experience #{index + 1}
                </div>

                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Company / Project Name</Label>
                      <Input
                        placeholder="e.g., Tata Consultancy Services"
                        value={entry.companyName}
                        onChange={(e) => updateExperience(entry.id, 'companyName', e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Role / Position</Label>
                      <Input
                        placeholder="e.g., Senior Developer"
                        value={entry.role}
                        onChange={(e) => updateExperience(entry.id, 'role', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Year</Label>
                      <Input
                        type="number"
                        min="1950"
                        max={new Date().getFullYear()}
                        placeholder="e.g., 2018"
                        value={entry.startYear}
                        onChange={(e) => updateExperience(entry.id, 'startYear', e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>End Year (leave empty if current)</Label>
                      <Input
                        type="number"
                        min="1950"
                        max={new Date().getFullYear()}
                        placeholder="e.g., 2023"
                        value={entry.endYear}
                        onChange={(e) => updateExperience(entry.id, 'endYear', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description (Optional)</Label>
                    <Textarea
                      placeholder="Describe your responsibilities and achievements..."
                      className="min-h-[80px] resize-none"
                      value={entry.description}
                      onChange={(e) => updateExperience(entry.id, 'description', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button type="button" variant="outline" onClick={addExperience} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Another Experience
          </Button>
        </div>
      )}
    </div>
  );
}
