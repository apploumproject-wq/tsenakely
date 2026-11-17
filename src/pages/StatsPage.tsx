import React, {useCallback, useEffect, useState} from 'react';
import {
  Award,
  BarChart3,
  Banknote,
  Calendar,
  PackageCheck,
  Receipt,
  ShoppingBag,
} from 'lucide-react';
import {RevenueBarChart} from '../components/RevenueBarChart';
import {tsenakelyDb} from '../db/database';
import type {AppSettings, StatisticsSummary, StatsPeriod} from '../db/types';
import {
  formatAriary,
  formatNumber,
  getPeriodBounds,
  toLocalDateInputValue,
} from '../utils/format';

interface StatsPageProps {
  settings: AppSettings;
  refreshKey: number;
}

const PERIOD_OPTIONS: Array<{key: StatsPeriod; label: string}> = [
  {key: 'today', label: "Aujourd'hui"},
  {key: 'yesterday', label: 'Hier'},
  {key: 'week', label: 'Cette semaine'},
  {key: 'month', label: 'Ce mois'},
  {key: 'year', label: 'Cette année'},
  {key: 'custom', label: 'Personnalisée'},
];

export const StatsPage: React.FC<StatsPageProps> = ({
  settings,
  refreshKey,
}) => {
  const todayStr = toLocalDateInputValue(new Date());
  const [period, setPeriod] = useState<StatsPeriod>('today');
  const [customStart, setCustomStart] = useState(todayStr);
  const [customEnd, setCustomEnd] = useState(todayStr);
  const [stats, setStats] = useState<StatisticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const currency = settings.currency || 'Ar';
  const bounds = getPeriodBounds(period, customStart, customEnd);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await tsenakelyDb.getStatistics(
        bounds.startIso,
        bounds.endIso
      );
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, [bounds.startIso, bounds.endIso]);

  useEffect(() => {
    loadStats();
  }, [loadStats, refreshKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0F294A] tracking-tight">
            Statistiques détaillées
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            Indicateurs calculés uniquement sur les ventes validées · Période :{' '}
            <span className="font-semibold text-[#0F294A]">{bounds.label}</span>
          </p>
        </div>

        {/* Filtres de période */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-2xl w-fit max-w-full">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPeriod(opt.key)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                period === opt.key
                  ? 'bg-[#0F294A] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="flex-1">
              <label
                htmlFor="stats-start-date"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Date de début
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="stats-start-date"
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                />
              </div>
            </div>
            <div className="flex-1">
              <label
                htmlFor="stats-end-date"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Date de fin
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="stats-end-date"
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && !stats ? (
        <div className="h-40 rounded-2xl bg-white border border-slate-200 animate-pulse" />
      ) : (
        stats && (
          <>
            {/* 4 KPI principaux */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-white border border-slate-200 p-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Chiffre d’affaires
                  </p>
                  <p className="mt-2 text-2xl font-bold text-[#0F294A] font-mono-num">
                    {formatAriary(stats.totalRevenue, currency)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-[#0F294A] flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5" />
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200 p-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Nombre de ventes
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 font-mono-num">
                    {formatNumber(stats.salesCount)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-sky-50 text-[#2563EB] flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-5 h-5" />
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200 p-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Quantité vendue
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 font-mono-num">
                    {formatNumber(stats.totalItemsSold)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <PackageCheck className="w-5 h-5" />
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-slate-200 p-5 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Panier moyen
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 font-mono-num">
                    {formatAriary(stats.averageBasket, currency)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-[#0F294A] flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Évolution du chiffre d'affaires */}
            <section className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
              <div className="flex items-center gap-2.5 mb-4">
                <BarChart3 className="w-5 h-5 text-[#2563EB]" />
                <h2 className="text-base font-bold text-slate-900">
                  Évolution du chiffre d’affaires
                </h2>
              </div>
              <RevenueBarChart data={stats.revenueSeries} currency={currency} />
            </section>

            {/* Répartition & Classements produits */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Produits les plus vendus + Répartition */}
              <section className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
                <div className="flex items-center gap-2.5 mb-4">
                  <Award className="w-5 h-5 text-[#0F294A]" />
                  <h2 className="text-base font-bold text-slate-900">
                    Produits les plus vendus & Répartition
                  </h2>
                </div>

                {stats.topProducts.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    Aucune vente enregistrée sur cette période.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {stats.topProducts.map((item) => (
                      <div key={item.product_name} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-semibold text-slate-900 truncate">
                            {item.product_name}
                          </span>
                          <span className="shrink-0 font-mono-num text-xs text-slate-600">
                            {formatNumber(item.total_qty)} u. ·{' '}
                            <strong className="text-[#0F294A]">
                              {formatAriary(item.total_revenue, currency)}
                            </strong>{' '}
                            ({item.share_percent}%)
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#2563EB]"
                            style={{
                              width: `${Math.max(4, item.share_percent)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Produits les moins vendus */}
              <section className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">
                  Produits les moins vendus
                </h2>

                {stats.leastSoldProducts.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    Aucun produit au catalogue.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {stats.leastSoldProducts.map((item) => (
                      <div
                        key={item.product_name}
                        className="py-3 flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="font-medium text-slate-800 truncate">
                          {item.product_name}
                        </span>
                        <span className="shrink-0 font-mono-num text-xs text-slate-600">
                          {formatNumber(item.total_qty)} vendu
                          {item.total_qty > 1 ? 's' : ''} ·{' '}
                          {formatAriary(item.total_revenue, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )
      )}
    </div>
  );
};
