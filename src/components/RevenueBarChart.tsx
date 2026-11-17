import React, {useState} from 'react';
import type {DailySalesPoint} from '../db/types';
import {formatAriary} from '../utils/format';

interface RevenueBarChartProps {
  data: DailySalesPoint[];
  currency: string;
  emptyText?: string;
}

export const RevenueBarChart: React.FC<RevenueBarChartProps> = ({
  data,
  currency,
  emptyText = 'Aucune vente enregistrée sur cette période.',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const hasAnyRevenue = data.some((d) => d.revenue > 0);
  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1000);

  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="w-full">
      {!hasAnyRevenue && (
        <p className="mb-3 text-xs text-slate-500">
          Aucune vente validée pour l’instant sur cette plage. Les barres
          s’actualiseront dès la première vente.
        </p>
      )}
      <div className="relative h-56 flex items-end gap-1.5 sm:gap-2.5 pt-8 pb-6 border-b border-slate-200">
        {/* Lignes repères horizontales */}
        <div className="pointer-events-none absolute inset-x-0 top-8 bottom-6 flex flex-col justify-between">
          <div className="border-t border-dashed border-slate-200/80 w-full" />
          <div className="border-t border-dashed border-slate-200/80 w-full" />
          <div className="border-t border-dashed border-slate-200/80 w-full" />
        </div>

        {data.map((point, idx) => {
          const heightPct =
            point.revenue > 0
              ? Math.max(6, Math.round((point.revenue / maxRevenue) * 100))
              : 2;
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={point.date}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => setHoveredIdx(isHovered ? null : idx)}
              className="relative flex-1 h-full flex flex-col justify-end items-center group cursor-pointer"
            >
              {isHovered && (
                <div className="absolute -top-1 z-10 whitespace-nowrap rounded-lg bg-[#0F294A] px-2.5 py-1.5 text-[11px] font-medium text-white shadow-md pointer-events-none">
                  <div className="font-mono-num font-semibold">
                    {formatAriary(point.revenue, currency)}
                  </div>
                  <div className="text-sky-200 text-[10px]">
                    {point.count} vente{point.count > 1 ? 's' : ''} ·{' '}
                    {point.label}
                  </div>
                </div>
              )}
              <div
                style={{height: `${heightPct}%`}}
                className={`w-full max-w-[36px] rounded-t-lg transition-all duration-150 ${
                  point.revenue > 0
                    ? isHovered
                      ? 'bg-[#2563EB]'
                      : 'bg-[#0F294A] group-hover:bg-[#1D4ED8]'
                    : 'bg-slate-200'
                }`}
              />
              <span className="absolute -bottom-6 text-[10px] sm:text-[11px] text-slate-500 whitespace-nowrap truncate max-w-full">
                {data.length <= 14 || idx % Math.ceil(data.length / 8) === 0
                  ? point.label
                  : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
