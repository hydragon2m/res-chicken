export type PrintableOrderItem = {
  productName: string;
  variantName?: string;
  quantity: number;
  lineTotal: number;
  options?: Array<{ name: string }>;
};

export type PrintableOrderData = {
  id: string;
  createdAt?: string;
  source?: string;
  tableCode?: string | null;
  subtotalAmount?: number;
  discountAmount?: number;
  voucherCode?: string | null;
  taxRate?: number;
  taxAmount?: number;
  totalAmount: number;
  paymentMethod?: string | null;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  storeTaxCode?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  items: PrintableOrderItem[];
};

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printHtmlDocument(html: string) {
  const existing = document.getElementById('chick-res-print-frame');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.id = 'chick-res-print-frame';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) return;

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => {
        iframe.remove();
      }, 2000);
    }
  };

  if (doc.readyState === 'complete') {
    window.setTimeout(triggerPrint, 150);
  } else {
    iframe.onload = () => window.setTimeout(triggerPrint, 150);
  }
}

export function printOrderReceipt(order: PrintableOrderData) {
  const shortId = order.id.slice(0, 8).toUpperCase();
  const timeStr = order.createdAt
    ? new Date(order.createdAt).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : new Date().toLocaleString('vi-VN');

  const storeTitle = escapeHtml(order.storeName || 'CHICK RES SYSTEM');
  const headerNote = order.receiptHeader ? `<div class="sub italic">${escapeHtml(order.receiptHeader)}</div>` : '';
  const addressLine = order.storeAddress ? `<div class="sub">${escapeHtml(order.storeAddress)}</div>` : '';
  const phoneLine = order.storePhone ? `<div class="sub">Hotline: ${escapeHtml(order.storePhone)}</div>` : '';
  const taxLine = order.storeTaxCode ? `<div class="sub">MST: ${escapeHtml(order.storeTaxCode)}</div>` : '';
  const channelLabel = order.tableCode
    ? `Tại bàn: ${escapeHtml(order.tableCode)}`
    : order.source === 'QR'
      ? 'Khách đặt QR tại bàn'
      : 'Tại quầy POS';

  const paymentLabel =
    order.paymentMethod === 'CASH'
      ? 'Tiền mặt (CASH)'
      : order.paymentMethod
        ? 'Chuyển khoản VietQR'
        : 'Chưa thanh toán';

  const itemsHtml = order.items
    .map((item) => {
      const variantPart = item.variantName ? ` (${escapeHtml(item.variantName)})` : '';
      const optsPart =
        item.options && item.options.length > 0
          ? `<div class="item-opt">+ ${item.options.map((o) => escapeHtml(o.name)).join(', ')}</div>`
          : '';
      return `
        <tr>
          <td class="col-name">
            <div class="item-title">${escapeHtml(item.productName)}${variantPart}</div>
            ${optsPart}
          </td>
          <td class="col-qty">${item.quantity}</td>
          <td class="col-price">${money.format(item.lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  const subtotal = order.subtotalAmount ?? order.totalAmount;
  const discountRow =
    (order.discountAmount ?? 0) > 0
      ? `<div class="sum-row">
          <span>Giảm giá${order.voucherCode ? ` (${escapeHtml(order.voucherCode)})` : ''}:</span>
          <span>-${money.format(order.discountAmount!)}</span>
        </div>`
      : '';
  const taxRow =
    (order.taxAmount ?? 0) > 0
      ? `<div class="sum-row">
          <span>Thuế VAT (${Math.round((order.taxRate ?? 0) * 100)}%):</span>
          <span>+${money.format(order.taxAmount!)}</span>
        </div>`
      : '';

  const footerText = escapeHtml(
    order.receiptFooter || 'Cảm ơn quý khách và hẹn gặp lại tại Chick Res!',
  );

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Hóa đơn #${shortId}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 4mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      color: #000;
      background: #fff;
      width: 72mm;
      max-width: 100%;
      margin: 0 auto;
      padding: 4px 2px;
      font-size: 12px;
      line-height: 1.45;
    }
    .center {
      text-align: center;
    }
    .store-name {
      font-size: 15px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }
    .sub {
      font-size: 11px;
      color: #222;
      margin-top: 2px;
    }
    .italic {
      font-style: italic;
    }
    .divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .receipt-title {
      font-size: 14px;
      font-weight: 800;
      text-transform: uppercase;
      margin-top: 6px;
    }
    .meta {
      font-size: 11px;
      margin: 6px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0;
    }
    th {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      border-bottom: 1px solid #000;
      padding: 4px 0;
      text-align: left;
    }
    td {
      padding: 5px 0;
      vertical-align: top;
      border-bottom: 1px dotted #ccc;
      font-size: 12px;
    }
    .col-name {
      width: 58%;
      padding-right: 4px;
    }
    .col-qty {
      width: 12%;
      text-align: center;
      font-weight: 700;
    }
    .col-price {
      width: 30%;
      text-align: right;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    th.col-qty { text-align: center; }
    th.col-price { text-align: right; }
    .item-title {
      font-weight: 600;
    }
    .item-opt {
      font-size: 10px;
      color: #333;
      margin-top: 1px;
    }
    .sum-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin: 3px 0;
      font-variant-numeric: tabular-nums;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 15px;
      font-weight: 800;
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 6px 0;
      margin: 6px 0;
      font-variant-numeric: tabular-nums;
    }
    .footer {
      text-align: center;
      font-size: 11px;
      margin-top: 10px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="center">
    ${headerNote}
    <div class="store-name">${storeTitle}</div>
    ${addressLine}
    ${phoneLine}
    ${taxLine}
    <div class="receipt-title">HÓA ĐƠN THANH TOÁN</div>
  </div>

  <div class="divider"></div>

  <div class="meta">
    <div class="meta-row">
      <span>Mã phiếu:</span>
      <strong>#${shortId}</strong>
    </div>
    <div class="meta-row">
      <span>Thời gian:</span>
      <span>${escapeHtml(timeStr)}</span>
    </div>
    <div class="meta-row">
      <span>Phục vụ:</span>
      <strong>${channelLabel}</strong>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="col-name">Tên món</th>
        <th class="col-qty">SL</th>
        <th class="col-price">Thành tiền</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="sum-row">
    <span>Tạm tính:</span>
    <span>${money.format(subtotal)}</span>
  </div>
  ${discountRow}
  ${taxRow}

  <div class="total-row">
    <span>TỔNG CỘNG:</span>
    <span>${money.format(order.totalAmount)}</span>
  </div>

  <div class="sum-row">
    <span>Thanh toán:</span>
    <strong>${paymentLabel}</strong>
  </div>

  <div class="divider"></div>
  <div class="footer">${footerText}</div>
</body>
</html>`;

  printHtmlDocument(html);
}

export function printTableQrCard(params: {
  storeName: string;
  tableCode: string;
  tableName: string;
  qrDataUrl: string;
}) {
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Mã QR ${escapeHtml(params.tableCode)}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 6mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      text-align: center;
      color: #000;
      background: #fff;
      width: 72mm;
      margin: 0 auto;
      padding: 8px;
    }
    .card {
      border: 2px solid #000;
      border-radius: 12px;
      padding: 14px 10px;
    }
    .brand {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .table-title {
      font-size: 20px;
      font-weight: 900;
      margin: 6px 0 2px;
    }
    .table-sub {
      font-size: 12px;
      margin-bottom: 10px;
    }
    img {
      width: 180px;
      height: 180px;
      display: block;
      margin: 0 auto 10px;
    }
    .guide {
      font-size: 11px;
      line-height: 1.4;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">${escapeHtml(params.storeName || 'CHICK RES')}</div>
    <div class="table-title">${escapeHtml(params.tableCode)}</div>
    <div class="table-sub">${escapeHtml(params.tableName)}</div>
    <img src="${params.qrDataUrl}" alt="QR ${escapeHtml(params.tableCode)}" />
    <div class="guide">Quét mã QR bằng Camera hoặc Zalo để xem thực đơn & gọi món tại bàn</div>
  </div>
</body>
</html>`;

  printHtmlDocument(html);
}
