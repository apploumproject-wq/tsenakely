import React, {useCallback, useEffect, useState} from 'react';
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  Boxes,
  Package,
  PackageX,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import {AppFooterSignature} from '../components/AppFooterSignature';
import {RevenueBarChart} from '../components/RevenueBarChart';
import {tsenakelyDb} from '../db/database';
import type {
  AppSettings,
  DashboardSummary,
  NavTab,
  SaleWithDetails,
} from '../db/types';
import {formatAriary, formatDateTime, formatNumber} from '../utils/format';

interface DashboardPageProps {
  settings: AppSettings;
  refreshKey: number;
  onNavigate: (tab: NavTab) => void;
  onInspectSale: (sale: SaleWithDetails) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  settings,
  refreshKey,
  onNavigate,
  onInspectSale,
}) => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tsenakelyDb.getDashboardSummary();
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  const currency = settings.currency || 'Ar';

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({length: 6}).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const statCards = [
    {
      label: "Chiffre d'affaires du jour",
      value: formatAriary(summary.todayRevenue, currency),
      sub: "Total des ventes validées aujourd'hui",
      icon: Banknote,
      tone: 'bg-sky-50 text-[#0F294A]',
    },
    {
      label: 'Nombre de ventes du jour',
      value: formatNumber(summary.todaySalesCount),
      sub:
        summary.todaySalesCount > 1
          ? 'Transactions validées'
          : 'Transaction validée',
      icon: ShoppingBag,
      tone: 'bg-sky-50 text-[#2563EB]',
    },
    {
      label: 'Nombre total de produits',
      value: formatNumber(summary.totalProducts),
      sub: 'Articles enregistrés au catalogue',
      icon: Package,
      tone: 'bg-slate-100 text-[#0F294A]',
    },
    {
      label: 'Stock disponible',
      value: `${formatNumber(summary.totalStockUnits)} unités`,
      sub: 'Quantité totale en inventaire',
      icon: Boxes,
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Produits en rupture de stock',
      value: formatNumber(summary.outOfStockCount),
      sub:
        summary.outOfStockCount === 0
          ? 'Aucune rupture signalée'
          : 'Réapprovisionnement urgent',
      icon: PackageX,
      tone:
        summary.outOfStockCount > 0
          ? 'bg-red-50 text-red-700'
          : 'bg-slate-100 text-slate-600',
    },
    {
      label: 'Produits avec stock faible',
      value: formatNumber(summary.lowStockCount),
      sub:
        summary.lowStockCount === 0
          ? 'Niveaux de stock corrects'
          : 'Sous ou égal au seuil minimum',
      icon: AlertCircle,
      tone:
        summary.lowStockCount > 0
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-600',
    },
  ];

  const todayFormatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  return (
    <div className="space-y-6">
      {/* En-tête Tableau de bord */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F294A] tracking-tight">
            Tableau de bord
          </h1>
          <p className="mt-0.5 text-sm text-slate-600 capitalize">
            {todayFormatted}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('vente')}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>Nouvelle vente</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Cartes statistiques principales */}
      <section aria-label="Indicateurs clés">
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="rounded-2xl bg-white border border-slate-200 p-3 sm:p-5 flex items-start justify-between gap-2 sm:gap-4 min-w-0"
              >
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-medium text-slate-500 leading-snug min-h-[2.25rem] sm:min-h-0">
                    {card.label}
                  </p>
                  <p className="mt-1 sm:mt-2 text-lg sm:text-2xl font-bold text-slate-900 font-mono-num truncate">
                    {card.value}
                  </p>
                  <p className="mt-1 text-[10px] sm:text-xs text-slate-500 leading-snug">{card.sub}</p>
                </div>
                <div
                  className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl shrink-0 flex items-center justify-center ${card.tone}`}
                >
                  <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Alerte stock faible / rupture si activée */}
      {settings.low_stock_alert_enabled && summary.alertProducts.length > 0 && (
        <section className="rounded-2xl bg-white border border-amber-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Alertes de stock ({summary.alertProducts.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-600">
                  {summary.alertProducts
                    .map(
                      (p) =>
                        `${p.name} (${
                          p.stock_qty === 0
                            ? 'Rupture'
                            : `${p.stock_qty} restant${p.stock_qty > 1 ? 's' : ''}`
                        })`
                    )
                    .join(' · ')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('parametres')}
              className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-[#0F294A] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Gérer les stocks
            </button>
          </div>
        </section>
      )}

      {/* Graphique des 7 derniers jours */}
      <section className="rounded-2xl bg-white border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-5 h-5 text-[#2563EB]" />
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Évolution des ventes (7 derniers jours)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('statistiques')}
            className="text-xs font-semibold text-[#2563EB] hover:text-[#0F294A] whitespace-nowrap cursor-pointer"
          >
            Voir statistiques détaillées
          </button>
        </div>
        <RevenueBarChart data={summary.last7Days} currency={currency} />
      </section>

      {/* Dernières ventes & Produits les plus vendus */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold text-slate-900">
              Dernières ventes
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('historique')}
              className="text-xs font-semibold text-[#2563EB] hover:text-[#0F294A] whitespace-nowrap cursor-pointer"
            >
              Tout voir
            </button>
          </div>

          {summary.recentSales.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">
                Aucune vente enregistrée pour le moment.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('vente')}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F294A] hover:underline cursor-pointer"
              >
                Enregistrer une première vente
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {summary.recentSales.map((sale) => (
                <button
                  key={sale.id}
                  type="button"
                  onClick={() => onInspectSale(sale)}
                  className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 -mx-2 px-2 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="font-mono text-xs text-[#0F294A]">
                        {sale.sale_number}
                      </span>
                      {sale.status === 'CANCELLED' && (
                        <span className="text-xs font-medium text-red-600">
                          · Annulée
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 truncate">
                      {formatDateTime(sale.sale_date)} · {sale.user_name} ·{' '}
                      {sale.details.reduce((s, d) => s + d.quantity, 0)} art.
                    </p>
                  </div>
                  <span
                    className={`font-mono-num text-sm font-bold shrink-0 ${
                      sale.status === 'CANCELLED'
                        ? 'text-slate-400 line-through'
                        : 'text-[#0F294A]'
                    }`}
                  >
                    {formatAriary(sale.total_amount, currency)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold text-slate-900">
              Produits les plus vendus
            </h2>
            <span className="text-xs text-slate-500">Cumul réel</span>
          </div>

          {summary.topProducts.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">
                Les classements apparaîtront dès les premières ventes validées.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {summary.topProducts.map((item, idx) => (
                <div key={item.product_name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-slate-400 w-5">
                        0{idx + 1}
                      </span>
                      <span className="font-medium text-slate-900 truncate">
                        {item.product_name}
                      </span>
                    </div>
                    <div className="shrink-0 text-right font-mono-num">
                      <span className="text-xs font-semibold text-[#0F294A]">
                        {formatNumber(item.total_qty)} vendu
                        {item.total_qty > 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-slate-400 mx-1.5">·</span>
                      <span className="text-xs font-medium text-slate-600">
                        {formatAriary(item.total_revenue, currency)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#0F294A]"
                      style={{width: `${Math.max(4, item.share_percent)}%`}}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Signature officielle App Loum Project en bas de la page d'accueil */}
      <AppFooterSignature className="mt-4" />
    </div>
  );
};
