import React, {useCallback, useEffect, useState} from 'react';
import {
  Ban,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  Printer,
  Search,
  X,
} from 'lucide-react';
import {ExcelExportPanel} from '../components/ExcelExportPanel';
import {tsenakelyDb} from '../db/database';
import type {AppSettings, SaleWithDetails} from '../db/types';
import {formatAriary, formatDateTime} from '../utils/format';

interface HistoryPageProps {
  settings: AppSettings;
  refreshKey: number;
  onInspectSale: (sale: SaleWithDetails) => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  settings,
  refreshKey,
  onInspectSale,
}) => {
  const [sales, setSales] = useState<SaleWithDetails[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'COMPLETED' | 'CANCELLED'
  >('ALL');
  const [loading, setLoading] = useState(true);
  const [showExcelModal, setShowExcelModal] = useState(false);

  const currency = settings.currency || 'Ar';

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const list = await tsenakelyDb.getSales({
        search,
        status: statusFilter,
      });
      setSales(list);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    loadSales();
  }, [loadSales, refreshKey]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F294A] tracking-tight">
            Historique des ventes
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Consultez, réimprimez en A4/thermique ou exportez vos ventes vers
            Excel.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <div className="relative sm:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° vente ou vendeur..."
              className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#0F294A]"
            />
          </div>

          <div className="inline-flex items-center p-1 bg-slate-200/70 rounded-xl self-start">
            {(
              [
                ['ALL', 'Toutes'],
                ['COMPLETED', 'Validées'],
                ['CANCELLED', 'Annulées'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === key
                    ? 'bg-white text-[#0F294A] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowExcelModal(true)}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0F294A] text-white text-xs font-semibold hover:bg-[#163A66] inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#38BDF8]" />
            <span>Exporter les ventes Excel</span>
          </button>
        </div>
      </div>

      {loading && sales.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
          Chargement de l’historique...
        </div>
      ) : sales.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center">
          <p className="text-sm font-semibold text-slate-700">
            Aucune vente correspondante
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Les ventes validées depuis l’onglet Vente apparaîtront ici.
          </p>
        </div>
      ) : (
        <>
          {/* Vue Tableau Desktop */}
          <div className="hidden md:block rounded-2xl bg-white border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-5 py-3.5 font-semibold">
                      N° Vente
                    </th>
                    <th className="text-left px-4 py-3.5 font-semibold">
                      Date et heure
                    </th>
                    <th className="text-left px-4 py-3.5 font-semibold">
                      Vendeur
                    </th>
                    <th className="text-left px-4 py-3.5 font-semibold">
                      Produits
                    </th>
                    <th className="text-right px-4 py-3.5 font-semibold">
                      Total
                    </th>
                    <th className="text-right px-4 py-3.5 font-semibold">
                      Payé
                    </th>
                    <th className="text-right px-4 py-3.5 font-semibold">
                      Monnaie
                    </th>
                    <th className="text-left px-4 py-3.5 font-semibold">
                      Statut
                    </th>
                    <th className="text-right px-5 py-3.5 font-semibold">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sales.map((sale) => (
                    <tr
                      key={sale.id}
                      onClick={() => onInspectSale(sale)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-3.5 font-mono text-xs font-bold text-[#0F294A] whitespace-nowrap">
                        {sale.sale_number}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap font-mono-num">
                        {formatDateTime(sale.sale_date)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-800 font-medium whitespace-nowrap">
                        {sale.user_name}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600 max-w-xs truncate">
                        {sale.details
                          .map((d) => `${d.product_name} (×${d.quantity})`)
                          .join(', ')}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-num font-bold text-slate-900 whitespace-nowrap">
                        {formatAriary(sale.total_amount, currency)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-num text-slate-600 whitespace-nowrap">
                        {formatAriary(sale.amount_paid, currency)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-num text-emerald-700 font-medium whitespace-nowrap">
                        {formatAriary(sale.change_given, currency)}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {sale.status === 'COMPLETED' ? (
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
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectSale(sale);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F294A] hover:text-[#2563EB] cursor-pointer"
                            title="Réimprimer ou voir détails"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Réimprimer</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onInspectSale(sale);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:text-[#0F294A] cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Voir</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Vue Cartes Mobile */}
          <div className="md:hidden space-y-3">
            {sales.map((sale) => (
              <button
                key={sale.id}
                type="button"
                onClick={() => onInspectSale(sale)}
                className="w-full text-left rounded-2xl bg-white border border-slate-200 p-4 space-y-2.5 active:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#0F294A]">
                    {sale.sale_number}
                  </span>
                  {sale.status === 'COMPLETED' ? (
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

                <p className="text-xs text-slate-500">
                  {formatDateTime(sale.sale_date)} · {sale.user_name}
                </p>

                <p className="text-xs text-slate-700 line-clamp-2">
                  {sale.details
                    .map((d) => `${d.product_name} ×${d.quantity}`)
                    .join(', ')}
                </p>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-mono-num">
                    Payé : {formatAriary(sale.amount_paid, currency)} · Rendu :{' '}
                    {formatAriary(sale.change_given, currency)}
                  </span>
                  <span className="text-sm font-bold text-[#0F294A] font-mono-num">
                    {formatAriary(sale.total_amount, currency)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Modale Exportation Excel depuis l'Historique */}
      {showExcelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl relative">
            <button
              type="button"
              onClick={() => setShowExcelModal(false)}
              className="absolute right-3 top-3 z-10 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 cursor-pointer"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
            <ExcelExportPanel settings={settings} />
          </div>
        </div>
      )}
    </div>
  );
};
