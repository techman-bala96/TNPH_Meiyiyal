import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { 
  Sparkles, 
  Mic, 
  Shield, 
  Users, 
  ArrowRight, 
  LogOut,
  Scale,
  Stethoscope,
  Zap,
  Palette,
  BookOpen,
  Code
} from 'lucide-react';

const categories = [
  { name: 'Professionals', icon: Scale, color: 'bg-professional', description: 'Lawyers, Doctors, CAs' },
  { name: 'Skilled Workers', icon: Zap, color: 'bg-skilled', description: 'Electricians, Plumbers' },
  { name: 'Freelancers', icon: Code, color: 'bg-freelancer', description: 'Designers, Developers' },
  { name: 'Educators', icon: BookOpen, color: 'bg-educator', description: 'Tutors, Coaches' },
];

export default function Index() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">Title</span>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <>
                <span className="text-sm text-muted-foreground hidden sm:block">
                  Welcome, {user.user_metadata?.first_name || user.email}
                </span>
                <Button variant="outline" size="sm" onClick={() => signOut()}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate('/auth')}>
                  Login
                </Button>
                <Button className="gradient-primary" onClick={() => navigate('/auth?mode=signup')}>
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 gradient-primary opacity-5" />
        <div className="absolute top-20 right-20 w-72 h-72 rounded-full bg-primary/10 blur-3xl animate-float" />
        <div className="absolute bottom-20 left-20 w-96 h-96 rounded-full bg-secondary/10 blur-3xl animate-float" style={{ animationDelay: '2s' }} />

        <div className="container mx-auto px-4 py-20 md:py-32 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6 animate-fade-in">
              <Mic className="w-4 h-4" />
              <span className="text-sm font-medium">Voice Assistant in 20+ Indian Languages</span>
            </div>

            <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 animate-fade-in">
              Find Verified{' '}
              <span className="text-gradient">Professionals</span>
              {' '}Near You
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              Connect with trusted workers, book services, and manage everything with just your voice.
              Lawyers, doctors, electricians, designers - all verified and ready to help.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <Button 
                size="lg" 
                className="h-14 px-8 text-lg gradient-primary shadow-glow"
                onClick={() => navigate(user ? '/feeds' : '/auth?mode=signup')}
              >
                {user ? 'Explore Workers' : 'Get Started Free'}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="h-14 px-8 text-lg"
                onClick={() => navigate('/worker-registration')}
              >
                <Users className="mr-2 w-5 h-5" />
                Register as Worker
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Explore Worker Categories
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From legal experts to home repair specialists, find the right professional for any job.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {categories.map((category, index) => (
              <div
                key={category.name}
                className="group relative bg-card rounded-2xl p-6 border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-300 cursor-pointer animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className={`w-14 h-14 rounded-xl ${category.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <category.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{category.name}</h3>
                <p className="text-muted-foreground text-sm">{category.description}</p>
                <ArrowRight className="absolute top-6 right-6 w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Mic className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Voice Commands</h3>
              <p className="text-muted-foreground">
                Control the app hands-free in Hindi, Tamil, Telugu, and 17+ more languages.
              </p>
            </div>

            <div className="text-center p-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-success" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">KYC Verified</h3>
              <p className="text-muted-foreground">
                All workers are Aadhaar and PAN verified for your safety and trust.
              </p>
            </div>

            <div className="text-center p-6 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Trusted Network</h3>
              <p className="text-muted-foreground">
                Reviews, ratings, and portfolios to help you choose the right professional.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="container mx-auto px-4 relative z-10 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Get Started?
          </h2>
          <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
            Join thousands of users who trust Title for finding verified professionals.
          </p>
          <Button 
            size="lg" 
            className="h-14 px-8 text-lg bg-white text-primary hover:bg-white/90"
            onClick={() => navigate('/auth?mode=signup')}
          >
            Create Free Account
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-background py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-xl font-bold">Title</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2026 Title. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
