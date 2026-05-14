import { useState } from 'react';
import { Plus, Trash2, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

export interface EducationEntry {
  id: string;
  degreeName: string;
  institution: string;
  yearCompleted: string;
}

interface EducationStepProps {
  education: EducationEntry[];
  onEducationChange: (education: EducationEntry[]) => void;
}

export function EducationStep({ education, onEducationChange }: EducationStepProps) {
  const addEducation = () => {
    const newEntry: EducationEntry = {
      id: crypto.randomUUID(),
      degreeName: '',
      institution: '',
      yearCompleted: '',
    };
    onEducationChange([...education, newEntry]);
  };

  const removeEducation = (id: string) => {
    onEducationChange(education.filter((e) => e.id !== id));
  };

  const updateEducation = (id: string, field: keyof EducationEntry, value: string) => {
    onEducationChange(
      education.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Educational Qualifications</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Optional: Add your degrees, certifications, or diplomas to build credibility.
        </p>
      </div>

      {education.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <GraduationCap className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No education added yet</p>
            <Button type="button" variant="outline" onClick={addEducation}>
              <Plus className="w-4 h-4 mr-2" />
              Add Education
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {education.map((entry, index) => (
            <Card key={entry.id} className="relative">
              <CardContent className="pt-6">
                <div className="absolute top-2 right-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeEducation(entry.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="text-sm font-medium text-muted-foreground mb-4">
                  Education #{index + 1}
                </div>

                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Degree / Certification Name</Label>
                    <Input
                      placeholder="e.g., Bachelor of Engineering"
                      value={entry.degreeName}
                      onChange={(e) => updateEducation(entry.id, 'degreeName', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Institution</Label>
                      <Input
                        placeholder="e.g., IIT Delhi"
                        value={entry.institution}
                        onChange={(e) => updateEducation(entry.id, 'institution', e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Year Completed</Label>
                      <Input
                        type="number"
                        min="1950"
                        max={new Date().getFullYear()}
                        placeholder="e.g., 2020"
                        value={entry.yearCompleted}
                        onChange={(e) => updateEducation(entry.id, 'yearCompleted', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button type="button" variant="outline" onClick={addEducation} className="w-full">
            <Plus className="w-4 h-4 mr-2" />
            Add Another Education
          </Button>
        </div>
      )}
    </div>
  );
}
