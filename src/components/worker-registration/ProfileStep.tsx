import { UseFormReturn } from 'react-hook-form';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WorkerFormData } from './types';

interface ProfileStepProps {
  form: UseFormReturn<WorkerFormData>;
}

export function ProfileStep({ form }: ProfileStepProps) {
  const { register, formState: { errors } } = form;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Tell Us About Yourself</h3>
        <p className="text-sm text-muted-foreground mb-6">
          This information will be displayed on your public profile to help customers find and choose you.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="about">About You *</Label>
          <Textarea
            id="about"
            placeholder="Describe your expertise, services offered, and what makes you unique..."
            className="min-h-[120px] resize-none"
            {...register('about')}
          />
          {errors.about && (
            <p className="text-sm text-destructive">{errors.about.message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Write a compelling introduction that highlights your skills and experience
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="yearsExperience">Years of Experience</Label>
            <Input
              id="yearsExperience"
              type="number"
              min="0"
              max="50"
              placeholder="e.g., 5"
              {...register('yearsExperience', { valueAsNumber: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hourlyRate">Hourly Rate (₹)</Label>
            <Input
              id="hourlyRate"
              type="number"
              min="0"
              placeholder="e.g., 500"
              {...register('hourlyRate', { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              Set based on your occupation type
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
