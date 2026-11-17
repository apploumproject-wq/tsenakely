import React, {useState} from 'react';
import {Download, Smartphone, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'card') {
      return (
        <p className="text-sm text-emerald-700 font-medium">
          Application déjà installée sur cet appareil en mode autonome.
        </p>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F294A] px-4 py-2.5 min-h-[44px] text-sm font-medium text-white hover:bg-[#163A66] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>Installer sur Android / Appareil</span>
      </button>
    );
  }

  if (variant === 'card' || isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 min-h-[44px] text-sm font-medium text-[#0F294A] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Smartphone className="w-4 h-4 text-[#2563EB]" />
          <span>Installer sur l’écran d’accueil</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 border border-slate-200 shadow-xl">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-bold text-[#0F294A]">
                  Installer TSENAKELY hors ligne
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-600 leading-relaxed">
                {isIOS ? (
                  <>
                    <p>
                      1. Touchez le bouton <strong>Partager</strong> dans la
                      barre Safari.
                    </p>
                    <p>
                      2. Faites défiler et sélectionnez{' '}
                      <strong>Sur l’écran d’accueil</strong>.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      1. Ouvrez le menu de votre navigateur Android (Chrome,
                      Edge ou Brave : icône <strong>⋮</strong> en haut à droite).
                    </p>
                    <p>
                      2. Appuyez sur{' '}
                      <strong>Installer l’application</strong> ou{' '}
                      <strong>Ajouter à l’écran d’accueil</strong>.
                    </p>
                    <p className="text-xs text-slate-500">
                      Une fois installée, l’application démarre en plein écran
                      et fonctionne sans connexion Internet.
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-[#0F294A] text-white text-sm font-medium hover:bg-[#163A66] transition-colors cursor-pointer"
              >
                Compris
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
