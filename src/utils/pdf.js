import crypto from "crypto";
import PDFDocument from "pdfkit";

// Professional currency formatting for PDF (avoids Unicode glyph corruption of rupee symbol)
export function fmtMoney(n) {
  const val = Number(n) || 0;
  return "Rs. " + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtNum(n) {
  const val = Number(n) || 0;
  return val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Computes dynamic row height based on text length across all columns
function computeRowHeight(doc, cols, widths, fontSize = 8.5) {
  doc.fontSize(fontSize).font("Helvetica");
  let maxTextH = 12;
  cols.forEach((text, i) => {
    const textStr = String(text ?? "");
    const h = doc.heightOfString(textStr, {
      width: widths[i] - 10,
      align: "left",
    });
    if (h > maxTextH) {
      maxTextH = h;
    }
  });
  return Math.ceil(maxTextH + 12); // 6pt padding top & 6pt padding bottom
}

// Draws table header banner
function drawTableHeader(doc, y, headers, widths, headerH = 22) {
  const totalW = widths.reduce((a, b) => a + b, 0);
  doc.save();
  doc.rect(40, y, totalW, headerH).fill("#12221c");
  doc.restore();

  let x = 40;
  headers.forEach((h, i) => {
    const isCenter = ["S.No", "Dori#", "Glb Dori#", "Size", "Date", "Status"].some((k) => h.includes(k));
    const isRight = ["Qty", "Rate", "Total", "Basic", "Amount"].some((k) => h.includes(k));
    const align = isCenter ? "center" : isRight ? "right" : "left";

    doc
      .fillColor("#e8c36a")
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(h, x + 4, y + 6, {
        width: widths[i] - 8,
        align,
      });
    x += widths[i];
  });

  return y + headerH;
}

// Draws a table row with dynamic height to prevent ANY text overlapping
function drawTableRowDynamic(doc, y, cols, widths, opts = {}) {
  const fontSize = opts.size || 8.5;
  const h = opts.h || computeRowHeight(doc, cols, widths, fontSize);
  const totalW = widths.reduce((a, b) => a + b, 0);

  // Background fill
  if (opts.fill) {
    doc.save();
    doc.rect(40, y, totalW, h).fill(opts.fill);
    doc.restore();
  }

  // Row bottom border
  doc.save();
  doc.strokeColor(opts.borderColor || "#e8dfcc").lineWidth(0.5);
  doc.moveTo(40, y + h).lineTo(40 + totalW, y + h).stroke();
  doc.restore();

  // Cell text
  let x = 40;
  cols.forEach((text, i) => {
    const align = opts.align?.[i] || "left";
    const cellFont = opts.isBold?.[i] || opts.bold ? "Helvetica-Bold" : "Helvetica";
    const cellColor = opts.cellColors?.[i] || opts.color || "#12221c";

    doc
      .fillColor(cellColor)
      .font(cellFont)
      .fontSize(fontSize)
      .text(String(text ?? ""), x + 4, y + 6, {
        width: widths[i] - 8,
        align,
        lineBreak: true,
      });
    x += widths[i];
  });

  return y + h;
}

// Generates PDF into in-memory Buffer (NO DISK WRITE)
// Clean layout, NO client GST details, dynamic row wrapping for long lanyard names
export function buildDispatchRangePdfBuffer({ company, client, fromNo, toNo, rows = [], generatedAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      // Add page numbers on all pages
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fillColor("#888888").font("Helvetica").fontSize(7.5).text(
          `Page ${i + 1} of ${totalPages}   ·   EKAKSHAR ENTERPRISES · Lanyard & Dori Manufacturing Report`,
          40,
          810,
          { width: 515, align: "center" }
        );
      }
      doc.flushPages();
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);

    // Top Header Banner
    doc.rect(0, 0, 595, 75).fill("#12221c");
    doc.fillColor("#e8c36a").font("Helvetica-Bold").fontSize(16).text(company.companyName || "EKAKSHAR ENTERPRISES", 40, 20);
    doc.fillColor("#f4efe4").font("Helvetica").fontSize(9).text(company.tagline || "Lanyard & Dori Manufacturing", 40, 42);
    doc.fillColor("#e8c36a").font("Helvetica-Bold").fontSize(13).text("DISPATCH REPORT", 360, 20, { align: "right", width: 195 });
    doc.fillColor("#f4efe4").font("Helvetica").fontSize(8.5).text(`Date: ${(generatedAt || new Date()).toLocaleDateString("en-IN")}`, 360, 40, {
      align: "right",
      width: 195,
    });
    if (fromNo || toNo) {
      doc.fillColor("#ded8c7").font("Helvetica").fontSize(8).text(`S.No Range: #${fromNo || 1} to #${toNo || rows.length}`, 360, 54, {
        align: "right",
        width: 195,
      });
    }

    let y = 88;

    // Client Info Box (NO Client GST details as requested)
    const clientName = client?.name || "All Clients Summary";
    const contactParts = [];
    if (client?.contactPerson) contactParts.push(`Contact: ${client.contactPerson}`);
    if (client?.mobile) contactParts.push(`Mobile: ${client.mobile}`);
    if (client?.address) contactParts.push(`Address: ${client.address}`);
    const contactText = contactParts.join("   |   ");

    doc.font("Helvetica-Bold").fontSize(11);
    const clientNameH = doc.heightOfString(clientName, { width: 495 });
    doc.font("Helvetica").fontSize(8);
    const contactH = contactText ? doc.heightOfString(contactText, { width: 495 }) : 0;

    const cardH = 8 + 10 + clientNameH + (contactH ? 4 + contactH : 0) + 8;
    doc.rect(40, y, 515, cardH).fill("#fcfaf4");
    doc.rect(40, y, 515, cardH).strokeColor("#e8dfcc").lineWidth(0.8).stroke();

    let curY = y + 8;
    doc.fillColor("#7a7265").font("Helvetica-Bold").fontSize(7).text("CLIENT DETAILS:", 50, curY);
    curY += 10;
    doc.fillColor("#12221c").font("Helvetica-Bold").fontSize(11).text(clientName, 50, curY, { width: 495 });
    curY += clientNameH + 3;
    if (contactText) {
      doc.fillColor("#555555").font("Helvetica").fontSize(8).text(contactText, 50, curY, { width: 495 });
    }

    y += cardH + 12;

    // Table widths (Total = 515)
    // S.No: 32, Glb Dori#: 38, Date: 52, Lanyard Name: 173, Size: 40, Qty: 45, Rate: 48, Total: 55, Status: 32
    const widths = [32, 38, 52, 173, 40, 45, 48, 55, 32];
    const headers = ["S.No", "Dori#", "Date", "Lanyard / Description", "Size", "Qty", "Rate (Rs)", "Total (Rs)", "Status"];

    y = drawTableHeader(doc, y, headers, widths, 22);

    let totalQty = 0;
    let totalAmt = 0;
    const sizeMap = {};

    rows.forEach((r, idx) => {
      const clientSerial = String(r.clientDoriNo || idx + 1);
      const globalDori = String(r.doriNo ? `#${r.doriNo}` : "—");
      const dateStr = r.date ? new Date(r.date).toLocaleDateString("en-IN") : "—";
      const itemName = r.itemName || "Custom Lanyard";
      const sizeName = r.sizeName || "—";
      const qty = r.quantity || 0;
      const rateStr = fmtNum(r.rate);
      const rowTotal = r.total || qty * (r.rate || 0);
      const totalStr = fmtNum(rowTotal);
      const statusText = r.isBilled ? "Billed" : "Due";

      totalQty += qty;
      totalAmt += rowTotal;
      sizeMap[sizeName] = (sizeMap[sizeName] || 0) + qty;

      const colData = [clientSerial, globalDori, dateStr, itemName, sizeName, `${qty}`, rateStr, totalStr, statusText];
      const rowHeight = computeRowHeight(doc, colData, widths, 8);

      // Clean Page Break if needed
      if (y + rowHeight > 740) {
        doc.addPage();
        y = 40;
        y = drawTableHeader(doc, y, headers, widths, 22);
      }

      y = drawTableRowDynamic(doc, y, colData, widths, {
        fill: r.isBilled ? "#f0fdf4" : idx % 2 ? "#faf8f3" : "#ffffff",
        color: "#12221c",
        size: 8,
        h: rowHeight,
        align: ["center", "center", "center", "left", "center", "right", "right", "right", "center"],
        isBold: [true, false, false, true, false, false, false, true, true],
        cellColors: [
          "#12221c",
          "#666666",
          "#444444",
          "#12221c",
          "#444444",
          "#12221c",
          "#333333",
          "#12221c",
          r.isBilled ? "#15803d" : "#b45309",
        ],
      });
    });

    y += 12;
    if (y > 700) {
      doc.addPage();
      y = 40;
    }

    // Size Summary Line
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#12221c").text("Size-wise Breakdown:", 40, y);
    y += 12;
    const sizes = Object.keys(sizeMap).sort();
    const sizeLine = sizes.map((s) => `${s}: ${sizeMap[s]} pcs`).join("   |   ");
    doc.font("Helvetica").fontSize(8).fillColor("#555555").text(sizeLine || "None", 40, y);
    y += 16;

    // Totals Box
    doc.rect(40, y, 515, 36).fill("#12221c");
    doc.fillColor("#e8c36a").font("Helvetica-Bold").fontSize(9.5).text(`Total Dispatches: ${rows.length} items   |   Total Pieces: ${totalQty} pcs`, 52, y + 12);
    doc.fillColor("#f4efe4").font("Helvetica-Bold").fontSize(10).text(`Grand Total: ${fmtMoney(totalAmt)}`, 350, y + 12, { width: 195, align: "right" });

    doc.end();
  });
}

// Generates formal Client Invoice / Bill in memory as Buffer (NO DISK WRITE)
// NO CLIENT GST DETAILS, DYNAMIC ROW HEIGHT, PREVIOUS BALANCE DUE & INSTALLMENTS BREAKDOWN
export function buildClientInvoicePdfBuffer({
  company,
  client,
  billNo,
  billDate,
  rows = [],
  notes,
  previousDue = 0,
  previousBillNo = "",
  paidAmount = 0,
  balanceDue = 0,
  payments = [],
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      // Add page numbers on all pages
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fillColor("#888888").font("Helvetica").fontSize(7.5).text(
          `Page ${i + 1} of ${totalPages}   ·   Thank you for your business! EKAKSHAR ENTERPRISES`,
          40,
          810,
          { width: 515, align: "center" }
        );
      }
      doc.flushPages();
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);

    // Top Header Banner
    doc.rect(0, 0, 595, 75).fill("#12221c");
    doc.fillColor("#e8c36a").font("Helvetica-Bold").fontSize(16).text(company.companyName || "EKAKSHAR ENTERPRISES", 40, 20);
    doc.fillColor("#f4efe4").font("Helvetica").fontSize(9).text(company.tagline || "Lanyard & Dori Manufacturing", 40, 42);

    doc.fillColor("#e8c36a").font("Helvetica-Bold").fontSize(14).text("BILL / INVOICE", 370, 18, { align: "right", width: 185 });
    doc.fillColor("#f4efe4").font("Helvetica-Bold").fontSize(9.5).text(`Bill No: ${billNo}`, 370, 38, { align: "right", width: 185 });
    doc.fillColor("#ded8c7").font("Helvetica").fontSize(8.5).text(`Date: ${new Date(billDate || Date.now()).toLocaleDateString("en-IN")}`, 370, 53, {
      align: "right",
      width: 185,
    });

    let y = 88;

    // Client Details Card (NO Client GST details as requested)
    const clientName = client?.name || "Client Name";
    const contactParts = [];
    if (client?.contactPerson) contactParts.push(`Contact: ${client.contactPerson}`);
    if (client?.mobile) contactParts.push(`Mobile: ${client.mobile}`);
    if (client?.address) contactParts.push(`Address: ${client.address}`);
    const contactText = contactParts.join("   |   ");

    doc.font("Helvetica-Bold").fontSize(11.5);
    const clientNameH = doc.heightOfString(clientName, { width: 495 });
    doc.font("Helvetica").fontSize(8);
    const contactH = contactText ? doc.heightOfString(contactText, { width: 495 }) : 0;

    const cardH = 8 + 10 + clientNameH + (contactH ? 4 + contactH : 0) + 8;
    doc.rect(40, y, 515, cardH).fill("#fcfaf4");
    doc.rect(40, y, 515, cardH).strokeColor("#e8dfcc").lineWidth(0.8).stroke();

    let curY = y + 8;
    doc.fillColor("#7a7265").font("Helvetica-Bold").fontSize(7).text("BILLED TO (CLIENT):", 50, curY);
    curY += 10;
    doc.fillColor("#12221c").font("Helvetica-Bold").fontSize(11.5).text(clientName, 50, curY, { width: 495 });
    curY += clientNameH + 3;
    if (contactText) {
      doc.fillColor("#555555").font("Helvetica").fontSize(8).text(contactText, 50, curY, { width: 495 });
    }

    y += cardH + 12;

    // Table widths (Total = 515):
    // S.No: 35, Date: 55, Description / Lanyard Name: 195, Size: 45, Qty: 45, Rate (Rs): 60, Total (Rs): 80
    const widths = [35, 55, 195, 45, 45, 60, 80];
    const headers = ["S.No", "Date", "Description / Lanyard Name", "Size", "Qty", "Rate (Rs)", "Total (Rs)"];

    y = drawTableHeader(doc, y, headers, widths, 22);

    let totalQty = 0;
    let itemsSubtotal = 0;

    rows.forEach((r, idx) => {
      const serialDisplay = String(r.clientDoriNo || idx + 1);
      const dateDisplay = r.date ? new Date(r.date).toLocaleDateString("en-IN") : "—";
      const itemName = r.itemName || "Custom Lanyard";
      const sizeName = r.sizeName || "—";
      const qty = r.quantity || 0;
      const rateStr = fmtNum(r.rate);
      const rowTotal = r.total || qty * (r.rate || 0);
      const totalStr = fmtNum(rowTotal);

      totalQty += qty;
      itemsSubtotal += rowTotal;

      const colData = [serialDisplay, dateDisplay, itemName, sizeName, `${qty}`, rateStr, totalStr];
      const rowHeight = computeRowHeight(doc, colData, widths, 8.5);

      // Clean Page Break if needed
      if (y + rowHeight > 730) {
        doc.addPage();
        y = 40;
        y = drawTableHeader(doc, y, headers, widths, 22);
      }

      y = drawTableRowDynamic(doc, y, colData, widths, {
        fill: idx % 2 ? "#faf8f3" : "#ffffff",
        color: "#12221c",
        size: 8.5,
        h: rowHeight,
        align: ["center", "center", "left", "center", "right", "right", "right"],
        isBold: [true, false, true, false, false, false, true],
        cellColors: ["#12221c", "#555555", "#12221c", "#444444", "#12221c", "#333333", "#12221c"],
      });
    });

    y += 14;

    const prevDueNum = Number(previousDue || 0);
    const invoiceGrandTotal = itemsSubtotal + prevDueNum;
    const paidNum = Number(paidAmount || 0);
    const netBalanceDue = Math.max(0, invoiceGrandTotal - paidNum);

    // Height needed for totals box
    let totH = 68;
    if (prevDueNum > 0) totH += 22;
    if (paidNum > 0) totH += 38;

    // Check if totals box fits on this page
    if (y + totH + 20 > 740) {
      doc.addPage();
      y = 40;
    }

    // Left Box: Notes & Payments / Installments Breakdown
    const leftW = 255;
    let leftY = y;

    if (notes) {
      doc.fillColor("#444444").font("Helvetica-Bold").fontSize(7.5).text("NOTES / TERMS:", 40, leftY);
      leftY += 10;
      doc.fillColor("#555555").font("Helvetica").fontSize(8).text(notes, 40, leftY, { width: leftW });
      leftY += 18;
    }

    if (payments && payments.length > 0) {
      const payH = Math.min(payments.length * 14 + 24, 90);
      doc.rect(40, leftY, leftW, payH).fill("#fcfaf4");
      doc.rect(40, leftY, leftW, payH).strokeColor("#e8dfcc").lineWidth(0.8).stroke();

      doc.fillColor("#7a7265").font("Helvetica-Bold").fontSize(7).text("PAYMENTS / INSTALLMENTS RECEIVED:", 48, leftY + 6);
      let py = leftY + 18;
      payments.slice(0, 4).forEach((p) => {
        const pDate = p.date ? new Date(p.date).toLocaleDateString("en-IN") : "";
        const pMode = (p.mode || "UPI").toUpperCase();
        const pRef = p.reference ? ` (${p.reference})` : "";
        const pLine = `${pDate} · ${pMode}${pRef}`;
        doc.fillColor("#333333").font("Helvetica").fontSize(7.5).text(pLine, 48, py, { width: 130, ellipsis: true });
        doc.fillColor("#15803d").font("Helvetica-Bold").fontSize(7.5).text(`-${fmtMoney(p.amount)}`, 180, py, { width: 108, align: "right" });
        py += 13;
      });
    }

    // Right Box: Totals Breakdown Box
    const totW = 240;
    const totX = 555 - totW;

    doc.rect(totX, y, totW, totH).fill("#fcfaf4");
    doc.rect(totX, y, totW, totH).strokeColor("#e8dfcc").lineWidth(0.8).stroke();

    let curTotY = y + 8;

    doc.fillColor("#444444").font("Helvetica").fontSize(8);
    doc.text(`Total Dispatches:`, totX + 12, curTotY);
    doc.font("Helvetica-Bold").text(`${rows.length} items (${totalQty} pcs)`, totX + 110, curTotY, { width: 118, align: "right" });
    curTotY += 14;

    doc.font("Helvetica").text(`Current Items Subtotal:`, totX + 12, curTotY);
    doc.font("Helvetica-Bold").text(fmtMoney(itemsSubtotal), totX + 110, curTotY, { width: 118, align: "right" });
    curTotY += 14;

    if (prevDueNum > 0) {
      const prevLabel = previousBillNo ? `Last Due (Bill #${previousBillNo}):` : `Previous Balance Due:`;
      doc.fillColor("#b45309").font("Helvetica-Bold").text(prevLabel, totX + 12, curTotY, { width: 130, ellipsis: true });
      doc.fillColor("#b45309").font("Helvetica-Bold").text(`+${fmtMoney(prevDueNum)}`, totX + 110, curTotY, { width: 118, align: "right" });
      curTotY += 16;
    }

    if (paidNum > 0) {
      doc.fillColor("#15803d").font("Helvetica-Bold").text(`Less: Payments Received:`, totX + 12, curTotY);
      doc.fillColor("#15803d").font("Helvetica-Bold").text(`-${fmtMoney(paidNum)}`, totX + 110, curTotY, { width: 118, align: "right" });
      curTotY += 16;

      // Net Balance Due Banner
      doc.rect(totX, curTotY, totW, 26).fill("#12221c");
      doc.fillColor("#e8c36a").font("Helvetica-Bold").fontSize(10).text(`Net Balance Due:`, totX + 12, curTotY + 7);
      doc.fillColor("#f4efe4").font("Helvetica-Bold").fontSize(10.5).text(fmtMoney(netBalanceDue), totX + 100, curTotY + 7, { width: 128, align: "right" });
    } else {
      // Grand Total Banner
      doc.rect(totX, curTotY, totW, 26).fill("#12221c");
      doc.fillColor("#e8c36a").font("Helvetica-Bold").fontSize(10).text(`Grand Total:`, totX + 12, curTotY + 7);
      doc.fillColor("#f4efe4").font("Helvetica-Bold").fontSize(10.5).text(fmtMoney(invoiceGrandTotal), totX + 100, curTotY + 7, { width: 128, align: "right" });
    }

    doc.end();
  });
}

// Generates Dashboard Summary PDF Buffer (NO DISK WRITE)
export function buildDashboardPdfBuffer({ company, periodName, fromDate, toDate, summary, salesRows = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const totalPages = doc.bufferedPageRange().count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        doc.fillColor("#888888").font("Helvetica").fontSize(7.5).text(
          `Page ${i + 1} of ${totalPages}   ·   EKAKSHAR ENTERPRISES · Business Performance Report`,
          40,
          810,
          { width: 515, align: "center" }
        );
      }
      doc.flushPages();
      resolve(Buffer.concat(chunks));
    });
    doc.on("error", reject);

    // Top Header
    doc.rect(0, 0, 595, 75).fill("#12221c");
    doc.fillColor("#e8c36a").font("Helvetica-Bold").fontSize(16).text(company.companyName || "EKAKSHAR ENTERPRISES", 40, 20);
    doc.fillColor("#f4efe4").font("Helvetica").fontSize(9).text(company.tagline || "Lanyard & Dori Manufacturing", 40, 42);
    doc.fillColor("#e8c36a").font("Helvetica-Bold").fontSize(13).text("DASHBOARD REPORT", 350, 20, { align: "right", width: 205 });
    doc.fillColor("#f4efe4").font("Helvetica").fontSize(8.5).text(`Period: ${periodName || "Report"} (${fromDate || ""} - ${toDate || ""})`, 350, 42, {
      align: "right",
      width: 205,
    });

    let y = 88;

    // KPI Cards Grid (4x2)
    const kpis = [
      ["Sales Amount", fmtMoney(summary.sales?.basic || summary.periodSales || 0)],
      ["Dispatches Qty", `${summary.sales?.qty || summary.periodQty || 0} pcs`],
      ["Purchases", fmtMoney(summary.purchases?.total || summary.periodPurchase || 0)],
      ["Expenses", fmtMoney(summary.expenses || summary.periodExpenses || 0)],
      ["Gross Profit", fmtMoney(summary.grossProfit || 0)],
      ["Net Profit", fmtMoney(summary.netProfit || 0)],
      ["Outstanding Due", fmtMoney(summary.outstanding || 0)],
      ["Raw Material Stock", fmtMoney(summary.stockValue || 0)],
    ];

    const cardW = 120;
    const cardH = 38;
    kpis.forEach(([label, val], idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const cx = 40 + col * (cardW + 11);
      const cy = y + row * (cardH + 8);

      doc.rect(cx, cy, cardW, cardH).fill("#fcfaf4");
      doc.rect(cx, cy, cardW, cardH).strokeColor("#e8dfcc").lineWidth(0.6).stroke();
      doc.fillColor("#7a7265").font("Helvetica-Bold").fontSize(6.5).text(label.toUpperCase(), cx + 7, cy + 6);
      doc.fillColor("#12221c").font("Helvetica-Bold").fontSize(9.5).text(String(val), cx + 7, cy + 19);
    });

    y += 2 * (cardH + 8) + 16;

    // Recent dispatches in this period
    doc.fillColor("#12221c").font("Helvetica-Bold").fontSize(10.5).text(`Dispatches in this Period (${salesRows.length} items):`, 40, y);
    y += 14;

    const widths = [35, 35, 52, 115, 138, 40, 45, 55];
    const headers = ["Dori#", "S.No", "Date", "Client", "Lanyard / Description", "Size", "Qty", "Total (Rs)"];
    y = drawTableHeader(doc, y, headers, widths, 22);

    salesRows.slice(0, 50).forEach((r, idx) => {
      const colData = [
        `#${r.doriNo}`,
        `#${r.clientDoriNo || 1}`,
        r.date ? new Date(r.date).toLocaleDateString("en-IN") : "—",
        r.client?.name || "Client",
        r.itemName || "Custom Lanyard",
        r.sizeName || "—",
        `${r.quantity}`,
        fmtNum(r.total),
      ];

      const rowHeight = computeRowHeight(doc, colData, widths, 7.5);

      if (y + rowHeight > 740) {
        doc.addPage();
        y = 40;
        y = drawTableHeader(doc, y, headers, widths, 22);
      }

      y = drawTableRowDynamic(doc, y, colData, widths, {
        fill: idx % 2 ? "#faf8f3" : "#ffffff",
        color: "#12221c",
        size: 7.5,
        h: rowHeight,
        align: ["center", "center", "center", "left", "left", "center", "right", "right"],
        isBold: [true, false, false, true, false, false, false, true],
      });
    });

    doc.end();
  });
}

export function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

