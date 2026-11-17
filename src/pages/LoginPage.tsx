import React, {useEffect, useState} from 'react';
import {Eye, EyeOff, Lock, Store, User as UserIcon} from 'lucide-react';
import {tsenakelyDb} from '../db/database';
import type {User} from '../db/types';
import {PWAInstallButton} from '../components/PWAInstallButton';

interface LoginPageProps {
  shopName: string;
  onLoginSuccess: (user: User) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  shopName,
  onLoginSuccess,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDefaultHint, setShowDefaultHint] = useState(false);

  useEffect(() => {
    tsenakelyDb
      .isUsingDefaultAdminPassword()
      .then(setShowDefaultHint)
      .catch(() => setShowDefaultHint(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError("Veuillez saisir votre nom d'utilisateur et votre mot de passe.");
      return;
    }

    setSubmitting(true);
    try {
      const user = await tsenakelyDb.authenticate(username, password);
      if (!user) {
        setError(
          "Nom d'utilisateur ou mot de passe incorrect, ou compte désactivé."
        );
        return;
      }
      onLoginSuccess(user);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Erreur lors de la connexion à la base locale.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between px-4 py-8 sm:px-6">
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-[#0F294A] flex items-center justify-center shadow-sm mb-4">
              <Store className="w-8 h-8 text-[#38BDF8]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F294A]">
              {shopName || 'TSENAKELY'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Gestion commerciale locale · Mode hors ligne actif
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs">
            <h2 className="text-lg font-bold text-slate-900">
              Connexion au point de vente
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Accédez à votre caisse, vos stocks et vos statistiques locales.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="login-username"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Nom d’utilisateur
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-username"
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex. admin"
                    className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#0F294A]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Saisir votre mot de passe"
                    className="w-full min-h-[46px] pl-10 pr-12 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#0F294A]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-[#0F294A] hover:bg-slate-100 cursor-pointer"
                    aria-label={
                      showPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs font-medium text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Vérification...' : 'Se connecter'}
              </button>
            </form>

            {showDefaultHint && (
              <div className="mt-5 pt-4 border-t border-slate-200 text-xs text-slate-600 leading-relaxed">
                <span className="font-semibold text-[#0F294A]">
                  Compte administrateur initial :
                </span>{' '}
                identifiant <span className="font-mono font-semibold">admin</span> ·
                mot de passe{' '}
                <span className="font-mono font-semibold">admin123</span>. Pensez à
                le modifier dans Paramètres après connexion.
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-center">
            <PWAInstallButton variant="compact" />
          </div>
        </div>
      </div>
    </div>
  );
};
