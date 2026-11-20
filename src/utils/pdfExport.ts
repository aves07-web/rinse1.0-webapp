import { jsPDF } from 'jspdf';
import { AppSettings, Invoice } from '../types/erp';
import { formatMoney } from './accounting';
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
  doc.text(`Terms: ${invoice.paymentTerms}`, pageWidth - margin, rightDetY, { align: 'right' });
  rightDetY += 4;

  y = Math.max(leftDetY, rightDetY, detailsStartY + 14) + 3;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

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
    doc.text('Product', margin + 2, curY + 5);
    doc.text('Service', margin + 62, curY + 5);
    doc.text('Qty', margin + 114, curY + 5, { align: 'right' });
    doc.text('Unit Price', margin + 139, curY + 5, { align: 'right' });
    doc.text('Discount', margin + 162, curY + 5, { align: 'right' });
    doc.text('Total', pageWidth - margin - 2, curY + 5, { align: 'right' });
    return curY + 9;
  };

  y = drawTableHeader(y);

  // Items rows with clean page break & repeated header
  for (const line of invoice.lines) {
    const prodLines = doc.splitTextToSize(line.productName || '-', 56);
    const srvLines = doc.splitTextToSize(line.serviceName || '-', 42);
    const rowLines = Math.max(prodLines.length, srvLines.length);
    const rowHeight = Math.max(6.5, rowLines * 4 + 2.5);

    if (y + rowHeight > pageHeight - margin - 14) {
      doc.addPage();
      y = margin;
      y = drawTableHeader(y);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(prodLines, margin + 2, y + 4);
    doc.setTextColor(71, 85, 105);
    doc.text(srvLines, margin + 62, y + 4);
    doc.setTextColor(15, 23, 42);
    doc.text(String(line.quantity), margin + 114, y + 4, { align: 'right' });
    doc.text(formatMoney(line.unitPrice, sym), margin + 139, y + 4, { align: 'right' });
    doc.text(formatMoney(line.discount, sym), margin + 162, y + 4, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatMoney(line.total, sym), pageWidth - margin - 2, y + 4, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    y += rowHeight;
  }

  // Keep Totals + Terms + Signatures together so signature block never sits alone
  const termsText = invoice.termsAndConditions || settings.invoiceTerms || '';
  const termsLines = doc.splitTextToSize(termsText, contentWidth);
  const footerHeight = 42 + termsLines.length * 3.8 + 26;

  if (y + footerHeight > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }

  y += 5;
  const totalsX = pageWidth - margin - 66;
  const rowStep = 5.2;

  const drawTotalRow = (label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 9.5 : 8.5);
    doc.setTextColor(bold ? 15 : 71, bold ? 23 : 85, bold ? 42 : 105);
    doc.text(label, totalsX, y);
    doc.text(val, pageWidth - margin, y, { align: 'right' });
    y += rowStep;
  };

  drawTotalRow('Subtotal', formatMoney(invoice.subtotal, sym));
  if (invoice.extraCharges > 0) {
    drawTotalRow('Additional Charges', formatMoney(invoice.extraCharges, sym));
  }
  if (invoice.discountTotal > 0) {
    drawTotalRow('Discount', `-${formatMoney(invoice.discountTotal, sym)}`);
  }

  doc.setDrawColor(0, 113, 227);
  doc.setLineWidth(0.35);
  doc.line(totalsX, y - 2, pageWidth - margin, y - 2);
  y += 2;

  drawTotalRow('Grand Total', formatMoney(invoice.grandTotal, sym), true);
  drawTotalRow('Paid Amount', formatMoney(invoice.paidAmount, sym));
  drawTotalRow('Balance Due', formatMoney(invoice.dueAmount, sym), true);

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
