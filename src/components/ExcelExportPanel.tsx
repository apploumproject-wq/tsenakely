import React, {useState} from 'react';
import {Calendar, CheckCircle2, FileSpreadsheet, Share2} from 'lucide-react';
import type {AppSettings, ExportPeriod} from '../db/types';
import {
  generateSalesExcelWorkbook,
  type GeneratedExcelExport,
} from '../utils/excelExport';
import {saveBlobToUserDevice, shareBlobFile} from '../utils/fileActions';
import {toLocalDateInputValue} from '../utils/format';

interface ExcelExportPanelProps {
  settings: AppSettings;
}

const EXPORT_PERIODS: Array<{key: ExportPeriod; label: string}> = [
  {key: 'all', label: 'Toutes les ventes'},
  {key: 'today', label: 'Ventes du jour'},
  {key: 'yesterday', label: "Ventes d'hier"},
  {key: 'week', label: 'Ventes de la semaine'},
  {key: 'month', label: 'Ventes du mois'},
  {key: 'year', label: "Ventes de l'année"},
  {key: 'custom', label: 'Période personnalisée'},
];

export const ExcelExportPanel: React.FC<ExcelExportPanelProps> = ({
  settings,
}) => {
  const todayStr = toLocalDateInputValue(new Date());
  const [period, setPeriod] = useState<ExportPeriod>('all');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [busy, setBusy] = useState(false);
  const [lastExport, setLastExport] = useState<GeneratedExcelExport | null>(
    null
  );
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const handleExportExcel = async () => {
    setFeedback(null);
    setBusy(true);
    try {
      const generated = await generateSalesExcelWorkbook(
        period,
        settings,
        startDate,
        endDate
      );
      setLastExport(generated);
      const saveRes = await saveBlobToUserDevice(
        generated.blob,
        generated.filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Classeur Excel (.xlsx)',
        '.xlsx'
      );
      setFeedback({
        type: 'success',
        text:
          saveRes.method === 'picker'
            ? `Fichier Excel enregistré (${generated.filename}) · ${generated.salesCount} vente(s), 4 feuilles générées.`
            : `Fichier Excel téléchargé (${generated.filename}) · ${generated.salesCount} vente(s), 4 feuilles générées.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Erreur lors de la génération Excel (.xlsx).',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleShareExcel = async () => {
    setFeedback(null);
    setBusy(true);
    try {
      const generated =
        lastExport ??
        (await generateSalesExcelWorkbook(
          period,
          settings,
          startDate,
          endDate
        ));
      setLastExport(generated);

      const res = await shareBlobFile(
        generated.blob,
        generated.filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        `Export ventes ${settings.shop_name || 'TSENAKELY'}`,
        `Classeur Excel des ventes (${generated.periodLabel})`
      );

      if (res === 'shared') {
        setFeedback({
          type: 'success',
          text: `Fichier ${generated.filename} partagé avec succès.`,
        });
      } else if (res === 'unsupported') {
        await saveBlobToUserDevice(
          generated.blob,
          generated.filename,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Classeur Excel (.xlsx)',
          '.xlsx'
        );
        setFeedback({
          type: 'success',
          text: `Partage direct non supporté sur ce navigateur : ${generated.filename} a été téléchargé pour transfert.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de partager le fichier Excel.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-[#0F294A]">
            Exportation Excel professionnelle (.xlsx)
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
            Génère un véritable classeur Excel à 4 feuilles (Historique des
            ventes, Résumé des ventes, Produits vendus, Stock) avec en-têtes
            figés, filtres et totaux automatiques. Fonctionne 100 % hors ligne.
          </p>
        </div>
      </div>

      {/* Filtres de période */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-700">
          Période à exporter
        </p>
        <div className="flex flex-wrap gap-1.5">
          {EXPORT_PERIODS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setPeriod(opt.key);
                setLastExport(null);
              }}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                period === opt.key
                  ? 'bg-[#0F294A] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label
              htmlFor="xlsx-start"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Date de début
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="xlsx-start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setLastExport(null);
                }}
                className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="xlsx-end"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Date de fin
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="xlsx-end"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setLastExport(null);
                }}
                className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#0F294A]"
              />
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-xs font-medium border flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {feedback.type === 'success' && (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={handleExportExcel}
          className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0F294A] text-white text-sm font-semibold hover:bg-[#163A66] inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>
            {busy ? 'Génération...' : 'Exporter les ventes Excel (.xlsx)'}
          </span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={handleShareExcel}
          className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          <Share2 className="w-4 h-4" />
          <span>Partager le fichier Excel</span>
        </button>
      </div>
    </div>
  );
};
