import React, {useEffect, useState} from 'react';
import {
  Bluetooth,
  Download,
  Printer,
  Usb,
  WifiOff,
  X,
} from 'lucide-react';
import type {AppSettings, SaleWithDetails} from '../db/types';
import {saveBlobToUserDevice} from '../utils/fileActions';
import {formatAriary, formatDateTime} from '../utils/format';
import {
  buildEscPosReceipt,
  printThermalHtmlWindow,
  thermalPrinter,
  type PrinterConnectionStatus,
} from '../utils/thermalPrinter';

interface ThermalReceiptModalProps {
  sale: SaleWithDetails | null;
  settings: AppSettings;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  sale,
  settings,
  onClose,
}) => {
  const [connStatus, setConnStatus] = useState<PrinterConnectionStatus>(
    thermalPrinter.getStatus()
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    return thermalPrinter.subscribe(setConnStatus);
  }, []);

  if (!sale) return null;

  const currency = settings.currency || 'Ar';
  const is80 = settings.printer_paper_width === '80';

  const handleConnectBt = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const name = await thermalPrinter.connectBluetooth();
      setMessage({type: 'success', text: `Connecté à ${name}.`});
    } catch (err) {
      setMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de connecter l’imprimante Bluetooth.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConnectUsb = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const name = await thermalPrinter.connectUsb();
      setMessage({type: 'success', text: `Connecté à ${name} (USB).`});
    } catch (err) {
      setMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Impossible de connecter l’imprimante USB.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDirectEscPosPrint = async () => {
    setMessage(null);
    setBusy(true);
    try {
      await thermalPrinter.printSaleReceipt(sale, settings);
      setMessage({
        type: 'success',
        text: `Ticket ${sale.sale_number} envoyé à l’imprimante (${settings.printer_paper_width} mm).`,
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Imprimante déconnectée ou indisponible.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadEscPosBin = async () => {
    const bytes = buildEscPosReceipt(
      sale,
      settings,
      settings.printer_paper_width
    );
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    await saveBlobToUserDevice(
      new Blob([copy.buffer], {type: 'application/octet-stream'}),
      `Ticket-${sale.sale_number}-${settings.printer_paper_width}mm.bin`,
      'application/octet-stream',
      'Trame brute ESC/POS',
      '.bin'
    );
    setMessage({
      type: 'success',
      text: 'Fichier brut ESC/POS (.bin) enregistré.',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl max-h-[92vh] rounded-2xl bg-white border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-[#0F294A]">
              Ticket thermique · {settings.printer_paper_width} mm
            </h3>
            <p className="text-xs text-slate-500">
              {connStatus.connected
                ? `Imprimante connectée : ${connStatus.deviceName} (${connStatus.mode})`
                : 'Aucune imprimante Bluetooth/USB connectée'}
            </p>
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

        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-6 space-y-4">
          {/* Aperçu fidèle du ticket thermique 58 mm ou 80 mm */}
          <div
            className={`mx-auto bg-white border border-slate-300 shadow-xs p-4 font-mono text-slate-900 ${
              is80 ? 'max-w-[340px] text-xs' : 'max-w-[260px] text-[11px]'
            }`}
          >
            <div className="text-center font-bold text-sm">
              {(settings.shop_name || 'TSENAKELY').toUpperCase()}
            </div>
            {settings.shop_address && (
              <div className="text-center text-[10px]">
                {settings.shop_address}
              </div>
            )}
            {settings.shop_phone && (
              <div className="text-center text-[10px]">
                Tél : {settings.shop_phone}
              </div>
            )}
            <div className="border-t border-dashed border-slate-400 my-2" />
            <div>Ticket : {sale.sale_number}</div>
            <div>Date : {formatDateTime(sale.sale_date)}</div>
            <div>Vendeur : {sale.user_name}</div>
            {sale.status === 'CANCELLED' && (
              <div className="font-bold text-red-700 mt-1">
                *** VENTE ANNULÉE ***
              </div>
            )}
            <div className="border-t border-dashed border-slate-400 my-2" />

            <div className="space-y-1.5">
              {sale.details.map((d) => (
                <div key={d.id}>
                  <div className="font-semibold">{d.product_name}</div>
                  <div className="flex justify-between">
                    <span>
                      {d.quantity} × {formatAriary(d.unit_price, currency)}
                    </span>
                    <span className="font-bold">
                      {formatAriary(d.subtotal, currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-slate-800 my-2" />
            <div className="flex justify-between font-bold text-xs">
              <span>TOTAL</span>
              <span>{formatAriary(sale.total_amount, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Payé</span>
              <span>{formatAriary(sale.amount_paid, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Monnaie</span>
              <span>{formatAriary(sale.change_given, currency)}</span>
            </div>
            <div className="border-t border-dashed border-slate-400 my-2" />
            <div className="text-center font-bold">
              Merci pour votre achat !
            </div>
            {settings.receipt_footer &&
              settings.receipt_footer.trim().toLowerCase() !==
                'merci pour votre achat !' && (
                <div className="text-center text-[10px] mt-1">
                  {settings.receipt_footer}
                </div>
              )}
          </div>

          {!connStatus.connected && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <WifiOff className="w-4 h-4 shrink-0" />
                <span>
                  Imprimante déconnectée ou non appairée dans cette session
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConnectBt}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-amber-300 font-semibold text-[#0F294A] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Bluetooth className="w-3.5 h-3.5" />
                  <span>Connecter Bluetooth</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConnectUsb}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-amber-300 font-semibold text-[#0F294A] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Usb className="w-3.5 h-3.5" />
                  <span>Connecter USB</span>
                </button>
              </div>
            </div>
          )}

          {message && (
            <div
              className={`rounded-xl p-3 text-xs font-medium border ${
                message.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Fermer
          </button>
          <button
            type="button"
            onClick={handleDownloadEscPosBin}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>ESC/POS (.bin)</span>
          </button>
          <button
            type="button"
            onClick={() => printThermalHtmlWindow(sale, settings)}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-[#0F294A] hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Impression système ({settings.printer_paper_width} mm)</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleDirectEscPosPrint}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0F294A] text-white text-xs font-semibold hover:bg-[#163A66] inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer ticket thermique</span>
          </button>
        </div>
      </div>
    </div>
  );
};
