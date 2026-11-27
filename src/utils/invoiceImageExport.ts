import QRCode from 'qrcode';
import { AppSettings, Invoice } from '../types/erp';
import { amountToWords, computeLineNetAmount, derivePaymentModeLabel, formatMoney } from './accounting';

export type InvoiceImageFormat = 'png' | 'jpg';

const MAX_IMAGE_BYTES = 1_048_576; // strictly < 1 MB
const MAX_CACHE_ENTRIES = 40;

export interface InvoiceImageResult {
  blob: Blob;
  fileName: string;
  bytes: number;
  fromCache: boolean;
  shared?: boolean;
}

const imageCache = new Map<string, { blob: Blob; fileName: string; bytes: number }>();

function buildCacheKey(
  invoice: Invoice,
  settings: AppSettings,
  format: InvoiceImageFormat
): string {
  const linesSig = invoice.lines
    .map(
      (l) =>
        `${l.productName}|${l.serviceName}|${l.quantity}|${l.unitPrice}|${l.discount}|${l.total}`
    )
    .join(';');
  const updatedMarker = invoice.updatedAt || `${invoice.issuedAt}:${invoice.paidAmount}:${invoice.grandTotal}`;
  const brandMarker = `${invoice.companyNameSnapshot || settings.companyName}|${settings.currencySymbol}|${settings.currencyCode}`;
  return `${invoice.id}::${updatedMarker}::${format}::${brandMarker}::${linesSig}`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function generateQrCanvas(value: string, size: number): Promise<HTMLCanvasElement | null> {
  try {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    await QRCode.toCanvas(c, value, {
      width: size,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
    return c;
  } catch {
    return null;
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (ctx.measureText(word).width > maxWidth) {
        let partial = '';
        for (const ch of word) {
          if (ctx.measureText(partial + ch).width > maxWidth && partial) {
            lines.push(partial);
            partial = ch;
          } else {
            partial += ch;
          }
        }
        current = partial;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode invoice image'));
      },
      mimeType,
      quality
    );
  });
}

function downscaleCanvas(source: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const target = document.createElement('canvas');
  target.width = Math.max(620, Math.round(source.width * factor));
  target.height = Math.max(877, Math.round(source.height * factor));
  const ctx = target.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, target.width, target.height);
  }
  return target;
}

async function renderInvoiceCanvas(
  invoice: Invoice,
  settings: AppSettings
): Promise<HTMLCanvasElement> {
  const width = 1240;
  const pad = 64;
  const contentW = width - pad * 2;
  const sym = settings.currencySymbol;

  const hasItemDiscount = invoice.lines.some((l) => Number(l.discount) > 0);
  const paymentMode = derivePaymentModeLabel(
    invoice.paidAmount,
    invoice.grandTotal,
    undefined,
    invoice.paymentMode
  );
  const amountWordsText = amountToWords(invoice.grandTotal, settings.currencyCode);
  const termsText = invoice.termsAndConditions || settings.invoiceTerms || '';

  const activeLogoUrl = invoice.logoSnapshotDataUrl ?? settings.companyLogoDataUrl;
  const showBrandName = invoice.showBrandNameSnapshot ?? settings.showBrandNameWithLogo ?? true;
  const brandName = invoice.companyNameSnapshot || settings.companyName;
  const brandAddress = invoice.companyAddressSnapshot || settings.companyAddress;
  const brandPhone = invoice.companyPhoneSnapshot || settings.companyPhone;

  const [logoImg, qrCanvas] = await Promise.all([
    activeLogoUrl ? loadImage(activeLogoUrl) : Promise.resolve(null),
    generateQrCanvas(`${invoice.id}|${invoice.customerId}|${invoice.grandTotal}`, 108),
  ]);

  // Pre-measure height so multi-item invoices never clip
  const measureCanvas = document.createElement('canvas');
  const mCtx = measureCanvas.getContext('2d')!;
  mCtx.font = '600 18px system-ui, -apple-system, sans-serif';
  const nameColW = hasItemDiscount ? 380 : 480;
  const rowMetrics = invoice.lines.map((line) => {
    const label = `${line.productName} · ${line.serviceName}`;
    const wrapped = wrapText(mCtx, label, nameColW - 16);
    const baseH = Math.max(46, wrapped.length * 22 + 22);
    const extraDiscH = hasItemDiscount && Number(line.discount) > 0 ? 14 : 0;
    return {
      wrapped,
      height: baseH + extraDiscH,
    };
  });

  mCtx.font = '400 16px system-ui, -apple-system, sans-serif';
  const termsLines = wrapText(mCtx, termsText, contentW);
  const wordsLines = wrapText(mCtx, amountWordsText, 540);
  const tableRowsH = rowMetrics.reduce((s, r) => s + r.height, 0);

  const summaryRowsCount =
    4 + // Subtotal + Total + Received + Due
    (invoice.extraCharges > 0 ? 1 : 0) +
    (Number(invoice.discountTotal) > 0 ? 1 : 0);

  const estimatedHeight =
    420 +
    46 + // table header
    tableRowsH +
    Math.max(summaryRowsCount * 42 + 40, wordsLines.length * 24 + 90) +
    termsLines.length * 22 +
    180;

  const height = Math.max(1754, estimatedHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  // Subtle top border
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  let y = pad;

  // HEADER LEFT: Logo + Brand
  let leftX = pad;
  let leftBottomY = y + 90;
  if (logoImg) {
    const maxH = 88;
    const ratio = (logoImg.naturalWidth || 200) / Math.max(1, logoImg.naturalHeight || 80);
    let drawH = maxH;
    let drawW = drawH * ratio;
    if (drawW > 240) {
      drawW = 240;
      drawH = drawW / Math.max(0.1, ratio);
    }
    ctx.drawImage(logoImg, pad, y, drawW, drawH);
    leftX = pad + drawW + 22;
    leftBottomY = Math.max(leftBottomY, y + drawH + 8);
  }

  let textY = y + 26;
  if (!logoImg || showBrandName) {
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 32px system-ui, -apple-system, sans-serif';
    ctx.fillText(brandName, leftX, textY);
    textY += 30;
  }
  ctx.fillStyle = '#475569';
  ctx.font = '400 18px system-ui, -apple-system, sans-serif';
  if (brandAddress) {
    for (const ln of wrapText(ctx, brandAddress, 460)) {
      ctx.fillText(ln, leftX, textY);
      textY += 22;
    }
  }
  if (brandPhone) {
    ctx.fillText(brandPhone, leftX, textY);
    textY += 22;
  }

  // HEADER RIGHT: Metadata + QR
  const qrSize = qrCanvas ? 108 : 0;
  const metaRightX = qrCanvas ? width - pad - qrSize - 18 : width - pad;
  if (qrCanvas) {
    ctx.drawImage(qrCanvas, width - pad - qrSize, y, qrSize, qrSize);
  }
  ctx.textAlign = 'right';
  let rightY = y + 22;
  ctx.fillStyle = '#0071E3';
  ctx.font = '700 22px system-ui, -apple-system, sans-serif';
  ctx.fillText('INVOICE', metaRightX, rightY);
  rightY += 28;
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 22px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(invoice.id, metaRightX, rightY);
  rightY += 24;
  ctx.fillStyle = '#475569';
  ctx.font = '400 17px system-ui, -apple-system, sans-serif';
  if (invoice.orderId) {
    ctx.fillText(`Order: ${invoice.orderId}`, metaRightX, rightY);
    rightY += 22;
  }
  ctx.fillText(`Issued: ${new Date(invoice.issuedAt).toLocaleDateString()}`, metaRightX, rightY);
  rightY += 22;
  ctx.fillText(`Due: ${new Date(invoice.dueDate).toLocaleDateString()}`, metaRightX, rightY);
  ctx.textAlign = 'left';

  y = Math.max(leftBottomY, textY, y + qrSize + 10, rightY + 12) + 18;
  ctx.strokeStyle = '#0071E3';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(width - pad, y);
  ctx.stroke();

  y += 28;

  // CUSTOMER & BILLING DETAILS
  const detTop = y;
  ctx.fillStyle = '#64748B';
  ctx.font = '700 14px system-ui, -apple-system, sans-serif';
  ctx.fillText('BILLED TO', pad, y);
  ctx.textAlign = 'right';
  ctx.fillText('BILLING DETAILS', width - pad, y);
  ctx.textAlign = 'left';

  y += 26;
  let custY = y;
  ctx.fillStyle = '#0F172A';
  ctx.font = '700 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(invoice.customerName, pad, custY);
  custY += 24;
  ctx.fillStyle = '#475569';
  ctx.font = '400 17px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(invoice.customerId, pad, custY);
  custY += 22;
  ctx.font = '400 17px system-ui, -apple-system, sans-serif';
  if (invoice.customerPhone) {
    ctx.fillText(invoice.customerPhone, pad, custY);
    custY += 22;
  }
  if (invoice.customerAddress) {
    for (const ln of wrapText(ctx, invoice.customerAddress, 500)) {
      ctx.fillText(ln, pad, custY);
      custY += 22;
    }
  }

  let billY = y;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#1E293B';
  ctx.font = '400 17px system-ui, -apple-system, sans-serif';
  ctx.fillText(
    `Account Type: ${invoice.isCorporate ? 'Corporate' : 'Retail'}`,
    width - pad,
    billY
  );
  billY += 24;
  if (invoice.isCorporate && invoice.billingBasis) {
    ctx.fillStyle = '#0071E3';
    ctx.font = '600 17px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Billing Basis: ${invoice.billingBasis}`, width - pad, billY);
    billY += 24;
    ctx.fillStyle = '#1E293B';
    ctx.font = '400 17px system-ui, -apple-system, sans-serif';
  }
  if (invoice.periodCovered) {
    ctx.fillText(`Period: ${invoice.periodCovered}`, width - pad, billY);
    billY += 24;
  }
  ctx.fillStyle = '#0F172A';
  ctx.font = '600 17px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Payment Mode: ${paymentMode}`, width - pad, billY);
  billY += 24;
  ctx.fillStyle = '#475569';
  ctx.font = '400 17px system-ui, -apple-system, sans-serif';
  ctx.fillText(`Terms: ${invoice.paymentTerms}`, width - pad, billY);
  billY += 24;
  ctx.textAlign = 'left';

  y = Math.max(custY, billY, detTop + 100) + 20;
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(width - pad, y);
  ctx.stroke();

  y += 28;

  // TABLE COLUMNS: S.N., Name, Quantity, Rate, [Discount], Amount
  const snX = pad + 14;
  const nameX = pad + 72;
  const qtyX = hasItemDiscount ? pad + 590 : pad + 700;
  const rateX = hasItemDiscount ? pad + 755 : pad + 885;
  const discX = pad + 935;
  const amtX = width - pad - 14;

  // Table header background
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(pad, y, contentW, 44);
  ctx.strokeStyle = '#0071E3';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(pad, y + 44);
  ctx.lineTo(width - pad, y + 44);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = '700 17px system-ui, -apple-system, sans-serif';
  ctx.fillText('S.N.', snX, y + 28);
  ctx.fillText('Name', nameX, y + 28);
  ctx.textAlign = 'right';
  ctx.fillText('Quantity', qtyX, y + 28);
  ctx.fillText('Rate', rateX, y + 28);
  if (hasItemDiscount) {
    ctx.fillText('Discount', discX, y + 28);
  }
  ctx.fillText('Amount', amtX, y + 28);
  ctx.textAlign = 'left';

  y += 44;

  // Rows
  invoice.lines.forEach((line, idx) => {
    const metric = rowMetrics[idx];
    const rowH = metric.height;
    if (idx % 2 === 1) {
      ctx.fillStyle = '#FAFCFF';
      ctx.fillRect(pad, y, contentW, rowH);
    }

    const textStartY = y + 28;
    ctx.fillStyle = '#64748B';
    ctx.font = '600 17px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(String(idx + 1), snX, textStartY);

    ctx.fillStyle = '#0F172A';
    ctx.font = '600 18px system-ui, -apple-system, sans-serif';
    metric.wrapped.forEach((ln, li) => {
      ctx.fillText(ln, nameX, textStartY + li * 22);
    });

    ctx.textAlign = 'right';
    ctx.font = '500 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = '#0F172A';
    ctx.fillText(String(line.quantity), qtyX, textStartY);
    ctx.fillText(formatMoney(line.unitPrice, sym), rateX, textStartY);

    if (hasItemDiscount) {
      const calc = computeLineNetAmount(line.quantity, line.unitPrice, line.discount);
      if (calc.discount > 0) {
        ctx.fillStyle = '#059669';
        ctx.font = '600 17px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(formatMoney(calc.discount, sym), discX, textStartY - 3);
        ctx.font = '500 14px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(`(${calc.discountPct}%)`, discX, textStartY + 15);
      } else {
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('—', discX, textStartY);
      }
    }

    ctx.fillStyle = '#0F172A';
    ctx.font = '700 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText(formatMoney(line.total, sym), amtX, textStartY);
    ctx.textAlign = 'left';

    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, y + rowH);
    ctx.lineTo(width - pad, y + rowH);
    ctx.stroke();

    y += rowH;
  });

  y += 28;

  // FOOTER: Left Amount in Words | Right 3-Color Summary
  const footerStartY = y;

  // Amount in Words Box
  const boxW = 570;
  const boxH = Math.max(82, wordsLines.length * 24 + 48);
  ctx.fillStyle = '#F8FAFC';
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.fillRect(pad, footerStartY, boxW, boxH);
  ctx.strokeRect(pad, footerStartY, boxW, boxH);

  ctx.fillStyle = '#64748B';
  ctx.font = '700 13px system-ui, -apple-system, sans-serif';
  ctx.fillText('AMOUNT IN WORDS', pad + 18, footerStartY + 24);
  ctx.fillStyle = '#0F172A';
  ctx.font = '600 17px system-ui, -apple-system, sans-serif';
  wordsLines.forEach((ln, li) => {
    ctx.fillText(ln, pad + 18, footerStartY + 50 + li * 24);
  });

  // Totals Column (3 colors: Subtotal violet, Discount emerald if > 0, Total Amount blue)
  const totW = 460;
  const totX = width - pad - totW;
  let ty = footerStartY;

  const drawSummaryRow = (
    label: string,
    val: string,
    opts?: { bg?: string; color?: string; bold?: boolean; topBlue?: boolean }
  ) => {
    const rowH = 38;
    if (opts?.bg) {
      ctx.fillStyle = opts.bg;
      ctx.fillRect(totX, ty, totW, rowH);
    }
    if (opts?.topBlue) {
      ctx.strokeStyle = '#0071E3';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(totX, ty);
      ctx.lineTo(totX + totW, ty);
      ctx.stroke();
    }
    ctx.fillStyle = opts?.color || '#334155';
    ctx.font = `${opts?.bold ? '700' : '500'} 18px system-ui, -apple-system, sans-serif`;
    ctx.fillText(label, totX + 14, ty + 25);
    ctx.textAlign = 'right';
    ctx.font = `${opts?.bold ? '700' : '500'} 18px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText(val, totX + totW - 14, ty + 25);
    ctx.textAlign = 'left';
    ty += rowH + 6;
  };

  drawSummaryRow('Subtotal', formatMoney(invoice.subtotal, sym), {
    bg: '#F5F3FF',
    color: '#6D28D9',
    bold: true,
  });
  if (invoice.extraCharges > 0) {
    drawSummaryRow('Additional Charges', formatMoney(invoice.extraCharges, sym));
  }
  if (Number(invoice.discountTotal) > 0) {
    drawSummaryRow('Discount', `-${formatMoney(invoice.discountTotal, sym)}`, {
      bg: '#ECFDF5',
      color: '#059669',
      bold: true,
    });
  }
  drawSummaryRow('Total Amount', formatMoney(invoice.grandTotal, sym), {
    bg: '#EFF6FF',
    color: '#0071E3',
    bold: true,
    topBlue: true,
  });
  drawSummaryRow('Received Amount', formatMoney(invoice.paidAmount, sym));
  drawSummaryRow('Amount Due', formatMoney(invoice.dueAmount, sym), {
    color: '#0F172A',
    bold: true,
  });

  y = Math.max(footerStartY + boxH, ty) + 32;
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(width - pad, y);
  ctx.stroke();
  y += 28;

  if (termsLines.length > 0) {
    ctx.fillStyle = '#334155';
    ctx.font = '700 16px system-ui, -apple-system, sans-serif';
    ctx.fillText('Terms & Conditions', pad, y);
    y += 22;
    ctx.fillStyle = '#64748B';
    ctx.font = '400 15px system-ui, -apple-system, sans-serif';
    for (const ln of termsLines) {
      ctx.fillText(ln, pad, y);
      y += 21;
    }
  }

  // Signatures block near bottom
  const sigY = Math.max(y + 72, height - 92);
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, sigY);
  ctx.lineTo(pad + 320, sigY);
  ctx.moveTo(width - pad - 320, sigY);
  ctx.lineTo(width - pad, sigY);
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = '500 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Customer Signature', pad + 160, sigY + 24);
  ctx.fillText('Laundry Authority Signature', width - pad - 160, sigY + 24);
  ctx.textAlign = 'left';

  return canvas;
}

export async function generateInvoiceImageBlob(
  invoice: Invoice,
  settings: AppSettings,
  format: InvoiceImageFormat
): Promise<InvoiceImageResult> {
  const key = buildCacheKey(invoice, settings, format);
  const cached = imageCache.get(key);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  let canvas = await renderInvoiceCanvas(invoice, settings);
  const ext = format === 'jpg' ? 'jpg' : 'png';
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const fileName = `${invoice.id}.${ext}`;

  let blob: Blob;
  if (format === 'jpg') {
    const qualities = [0.9, 0.8, 0.7, 0.58];
    blob = await canvasToBlob(canvas, mimeType, qualities[0]);
    for (let i = 1; i < qualities.length && blob.size >= MAX_IMAGE_BYTES; i++) {
      blob = await canvasToBlob(canvas, mimeType, qualities[i]);
    }
    let scale = 0.82;
    while (blob.size >= MAX_IMAGE_BYTES && scale >= 0.55) {
      const scaled = downscaleCanvas(canvas, scale);
      blob = await canvasToBlob(scaled, mimeType, 0.72);
      scale -= 0.14;
    }
  } else {
    blob = await canvasToBlob(canvas, mimeType);
    const scales = [0.85, 0.72, 0.6];
    for (let i = 0; i < scales.length && blob.size >= MAX_IMAGE_BYTES; i++) {
      const scaled = downscaleCanvas(canvas, scales[i]);
      blob = await canvasToBlob(scaled, mimeType);
    }
  }

  if (imageCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = imageCache.keys().next().value;
    if (oldestKey) imageCache.delete(oldestKey);
  }
  imageCache.set(key, { blob, fileName, bytes: blob.size });

  return {
    blob,
    fileName,
    bytes: blob.size,
    fromCache: false,
  };
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportInvoiceAsImage(
  invoice: Invoice,
  settings: AppSettings,
  format: InvoiceImageFormat
): Promise<InvoiceImageResult> {
  const res = await generateInvoiceImageBlob(invoice, settings, format);
  triggerBlobDownload(res.blob, res.fileName);
  return { ...res, shared: false };
}

export async function shareInvoiceImage(
  invoice: Invoice,
  settings: AppSettings,
  format: InvoiceImageFormat = 'jpg'
): Promise<InvoiceImageResult> {
  const res = await generateInvoiceImageBlob(invoice, settings, format);
  const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const file = new File([res.blob], res.fileName, { type: mimeType });

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        title: `Invoice ${invoice.id}`,
        text: `Invoice ${invoice.id} for ${invoice.customerName}`,
        files: [file],
      });
      return { ...res, shared: true };
    } catch {
      // Fall back to direct download if share sheet is dismissed or unsupported in iframe
    }
  }

  triggerBlobDownload(res.blob, res.fileName);
  return { ...res, shared: false };
}

export function clearInvoiceImageCache() {
  imageCache.clear();
}
