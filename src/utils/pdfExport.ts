import { jsPDF } from 'jspdf';
import { AppSettings, Invoice } from '../types/erp';
import { amountToWords, computeLineNetAmount, derivePaymentModeLabel, formatMoney } from './accounting';
import { getLogoMaxHeightMm } from './theme';

interface RasterLogo {
  pngDataUrl: string;
  aspectRatio: number;
}

async function rasterizeLogoOffline(dataUrl: string): Promise<RasterLogo | null> {
  if (!dataUrl) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const natW = img.naturalWidth || 300;
      const natH = img.naturalHeight || 120;
      const scale = Math.min(3, Math.max(1, 900 / Math.max(natW, natH)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(natW * scale));
      canvas.height = Math.max(1, Math.round(natH * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve({
          pngDataUrl: canvas.toDataURL('image/png'),
          aspectRatio: natW / Math.max(1, natH),
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function exportInvoiceToA4Pdf(invoice: Invoice, settings: AppSettings): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const sym = settings.currencySymbol;

  const activeLogoUrl = invoice.logoSnapshotDataUrl ?? settings.companyLogoDataUrl;
  const activeLogoSize = invoice.logoSizeSnapshot ?? settings.companyLogoSize ?? 'Medium';
  const showBrandName = invoice.showBrandNameSnapshot ?? settings.showBrandNameWithLogo ?? true;
  const brandName = invoice.companyNameSnapshot || settings.companyName;
  const brandAddress = invoice.companyAddressSnapshot || settings.companyAddress;
  const brandPhone = invoice.companyPhoneSnapshot || settings.companyPhone;

  const rasterLogo = activeLogoUrl ? await rasterizeLogoOffline(activeLogoUrl) : null;

  let y = margin;

  // HEADER: Far top-left logo BEFORE business name, invoice metadata top-right
  const maxLogoH = getLogoMaxHeightMm(activeLogoSize);
  let textStartX = margin;
  let headerBottomY = y + 18;

  if (rasterLogo) {
    let logoH = maxLogoH;
    let logoW = logoH * rasterLogo.aspectRatio;
    const maxLogoW = 72;
    if (logoW > maxLogoW) {
      logoW = maxLogoW;
      logoH = logoW / Math.max(0.1, rasterLogo.aspectRatio);
    }
    doc.addImage(rasterLogo.pngDataUrl, 'PNG', margin, y, logoW, logoH);
    textStartX = margin + logoW + 4.5;
    headerBottomY = Math.max(headerBottomY, y + logoH);
  }

  let nameY = y + 6;
  if (!rasterLogo || showBrandName) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42);
    doc.text(brandName, textStartX, nameY, { maxWidth: 85 });
    nameY += 5.5;
  } else {
    nameY += 2;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  if (brandAddress) {
    const addrLines = doc.splitTextToSize(brandAddress, 78);
    doc.text(addrLines, textStartX, nameY);
    nameY += addrLines.length * 4;
  }
  if (brandPhone) {
    doc.text(brandPhone, textStartX, nameY);
    nameY += 4;
  }

  // Right header: INVOICE title, ID, Order ID, dates
  let rightY = y + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0, 113, 227);
  doc.text('INVOICE', pageWidth - margin, rightY, { align: 'right' });
  rightY += 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(invoice.id, pageWidth - margin, rightY, { align: 'right' });
  rightY += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  if (invoice.orderId) {
    doc.text(`Order: ${invoice.orderId}`, pageWidth - margin, rightY, { align: 'right' });
    rightY += 4;
  }
  doc.text(
    `Issued: ${new Date(invoice.issuedAt).toLocaleDateString()}`,
    pageWidth - margin,
    rightY,
    { align: 'right' }
  );
  rightY += 4;
  doc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`, pageWidth - margin, rightY, {
    align: 'right',
  });
  rightY += 4;

  y = Math.max(headerBottomY, nameY, rightY) + 3;
  // Thin blue header line
  doc.setDrawColor(0, 113, 227);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // Customer & Billing Details
  const detailsStartY = y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('BILLED TO', margin, y);
  doc.text('BILLING DETAILS', pageWidth - margin, y, { align: 'right' });
  y += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(invoice.customerName, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Account Type: ${invoice.isCorporate ? 'Corporate' : 'Retail'}`,
    pageWidth - margin,
    y,
    { align: 'right' }
  );
  y += 4.5;

  let leftDetY = y;
  doc.text(`Customer ID: ${invoice.customerId}`, margin, leftDetY);
  leftDetY += 4;
  if (invoice.customerPhone) {
    doc.text(invoice.customerPhone, margin, leftDetY);
    leftDetY += 4;
  }
  if (invoice.customerAddress) {
    const addr = doc.splitTextToSize(invoice.customerAddress, 90);
    doc.text(addr, margin, leftDetY);
    leftDetY += addr.length * 4;
  }

  let rightDetY = y;
  if (invoice.isCorporate && invoice.billingBasis) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 113, 227);
    doc.text(`Billing Basis: ${invoice.billingBasis}`, pageWidth - margin, rightDetY, {
      align: 'right',
    });
    rightDetY += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
  }
  if (invoice.periodCovered) {
    doc.text(`Period: ${invoice.periodCovered}`, pageWidth - margin, rightDetY, { align: 'right' });
    rightDetY += 4;
  }
  doc.setTextColor(15, 23, 42);
  const paymentMode = derivePaymentModeLabel(
    invoice.paidAmount,
    invoice.grandTotal,
    undefined,
    invoice.paymentMode
  );
  doc.text(`Payment Mode: ${paymentMode}`, pageWidth - margin, rightDetY, { align: 'right' });
  rightDetY += 4;
  doc.setTextColor(71, 85, 105);
  doc.text(`Terms: ${invoice.paymentTerms}`, pageWidth - margin, rightDetY, { align: 'right' });
  rightDetY += 4;

  y = Math.max(leftDetY, rightDetY, detailsStartY + 18) + 3;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  const hasPerItemDiscount = invoice.lines.some((l) => Number(l.discount) > 0);

  // Table Header Drawer (repeats across pages)
  const drawTableHeader = (curY: number) => {
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, curY, contentWidth, 7.5, 'F');
    doc.setDrawColor(0, 113, 227);
    doc.setLineWidth(0.35);
    doc.line(margin, curY + 7.5, pageWidth - margin, curY + 7.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text('S.N.', margin + 2, curY + 5);
    doc.text('Name', margin + 12, curY + 5);
    if (hasPerItemDiscount) {
      doc.text('Quantity', margin + 106, curY + 5, { align: 'right' });
      doc.text('Rate', margin + 132, curY + 5, { align: 'right' });
      doc.text('Discount', margin + 160, curY + 5, { align: 'right' });
    } else {
      doc.text('Quantity', margin + 124, curY + 5, { align: 'right' });
      doc.text('Rate', margin + 154, curY + 5, { align: 'right' });
    }
    doc.text('Amount', pageWidth - margin - 2, curY + 5, { align: 'right' });
    return curY + 9;
  };

  y = drawTableHeader(y);

  // Items rows with clean page break & repeated header
  invoice.lines.forEach((line, idx) => {
    const itemName = line.serviceName ? `${line.productName} · ${line.serviceName}` : line.productName;
    const nameWidth = hasPerItemDiscount ? 76 : 96;
    const nameLines = doc.splitTextToSize(itemName || '-', nameWidth);
    const calc = computeLineNetAmount(line.quantity, line.unitPrice, line.discount);
    const discExtra = hasPerItemDiscount && calc.discount > 0 ? 1 : 0;
    const rowLines = Math.max(nameLines.length, 1 + discExtra);
    const rowHeight = Math.max(7, rowLines * 4 + 2.5);

    if (y + rowHeight > pageHeight - margin - 14) {
      doc.addPage();
      y = margin;
      y = drawTableHeader(y);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(String(idx + 1), margin + 2, y + 4);
    doc.setTextColor(15, 23, 42);
    doc.text(nameLines, margin + 12, y + 4);

    if (hasPerItemDiscount) {
      doc.text(String(line.quantity), margin + 106, y + 4, { align: 'right' });
      doc.text(formatMoney(line.unitPrice, sym), margin + 132, y + 4, { align: 'right' });
      if (calc.discount > 0) {
        doc.setTextColor(5, 150, 105);
        doc.text(formatMoney(calc.discount, sym), margin + 160, y + 3.8, { align: 'right' });
        doc.setFontSize(7.2);
        doc.setTextColor(100, 116, 139);
        doc.text(`(${calc.discountPct}%)`, margin + 160, y + 7.2, { align: 'right' });
        doc.setFontSize(8.5);
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text('-', margin + 160, y + 4, { align: 'right' });
      }
    } else {
      doc.text(String(line.quantity), margin + 124, y + 4, { align: 'right' });
      doc.text(formatMoney(line.unitPrice, sym), margin + 154, y + 4, { align: 'right' });
    }

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.text(formatMoney(line.total, sym), pageWidth - margin - 2, y + 4, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    y += rowHeight;
  });

  // Keep Totals + Amount in Words + Terms + Signatures together so signature block never sits alone
  const termsText = invoice.termsAndConditions || settings.invoiceTerms || '';
  const termsLines = doc.splitTextToSize(termsText, contentWidth);
  const amountWordsText = amountToWords(invoice.grandTotal, settings.currencyCode);
  const wordsLines = doc.splitTextToSize(amountWordsText, 96);
  const footerHeight = 52 + termsLines.length * 3.8 + 26;

  if (y + footerHeight > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }

  y += 5;
  const wordsBoxY = y;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  const wordsBoxH = Math.max(14, wordsLines.length * 4 + 7);
  doc.roundedRect(margin, wordsBoxY - 3, 104, wordsBoxH, 1.2, 1.2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('AMOUNT IN WORDS', margin + 2.5, wordsBoxY + 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text(wordsLines, margin + 2.5, wordsBoxY + 5);
  const totalsWidth = 72;
  const totalsX = pageWidth - margin - totalsWidth;
  const rowStep = 6;

  const drawTotalRow = (
    label: string,
    val: string,
    opts?: {
      bold?: boolean;
      fontSize?: number;
      textRgb?: [number, number, number];
      fillRgb?: [number, number, number];
      topBorderRgb?: [number, number, number];
    }
  ) => {
    const bold = opts?.bold ?? false;
    const fontSize = opts?.fontSize ?? (bold ? 9.5 : 8.5);
    const [r, g, b] = opts?.textRgb ?? (bold ? [15, 23, 42] : [71, 85, 105]);
    if (opts?.fillRgb) {
      doc.setFillColor(opts.fillRgb[0], opts.fillRgb[1], opts.fillRgb[2]);
      doc.roundedRect(totalsX, y - 4, totalsWidth, 5.6, 1, 1, 'F');
    }
    if (opts?.topBorderRgb) {
      doc.setDrawColor(opts.topBorderRgb[0], opts.topBorderRgb[1], opts.topBorderRgb[2]);
      doc.setLineWidth(0.45);
      doc.line(totalsX, y - 4, pageWidth - margin, y - 4);
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(r, g, b);
    doc.text(label, totalsX + 2, y);
    doc.text(val, pageWidth - margin - 2, y, { align: 'right' });
    y += rowStep;
  };

  drawTotalRow('Subtotal', formatMoney(invoice.subtotal, sym), {
    bold: true,
    textRgb: [109, 40, 217],
    fillRgb: [245, 243, 255],
  });
  if (invoice.extraCharges > 0) {
    drawTotalRow('Additional Charges', formatMoney(invoice.extraCharges, sym));
  }
  if (Number(invoice.discountTotal) > 0) {
    drawTotalRow('Discount', `-${formatMoney(invoice.discountTotal, sym)}`, {
      bold: true,
      textRgb: [5, 150, 105],
      fillRgb: [236, 253, 245],
    });
  }

  y += 0.8;
  drawTotalRow('Total Amount', formatMoney(invoice.grandTotal, sym), {
    bold: true,
    fontSize: 9.5,
    textRgb: [0, 113, 227],
    fillRgb: [239, 246, 255],
    topBorderRgb: [0, 113, 227],
  });
  drawTotalRow('Received Amount', formatMoney(invoice.paidAmount, sym));
  drawTotalRow('Amount Due', formatMoney(invoice.dueAmount, sym), { bold: true });
  y = Math.max(y, wordsBoxY + wordsBoxH + 4);

  y += 5;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  if (termsLines.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text('Terms & Conditions', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(termsLines, margin, y);
    y += termsLines.length * 3.8 + 8;
  } else {
    y += 8;
  }

  // Signatures block at bottom
  const sigY = Math.max(y + 10, Math.min(pageHeight - margin - 12, y + 14));
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(margin, sigY, margin + 62, sigY);
  doc.line(pageWidth - margin - 62, sigY, pageWidth - margin, sigY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Customer Signature', margin + 31, sigY + 4.5, { align: 'center' });
  doc.text('Laundry Authority Signature', pageWidth - margin - 31, sigY + 4.5, {
    align: 'center',
  });

  doc.save(`${invoice.id}.pdf`);
}
