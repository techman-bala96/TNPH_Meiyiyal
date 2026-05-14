import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { StepIndicator } from '@/components/worker-registration/StepIndicator';
import { CategoryStep } from '@/components/worker-registration/CategoryStep';
import { ProfileStep } from '@/components/worker-registration/ProfileStep';
import { EducationStep, EducationEntry } from '@/components/worker-registration/EducationStep';
import { ExperienceStep, ExperienceEntry } from '@/components/worker-registration/ExperienceStep';
import { PortfolioStep, PortfolioEntry } from '@/components/worker-registration/PortfolioStep';
import { KYCStep } from '@/components/worker-registration/KYCStep';
import { ReviewStep } from '@/components/worker-registration/ReviewStep';
import { workerFormSchema, WorkerFormData, WorkerCategory } from '@/components/worker-registration/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const STEPS = ['Category', 'Profile', 'Education', 'Experience', 'Portfolio', 'KYC', 'Review'];

export default function WorkerRegistration() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [selectedCategory, setSelectedCategory] = useState<WorkerCategory | null>(null);
  const [selectedOccupation, setSelectedOccupation] = useState<string | null>(null);
  const [occupationName, setOccupationName] = useState<string | null>(null);
  const [paymentMethodology, setPaymentMethodology] = useState<string | null>(null);
  const [education, setEducation] = useState<EducationEntry[]>([]);
  const [experience, setExperience] = useState<ExperienceEntry[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioEntry[]>([]);

  // KYC state
  const [aadhaarVerified, setAadhaarVerified] = useState(false);
  const [panVerified, setPanVerified] = useState(false);
  const [videoVerified, setVideoVerified] = useState(false);
  const [panNumber, setPanNumber] = useState('');
  const [panName, setPanName] = useState('');

  const form = useForm<WorkerFormData>({
    resolver: zodResolver(workerFormSchema),
    defaultValues: {
      about: '',
      yearsExperience: 0,
      hourlyRate: 0,
    },
  });

  // Fetch occupation details when selected
  useEffect(() => {
    if (selectedOccupation) {
      fetchOccupationDetails();
    }
  }, [selectedOccupation]);

  const fetchOccupationDetails = async () => {
    if (!selectedOccupation) return;
    
    const { data } = await supabase
      .from('occupations')
      .select('name, payment_methodology')
      .eq('id', selectedOccupation)
      .maybeSingle();

    if (data) {
      setOccupationName(data.name);
      setPaymentMethodology(data.payment_methodology);
    }
  };

  const handlePanChange = (field: 'panNumber' | 'panName', value: string) => {
    if (field === 'panNumber') {
      setPanNumber(value);
      // Auto-verify PAN format (simple validation)
      setPanVerified(value.length === 10 && panName.length > 2);
    } else {
      setPanName(value);
      setPanVerified(panNumber.length === 10 && value.length > 2);
    }
  };

  const handleAadhaarVerify = () => {
    // Simulate OTP verification (in real app, this would call backend)
    toast.info('OTP sent to your Aadhaar-linked mobile number');
    setTimeout(() => {
      setAadhaarVerified(true);
      toast.success('Aadhaar verified successfully!');
    }, 2000);
  };

  const handleVideoRecord = () => {
    // Simulate video recording (in real app, this would open camera)
    toast.info('Starting video verification...');
    setTimeout(() => {
      setVideoVerified(true);
      toast.success('Video verification completed!');
    }, 3000);
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 0: // Category
        return !!selectedCategory && !!selectedOccupation;
      case 1: // Profile
        return form.formState.isValid || form.watch('about')?.length >= 20;
      case 5: // KYC
        return aadhaarVerified && panVerified && videoVerified;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (currentStep === 1) {
      const valid = await form.trigger();
      if (!valid) return;
    }

    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    } else {
      navigate(-1);
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please login or signup first');
      navigate('/auth?mode=signup');
      return;
    }

    if (!selectedCategory || !selectedOccupation) {
      toast.error('Please select category and occupation');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create worker profile
      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .insert({
          user_id: user.id,
          category: selectedCategory,
          occupation_id: selectedOccupation,
          about: form.getValues('about'),
          years_experience: form.getValues('yearsExperience') || 0,
          hourly_rate: form.getValues('hourlyRate') || null,
        })
        .select()
        .single();

      if (workerError) throw workerError;

      const workerId = workerData.id;

      // Insert education records
      if (education.length > 0) {
        const educationRecords = education
          .filter((e) => e.degreeName && e.institution)
          .map((e) => ({
            worker_id: workerId,
            degree_name: e.degreeName,
            institution: e.institution,
            year_completed: e.yearCompleted ? parseInt(e.yearCompleted) : null,
          }));

        if (educationRecords.length > 0) {
          const { error } = await supabase.from('worker_education').insert(educationRecords);
          if (error) console.error('Education insert error:', error);
        }
      }

      // Insert experience records
      if (experience.length > 0) {
        const experienceRecords = experience
          .filter((e) => e.companyName && e.role)
          .map((e) => ({
            worker_id: workerId,
            company_name: e.companyName,
            role: e.role,
            start_year: e.startYear ? parseInt(e.startYear) : null,
            end_year: e.endYear ? parseInt(e.endYear) : null,
            description: e.description || null,
          }));

        if (experienceRecords.length > 0) {
          const { error } = await supabase.from('worker_experience').insert(experienceRecords);
          if (error) console.error('Experience insert error:', error);
        }
      }

      // Insert portfolio records
      if (portfolio.length > 0) {
        const portfolioRecords = portfolio
          .filter((p) => p.title && p.mediaUrl)
          .map((p) => ({
            worker_id: workerId,
            title: p.title,
            media_type: p.mediaType,
            media_url: p.mediaUrl,
            description: p.description || null,
          }));

        if (portfolioRecords.length > 0) {
          const { error } = await supabase.from('worker_portfolio').insert(portfolioRecords);
          if (error) console.error('Portfolio insert error:', error);
        }
      }

      // Create KYC record
      const { error: kycError } = await supabase.from('kyc_verification').insert({
        worker_id: workerId,
        aadhaar_verified: aadhaarVerified,
        pan_number: panNumber,
        pan_name: panName,
        pan_verified: panVerified,
        video_verified: videoVerified,
        status: 'pending',
      });

      if (kycError) console.error('KYC insert error:', kycError);

      // Update user role to worker
      await supabase
        .from('profiles')
        .update({ role: 'worker' })
        .eq('user_id', user.id);

      toast.success('Worker profile created successfully! Your profile is under review.');
      navigate('/');
    } catch (error: any) {
      console.error('Submit error:', error);
      toast.error(error.message || 'Failed to create worker profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <CategoryStep
            selectedCategory={selectedCategory}
            selectedOccupation={selectedOccupation}
            onCategoryChange={setSelectedCategory}
            onOccupationChange={setSelectedOccupation}
          />
        );
      case 1:
        return <ProfileStep form={form} />;
      case 2:
        return <EducationStep education={education} onEducationChange={setEducation} />;
      case 3:
        return <ExperienceStep experience={experience} onExperienceChange={setExperience} />;
      case 4:
        return <PortfolioStep portfolio={portfolio} onPortfolioChange={setPortfolio} />;
      case 5:
        return (
          <KYCStep
            aadhaarVerified={aadhaarVerified}
            panVerified={panVerified}
            videoVerified={videoVerified}
            panNumber={panNumber}
            panName={panName}
            onPanChange={handlePanChange}
            onAadhaarVerify={handleAadhaarVerify}
            onVideoRecord={handleVideoRecord}
          />
        );
      case 6:
        return (
          <ReviewStep
            category={selectedCategory}
            occupationName={occupationName}
            paymentMethodology={paymentMethodology}
            about={form.getValues('about')}
            yearsExperience={form.getValues('yearsExperience') || 0}
            hourlyRate={form.getValues('hourlyRate') || 0}
            educationCount={education.filter((e) => e.degreeName).length}
            experienceCount={experience.filter((e) => e.companyName).length}
            portfolioCount={portfolio.filter((p) => p.title).length}
            aadhaarVerified={aadhaarVerified}
            panVerified={panVerified}
            videoVerified={videoVerified}
          />
        );
      default:
        return null;
    }
  };

  return (
    <AuthLayout
      title="Register as a Worker"
      subtitle="Complete your profile to start offering services"
      showBackButton={true}
      onBack={handleBack}
    >
      <div className="w-full max-w-2xl mx-auto">
        <StepIndicator steps={STEPS} currentStep={currentStep} />

        <div className="min-h-[400px]">{renderStep()}</div>

        <div className="flex justify-between mt-8 pt-6 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          {currentStep < STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={!canProceed()}
              className="gradient-primary flex items-center gap-2"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !canProceed()}
              className="gradient-primary flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Registration'
              )}
            </Button>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{' '}
          <Button variant="link" className="px-0 text-primary" onClick={() => navigate('/auth')}>
            Login here
          </Button>
        </p>
      </div>
    </AuthLayout>
  );
}
