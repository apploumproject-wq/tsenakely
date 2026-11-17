import React, {useState} from 'react';
import {Ban, CheckCircle2, FileText, Printer, X} from 'lucide-react';
import {tsenakelyDb} from '../db/database';
import type {AppSettings, SaleWithDetails, User} from '../db/types';
import {formatAriary, formatDateTime} from '../utils/format';
import {ConfirmDialog} from './ConfirmDialog';
import {InvoicePdfModal} from './InvoicePdfModal';
import {ThermalReceiptModal} from './ThermalReceiptModal';

interface SaleDetailModalProps {
  sale: SaleWithDetails | null;
  currentUser: User;
  settings: AppSettings;
  onClose: () => void;
  onSaleCancelled: () => void;
}

export const SaleDetailModal: React.FC<SaleDetailModalProps> = ({
  sale,
  currentUser,
  settings,
  onClose,
  onSaleCancelled,
}) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [showThermalModal, setShowThermalModal] = useState(false);

  if (!sale) return null;

  const currency = settings.currency || 'Ar';
  const isAdmin = currentUser.role === 'ADMIN';
  const isCompleted = sale.status === 'COMPLETED';

  const handleConfirmCancel = async () => {
    setError('');
    setCancelling(true);
    try {
      await tsenakelyDb.cancelSale(sale.id, currentUser, cancelReason);
      setConfirmOpen(false);
      setCancelReason('');
      onSaleCancelled();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de l'annulation."
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[#0F294A] font-mono">
                  {sale.sale_number}
                </h3>
                {isCompleted ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Validée
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                    <Ban className="w-3.5 h-3.5" />
                    Annulée
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatDateTime(sale.sale_date)} · Vendeur : {sale.user_name}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-5">
            {sale.status === 'CANCELLED' && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800 space-y-1">
                <p className="font-bold">Vente annulée (stock restauré)</p>
                <p>
                  Par : {sale.cancelled_by ?? 'Administrateur'} ·{' '}
                  {sale.cancelled_at ? formatDateTime(sale.cancelled_at) : ''}
                </p>
                {sale.cancel_reason && <p>Motif : {sale.cancel_reason}</p>}
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold text-slate-500 mb-2">
                Produits vendus ({sale.details.length})
              </h4>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3.5 py-2.5 font-semibold">
                        Produit
                      </th>
                      <th className="text-right px-3 py-2.5 font-semibold">
                        PU
                      </th>
                      <th className="text-right px-3 py-2.5 font-semibold">
                        Qté
                      </th>
                      <th className="text-right px-3.5 py-2.5 font-semibold">
                        Sous-total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sale.details.map((d) => (
                      <tr key={d.id}>
                        <td className="px-3.5 py-2.5 font-medium text-slate-900">
                          {d.product_name}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono-num text-slate-600">
                          {formatAriary(d.unit_price, currency)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono-num text-slate-700">
                          {d.quantity}
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono-num font-semibold text-slate-900">
                          {formatAriary(d.subtotal, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm">
              <div className="flex justify-between font-bold text-[#0F294A] text-base">
                <span>Montant total</span>
                <span className="font-mono-num">
                  {formatAriary(sale.total_amount, currency)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Montant payé</span>
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

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPdfModal(true)}
                className="min-h-[42px] px-3.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>Imprimer facture A4</span>
              </button>
              <button
                type="button"
                onClick={() => setShowThermalModal(true)}
                className="min-h-[42px] px-3.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer ticket thermique</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && isCompleted && (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="min-h-[42px] px-3.5 rounded-xl border border-red-300 bg-white text-xs font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Ban className="w-4 h-4" />
                  <span>Annuler</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 rounded-xl bg-[#0F294A] text-white text-xs font-semibold hover:bg-[#163A66] cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Annuler la vente ${sale.sale_number} ?`}
        message="Les quantités vendues seront automatiquement remises en stock et la trace d'annulation sera conservée dans l'historique."
        confirmLabel="Confirmer l’annulation"
        loading={cancelling}
        onConfirm={handleConfirmCancel}
        onCancel={() => setConfirmOpen(false)}
      >
        <div>
          <label
            htmlFor="cancel-reason-input"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            Motif de l’annulation (optionnel)
          </label>
          <input
            id="cancel-reason-input"
            type="text"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Ex. Erreur de saisie caissier"
            className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
          />
        </div>
      </ConfirmDialog>

      <InvoicePdfModal
        sale={showPdfModal ? sale : null}
        settings={settings}
        onClose={() => setShowPdfModal(false)}
      />

      <ThermalReceiptModal
        sale={showThermalModal ? sale : null}
        settings={settings}
        onClose={() => setShowThermalModal(false)}
      />
    </>
  );
};
