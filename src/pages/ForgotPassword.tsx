import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Mail, ArrowLeft, ArrowRight, Loader2, CheckCircle } from 'lucide-react';

import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [isEmailSent, setIsEmailSent] = useState(false);
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const handleSubmit = async (data: ForgotPasswordForm) => {
    setIsLoading(true);
    const { error } = await resetPassword(data.email);
    setIsLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setIsEmailSent(true);
    toast.success('Password reset link sent to your email!');
  };

  if (isEmailSent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="We've sent you a password reset link"
      >
        <div className="flex flex-col items-center text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-success" />
          </div>

          <div className="space-y-2">
            <p className="text-muted-foreground">
              We've sent a password reset link to:
            </p>
            <p className="font-semibold text-foreground">{form.getValues('email')}</p>
          </div>

          <div className="space-y-3 w-full">
            <Button
              className="w-full h-12 gradient-primary"
              onClick={() => window.open('https://mail.google.com', '_blank')}
            >
              <Mail className="mr-2 w-5 h-5" />
              Open Email App
            </Button>

            <Button
              variant="outline"
              className="w-full h-12"
              onClick={() => setIsEmailSent(false)}
            >
              Try another email
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Didn't receive the email?{' '}
            <Button
              variant="link"
              className="px-0 h-auto text-primary"
              onClick={() => handleSubmit(form.getValues())}
            >
              Click to resend
            </Button>
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="No worries, we'll send you reset instructions"
    >
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="pl-10 h-12"
              {...form.register('email')}
            />
          </div>
          {form.formState.errors.email && (
            <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        <Button type="submit" className="w-full h-12 text-base gradient-primary" disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              Send Reset Link
              <ArrowRight className="ml-2 w-5 h-5" />
            </>
          )}
        </Button>

      </form>
    </AuthLayout>
  );
}
