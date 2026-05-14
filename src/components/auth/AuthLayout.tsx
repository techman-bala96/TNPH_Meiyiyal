import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  onBack?: () => void;
}

export function AuthLayout({ children, title, subtitle, showBackButton = true, onBack }: AuthLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/10 blur-3xl animate-float" />
          <div className="absolute top-1/2 -left-20 w-60 h-60 rounded-full bg-white/10 blur-3xl animate-float" style={{ animationDelay: '2s' }} />
          <div className="absolute -bottom-20 right-20 w-40 h-40 rounded-full bg-white/10 blur-3xl animate-float" style={{ animationDelay: '4s' }} />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center items-center w-full px-12 text-primary-foreground">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="w-8 h-8" />
            </div>
            <span className="text-4xl font-bold">Title</span>
          </div>
          
          <h2 className="text-3xl font-bold text-center mb-4">
            Connect with Verified Professionals
          </h2>
          <p className="text-lg text-primary-foreground/80 text-center max-w-md">
            Find trusted workers, get expert services, and manage everything with voice commands in your language.
          </p>

          {/* Feature highlights */}
          <div className="mt-12 space-y-4 w-full max-w-md">
            {[
              '✨ 20+ Worker Categories',
              '🎤 Voice Assistant in All Indian Languages',
              '✅ KYC Verified Professionals',
              '💬 Real-time Communication'
            ].map((feature, index) => (
              <div 
                key={index}
                className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <span className="text-lg">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 py-12 bg-background">
        <div className="w-full max-w-md">
          {/* Back Button */}
          {showBackButton && (
            <Button
              variant="ghost"
              onClick={onBack || (() => navigate(-1))}
              className="mb-6 -ml-2"
            >
              <ArrowLeft className="mr-2 w-4 h-4" />
              Back
            </Button>
          )}

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-gradient">Title</span>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">{title}</h1>
            <p className="text-muted-foreground">{subtitle}</p>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}