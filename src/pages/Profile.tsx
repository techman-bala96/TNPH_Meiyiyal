import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useWorkerProfile } from '@/hooks/useWorkerProfile';
import { PageLayout } from '@/components/layout/PageLayout';
import { BottomNav } from '@/components/layout/BottomNav';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  ChevronRight,
  Briefcase,
  HelpCircle,
  Shield,
  LogOut,
  Globe
} from 'lucide-react';

export default function Profile() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { userProfile, isWorker, workerProfile } = useWorkerProfile();

  if (!user) {
    navigate('/auth');
    return null;
  }

  const menuItems = [
    { icon: User, label: 'Edit Profile', path: '/profile/edit' },
    { icon: Globe, label: 'Language Settings', path: '/profile/language' },
    { icon: Shield, label: 'Privacy & Security', path: '/profile/privacy' },
    { icon: HelpCircle, label: 'Help & Support', path: '/support' },
  ];

  return (
    <>
      <PageLayout title="Profile" subtitle="Manage your account" backPath="/dashboard">
        <div className="space-y-6 pb-24">
          {/* Profile Header */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                  {userProfile?.avatar_url ? (
                    <img 
                      src={userProfile.avatar_url} 
                      alt="" 
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-10 h-10 text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">
                    {userProfile?.first_name || user.user_metadata?.first_name || 'User'}{' '}
                    {userProfile?.last_name || user.user_metadata?.last_name || ''}
                  </h2>
                  <p className="text-sm text-muted-foreground capitalize">
                    {userProfile?.role || 'user'}
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {user.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="w-4 h-4" />
                    {user.email}
                  </div>
                )}
                {userProfile?.phone_number && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-4 h-4" />
                    {userProfile.phone_number}
                  </div>
                )}
                {userProfile?.location_address && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    {userProfile.location_address}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Worker Profile Link */}
          {isWorker && workerProfile && (
            <Card 
              className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate('/worker/profile')}
            >
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Briefcase className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Worker Profile</p>
                    <p className="text-sm text-muted-foreground">
                      Manage your worker settings
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Menu Items */}
          <Card>
            <CardContent className="p-0">
              {menuItems.map((item, index) => (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors ${
                    index > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  <item.icon className="w-5 h-5 text-muted-foreground" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Sign Out */}
          <Button 
            variant="outline" 
            className="w-full text-destructive hover:text-destructive"
            onClick={() => signOut()}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </PageLayout>
      <BottomNav />
    </>
  );
}
