import ExcelJS from 'exceljs';
import {tsenakelyDb} from '../db/database';
import type {AppSettings, ExportPeriod, SaleWithDetails} from '../db/types';
import {
  formatDateOnly,
  formatTimeOnly,
  getPeriodBounds,
} from './format';

export interface GeneratedExcelExport {
  blob: Blob;
  filename: string;
  salesCount: number;
  rowsCount: number;
  periodLabel: string;
}

const NAVY_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: {argb: 'FF0F294A'},
};

const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: {argb: 'FFE2E8F0'},
};

const ZEBRA_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: {argb: 'FFF8FAFC'},
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: {argb: 'FFFFFFFF'},
};

const BODY_FONT: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 10.5,
  color: {argb: 'FF0F172A'},
};

const TOTAL_FONT: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 11,
  bold: true,
  color: {argb: 'FF0F294A'},
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: {style: 'thin', color: {argb: 'FFCBD5E1'}},
  left: {style: 'thin', color: {argb: 'FFCBD5E1'}},
  bottom: {style: 'thin', color: {argb: 'FFCBD5E1'}},
  right: {style: 'thin', color: {argb: 'FFCBD5E1'}},
};

function styleHeaderRow(row: ExcelJS.Row, colCount: number) {
  row.height = 26;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = NAVY_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = {vertical: 'middle', horizontal: 'left', wrapText: true};
    cell.border = THIN_BORDER;
  }
}

function autoFitColumns(sheet: ExcelJS.Worksheet, minWidth = 12, maxWidth = 38) {
  sheet.columns.forEach((col) => {
    let maxLen = minWidth;
    col.eachCell?.({includeEmpty: false}, (cell) => {
      const val = cell.value;
      let text = '';
      if (val && typeof val === 'object' && 'result' in val) {
        text = String((val as {result?: unknown}).result ?? '');
      } else {
        text = String(val ?? '');
      }
      // Tenir compte du suffixe " Ar"
      const len = text.length + 4;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxWidth, maxLen);
  });
}

function getExportBounds(
  period: ExportPeriod,
  customStart?: string,
  customEnd?: string
): {startIso?: string; endIso?: string; label: string} {
  if (period === 'all') {
    return {label: 'Toutes les ventes'};
  }
  return getPeriodBounds(period, customStart, customEnd);
}

export async function generateSalesExcelWorkbook(
  period: ExportPeriod,
  settings: AppSettings,
  customStart?: string,
  customEnd?: string
): Promise<GeneratedExcelExport> {
  const bounds = getExportBounds(period, customStart, customEnd);
  const currency = settings.currency || 'Ar';
  const ariaryFormat = `#,##0 "${currency}"`;

  // Lecture seule de la base locale sans modifier les données originales
  const sales: SaleWithDetails[] = await tsenakelyDb.getSalesInRange(
    bounds.startIso,
    bounds.endIso
  );
  const products = await tsenakelyDb.getProducts();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = settings.shop_name || 'TSENAKELY';
  workbook.created = new Date();

  // =========================================================================
  // FEUILLE 1 : Historique des ventes (1 ligne = 1 produit vendu)
  // =========================================================================
  const sheetHistory = workbook.addWorksheet('Historique des ventes', {
    views: [{state: 'frozen', ySplit: 1}],
  });

  const histHeaders = [
    'Numéro de vente',
    'Date',
    'Heure',
    'Nom du vendeur',
    'Produit',
    'Quantité',
    `Prix unitaire (${currency})`,
    `Montant total (${currency})`,
    `Montant payé (${currency})`,
    `Monnaie rendue (${currency})`,
    'Statut de la vente',
  ];
  const hHeaderRow = sheetHistory.addRow(histHeaders);
  styleHeaderRow(hHeaderRow, histHeaders.length);

  let histRowCount = 0;
  let totalLineQty = 0;

  for (const sale of sales) {
    const saleDateObj = new Date(sale.sale_date);
    const dateStr = formatDateOnly(sale.sale_date);
    const timeStr = formatTimeOnly(sale.sale_date);
    const statusLabel = sale.status === 'COMPLETED' ? 'Validée' : 'Annulée';

    for (const [detailIndex, detail] of sale.details.entries()) {
      histRowCount++;
      totalLineQty += detail.quantity;
      const row = sheetHistory.addRow([
        sale.sale_number,
        Number.isNaN(saleDateObj.getTime()) ? dateStr : saleDateObj,
        timeStr,
        sale.user_name,
        detail.product_name,
        detail.quantity,
        detail.unit_price,
        detail.subtotal,
        // These are sale-level amounts: show them once, not once per product.
        detailIndex === 0 ? sale.amount_paid : null,
        detailIndex === 0 ? sale.change_given : null,
        statusLabel,
      ]);

      row.height = 20;
      row.eachCell((cell, colNumber) => {
        cell.font = BODY_FONT;
        cell.border = THIN_BORDER;
        if (histRowCount % 2 === 0) cell.fill = ZEBRA_FILL;
        if (colNumber === 2 && cell.value instanceof Date) {
          cell.numFmt = 'dd/mm/yyyy';
        }
        if (colNumber === 6) {
          cell.numFmt = '#,##0';
          cell.alignment = {horizontal: 'right', vertical: 'middle'};
        } else if (colNumber >= 7 && colNumber <= 10) {
          cell.numFmt = ariaryFormat;
          cell.alignment = {horizontal: 'right', vertical: 'middle'};
        } else {
          cell.alignment = {horizontal: 'left', vertical: 'middle'};
        }
      });
    }
  }

  const histLastDataRow = 1 + histRowCount;
  const histTotalRow = sheetHistory.addRow([
    'TOTAL',
    '',
    '',
    `${sales.length} vente(s)`,
    `${histRowCount} ligne(s)`,
    histRowCount > 0 ? {formula: `SUM(F2:F${histLastDataRow})`} : 0,
    '',
    histRowCount > 0 ? {formula: `SUM(H2:H${histLastDataRow})`} : 0,
    '',
    '',
    '',
  ]);
  histTotalRow.height = 24;
  histTotalRow.eachCell((cell, colNumber) => {
    cell.fill = TOTAL_FILL;
    cell.font = TOTAL_FONT;
    cell.border = THIN_BORDER;
    if (colNumber === 6) {
      cell.numFmt = '#,##0';
      cell.alignment = {horizontal: 'right', vertical: 'middle'};
    } else if (colNumber === 8) {
      cell.numFmt = ariaryFormat;
      cell.alignment = {horizontal: 'right', vertical: 'middle'};
    }
  });

  sheetHistory.autoFilter = {
    from: {row: 1, column: 1},
    to: {row: Math.max(1, histLastDataRow), column: histHeaders.length},
  };
  autoFitColumns(sheetHistory);

  // =========================================================================
  // FEUILLE 2 : Résumé des ventes (calculé sur ventes validées)
  // =========================================================================
  const completedSales = sales.filter((s) => s.status === 'COMPLETED');
  const totalRevenue = completedSales.reduce((sum, s) => sum + s.total_amount, 0);
  const completedCount = completedSales.length;
  const totalItemsSold = completedSales.reduce(
    (sum, s) => sum + s.details.reduce((dSum, d) => dSum + d.quantity, 0),
    0
  );
  const avgBasket =
    completedCount > 0 ? Math.round(totalRevenue / completedCount) : 0;

  const productAgg = new Map<
    string,
    {name: string; qty: number; unitPrice: number; revenue: number}
  >();
  for (const s of completedSales) {
    for (const d of s.details) {
      const key = d.product_name.toLowerCase();
      const curr = productAgg.get(key) ?? {
        name: d.product_name,
        qty: 0,
        unitPrice: d.unit_price,
        revenue: 0,
      };
      curr.qty += d.quantity;
      curr.unitPrice = d.unit_price;
      curr.revenue += d.subtotal;
      productAgg.set(key, curr);
    }
  }
  const productStats = Array.from(productAgg.values()).sort(
    (a, b) => b.revenue - a.revenue
  );

  const sheetSummary = workbook.addWorksheet('Résumé des ventes', {
    views: [{state: 'frozen', ySplit: 7}],
  });

  const sumTitleRow = sheetSummary.addRow([
    `RÉSUMÉ DES VENTES — ${settings.shop_name || 'TSENAKELY'}`,
    '',
    bounds.label,
    '',
  ]);
  styleHeaderRow(sumTitleRow, 4);

  const kpis: Array<[string, number, string]> = [
    ['Nombre total de ventes validées', completedCount, '#,##0'],
    [`Chiffre d'affaires total (${currency})`, totalRevenue, ariaryFormat],
    ['Quantité totale vendue', totalItemsSold, '#,##0'],
    [`Panier moyen (${currency})`, avgBasket, ariaryFormat],
  ];

  for (const [label, val, fmt] of kpis) {
    const r = sheetSummary.addRow([label, val]);
    r.height = 22;
    r.getCell(1).font = {name: 'Calibri', size: 11, bold: true, color: {argb: 'FF0F294A'}};
    r.getCell(1).border = THIN_BORDER;
    r.getCell(2).font = {name: 'Calibri', size: 11, bold: true, color: {argb: 'FF0F172A'}};
    r.getCell(2).numFmt = fmt;
    r.getCell(2).alignment = {horizontal: 'right', vertical: 'middle'};
    r.getCell(2).border = THIN_BORDER;
  }

  sheetSummary.addRow([]);

  const breakdownHeader = sheetSummary.addRow([
    'Produit (Répartition CA)',
    'Quantité vendue',
    `Chiffre d'affaires (${currency})`,
    'Part (%)',
  ]);
  styleHeaderRow(breakdownHeader, 4);

  const breakdownStartRow = 8;
  productStats.forEach((p, idx) => {
    const share = totalRevenue > 0 ? p.revenue / totalRevenue : 0;
    const r = sheetSummary.addRow([p.name, p.qty, p.revenue, share]);
    r.height = 20;
    r.eachCell((cell, col) => {
      cell.font = BODY_FONT;
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) cell.fill = ZEBRA_FILL;
      if (col === 2) {
        cell.numFmt = '#,##0';
        cell.alignment = {horizontal: 'right', vertical: 'middle'};
      } else if (col === 3) {
        cell.numFmt = ariaryFormat;
        cell.alignment = {horizontal: 'right', vertical: 'middle'};
      } else if (col === 4) {
        cell.numFmt = '0.0%';
        cell.alignment = {horizontal: 'right', vertical: 'middle'};
      }
    });
  });

  const breakdownEndRow = breakdownStartRow + productStats.length - 1;
  const breakdownTotalRow = sheetSummary.addRow([
    'TOTAL',
    productStats.length > 0
      ? {formula: `SUM(B${breakdownStartRow}:B${breakdownEndRow})`}
      : 0,
    productStats.length > 0
      ? {formula: `SUM(C${breakdownStartRow}:C${breakdownEndRow})`}
      : 0,
    productStats.length > 0 ? 1 : 0,
  ]);
  breakdownTotalRow.height = 24;
  breakdownTotalRow.eachCell((cell, col) => {
    cell.fill = TOTAL_FILL;
    cell.font = TOTAL_FONT;
    cell.border = THIN_BORDER;
    if (col === 2) {
      cell.numFmt = '#,##0';
      cell.alignment = {horizontal: 'right', vertical: 'middle'};
    } else if (col === 3) {
      cell.numFmt = ariaryFormat;
      cell.alignment = {horizontal: 'right', vertical: 'middle'};
    } else if (col === 4) {
      cell.numFmt = '0.0%';
      cell.alignment = {horizontal: 'right', vertical: 'middle'};
    }
  });

  sheetSummary.autoFilter = {
    from: {row: 7, column: 1},
    to: {row: Math.max(7, breakdownEndRow), column: 4},
  };
  autoFitColumns(sheetSummary, 16, 40);

  // =========================================================================
  // FEUILLE 3 : Produits vendus
  // =========================================================================
  const sheetSoldProducts = workbook.addWorksheet('Produits vendus', {
    views: [{state: 'frozen', ySplit: 1}],
  });

  const soldHeaders = [
    'Nom du produit',
    'Quantité totale vendue',
    `Prix unitaire (${currency})`,
    `Chiffre d'affaires par produit (${currency})`,
  ];
  const spHeader = sheetSoldProducts.addRow(soldHeaders);
  styleHeaderRow(spHeader, soldHeaders.length);

  productStats.forEach((p, idx) => {
    const r = sheetSoldProducts.addRow([
      p.name,
      p.qty,
      p.unitPrice,
      p.revenue,
    ]);
    r.height = 20;
    r.eachCell((cell, col) => {
      cell.font = BODY_FONT;
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) cell.fill = ZEBRA_FILL;
      if (col === 2) {
        cell.numFmt = '#,##0';
        cell.alignment = {horizontal: 'right', vertical: 'middle'};
      } else if (col === 3 || col === 4) {
        cell.numFmt = ariaryFormat;
        cell.alignment = {horizontal: 'right', vertical: 'middle'};
      }
    });
  });

  const spLastRow = 1 + productStats.length;
  const spTotalRow = sheetSoldProducts.addRow([
    'TOTAL',
    productStats.length > 0 ? {formula: `SUM(B2:B${spLastRow})`} : 0,
    '',
    productStats.length > 0 ? {formula: `SUM(D2:D${spLastRow})`} : 0,
  ]);
  spTotalRow.height = 24;
  spTotalRow.eachCell((cell, col) => {
    cell.fill = TOTAL_FILL;
    cell.font = TOTAL_FONT;
    cell.border = THIN_BORDER;
    if (col === 2) {
      cell.numFmt = '#,##0';
      cell.alignment = {horizontal: 'right', vertical: 'middle'};
    } else if (col === 4) {
      cell.numFmt = ariaryFormat;
      cell.alignment = {horizontal: 'right', vertical: 'middle'};
    }
  });

  sheetSoldProducts.autoFilter = {
    from: {row: 1, column: 1},
    to: {row: Math.max(1, spLastRow), column: 4},
  };
  autoFitColumns(sheetSoldProducts, 16, 40);

  // =========================================================================
  // FEUILLE 4 : Stock
  // =========================================================================
  const sheetStock = workbook.addWorksheet('Stock', {
    views: [{state: 'frozen', ySplit: 1}],
  });

  const stockHeaders = [
    'Nom du produit',
    'Quantité disponible',
    `Prix de vente (${currency})`,
    `Valeur du stock (${currency})`,
  ];
  const stHeader = sheetStock.addRow(stockHeaders);
  styleHeaderRow(stHeader, stockHeaders.length);

  products.forEach((prod, idx) => {
    const excelRowNum = idx + 2;
    const r = sheetStock.addRow([
      prod.name,
      prod.stock_qty,
      prod.price,
      {
        formula: `B${excelRowNum}*C${excelRowNum}`,
        result: prod.stock_qty * prod.price,
      },
    ]);
    r.height = 20;
    r.eachCell((cell, col) => {
      cell.font = BODY_FONT;
      cell.border = THIN_BORDER;
      if (idx % 2 === 1) cell.fill = ZEBRA_FILL;
      if (col === 2) {
        cell.numFmt = '#,##0';
        cell.alignment = {horizontal: 'right', vertical: 'middle'};
      } else if (col === 3 || col === 4) {
        cell.numFmt = ariaryFormat;
        cell.alignment = {horizontal: 'right', vertical: 'middle'};
      }
    });
  });

  const stLastRow = 1 + products.length;
  const stTotalRow = sheetStock.addRow([
    'TOTAL STOCK',
    products.length > 0 ? {formula: `SUM(B2:B${stLastRow})`} : 0,
    '',
    products.length > 0 ? {formula: `SUM(D2:D${stLastRow})`} : 0,
  ]);
  stTotalRow.height = 24;
  stTotalRow.eachCell((cell, col) => {
    cell.fill = TOTAL_FILL;
    cell.font = TOTAL_FONT;
    cell.border = THIN_BORDER;
    if (col === 2) {
      cell.numFmt = '#,##0';
      cell.alignment = {horizontal: 'right', vertical: 'middle'};
    } else if (col === 4) {
      cell.numFmt = ariaryFormat;
      cell.alignment = {horizontal: 'right', vertical: 'middle'};
    }
  });

  sheetStock.autoFilter = {
    from: {row: 1, column: 1},
    to: {row: Math.max(1, stLastRow), column: 4},
  };
  autoFitColumns(sheetStock, 16, 40);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const dateTag = new Date().toISOString().slice(0, 10);
  const filename = `TSENAKELY-Ventes-${period}-${dateTag}.xlsx`;

  return {
    blob,
    filename,
    salesCount: sales.length,
    rowsCount: totalLineQty,
    periodLabel: bounds.label,
  };
}
