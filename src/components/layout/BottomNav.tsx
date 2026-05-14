import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Search, MessageSquare, Wallet, User, Briefcase } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  isWorker?: boolean;
}

export function BottomNav({ isWorker = false }: BottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const userNavItems = [
    { icon: Home, label: t('nav.home'), path: '/dashboard' },
    { icon: Search, label: t('nav.find'), path: '/feeds' },
    { icon: MessageSquare, label: t('nav.requests'), path: '/requests' },
    { icon: Wallet, label: t('nav.wallet'), path: '/wallet' },
    { icon: User, label: t('nav.profile'), path: '/profile' },
  ];

  const workerNavItems = [
    { icon: Home, label: t('nav.home'), path: '/dashboard' },
    { icon: Briefcase, label: t('nav.jobs'), path: '/worker/requests' },
    { icon: MessageSquare, label: t('nav.requests'), path: '/requests' },
    { icon: Wallet, label: t('nav.wallet'), path: '/wallet' },
    { icon: User, label: t('nav.profile'), path: '/profile' },
  ];

  const navItems = isWorker ? workerNavItems : userNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5", isActive && "text-primary")} />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
