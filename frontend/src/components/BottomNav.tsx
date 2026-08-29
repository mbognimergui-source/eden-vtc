import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Car, Wallet, Clock, User } from 'lucide-react';
import { t } from '@/lib/i18n';

const navItems = [
  { path: '/', icon: Home, labelKey: 'nav.home', label: 'Accueil' },
  { path: '/book', icon: Car, labelKey: 'nav.book', label: 'Commander' },
  { path: '/wallet', icon: Wallet, labelKey: 'nav.wallet', label: 'Portefeuille' },
  { path: '/rides', icon: Clock, labelKey: 'nav.rides', label: 'Courses' },
  { path: '/feedback', icon: User, labelKey: 'nav.profile', label: 'Profil' },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur-lg border-t border-border/50 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-xl transition-all duration-300 ${
                isActive
                  ? 'text-[hsl(195,50%,25%)]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {isActive && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-[hsl(45,65%,47%)] animate-in fade-in zoom-in duration-300" />
              )}
              <div className={`relative p-1.5 rounded-lg transition-all duration-300 ${
                isActive ? 'bg-[hsl(195,50%,25%)]/10 scale-110' : ''
              }`}>
                <Icon className={`w-5 h-5 transition-all duration-300 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
              </div>
              <span className={`text-[10px] font-medium transition-all duration-300 ${
                isActive ? 'opacity-100 translate-y-0' : 'opacity-70 translate-y-0'
              }`}>
                {t(item.labelKey) || item.label}
              </span>
            </button>
          );
        })}
      </div>
      {/* Safe area for iOS */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}