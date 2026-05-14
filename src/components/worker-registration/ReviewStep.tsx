import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Database } from '@/integrations/supabase/types';

type WorkerCategory = Database['public']['Enums']['worker_category'];

interface ReviewStepProps {
  category: WorkerCategory | null;
  occupationName: string | null;
  paymentMethodology: string | null;
  about: string;
  yearsExperience: number;
  hourlyRate: number;
  educationCount: number;
  experienceCount: number;
  portfolioCount: number;
  aadhaarVerified: boolean;
  panVerified: boolean;
  videoVerified: boolean;
}

const categoryLabels: Record<WorkerCategory, string> = {
  professional: 'Professional Services',
  skilled: 'Skilled Worker',
  freelancer: 'Freelancer',
  educator: 'Educator',
};

const paymentLabels: Record<string, { label: string; description: string }> = {
  per_session: { label: 'Per Session', description: 'Billed per minute/hour of consultation' },
  task_based: { label: 'Task Based', description: 'Fixed price per task or project' },
  free_service: { label: 'Free Service', description: 'Optional tipping, no mandatory payment' },
  hybrid: { label: 'Hybrid', description: 'Free chat with paid calls/sessions' },
};

export function ReviewStep({
  category,
  occupationName,
  paymentMethodology,
  about,
  yearsExperience,
  hourlyRate,
  educationCount,
  experienceCount,
  portfolioCount,
  aadhaarVerified,
  panVerified,
  videoVerified,
}: ReviewStepProps) {
  const kycComplete = aadhaarVerified && panVerified && videoVerified;
  const payment = paymentMethodology ? paymentLabels[paymentMethodology] : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Review Your Profile</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please review all information before submitting your worker registration.
        </p>
      </div>

      <div className="grid gap-4">
        {/* Category & Occupation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Category & Occupation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-primary/10 text-primary">
                {category ? categoryLabels[category] : 'Not selected'}
              </Badge>
              <Badge variant="outline">{occupationName || 'Not selected'}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Payment Methodology */}
        {payment && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Assigned Payment Model
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary text-primary-foreground">{payment.label}</Badge>
                <span className="text-sm text-muted-foreground">{payment.description}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                * Payment model is automatically assigned based on your occupation
              </p>
            </CardContent>
          </Card>
        )}

        {/* Profile Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Profile Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-sm text-muted-foreground">About: </span>
              <span className="text-sm">{about ? `${about.slice(0, 100)}...` : 'Not provided'}</span>
            </div>
            <div className="flex gap-6">
              <div>
                <span className="text-sm text-muted-foreground">Experience: </span>
                <span className="text-sm font-medium">{yearsExperience || 0} years</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Hourly Rate: </span>
                <span className="text-sm font-medium">₹{hourlyRate || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Additional Content</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                {educationCount > 0 ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-sm">{educationCount} Education</span>
              </div>
              <div className="flex items-center gap-2">
                {experienceCount > 0 ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-sm">{experienceCount} Experience</span>
              </div>
              <div className="flex items-center gap-2">
                {portfolioCount > 0 ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-sm">{portfolioCount} Portfolio</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* KYC Status */}
        <Card className={kycComplete ? 'border-green-500' : 'border-destructive'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">KYC Verification Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                {aadhaarVerified ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
                <span className="text-sm">Aadhaar</span>
              </div>
              <div className="flex items-center gap-2">
                {panVerified ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
                <span className="text-sm">PAN</span>
              </div>
              <div className="flex items-center gap-2">
                {videoVerified ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-destructive" />
                )}
                <span className="text-sm">Video</span>
              </div>
            </div>
            {!kycComplete && (
              <p className="text-xs text-destructive mt-2">
                * Complete all KYC steps to activate your profile
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
