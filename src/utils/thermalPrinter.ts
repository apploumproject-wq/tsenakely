import type {
  AppSettings,
  PrinterConnectionMode,
  PrinterPaperWidth,
  SaleWithDetails,
} from '../db/types';
import {formatAriary, formatDateTime} from './format';

/**
 * Encodage ESC/POS binaire réel pour imprimantes thermiques 58 mm (32 col.) et 80 mm (48 col.).
 * Supporte Web Bluetooth (BLE GATT), WebUSB et impression thermique système.
 */

const ESC = 0x1b;
const GS = 0x1d;

// Services GATT fréquents sur imprimantes thermiques Bluetooth BLE
const BLE_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
];

const CP858_MAP: Record<string, number> = {
  é: 0x82,
  è: 0x8a,
  ê: 0x88,
  ë: 0x89,
  à: 0x85,
  â: 0x83,
  ä: 0x84,
  ç: 0x87,
  î: 0x8c,
  ï: 0x8b,
  ô: 0x93,
  ö: 0x94,
  ù: 0x97,
  û: 0x96,
  ü: 0x81,
  É: 0x90,
  È: 0x45,
  À: 0x41,
  Ç: 0x80,
  '€': 0xd5,
  '°': 0xf8,
};

function encodeTextCp858(text: string): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    if (CP858_MAP[ch] !== undefined) {
      bytes.push(CP858_MAP[ch]);
    } else {
      const code = ch.charCodeAt(0);
      if (code >= 0x20 && code <= 0x7e) {
        bytes.push(code);
      } else if (ch === '\n') {
        bytes.push(0x0a);
      } else {
        // Normalisation ASCII sans diacritique pour tout caractère étendu non mappé
        const norm = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const c = norm.charCodeAt(0);
        bytes.push(c >= 0x20 && c <= 0x7e ? c : 0x3f);
      }
    }
  }
  return bytes;
}

function padRow(left: string, right: string, cols: number): string {
  const cleanLeft = left.trim();
  const cleanRight = right.trim();
  const space = cols - cleanLeft.length - cleanRight.length;
  if (space >= 1) {
    return `${cleanLeft}${' '.repeat(space)}${cleanRight}`;
  }
  const maxLeft = Math.max(4, cols - cleanRight.length - 1);
  return `${cleanLeft.slice(0, maxLeft)} ${cleanRight}`;
}

export function buildEscPosReceipt(
  sale: SaleWithDetails,
  settings: AppSettings,
  paperWidth: PrinterPaperWidth
): Uint8Array {
  const cols = paperWidth === '80' ? 48 : 32;
  const currency = settings.currency || 'Ar';
  const sep = '-'.repeat(cols);
  const dblSep = '='.repeat(cols);

  const out: number[] = [];
  const push = (...vals: number[]) => out.push(...vals);
  const line = (txt = '') => push(...encodeTextCp858(`${txt}\n`));

  // Init + sélection page de codes CP858 (Europe occidentale)
  push(ESC, 0x40);
  push(ESC, 0x74, 19);

  // En-tête centré en gras double taille
  push(ESC, 0x61, 1); // Centré
  push(ESC, 0x45, 1); // Gras ON
  push(GS, 0x21, 0x11); // Double largeur & hauteur
  line((settings.shop_name || 'TSENAKELY').toUpperCase());
  push(GS, 0x21, 0x00); // Taille normale
  push(ESC, 0x45, 0); // Gras OFF

  if (settings.shop_address) line(settings.shop_address);
  if (settings.shop_phone) line(`Tel : ${settings.shop_phone}`);
  line(sep);

  // Métadonnées vente à gauche
  push(ESC, 0x61, 0);
  line(`Ticket  : ${sale.sale_number}`);
  line(`Date    : ${formatDateTime(sale.sale_date)}`);
  line(`Vendeur : ${sale.user_name}`);
  if (sale.status === 'CANCELLED') {
    push(ESC, 0x45, 1);
    line('*** VENTE ANNULEE ***');
    push(ESC, 0x45, 0);
  }
  line(sep);

  // Articles
  for (const item of sale.details) {
    line(item.product_name);
    const leftPart = `  ${item.quantity} x ${formatAriary(
      item.unit_price,
      currency
    )}`;
    const rightPart = formatAriary(item.subtotal, currency);
    line(padRow(leftPart, rightPart, cols));
  }

  line(dblSep);

  // Totaux
  push(ESC, 0x45, 1);
  line(padRow('TOTAL', formatAriary(sale.total_amount, currency), cols));
  push(ESC, 0x45, 0);
  line(padRow('Paye', formatAriary(sale.amount_paid, currency), cols));
  line(padRow('Monnaie', formatAriary(sale.change_given, currency), cols));
  line(sep);

  // Remerciement centré
  push(ESC, 0x61, 1);
  push(ESC, 0x45, 1);
  line('Merci pour votre achat !');
  push(ESC, 0x45, 0);
  if (
    settings.receipt_footer &&
    settings.receipt_footer.trim().toLowerCase() !== 'merci pour votre achat !'
  ) {
    line(settings.receipt_footer.trim());
  }

  line('');
  line('');
  line('');

  // Coupe papier partielle (GS V 66 0)
  push(GS, 0x56, 0x42, 0x00);

  return new Uint8Array(out);
}

export function buildEscPosTestTicket(
  settings: AppSettings,
  paperWidth: PrinterPaperWidth
): Uint8Array {
  const sampleSale: SaleWithDetails = {
    id: 0,
    sale_number: 'TEST-IMPRESSION',
    sale_date: new Date().toISOString(),
    user_id: 0,
    user_name: 'Test Système',
    total_amount: 3000,
    amount_paid: 5000,
    change_given: 2000,
    status: 'COMPLETED',
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
    details: [
      {
        id: 1,
        sale_id: 0,
        product_id: 1,
        product_name: `Test papier ${paperWidth} mm`,
        unit_price: 3000,
        quantity: 1,
        subtotal: 3000,
      },
    ],
  };
  return buildEscPosReceipt(sampleSale, settings, paperWidth);
}

// Interfaces Web Bluetooth / WebUSB minimales pour typage strict
interface BleCharacteristicLike {
  properties: {write: boolean; writeWithoutResponse: boolean};
  writeValueWithResponse?: (val: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (val: BufferSource) => Promise<void>;
  writeValue?: (val: BufferSource) => Promise<void>;
}

interface BleDeviceLike {
  id: string;
  name?: string;
  gatt?: {
    connected: boolean;
    connect: () => Promise<{
      getPrimaryServices: () => Promise<
        Array<{
          getCharacteristics: () => Promise<BleCharacteristicLike[]>;
        }>
      >;
    }>;
    disconnect: () => void;
  };
  addEventListener: (event: string, cb: () => void) => void;
}

interface UsbDeviceLike {
  productName?: string;
  manufacturerName?: string;
  opened: boolean;
  configuration?: {
    configurationValue: number;
    interfaces: Array<{
      interfaceNumber: number;
      alternates: Array<{
        interfaceClass: number;
        endpoints: Array<{direction: string; endpointNumber: number}>;
      }>;
    }>;
  };
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (num: number) => Promise<void>;
  claimInterface: (num: number) => Promise<void>;
  transferOut: (endpointNumber: number, data: BufferSource) => Promise<unknown>;
}

export interface PrinterConnectionStatus {
  connected: boolean;
  mode: PrinterConnectionMode | null;
  deviceName: string;
}

class ThermalPrinterManager {
  private bleDevice: BleDeviceLike | null = null;
  private bleChar: BleCharacteristicLike | null = null;
  private usbDevice: UsbDeviceLike | null = null;
  private usbInterfaceNum = 0;
  private usbEndpointOut = 1;
  private listeners = new Set<(status: PrinterConnectionStatus) => void>();

  subscribe(cb: (status: PrinterConnectionStatus) => void): () => void {
    this.listeners.add(cb);
    cb(this.getStatus());
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    const status = this.getStatus();
    for (const cb of this.listeners) cb(status);
  }

  getStatus(): PrinterConnectionStatus {
    if (this.bleDevice?.gatt?.connected && this.bleChar) {
      return {
        connected: true,
        mode: 'BLUETOOTH',
        deviceName: this.bleDevice.name || 'Imprimante Bluetooth',
      };
    }
    if (this.usbDevice?.opened) {
      return {
        connected: true,
        mode: 'USB',
        deviceName:
          this.usbDevice.productName ||
          this.usbDevice.manufacturerName ||
          'Imprimante USB',
      };
    }
    return {connected: false, mode: null, deviceName: ''};
  }

  isBluetoothSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'bluetooth' in navigator &&
      typeof (navigator as unknown as {bluetooth?: {requestDevice?: unknown}})
        .bluetooth?.requestDevice === 'function'
    );
  }

  isUsbSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'usb' in navigator &&
      typeof (navigator as unknown as {usb?: {requestDevice?: unknown}}).usb
        ?.requestDevice === 'function'
    );
  }

  async connectBluetooth(): Promise<string> {
    if (!this.isBluetoothSupported()) {
      throw new Error(
        "Web Bluetooth n'est pas disponible dans ce navigateur. Utilisez Chrome sur Android (HTTPS) ou l'impression thermique système."
      );
    }

    const bt = (
      navigator as unknown as {
        bluetooth: {
          requestDevice: (opts: {
            acceptAllDevices: boolean;
            optionalServices: string[];
          }) => Promise<BleDeviceLike>;
        };
      }
    ).bluetooth;

    const device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_PRINTER_SERVICES,
    });

    if (!device.gatt) {
      throw new Error('Périphérique Bluetooth sans profil GATT compatible.');
    }

    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();

    let foundChar: BleCharacteristicLike | null = null;
    for (const srv of services) {
      const chars = await srv.getCharacteristics();
      for (const ch of chars) {
        if (ch.properties.writeWithoutResponse || ch.properties.write) {
          foundChar = ch;
          break;
        }
      }
      if (foundChar) break;
    }

    if (!foundChar) {
      device.gatt.disconnect();
      throw new Error(
        "Aucune caractéristique d'écriture ESC/POS détectée sur cette imprimante Bluetooth."
      );
    }

    device.addEventListener('gattserverdisconnected', () => {
      this.bleChar = null;
      this.bleDevice = null;
      this.notify();
    });

    this.bleDevice = device;
    this.bleChar = foundChar;
    this.notify();
    return device.name || 'Imprimante Bluetooth';
  }

  async connectUsb(): Promise<string> {
    if (!this.isUsbSupported()) {
      throw new Error(
        "WebUSB n'est pas pris en charge par ce navigateur. Utilisez Chrome Android avec câble OTG ou l'impression système."
      );
    }

    const usb = (
      navigator as unknown as {
        usb: {
          requestDevice: (opts: {
            filters: Array<{classCode?: number}>;
          }) => Promise<UsbDeviceLike>;
        };
      }
    ).usb;

    const device = await usb.requestDevice({
      filters: [{classCode: 7}],
    });

    await device.open();
    if (!device.configuration) {
      await device.selectConfiguration(1);
    }

    const iface =
      device.configuration?.interfaces.find((i) =>
        i.alternates.some((a) => a.interfaceClass === 7)
      ) ?? device.configuration?.interfaces[0];

    if (!iface) {
      await device.close();
      throw new Error('Interface imprimante USB introuvable.');
    }

    await device.claimInterface(iface.interfaceNumber);
    const outEp = iface.alternates[0]?.endpoints.find(
      (e) => e.direction === 'out'
    );
    if (!outEp) {
      await device.close();
      throw new Error('Point de sortie USB (Bulk OUT) introuvable.');
    }

    this.usbDevice = device;
    this.usbInterfaceNum = iface.interfaceNumber;
    this.usbEndpointOut = outEp.endpointNumber;
    this.notify();
    return device.productName || 'Imprimante USB';
  }

  async disconnect(): Promise<void> {
    try {
      if (this.bleDevice?.gatt?.connected) {
        this.bleDevice.gatt.disconnect();
      }
    } catch {
      // ignore
    }
    try {
      if (this.usbDevice?.opened) {
        await this.usbDevice.close();
      }
    } catch {
      // ignore
    }
    this.bleDevice = null;
    this.bleChar = null;
    this.usbDevice = null;
    this.notify();
  }

  async sendEscPosBytes(bytes: Uint8Array): Promise<void> {
    const status = this.getStatus();
    if (!status.connected) {
      throw new Error(
        'Imprimante déconnectée ou indisponible. Connectez une imprimante dans Paramètres d’impression ou utilisez l’impression système.'
      );
    }

    if (status.mode === 'BLUETOOTH' && this.bleChar) {
      const chunkSize = 20;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        if (
          this.bleChar.properties.writeWithoutResponse &&
          this.bleChar.writeValueWithoutResponse
        ) {
          await this.bleChar.writeValueWithoutResponse(chunk);
        } else if (this.bleChar.writeValueWithResponse) {
          await this.bleChar.writeValueWithResponse(chunk);
        } else if (this.bleChar.writeValue) {
          await this.bleChar.writeValue(chunk);
        }
        await new Promise((r) => setTimeout(r, 15));
      }
      return;
    }

    if (status.mode === 'USB' && this.usbDevice?.opened) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      await this.usbDevice.transferOut(this.usbEndpointOut, copy.buffer);
      return;
    }

    throw new Error('Connexion imprimante perdue.');
  }

  async printSaleReceipt(
    sale: SaleWithDetails,
    settings: AppSettings
  ): Promise<void> {
    const payload = buildEscPosReceipt(
      sale,
      settings,
      settings.printer_paper_width
    );
    await this.sendEscPosBytes(payload);
  }

  async printTestReceipt(settings: AppSettings): Promise<void> {
    const payload = buildEscPosTestTicket(
      settings,
      settings.printer_paper_width
    );
    await this.sendEscPosBytes(payload);
  }
}

export const thermalPrinter = new ThermalPrinterManager();

export function printThermalHtmlWindow(
  sale: SaleWithDetails,
  settings: AppSettings
): void {
  const widthMm = settings.printer_paper_width === '80' ? 80 : 58;
  const currency = settings.currency || 'Ar';

  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const rowsHtml = sale.details
    .map(
      (d) => `
      <div class="item">
        <div class="item-name">${esc(d.product_name)}</div>
        <div class="row">
          <span>${d.quantity} × ${esc(formatAriary(d.unit_price, currency))}</span>
          <strong>${esc(formatAriary(d.subtotal, currency))}</strong>
        </div>
      </div>`
    )
    .join('');

  // Print in a hidden iframe instead of window.open(). Android WebView can
  // otherwise open an empty external tab and leave the app behind it.
  const frame = document.createElement('iframe');
  frame.title = `Ticket ${sale.sale_number}`;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.width = `${widthMm}mm`;
  frame.style.height = '100vh';
  frame.style.left = '-10000px';
  frame.style.top = '0';
  frame.style.border = '0';
  frame.style.pointerEvents = 'none';
  document.body.appendChild(frame);

  const printDoc = frame.contentDocument;
  const printWindow = frame.contentWindow;
  if (!printDoc || !printWindow || typeof printWindow.print !== 'function') {
    frame.remove();
    window.print();
    return;
  }

  printDoc.open();
  printDoc.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>Ticket ${esc(sale.sale_number)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 2mm; }
  html, body { margin: 0; padding: 0; }
  body {
    width: ${widthMm - 4}mm;
    margin: 0 auto;
    padding: 4px 0;
    font-family: 'Courier New', monospace;
    font-size: ${widthMm === 80 ? '12px' : '11px'};
    color: #000;
  }
  .center { text-align: center; }
  .shop { font-size: ${widthMm === 80 ? '16px' : '14px'}; font-weight: bold; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .dbl { border-top: 2px solid #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .item { margin-bottom: 4px; }
  .item-name { font-weight: bold; }
  .total { font-size: ${widthMm === 80 ? '14px' : '13px'}; font-weight: bold; }
</style>
</head>
<body>
  <div class="center shop">${esc(settings.shop_name || 'TSENAKELY')}</div>
  ${settings.shop_address ? `<div class="center">${esc(settings.shop_address)}</div>` : ''}
  ${settings.shop_phone ? `<div class="center">Tél : ${esc(settings.shop_phone)}</div>` : ''}
  <div class="sep"></div>
  <div>Ticket : ${esc(sale.sale_number)}</div>
  <div>Date : ${esc(formatDateTime(sale.sale_date))}</div>
  <div>Vendeur : ${esc(sale.user_name)}</div>
  ${sale.status === 'CANCELLED' ? '<div style="font-weight:bold;margin-top:4px;">*** VENTE ANNULEE ***</div>' : ''}
  <div class="sep"></div>
  ${rowsHtml}
  <div class="dbl"></div>
  <div class="row total"><span>TOTAL</span><span>${esc(formatAriary(sale.total_amount, currency))}</span></div>
  <div class="row"><span>Payé</span><span>${esc(formatAriary(sale.amount_paid, currency))}</span></div>
  <div class="row"><span>Monnaie</span><span>${esc(formatAriary(sale.change_given, currency))}</span></div>
  <div class="sep"></div>
  <div class="center" style="font-weight:bold;margin-top:8px;">Merci pour votre achat !</div>
  ${settings.receipt_footer && settings.receipt_footer.trim().toLowerCase() !== 'merci pour votre achat !' ? `<div class="center" style="margin-top:4px;">${esc(settings.receipt_footer)}</div>` : ''}
</body>
</html>`);
  printDoc.close();

  const cleanup = () => {
    if (frame.isConnected) frame.remove();
  };
  printWindow.addEventListener('afterprint', cleanup, {once: true});

  // Let Android finish laying out the receipt before opening the system print UI.
  window.setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      cleanup();
      window.print();
    }
  }, 300);
}
