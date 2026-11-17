import React from 'react';

interface AppFooterSignatureProps {
  className?: string;
  align?: 'center' | 'left';
}

export const AppFooterSignature: React.FC<AppFooterSignatureProps> = ({
  className = '',
  align = 'center',
}) => {
  return (
    <footer
      className={`border-t border-slate-200/80 pt-5 pb-2 ${
        align === 'center' ? 'text-center' : 'text-left'
      } ${className}`}
    >
      <p className="text-xs font-semibold text-[#0F294A] tracking-tight">
        App Loum Project
      </p>
      <p className="mt-0.5 text-[11px] text-slate-600">
        Copyright © 2026 – Tous droits réservés.
      </p>
      <p className="mt-1.5 text-[11px] text-slate-500">
        Pour recevoir l’APK ou collaborer :{' '}
        <a
          href="mailto:apploumproject@gmail.com"
          className="font-medium text-[#0F294A] hover:text-[#2563EB] underline underline-offset-2 transition-colors"
        >
          apploumproject@gmail.com
        </a>
      </p>
    </footer>
  );
};
