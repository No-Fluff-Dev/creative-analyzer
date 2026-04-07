import jsPDF from "jspdf";

const PRIMARY = "#111111";
const ACCENT = "#6366F1";
const MUTED = "#888888";
const LIGHT = "#F5F5F5";
const BORDER = "#E5E5E5";
const GREEN = "#15803D";
const GREEN_BG = "#F0FDF4";
const RED = "#B91C1C";
const RED_BG = "#FEF2F2";
const AMBER = "#B45309";
const AMBER_BG = "#FFFBEB";

const PW = 210; // A4 portrait width mm
const PH = 297; // A4 portrait height mm
const ML = 20; // margin left
const MR = 20; // margin right
const CW = PW - ML - MR; // content width

const DIMS = [
  { key: "visual_hierarchy", name: "Visual Hierarchy" },
  { key: "clarity_readability", name: "Clarity & Readability" },
  { key: "three_second_test", name: "3-Second Test" },
  { key: "behavioural_triggers", name: "Behavioural Triggers" },
  { key: "cta_strength", name: "CTA Strength" },
  { key: "cognitive_load", name: "Cognitive Load" },
  { key: "emotional_resonance", name: "Emotional Resonance" },
  { key: "brand_consistency", name: "Brand Consistency" },
];

function scoreColor(s: number) {
  if (s >= 75) return GREEN;
  if (s >= 50) return AMBER;
  return RED;
}
function scoreBgColor(s: number) {
  if (s >= 75) return GREEN_BG;
  if (s >= 50) return AMBER_BG;
  return RED_BG;
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function setFill(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}
function setTextColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}
function setDrawColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

// Wrap text to fit within maxWidth
function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth);
}

// Draw page header
function drawHeader(doc: jsPDF, pageNum: number, totalPages: number) {
  // Top bar
  setFill(doc, PRIMARY);
  doc.rect(0, 0, PW, 12, "F");

  // Logo text
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setTextColor(doc, "#FFFFFF");
  doc.text("NO FLUFF", ML, 7.5);

  // Signal tag
  setFill(doc, ACCENT);
  doc.roundedRect(PW - MR - 28, 2.5, 28, 7, 1, 1, "F");
  doc.setFontSize(7);
  setTextColor(doc, "#FFFFFF");
  doc.text("SIGNAL REPORT", PW - MR - 14, 7.5, { align: "center" });

  // Footer
  setFill(doc, LIGHT);
  doc.rect(0, PH - 10, PW, 10, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  setTextColor(doc, MUTED);
  doc.text("No Fluff. Just Science. — preflyght.nofluff.in", ML, PH - 4);
  doc.text(`${pageNum} / ${totalPages}`, PW - MR, PH - 4, { align: "right" });
}

// Draw a section heading
function sectionHeading(doc: jsPDF, label: string, y: number) {
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  setTextColor(doc, MUTED);
  doc.text(label.toUpperCase(), ML, y);
  setDrawColor(doc, BORDER);
  doc.setLineWidth(0.3);
  doc.line(
    ML + doc.getTextWidth(label.toUpperCase()) + 3,
    y - 0.5,
    PW - MR,
    y - 0.5,
  );
  return y + 6;
}

// Draw score pill
function scorePill(
  doc: jsPDF,
  score: number,
  x: number,
  y: number,
  w = 18,
  h = 7,
) {
  setFill(doc, scoreBgColor(score));
  doc.roundedRect(x, y - h + 1, w, h, 1.5, 1.5, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setTextColor(doc, scoreColor(score));
  doc.text(`${score}`, x + w / 2, y - 0.5, { align: "center" });
}

// Draw score bar
function scoreBar(doc: jsPDF, score: number, x: number, y: number, w: number) {
  setFill(doc, BORDER);
  doc.roundedRect(x, y, w, 2.5, 0.5, 0.5, "F");
  setFill(doc, scoreColor(score));
  doc.roundedRect(x, y, (score / 100) * w, 2.5, 0.5, 0.5, "F");
}

export interface PDFReportData {
  creative: { dataUrl: string | null; type: string; name: string } | null;
  result: {
    overall_score: number;
    overall_verdict: string;
    pass: boolean;
    dimensions: { [key: string]: { score: number; recommendation: string } };
    top_fixes: string[];
    attention_zones: { priority: number; label: string; note: string }[];
    industry_benchmarks?: {
      summary: string;
      examples: {
        brand: string;
        campaign: string;
        technique: string;
        lesson: string;
      }[];
      gap: string;
    };
  };
  heatmapDataUrl?: string; // canvas toDataURL() from HeatmapCanvas
  client: string;
  platform: string;
  industry: string;
  threshold: number;
  model: string;
  date: string;
}

export async function generatePDF(data: PDFReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const {
    result,
    creative,
    client,
    platform,
    industry,
    threshold,
    model,
    date,
    heatmapDataUrl,
  } = data;
  const hasBenchmarks = !!result.industry_benchmarks;
  const totalPages = hasBenchmarks ? 5 : 4;

  // ─────────────────────────────────────────────
  // PAGE 1 — COVER
  // ─────────────────────────────────────────────
  drawHeader(doc, 1, totalPages);

  // Big black cover block
  setFill(doc, PRIMARY);
  doc.rect(0, 12, PW, 90, "F");

  // Score circle (manual)
  const cx = PW / 2,
    cy = 57,
    cr = 22;
  setFill(doc, "#1A1A1A");
  doc.circle(cx, cy, cr + 3, "F");
  setFill(doc, scoreBgColor(result.overall_score));
  doc.circle(cx, cy, cr, "F");
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  setTextColor(doc, scoreColor(result.overall_score));
  doc.text(`${result.overall_score}`, cx, cy + 4, { align: "center" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  setTextColor(doc, scoreColor(result.overall_score));
  doc.text("/ 100", cx, cy + 10, { align: "center" });

  // Pass/Fail badge
  const badgeW = 24,
    badgeH = 8;
  setFill(doc, result.pass ? GREEN : RED);
  doc.roundedRect(cx - badgeW / 2, cy + 14, badgeW, badgeH, 2, 2, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setTextColor(doc, "#FFFFFF");
  doc.text(result.pass ? "PASS" : "FAIL", cx, cy + 19.5, { align: "center" });

  // Verdict
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  setTextColor(doc, "#CCCCCC");
  const verdictLines = wrapText(doc, `"${result.overall_verdict}"`, CW);
  doc.text(verdictLines, cx, cy + 30, { align: "center" });

  // Meta info below cover block
  let y = 115;
  const metaItems = [
    ["Client / Campaign", client || "—"],
    ["Platform", platform || "—"],
    ["Industry", industry || "—"],
    ["Pass Threshold", `${threshold}/100`],
    ["Model", model],
    ["Date", date],
  ];

  const colW = CW / 2;
  metaItems.forEach(([label, value], i) => {
    const col = i % 2 === 0 ? ML : ML + colW + 5;
    if (i % 2 === 0 && i > 0) y += 14;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    setTextColor(doc, MUTED);
    doc.text(label.toUpperCase(), col, y);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    setTextColor(doc, PRIMARY);
    doc.text(value, col, y + 5);
  });

  y += 20;

  // Tagline
  setFill(doc, LIGHT);
  doc.rect(ML, y, CW, 14, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  setTextColor(doc, PRIMARY);
  doc.text("No Fluff. Just Science.", ML + CW / 2, y + 5.5, {
    align: "center",
  });
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  setTextColor(doc, MUTED);
  doc.text(
    "Pre-flight creative analysis powered by behavioural science",
    ML + CW / 2,
    y + 10,
    { align: "center" },
  );

  // ─────────────────────────────────────────────
  // PAGE 2 — CREATIVE + DIMENSION SCORES
  // ─────────────────────────────────────────────
  doc.addPage();
  drawHeader(doc, 2, totalPages);
  y = 20;

  y = sectionHeading(doc, "Creative", y);

  // Creative image
  if (creative?.dataUrl && creative.type === "image") {
    try {
      const imgW = CW;
      const imgH = 70;
      doc.addImage(
        creative.dataUrl,
        "JPEG",
        ML,
        y,
        imgW,
        imgH,
        undefined,
        "FAST",
      );
      y += imgH + 8;
    } catch {}
  } else {
    setFill(doc, LIGHT);
    doc.rect(ML, y, CW, 30, "F");
    doc.setFontSize(9);
    setTextColor(doc, MUTED);
    doc.text(
      creative?.type === "video" ? `🎬 ${creative.name}` : "No creative image",
      ML + CW / 2,
      y + 17,
      { align: "center" },
    );
    y += 38;
  }

  y = sectionHeading(doc, "Dimension Scores", y);

  // Dimension grid — 2 columns
  const dimColW = (CW - 8) / 2;
  DIMS.forEach((d, i) => {
    const col = i % 2 === 0 ? ML : ML + dimColW + 8;
    if (i % 2 === 0 && i > 0) y += 22;

    const dim = result.dimensions[d.key];

    // Card bg
    setFill(doc, LIGHT);
    doc.roundedRect(col, y - 2, dimColW, 20, 2, 2, "F");

    // Name
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    setTextColor(doc, PRIMARY);
    doc.text(d.name, col + 3, y + 4);

    // Score pill
    scorePill(doc, dim.score, col + dimColW - 21, y + 1);

    // Bar
    scoreBar(doc, dim.score, col + 3, y + 8, dimColW - 6);

    // Recommendation
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    setTextColor(doc, MUTED);
    const recLines = wrapText(doc, dim.recommendation, dimColW - 6);
    doc.text(recLines.slice(0, 2), col + 3, y + 14);
  });

  y += 22;

  // ─────────────────────────────────────────────
  // PAGE 3 — TOP FIXES
  // ─────────────────────────────────────────────
  doc.addPage();
  drawHeader(doc, 3, totalPages);
  y = 20;

  y = sectionHeading(doc, "Top Fixes", y);

  const fixColors = [RED, AMBER, ACCENT];
  const fixBgs = [RED_BG, AMBER_BG, "#EEF2FF"];
  const fixLabels = ["Critical", "Important", "Nice to have"];

  (result.top_fixes || []).forEach((fix, i) => {
    // Badge
    setFill(doc, fixBgs[i]);
    doc.roundedRect(ML, y, 28, 6, 1.5, 1.5, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    setTextColor(doc, fixColors[i]);
    doc.text(fixLabels[i], ML + 14, y + 4.2, { align: "center" });

    // Fix text
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    setTextColor(doc, PRIMARY);
    const fixLines = wrapText(doc, fix, CW - 34);
    doc.text(fixLines, ML + 32, y + 4.5);

    y += Math.max(fixLines.length * 5, 10) + 8;

    // Divider
    if (i < 2) {
      setDrawColor(doc, BORDER);
      doc.setLineWidth(0.2);
      doc.line(ML, y - 4, PW - MR, y - 4);
    }
  });

  y += 10;
  y = sectionHeading(doc, "Attention Zones", y);

  // Attention zones
  (result.attention_zones || []).forEach((z, i) => {
    const zoneColors = [RED, AMBER, "#EAB308"];
    setFill(doc, zoneColors[i] + "22");
    doc.roundedRect(ML, y, CW, 16, 2, 2, "F");

    // Priority badge
    setFill(doc, zoneColors[i]);
    doc.circle(ML + 7, y + 8, 5, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    setTextColor(doc, "#FFFFFF");
    doc.text(`${z.priority}`, ML + 7, y + 10, { align: "center" });

    // Label
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    setTextColor(doc, PRIMARY);
    doc.text(z.label, ML + 16, y + 6);

    // Note
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    setTextColor(doc, MUTED);
    const noteLines = wrapText(doc, z.note, CW - 20);
    doc.text(noteLines.slice(0, 2), ML + 16, y + 11);

    y += 20;
  });

  // ─────────────────────────────────────────────
  // PAGE 4 — ATTENTION MAP
  // ─────────────────────────────────────────────
  doc.addPage();
  drawHeader(doc, 4, totalPages);
  y = 20;

  y = sectionHeading(doc, "Attention Map", y);

  if (heatmapDataUrl) {
    try {
      const maxH = hasBenchmarks ? 140 : 200;
      doc.addImage(heatmapDataUrl, "PNG", ML, y, CW, maxH, undefined, "FAST");
      y += maxH + 6;
    } catch {}
  } else if (creative?.type === "video") {
    setFill(doc, LIGHT);
    doc.rect(ML, y, CW, 40, "F");
    doc.setFontSize(9);
    setTextColor(doc, MUTED);
    doc.text(
      "Attention mapping is not available for video creatives.",
      ML + CW / 2,
      y + 22,
      { align: "center" },
    );
    y += 48;
  } else {
    setFill(doc, LIGHT);
    doc.rect(ML, y, CW, 40, "F");
    doc.setFontSize(9);
    setTextColor(doc, MUTED);
    doc.text("No attention map available.", ML + CW / 2, y + 22, {
      align: "center",
    });
    y += 48;
  }

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  setTextColor(doc, MUTED);
  doc.text(
    "Zones based on AI visual analysis — not pixel-level eye tracking",
    ML + CW / 2,
    y,
    { align: "center" },
  );

  // ─────────────────────────────────────────────
  // PAGE 5 — INDUSTRY BENCHMARKS (if applicable)
  // ─────────────────────────────────────────────
  if (hasBenchmarks && result.industry_benchmarks) {
    doc.addPage();
    drawHeader(doc, 5, totalPages);
    y = 20;

    y = sectionHeading(doc, `Industry Benchmarks — ${industry}`, y);

    // Summary
    setFill(doc, LIGHT);
    doc.roundedRect(ML, y, CW, 2, 2, 2, "F"); // placeholder, will resize
    const summaryLines = wrapText(
      doc,
      result.industry_benchmarks.summary,
      CW - 10,
    );
    const summaryH = summaryLines.length * 5 + 10;
    setFill(doc, LIGHT);
    doc.roundedRect(ML, y, CW, summaryH, 2, 2, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    setTextColor(doc, MUTED);
    doc.text("WHAT TOP CAMPAIGNS ARE DOING", ML + 5, y + 5);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    setTextColor(doc, PRIMARY);
    doc.text(summaryLines, ML + 5, y + 10);
    y += summaryH + 8;

    // Examples
    y = sectionHeading(doc, "Real-World Examples", y);

    const exColors = [ACCENT, "#F59E0B"];
    const exBgs = ["#EEF2FF", "#FFFBEB"];

    result.industry_benchmarks.examples.forEach((ex, i) => {
      // Header strip
      setFill(doc, exBgs[i]);
      doc.roundedRect(ML, y, CW, 8, 2, 2, "F");
      setFill(doc, exColors[i]);
      doc.roundedRect(ML, y, 8, 8, 2, 2, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      setTextColor(doc, "#FFFFFF");
      doc.text(`${i + 1}`, ML + 4, y + 5.2, { align: "center" });
      doc.setFontSize(9);
      setTextColor(doc, PRIMARY);
      doc.text(ex.brand, ML + 12, y + 3.5);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      setTextColor(doc, MUTED);
      doc.text(ex.campaign, ML + 12, y + 7);
      y += 11;

      // Technique
      const techLines = wrapText(doc, ex.technique, CW - 10);
      const techH = techLines.length * 4.5 + 8;
      setFill(doc, "#F5F3FF");
      doc.roundedRect(ML, y, CW, techH, 1.5, 1.5, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      setTextColor(doc, ACCENT);
      doc.text("TECHNIQUE", ML + 4, y + 4.5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      setTextColor(doc, PRIMARY);
      doc.text(techLines, ML + 4, y + 8.5);
      y += techH + 3;

      // Lesson
      const lessonLines = wrapText(doc, ex.lesson, CW - 10);
      const lessonH = lessonLines.length * 4.5 + 8;
      setFill(doc, GREEN_BG);
      doc.roundedRect(ML, y, CW, lessonH, 1.5, 1.5, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      setTextColor(doc, GREEN);
      doc.text("WHAT YOU CAN LEARN", ML + 4, y + 4.5);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      setTextColor(doc, PRIMARY);
      doc.text(lessonLines, ML + 4, y + 8.5);
      y += lessonH + 6;
    });

    // Gap
    y = sectionHeading(doc, "The Gap", y);
    const gapLines = wrapText(doc, result.industry_benchmarks.gap, CW - 10);
    const gapH = gapLines.length * 5 + 10;
    setFill(doc, RED_BG);
    doc.roundedRect(ML, y, CW, gapH, 2, 2, "F");
    setDrawColor(doc, RED);
    doc.setLineWidth(0.5);
    doc.line(ML, y, ML, y + gapH);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    setTextColor(doc, PRIMARY);
    doc.text(gapLines, ML + 6, y + 7);
    y += gapH + 6;
  }

  // Save
  const filename = `NoFluff_Signal_${client || "Report"}_${date.replace(/\//g, "-")}.pdf`;
  doc.save(filename);
}
