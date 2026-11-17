import React, {useEffect, useState} from 'react';
import {Download, FileText, Printer, Share2, X} from 'lucide-react';
import type {AppSettings, SaleWithDetails} from '../db/types';
import {saveBlobToUserDevice, shareBlobFile} from '../utils/fileActions';
import {formatAriary, formatDateTime} from '../utils/format';
import {buildInvoicePdf, type GeneratedInvoicePdf} from '../utils/invoicePdf';

interface InvoicePdfModalProps {
  sale: SaleWithDetails | null;
  settings: AppSettings;
  onClose: () => void;
}

export const InvoicePdfModal: React.FC<InvoicePdfModalProps> = ({
  sale,
  settings,
  onClose,
}) => {
  const [pdf, setPdf] = useState<GeneratedInvoicePdf | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    if (!sale) {
      setPdf(null);
      return;
    }
    const generated = buildInvoicePdf(sale, settings);
    setPdf(generated);
    setStatusMsg('');
    return () => {
      URL.revokeObjectURL(generated.objectUrl);
    };
  }, [sale, settings]);

  if (!sale || !pdf) return null;

  const currency = settings.currency || 'Ar';

  const handleSavePdf = async () => {
    setStatusMsg('');
    try {
      const res = await saveBlobToUserDevice(
        pdf.blob,
        pdf.filename,
        'application/pdf',
        'Document PDF Facture A4',
        '.pdf'
      );
      setStatusMsg(
        res.method === 'picker'
          ? `PDF enregistré à l’emplacement choisi (${res.filename}).`
          : `PDF téléchargé : ${res.filename}.`
      );
    } catch (err) {
      setStatusMsg(
        err instanceof Error ? err.message : 'Enregistrement annulé.'
      );
    }
  };

  const handleSharePdf = async () => {
    setStatusMsg('');
    const result = await shareBlobFile(
      pdf.blob,
      pdf.filename,
      'application/pdf',
      `Facture ${sale.sale_number}`,
      `Facture ${sale.sale_number} — ${settings.shop_name || 'TSENAKELY'}`
    );
    if (result === 'shared') {
      setStatusMsg('Facture PDF partagée.');
    } else if (result === 'unsupported') {
      await handleSavePdf();
      setStatusMsg(
        'Partage direct non supporté par ce navigateur : le PDF a été téléchargé pour envoi manuel.'
      );
    }
  };

  const handlePrintA4 = () => {
    const win = window.open(pdf.objectUrl, '_blank');
    if (win) {
      win.addEventListener('load', () => {
        try {
          win.print();
        } catch {
          // L'utilisateur peut imprimer depuis la visionneuse PDF ouverte
        }
      });
    } else {
      window.print();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl h-[92vh] rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-5 h-5 text-[#0F294A] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-[#0F294A] truncate">
                Facture A4 · {sale.sale_number}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                {formatDateTime(sale.sale_date)} · {sale.user_name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Aperçu PDF A4 intégré + fallback visuel */}
        <div className="flex-1 bg-slate-100 overflow-y-auto p-3 sm:p-5 flex flex-col items-center">
          <iframe
            src={pdf.objectUrl}
            title={`Aperçu Facture ${sale.sale_number}`}
            className="hidden sm:block w-full h-full min-h-[460px] rounded-xl border border-slate-300 bg-white"
          />

          {/* Aperçu HTML structuré optimisé pour écrans mobiles où les iframes PDF sont parfois bloquées */}
          <div className="sm:hidden w-full rounded-xl bg-white border border-slate-200 p-5 space-y-4 text-sm">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                {settings.shop_logo_data_url && (
                  <img
                    src={settings.shop_logo_data_url}
                    alt="Logo commerce"
                    className="h-10 w-10 object-contain mb-2"
                  />
                )}
                <p className="font-bold text-[#0F294A] text-base">
                  {settings.shop_name || 'TSENAKELY'}
                </p>
                {settings.shop_address && (
                  <p className="text-xs text-slate-500">
                    {settings.shop_address}
                  </p>
                )}
                {settings.shop_phone && (
                  <p className="text-xs text-slate-500">
                    Tél : {settings.shop_phone}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="font-bold text-[#0F294A]">FACTURE</p>
                <p className="text-xs font-mono text-slate-700">
                  {sale.sale_number}
                </p>
                <p className="text-[11px] text-slate-500">
                  {formatDateTime(sale.sale_date)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {sale.details.map((d) => (
                <div
                  key={d.id}
                  className="flex justify-between gap-2 text-xs border-b border-slate-100 pb-1.5"
                >
                  <span>
                    {d.product_name} (×{d.quantity} ·{' '}
                    {formatAriary(d.unit_price, currency)})
                  </span>
                  <strong className="font-mono-num">
                    {formatAriary(d.subtotal, currency)}
                  </strong>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 rounded-xl p-3 space-y-1 text-xs">
              <div className="flex justify-between font-bold text-[#0F294A] text-sm">
                <span>Total à payer</span>
                <span className="font-mono-num">
                  {formatAriary(sale.total_amount, currency)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Montant reçu</span>
                <span className="font-mono-num">
                  {formatAriary(sale.amount_paid, currency)}
                </span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Monnaie rendue</span>
                <span className="font-mono-num">
                  {formatAriary(sale.change_given, currency)}
                </span>
              </div>
            </div>

            <p className="text-center text-xs font-semibold text-[#0F294A]">
              Merci pour votre achat !
            </p>
          </div>
        </div>

        {statusMsg && (
          <div className="px-5 py-2 bg-sky-50 border-t border-sky-200 text-xs font-medium text-[#0F294A]">
            {statusMsg}
          </div>
        )}

        <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={handleSharePdf}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Partager PDF</span>
          </button>
          <button
            type="button"
            onClick={handleSavePdf}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Enregistrer PDF</span>
          </button>
          <button
            type="button"
            onClick={handlePrintA4}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] inline-flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer facture A4</span>
          </button>
        </div>
      </div>
    </div>
  );
};
