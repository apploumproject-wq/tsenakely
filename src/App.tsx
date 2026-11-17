import {useCallback, useEffect, useState} from 'react';
import {
  BarChart3,
  Clock,
  Home,
  LogOut,
  Settings,
  ShoppingCart,
  Store,
  WifiOff,
} from 'lucide-react';
import {PWAInstallButton} from './components/PWAInstallButton';
import {SaleDetailModal} from './components/SaleDetailModal';
import {tsenakelyDb} from './db/database';
import type {
  AppSettings,
  NavTab,
  SaleWithDetails,
  User,
} from './db/types';
import {useOnlineStatus} from './hooks/usePWAInstall';
import {DashboardPage} from './pages/DashboardPage';
import {HistoryPage} from './pages/HistoryPage';
import {LoginPage} from './pages/LoginPage';
import {PosPage} from './pages/PosPage';
import {SettingsPage} from './pages/SettingsPage';
import {StatsPage} from './pages/StatsPage';

const SESSION_KEY = 'tsenakely_active_user_id';

const DEFAULT_APP_SETTINGS: AppSettings = {
  shop_name: 'TSENAKELY',
  currency: 'Ar',
  shop_phone: '',
  shop_address: '',
  shop_logo_data_url: '',
  receipt_footer: 'Merci pour votre achat !',
  low_stock_alert_enabled: true,
  printer_connection_mode: 'BLUETOOTH',
  printer_paper_width: '58',
  printer_device_name: '',
  printer_auto_print_sale: false,
};

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  icon: React.ComponentType<{className?: string}>;
}> = [
  {id: 'accueil', label: 'Accueil', icon: Home},
  {id: 'vente', label: 'Vente', icon: ShoppingCart},
  {id: 'historique', label: 'Historique', icon: Clock},
  {id: 'statistiques', label: 'Statistiques', icon: BarChart3},
  {id: 'parametres', label: 'Paramètres', icon: Settings},
];

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [initError, setInitError] = useState('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [activeTab, setActiveTab] = useState<NavTab>('accueil');
  const [refreshKey, setRefreshKey] = useState(0);
  const [inspectedSale, setInspectedSale] = useState<SaleWithDetails | null>(
    null
  );
  const isOnline = useOnlineStatus();

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await tsenakelyDb.init();
        const loadedSettings = await tsenakelyDb.getSettings();
        if (cancelled) return;
        setSettings(loadedSettings);

        const savedId = sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(SESSION_KEY);
        if (savedId) {
          const parsedId = parseInt(savedId, 10);
          if (!Number.isNaN(parsedId)) {
            const u = await tsenakelyDb.getUserById(parsedId);
            if (u && !cancelled) {
              setCurrentUser(u);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setInitError(
            err instanceof Error
              ? err.message
              : "Impossible d'initialiser la base de données locale."
          );
        }
      } finally {
        if (!cancelled) {
          setInitializing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLoginSuccess = (user: User) => {
    localStorage.setItem(SESSION_KEY, String(user.id));
    sessionStorage.setItem(SESSION_KEY, String(user.id));
    setCurrentUser(user);
    setActiveTab('accueil');
    triggerRefresh();
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setInspectedSale(null);
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
        <div className="w-14 h-14 rounded-2xl bg-[#0F294A] flex items-center justify-center mb-4">
          <Store className="w-7 h-7 text-[#38BDF8]" />
        </div>
        <p className="text-base font-bold text-[#0F294A]">TSENAKELY</p>
        <p className="mt-1 text-xs text-slate-500">
          Chargement de la base de données locale...
        </p>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white border border-red-200 p-6 text-center space-y-3">
          <h1 className="text-lg font-bold text-red-700">
            Erreur d’initialisation
          </h1>
          <p className="text-sm text-slate-600">{initError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        shopName={settings.shop_name}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row">
      {/* Barre latérale Desktop */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0F294A] text-white no-print">
        <div className="px-5 h-16 flex items-center gap-3 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Store className="w-5 h-5 text-[#38BDF8]" />
          </div>
          <span className="text-lg font-extrabold tracking-tight truncate">
            {settings.shop_name}
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Navigation principale">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full min-h-[46px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-white text-[#0F294A]'
                    : 'text-slate-200 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    active ? 'text-[#2563EB]' : 'text-sky-300/80'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-3">
          {!isOnline && (
            <div className="flex items-center gap-2 text-xs text-sky-200">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>Mode hors ligne actif</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {currentUser.full_name}
              </p>
              <p className="text-[11px] text-sky-200/80">
                {currentUser.role === 'ADMIN' ? 'Administrateur' : 'Vendeur'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-sky-200 hover:bg-white/10 hover:text-white cursor-pointer"
              title="Se déconnecter"
              aria-label="Se déconnecter"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Contenu principal */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen">
        {/* Top bar Mobile & Desktop */}
        <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-2.5 lg:hidden min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0F294A] flex items-center justify-center shrink-0">
              <Store className="w-4 h-4 text-[#38BDF8]" />
            </div>
            <span className="text-base font-extrabold text-[#0F294A] tracking-tight truncate">
              {settings.shop_name}
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500">
            <span className="font-semibold text-[#0F294A]">
              {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
            </span>
            <span>·</span>
            <span>Base locale SQLite hors ligne</span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {!isOnline && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 lg:hidden">
                <WifiOff className="w-3.5 h-3.5" />
                Hors ligne
              </span>
            )}
            <PWAInstallButton variant="compact" />
            <button
              type="button"
              onClick={handleLogout}
              className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Se déconnecter"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 max-w-7xl w-full mx-auto pb-24 lg:pb-8">
          {activeTab === 'accueil' && (
            <DashboardPage
              settings={settings}
              refreshKey={refreshKey}
              onNavigate={setActiveTab}
              onInspectSale={setInspectedSale}
            />
          )}

          {activeTab === 'vente' && (
            <PosPage
              currentUser={currentUser}
              settings={settings}
              refreshKey={refreshKey}
              onSaleCompleted={triggerRefresh}
            />
          )}

          {activeTab === 'historique' && (
            <HistoryPage
              settings={settings}
              refreshKey={refreshKey}
              onInspectSale={setInspectedSale}
            />
          )}

          {activeTab === 'statistiques' && (
            <StatsPage settings={settings} refreshKey={refreshKey} />
          )}

          {activeTab === 'parametres' && (
            <SettingsPage
              currentUser={currentUser}
              settings={settings}
              refreshKey={refreshKey}
              onDataChanged={triggerRefresh}
              onSettingsUpdated={(next) => {
                setSettings(next);
                triggerRefresh();
              }}
              onLogout={handleLogout}
            />
          )}
        </main>
      </div>

      {/* Barre de navigation fixe en bas sur Mobile */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center h-16 pb-safe no-print"
        aria-label="Navigation mobile"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 px-1 transition-colors cursor-pointer ${
                active ? 'text-[#0F294A]' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon
                className={`w-5 h-5 ${
                  active ? 'text-[#2563EB]' : 'text-slate-500'
                }`}
              />
              <span
                className={`text-[10px] tracking-tight truncate max-w-full ${
                  active ? 'font-bold text-[#0F294A]' : 'font-medium'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Modale détail de vente (accessible depuis Accueil & Historique) */}
      <SaleDetailModal
        sale={inspectedSale}
        currentUser={currentUser}
        settings={settings}
        onClose={() => setInspectedSale(null)}
        onSaleCancelled={triggerRefresh}
      />
    </div>
  );
}
