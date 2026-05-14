import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Phone, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/hooks/useAuth';

const phoneSchema = z.object({
  phone: z.string().min(10, 'Please enter a valid phone number'),
});

type PhoneForm = z.infer<typeof phoneSchema>;

export default function OtpLogin() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const navigate = useNavigate();
  const { user, signInWithPhone, verifyOtp } = useAuth();

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const form = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  });

  const handleSendOtp = async (data: PhoneForm) => {
    setIsLoading(true);
    const formattedPhone = data.phone.startsWith('+') ? data.phone : `+91${data.phone}`;
    const { error } = await signInWithPhone(formattedPhone);
    setIsLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setPhone(formattedPhone);
    setStep('otp');
    setResendTimer(60);
    toast.success('OTP sent to your phone!');
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      toast.error('Please enter the complete OTP');
      return;
    }

    setIsLoading(true);
    const { error } = await verifyOtp(phone, otp);
    setIsLoading(false);

    if (error) {
      if (error.message.includes('expired')) {
        toast.error('OTP expired. Please request a new one.');
      } else if (error.message.includes('invalid')) {
        toast.error('Invalid OTP. Please try again.');
      } else {
        toast.error(error.message);
      }
      return;
    }

    toast.success('Login successful!');
    navigate('/');
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    
    setIsLoading(true);
    const { error } = await signInWithPhone(phone);
    setIsLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setResendTimer(60);
    setOtp('');
    toast.success('OTP resent successfully!');
  };

  if (step === 'otp') {
    return (
      <AuthLayout
        title="Enter OTP"
        subtitle={`We've sent a 6-digit code to ${phone}`}
      >
        <div className="space-y-6">
          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={setOtp}
              className="gap-2"
            >
              <InputOTPGroup className="gap-2">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <InputOTPSlot
                    key={index}
                    index={index}
                    className="w-12 h-14 text-xl font-bold border-2 rounded-xl"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button
            className="w-full h-12 text-base gradient-primary"
            onClick={handleVerifyOtp}
            disabled={isLoading || otp.length !== 6}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Verify & Login
                <ArrowRight className="ml-2 w-5 h-5" />
              </>
            )}
          </Button>

          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Didn't receive the code?
            </p>
            <Button
              variant="link"
              className="text-primary"
              onClick={handleResendOtp}
              disabled={resendTimer > 0}
            >
              {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
            </Button>
          </div>

          <Button
            variant="ghost"
            className="w-full h-12"
            onClick={() => {
              setStep('phone');
              setOtp('');
            }}
          >
            <ArrowLeft className="mr-2 w-5 h-5" />
            Change Phone Number
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Login with OTP"
      subtitle="We'll send you a one-time password"
    >
      <form onSubmit={form.handleSubmit(handleSendOtp)} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground">
              <Phone className="w-5 h-5" />
              <span className="text-sm font-medium">+91</span>
            </div>
            <Input
              id="phone"
              type="tel"
              placeholder="98765 43210"
              className="pl-20 h-12"
              {...form.register('phone')}
            />
          </div>
          {form.formState.errors.phone && (
            <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full h-12 text-base gradient-primary" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Send OTP
              <ArrowRight className="ml-2 w-5 h-5" />
            </>
          )}
        </Button>

      </form>
    </AuthLayout>
  );
}
