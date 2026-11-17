import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {AppSettings, SaleWithDetails} from '../db/types';
import {formatAriary, formatDateTime} from './format';

export interface GeneratedInvoicePdf {
  blob: Blob;
  filename: string;
  objectUrl: string;
}

export function buildInvoicePdf(
  sale: SaleWithDetails,
  settings: AppSettings
): GeneratedInvoicePdf {
  const currency = settings.currency || 'Ar';
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;

  // Bandeau supérieur bleu marine
  doc.setFillColor(15, 41, 74); // #0F294A
  doc.rect(0, 0, pageWidth, 6, 'F');

  let leftY = 18;
  let textStartX = margin;

  // Logo du commerce si présent
  if (settings.shop_logo_data_url) {
    try {
      const format = settings.shop_logo_data_url.includes('image/png')
        ? 'PNG'
        : 'JPEG';
      doc.addImage(settings.shop_logo_data_url, format, margin, 14, 22, 22);
      textStartX = margin + 27;
    } catch {
      // Ignorer si l'image logo est invalide
    }
  }

  // En-tête Commerce à gauche
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 41, 74);
  doc.text(settings.shop_name || 'TSENAKELY', textStartX, leftY);

  leftY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);

  if (settings.shop_address) {
    doc.text(settings.shop_address, textStartX, leftY);
    leftY += 4.8;
  }
  if (settings.shop_phone) {
    doc.text(`Tél : ${settings.shop_phone}`, textStartX, leftY);
    leftY += 4.8;
  }

  // Bloc FACTURE à droite
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 41, 74);
  doc.text('FACTURE', pageWidth - margin, 18, {align: 'right'});

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`N° : ${sale.sale_number}`, pageWidth - margin, 24.5, {
    align: 'right',
  });
  doc.text(
    `Date : ${formatDateTime(sale.sale_date)}`,
    pageWidth - margin,
    29.5,
    {align: 'right'}
  );
  doc.text(`Vendeur : ${sale.user_name}`, pageWidth - margin, 34.5, {
    align: 'right',
  });

  if (sale.status === 'CANCELLED') {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('STATUT : FACTURE ANNULÉE', pageWidth - margin, 40, {
      align: 'right',
    });
  }

  // Ligne de séparation
  const separatorY = Math.max(leftY + 6, 45);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(margin, separatorY, pageWidth - margin, separatorY);

  // Tableau des produits vendus
  const tableRows = sale.details.map((item, idx) => [
    String(idx + 1),
    item.product_name,
    String(item.quantity),
    formatAriary(item.unit_price, currency),
    formatAriary(item.subtotal, currency),
  ]);

  autoTable(doc, {
    startY: separatorY + 6,
    margin: {left: margin, right: margin},
    head: [['#', 'Produit', 'Quantité', 'Prix unitaire', 'Sous-total']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 41, 74],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9.5,
      halign: 'left',
      cellPadding: 3.5,
    },
    bodyStyles: {
      textColor: [15, 23, 42],
      fontSize: 9.5,
      cellPadding: 3.2,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: {cellWidth: 12, halign: 'center'},
      1: {cellWidth: 'auto', halign: 'left'},
      2: {cellWidth: 24, halign: 'right'},
      3: {cellWidth: 36, halign: 'right'},
      4: {cellWidth: 38, halign: 'right', fontStyle: 'bold'},
    },
  });

  const finalY =
    (doc as unknown as {lastAutoTable?: {finalY: number}}).lastAutoTable
      ?.finalY ?? separatorY + 40;

  // Encadré récapitulatif financier aligné à droite
  const boxWidth = 86;
  const boxX = pageWidth - margin - boxWidth;
  let boxY = finalY + 8;

  // Vérifier saut de page éventuel
  if (boxY > 250) {
    doc.addPage();
    boxY = 20;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(boxX, boxY, boxWidth, 32, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 41, 74);
  doc.text('Total à payer :', boxX + 4, boxY + 9);
  doc.text(
    formatAriary(sale.total_amount, currency),
    boxX + boxWidth - 4,
    boxY + 9,
    {align: 'right'}
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Montant reçu :', boxX + 4, boxY + 17.5);
  doc.text(
    formatAriary(sale.amount_paid, currency),
    boxX + boxWidth - 4,
    boxY + 17.5,
    {align: 'right'}
  );

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(4, 120, 87);
  doc.text('Monnaie rendue :', boxX + 4, boxY + 25.5);
  doc.text(
    formatAriary(sale.change_given, currency),
    boxX + boxWidth - 4,
    boxY + 25.5,
    {align: 'right'}
  );

  // Mention de remerciement obligatoire
  const footerY = Math.max(boxY + 46, 265);
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY - 8, pageWidth - margin, footerY - 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 41, 74);
  doc.text('Merci pour votre achat !', pageWidth / 2, footerY, {
    align: 'center',
  });

  if (
    settings.receipt_footer &&
    settings.receipt_footer.trim().toLowerCase() !== 'merci pour votre achat !'
  ) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(settings.receipt_footer.trim(), pageWidth / 2, footerY + 5.5, {
      align: 'center',
    });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `${settings.shop_name || 'TSENAKELY'} · Document généré hors ligne`,
    margin,
    287
  );
  doc.text(`Facture ${sale.sale_number}`, pageWidth - margin, 287, {
    align: 'right',
  });

  const blob = doc.output('blob');
  const filename = `Facture-${sale.sale_number}.pdf`;
  const objectUrl = URL.createObjectURL(blob);

  return {blob, filename, objectUrl};
}
