import { useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster as ShadcnToaster } from '@/components/ui/toaster';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Index from './pages/Index';
import BookRide from './pages/BookRide';
import TrackRide from './pages/TrackRide';
import Wallet from './pages/Wallet';
import MyRides from './pages/MyRides';
import Feedback from './pages/Feedback';
import DriverDashboard from './pages/DriverDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PhoneLogin from './pages/PhoneLogin';
import AuthError from './pages/AuthError';
import Welcome from './pages/Welcome';
import SetupAccess from './pages/SetupAccess';
import SecurityAlerts from './pages/SecurityAlerts';
import RouteGuard from './components/RouteGuard';
import AIChatbot from './components/AIChatbot';
import DebtLockScreen from './components/DebtLockScreen';
import InstallPrompt from './components/InstallPrompt';
import { UserAlertsBannerCompact } from './components/UserAlertsBanner';
import { useAutoLang } from './hooks/useAutoLang';
import { useAuth } from './hooks/useAuth';
import { useDeviceLock } from './hooks/useDeviceLock';
import { useUserAlerts, requestAlertNotificationPermission } from './hooks/useUserAlerts';

const queryClient = new QueryClient();

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/welcome" element={<Welcome />} />
    <Route path="/login" element={<PhoneLogin />} />
    <Route path="/book" element={<BookRide />} />
    <Route path="/track" element={<TrackRide />} />
    <Route path="/wallet" element={<Wallet />} />
    <Route path="/rides" element={<MyRides />} />
    <Route path="/feedback" element={<Feedback />} />
    <Route path="/driver" element={
      <RouteGuard requiredRole="driver" fallbackMessage="Seuls les chauffeurs EDEN VTC peuvent accéder à cet espace.">
        <DriverDashboard />
      </RouteGuard>
    } />
    <Route path="/admin" element={
      <RouteGuard requiredRole="admin" fallbackMessage="Seuls les administrateurs EDEN VTC peuvent accéder à la gestion de la plateforme.">
        <AdminDashboard />
      </RouteGuard>
    } />
    <Route path="/setup-access" element={<SetupAccess />} />
    <Route path="/security" element={<SecurityAlerts />} />
    <Route path="/auth/error" element={<AuthError />} />
  </Routes>
);

function AppWithLang() {
  useAutoLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAuthenticated = !!user;

  const deviceLock = useDeviceLock(isAuthenticated);
  const userAlerts = useUserAlerts(isAuthenticated);

  // Request notification permission when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      requestAlertNotificationPermission();
    }
  }, [isAuthenticated]);

  // Show lock screen if user is locked (debt or device blocked)
  // Allow access to wallet page for payment and auth pages
  const currentPath = window.location.pathname;
  const isAllowedPath = currentPath === '/wallet' || currentPath.startsWith('/auth');

  if (isAuthenticated && deviceLock.locked && !deviceLock.loading && !isAllowedPath) {
    return (
      <DebtLockScreen
        debtAmount={deviceLock.debtAmount}
        deviceBlocked={deviceLock.deviceBlocked}
        blockReason={deviceLock.blockReason}
        installCount={deviceLock.installCount}
        message={deviceLock.message}
        onPayDebt={() => navigate('/wallet')}
      />
    );
  }

  return (
    <>
      {/* Security alerts banner */}
      {isAuthenticated && userAlerts.stats.unread > 0 && (
        <UserAlertsBannerCompact
          stats={userAlerts.stats}
          newAlerts={userAlerts.newAlerts}
          onMarkAllRead={userAlerts.markAllRead}
        />
      )}
      <AppRoutes />
      <InstallPrompt />
      <AIChatbot />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <ShadcnToaster />
      <BrowserRouter>
        <AppWithLang />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
export { AppRoutes };