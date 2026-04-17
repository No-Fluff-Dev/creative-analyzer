import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import { generatePDF } from "./generatePDF";

const DIMS = [
  { key: "visual_hierarchy", name: "Visual hierarchy" },
  { key: "clarity_readability", name: "Clarity & readability" },
  { key: "three_second_test", name: "3-second test" },
  { key: "behavioural_triggers", name: "Behavioural triggers" },
  { key: "cta_strength", name: "CTA strength" },
  { key: "cognitive_load", name: "Cognitive load" },
  { key: "emotional_resonance", name: "Emotional resonance" },
  { key: "brand_consistency", name: "Brand consistency" },
  { key: "concept_alignment", name: "Concept alignment" },
];
const PLATFORMS = [
  "Meta feed",
  "Meta story/reel",
  "Google display",
  "Amazon",
  "Landing page",
  "YouTube",
  "Email",
];
const LABELS = ["A", "B", "C", "D"];
const LABEL_COLORS = ["#6366F1", "#F59E0B", "#10B981", "#EF4444"];
const MODELS = [
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", credits: 1 },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", credits: 3 },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", credits: 4 },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", credits: 8 },
];
const INDUSTRIES = [
  "Skincare",
  "Haircare",
  "Supplements & wellness",
  "Food & beverage",
  "Fashion & apparel",
  "Jewellery",
  "Home & living",
  "Pet care",
  "Sports & fitness",
  "Electronics",
  "Baby & parenting",
  "Beauty & cosmetics",
];

interface BrandFile {
  id?: string;
  name: string;
  type: string;
  dataUrl: string;
  extractedText: string;
  storagePath?: string;
}
interface Brand {
  id?: string;
  notes: string;
  updatedAt: number;
  files?: BrandFile[];
}
interface BrandMap {
  [name: string]: Brand;
}
interface Zone {
  priority: number;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  note: string;
}
interface CreativeFile {
  file: File;
  type: "image" | "video";
  dataUrl: string | null;
  name: string;
  mimeType: string;
}
interface IndustryExample {
  brand: string;
  campaign: string;
  technique: string;
  lesson: string;
}
interface IndustryBenchmarks {
  summary: string;
  examples: IndustryExample[];
  gap: string;
}
interface AnalysisResult {
  overall_score: number;
  overall_verdict: string;
  pass: boolean;
  dimensions: { [key: string]: { score: number; recommendation: string } };
  top_fixes: string[];
  attention_zones: Zone[];
  industry_benchmarks?: IndustryBenchmarks;
  creative_storage_path?: string;
  creative_name?: string;
  creative_type?: "image" | "video";
  creative_mimeType?: string;
}
interface AnalysedCreative extends CreativeFile {
  result: AnalysisResult;
  index: number;
}

function scoreColor(s: number) {
  return s >= 75 ? "#22C55E" : s >= 50 ? "#F59E0B" : "#EF4444";
}
function scoreBg(s: number) {
  if (s >= 75) return { bg: "#F0FDF4", text: "#15803D" };
  if (s >= 50) return { bg: "#FFFBEB", text: "#B45309" };
  return { bg: "#FEF2F2", text: "#B91C1C" };
}
function verdictText(s: number) {
  if (s >= 80) return "Ready to test";
  if (s >= 65) return "Minor fixes needed";
  if (s >= 50) return "Needs work";
  return "Rework recommended";
}
function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });
}
function toBase64Raw(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });
}
async function extractPdfText(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" as any
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item: any) => item.str).join(" ") + "\n";
    }
    return text.trim();
  } catch {
    return "";
  }
}
async function extractDocxText(file: File): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  } catch {
    return "";
  }
}
async function loadBrandsFromSupabase(
  userId: string,
  teamId?: string,
): Promise<BrandMap> {
  let query = supabase.from("brands").select("*, brand_files(*)");
  if (teamId) query = query.eq("team_id", teamId);
  else query = query.eq("user_id", userId).is("team_id", null);
  const { data: brands, error } = await query.order("created_at", {
    ascending: true,
  });
  if (error || !brands) return {};
  const brandMap: BrandMap = {};
  for (const brand of brands) {
    const files: BrandFile[] = await Promise.all(
      (brand.brand_files || []).map(async (f: any) => {
        let dataUrl = "";
        if (f.storage_path && f.mime_type?.startsWith("image/")) {
          const { data } = await supabase.storage
            .from("brand-assets")
            .download(f.storage_path);
          if (data)
            dataUrl = await new Promise((res) => {
              const reader = new FileReader();
              reader.onload = () => res(reader.result as string);
              reader.readAsDataURL(data);
            });
        }
        return {
          id: f.id,
          name: f.name,
          type: f.mime_type,
          dataUrl,
          extractedText: f.extracted_text || "",
          storagePath: f.storage_path,
        };
      }),
    );
    brandMap[brand.name] = {
      id: brand.id,
      notes: brand.notes || "",
      updatedAt: new Date(brand.updated_at).getTime(),
      files,
    };
  }
  return brandMap;
}

// ─── RADIAL SCORE ────────────────────────────────────────────
function RadialScore({
  score,
  size = 72,
  color,
}: {
  score: number;
  size?: number;
  color?: string;
}) {
  const r = size / 2 - 6,
    circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ,
    c = color || scoreColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#F0F0F0"
        strokeWidth="5"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={c}
        strokeWidth="5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2 + 5}
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill={c}
      >
        {score}
      </text>
    </svg>
  );
}

// ─── HEATMAP CANVAS ──────────────────────────────────────────
function HeatmapCanvas({ dataUrl, zones }: { dataUrl: string; zones: Zone[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !zones?.length || !dataUrl) return;
    const canvas = canvasRef.current,
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      zones.forEach((zone) => {
        const x = zone.x * img.naturalWidth,
          y = zone.y * img.naturalHeight,
          w = zone.w * img.naturalWidth,
          h = zone.h * img.naturalHeight;
        const cx2 = x + w / 2,
          cy2 = y + h / 2;
        const grad = ctx.createRadialGradient(
          cx2,
          cy2,
          0,
          cx2,
          cy2,
          Math.max(w, h) * 0.65,
        );
        const col =
          zone.priority === 1
            ? "rgba(239,68,68,0.5)"
            : zone.priority === 2
              ? "rgba(251,146,60,0.4)"
              : "rgba(250,204,21,0.3)";
        grad.addColorStop(0, col);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x - w * 0.15, y - h * 0.15, w * 1.3, h * 1.3);
        ctx.strokeStyle =
          zone.priority === 1
            ? "rgba(239,68,68,0.85)"
            : zone.priority === 2
              ? "rgba(251,146,60,0.75)"
              : "rgba(202,138,4,0.7)";
        ctx.lineWidth = Math.max(2, img.naturalWidth * 0.003);
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        const labelText = `${zone.priority}. ${zone.label}`,
          fs = Math.max(12, img.naturalWidth * 0.016);
        ctx.font = `bold ${fs}px system-ui`;
        const tw = ctx.measureText(labelText).width,
          pad = 6,
          bh = fs + pad * 2,
          bx = x,
          by = Math.max(0, y - bh - 2);
        ctx.fillStyle =
          zone.priority === 1
            ? "rgba(239,68,68,0.92)"
            : zone.priority === 2
              ? "rgba(251,146,60,0.92)"
              : "rgba(202,138,4,0.92)";
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + pad * 2, bh, 4);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, bx + pad, by + bh / 2);
      });
    };
    img.src = dataUrl;
  }, [dataUrl, zones]);
  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", display: "block", borderRadius: 10 }}
    />
  );
}

// ─── BRAND MANAGER ───────────────────────────────────────────
function BrandManager({
  onSelect,
  selectedBrand,
  onClose,
  onUpdated,
  userId,
  teamId,
  isModal = true,
}: {
  onSelect: (name: string, notes: string, files?: BrandFile[]) => void;
  selectedBrand: string;
  onClose: () => void;
  onUpdated: (b: BrandMap) => void;
  userId: string;
  teamId?: string;
  isModal?: boolean;
}) {
  const [brands, setBrands] = useState<BrandMap>({});
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<BrandFile[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    loadBrandsFromSupabase(userId, teamId).then((b) => {
      setBrands(b);
      onUpdated(b);
    });
  }, [userId, teamId]);
  const handleFileUpload = async (f: File) => {
    setUploading(true);
    try {
      const isImage = f.type.startsWith("image/"),
        isPdf = f.type === "application/pdf";
      const isDocx =
        f.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      let dataUrl = "",
        extractedText = "";
      if (isImage) dataUrl = await toBase64(f);
      else if (isPdf) {
        extractedText = await extractPdfText(f);
        dataUrl = await toBase64(f);
      } else if (isDocx) extractedText = await extractDocxText(f);
      setFiles((prev) => [
        ...prev,
        { name: f.name, type: f.type, dataUrl, extractedText, _file: f } as any,
      ]);
    } catch {}
    setUploading(false);
  };
  const commit = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      let brandId: string;
      if (editing && brands[editing]?.id) {
        const { data } = await supabase
          .from("brands")
          .update({
            name: name.trim(),
            notes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", brands[editing].id)
          .select()
          .single();
        brandId = data.id;
      } else {
        const { data } = await supabase
          .from("brands")
          .insert({
            user_id: userId,
            team_id: teamId || null,
            name: name.trim(),
            notes,
          })
          .select()
          .single();
        brandId = data.id;
      }
      const savedFiles: BrandFile[] = [];
      for (const f of files) {
        if ((f as any)._file) {
          const rawFile = (f as any)._file as File;
          const storagePath = `${userId}/${brandId}/${Date.now()}_${rawFile.name}`;
          await supabase.storage
            .from("brand-assets")
            .upload(storagePath, rawFile);
          const { data: fileRecord } = await supabase
            .from("brand_files")
            .insert({
              brand_id: brandId,
              user_id: userId,
              team_id: teamId || null,
              name: rawFile.name,
              mime_type: rawFile.type,
              extracted_text: f.extractedText || null,
              storage_path: storagePath,
            })
            .select()
            .single();
          savedFiles.push({ ...f, id: fileRecord.id, storagePath });
        } else savedFiles.push(f);
      }
      const updated = await loadBrandsFromSupabase(userId, teamId);
      setBrands(updated);
      onUpdated(updated);
      if (editing && selectedBrand === editing)
        onSelect(name.trim(), notes, savedFiles);
      setName("");
      setNotes("");
      setFiles([]);
      setEditing(null);
    } catch (err) {
      console.error("Failed to save brand:", err);
    }
    setSaving(false);
  };
  const del = async (n: string) => {
    const brand = brands[n];
    if (!brand?.id) return;
    const filePaths = (brand.files || [])
      .filter((f) => f.storagePath)
      .map((f) => f.storagePath as string);
    if (filePaths.length > 0)
      await supabase.storage.from("brand-assets").remove(filePaths);
    await supabase.from("brands").delete().eq("id", brand.id);
    const updated = await loadBrandsFromSupabase(userId, teamId);
    setBrands(updated);
    onUpdated(updated);
    if (selectedBrand === n) onSelect("", "", []);
  };
  const edit = (n: string) => {
    setEditing(n);
    setName(n);
    setNotes(brands[n].notes);
    setFiles(brands[n].files || []);
  };
  const removeFile = async (idx: number) => {
    const f = files[idx];
    if (f.id) {
      if (f.storagePath)
        await supabase.storage.from("brand-assets").remove([f.storagePath]);
      await supabase.from("brand_files").delete().eq("id", f.id);
    }
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };
  const fileIcon = (type: string) =>
    type.startsWith("image/") ? "🖼️" : type === "application/pdf" ? "📄" : "📝";
  const content = (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: "1.5rem",
        width: "100%",
        maxWidth: isModal ? 480 : "100%",
        maxHeight: isModal ? "85vh" : "auto",
        overflowY: "auto",
        boxShadow: isModal ? "0 20px 60px rgba(0,0,0,0.2)" : "none",
        border: isModal ? "none" : "1px solid #EFEFEF",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#111", margin: 0 }}>
          Brand guidelines
        </h2>
        {isModal && (
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "1px solid #EFEFEF",
              background: "#fff",
              cursor: "pointer",
              fontSize: 14,
              color: "#555",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        )}
      </div>
      {Object.keys(brands).length > 0 && (
        <div
          style={{
            marginBottom: "1.25rem",
            display: "grid",
            gridTemplateColumns: isModal ? "1fr" : "1fr 1fr",
            gap: 10,
          }}
        >
          {Object.entries(brands).map(([n, d]) => (
            <div
              key={n}
              onClick={() => {
                onSelect(n, d.notes, d.files || []);
                onClose();
              }}
              style={{
                border: `2px solid ${selectedBrand === n ? "#6366F1" : "#F0F0F0"}`,
                borderRadius: 10,
                padding: "10px 14px",
                cursor: "pointer",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: selectedBrand === n ? "#6366F1" : "#222",
                  }}
                >
                  {n}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      edit(n);
                    }}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 6,
                      border: "1px solid #EFEFEF",
                      background: "#fff",
                      cursor: "pointer",
                      color: "#666",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      del(n);
                    }}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 6,
                      border: "1px solid #FEECEC",
                      background: "#FEF2F2",
                      cursor: "pointer",
                      color: "#B91C1C",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p
                style={{
                  fontSize: 11,
                  color: "#AAA",
                  margin: "4px 0 0",
                  lineHeight: 1.4,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {d.notes || "No notes"}
              </p>
              {(d.files || []).length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    flexWrap: "wrap",
                    marginTop: 6,
                  }}
                >
                  {(d.files || []).map((f, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "#F5F3FF",
                        color: "#6366F1",
                        border: "1px solid #E0DBFF",
                      }}
                    >
                      {fileIcon(f.type)}{" "}
                      {f.name.length > 20 ? f.name.slice(0, 20) + "…" : f.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          background: "#FAFAFA",
          borderRadius: 12,
          padding: "1.25rem",
          border: "1px solid #F0F0F0",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#AAA",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 10,
          }}
        >
          {editing ? "Edit brand" : "Add new brand"}
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Brand / client name"
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #EFEFEF",
            borderRadius: 8,
            fontSize: 13,
            marginBottom: 10,
            outline: "none",
            background: "#fff",
            boxSizing: "border-box",
            color: "#111",
          }}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Colours, fonts, tone, visual rules, messaging…"
          rows={3}
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #EFEFEF",
            borderRadius: 8,
            fontSize: 13,
            resize: "vertical",
            fontFamily: "inherit",
            outline: "none",
            background: "#fff",
            boxSizing: "border-box",
            marginBottom: 10,
            color: "#111",
          }}
        />
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            border: "1.5px dashed #DDD",
            borderRadius: 8,
            padding: "16px",
            textAlign: "center",
            cursor: "pointer",
            background: "#fff",
            marginBottom: 10,
          }}
        >
          <p
            style={{ fontSize: 13, fontWeight: 500, color: "#555", margin: 0 }}
          >
            {uploading
              ? "Processing file…"
              : "📎 Upload brand guideline document"}
          </p>
          <p style={{ fontSize: 11, color: "#CCC", margin: "4px 0 0" }}>
            PDF · Word (.docx) · PNG · JPG · SVG
          </p>
          <input
            ref={fileRef}
            type="file"
            style={{ display: "none" }}
            accept=".pdf,.docx,image/png,image/jpeg,image/svg+xml"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
        {files.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            {files.map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: "#F5F3FF",
                  color: "#6366F1",
                  border: "1px solid #E0DBFF",
                }}
              >
                <span>
                  {fileIcon(f.type)}{" "}
                  {f.name.length > 22 ? f.name.slice(0, 22) + "…" : f.name}
                </span>
                {f.extractedText && (
                  <span style={{ color: "#10B981", fontSize: 9 }}>
                    ✓ text extracted
                  </span>
                )}
                <button
                  onClick={() => removeFile(i)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#6366F1",
                    fontSize: 12,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={commit}
          disabled={!name.trim() || saving}
          style={{
            marginTop: 4,
            width: "100%",
            padding: "10px",
            borderRadius: 8,
            border: "none",
            background: name.trim() && !saving ? "#111" : "#F0F0F0",
            color: name.trim() && !saving ? "#fff" : "#AAA",
            fontSize: 13,
            fontWeight: 600,
            cursor: name.trim() && !saving ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Save brand"}
        </button>
        {editing && (
          <button
            onClick={() => {
              setEditing(null);
              setName("");
              setNotes("");
              setFiles([]);
            }}
            style={{
              marginTop: 8,
              width: "100%",
              padding: "10px",
              borderRadius: 8,
              border: "1px solid #EFEFEF",
              background: "#fff",
              fontSize: 13,
              fontWeight: 500,
              color: "#888",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
  if (!isModal) return content;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      {content}
    </div>
  );
}

// ─── UPLOAD ZONE ─────────────────────────────────────────────
function UploadZone({
  onFile,
  label,
  labelColor,
}: {
  onFile: (f: CreativeFile) => void;
  label?: string;
  labelColor?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const handle = async (f: File) => {
    const isVideo = f.type.startsWith("video");
    const dataUrl = isVideo ? null : await toBase64(f);
    onFile({
      file: f,
      type: isVideo ? "video" : "image",
      dataUrl,
      name: f.name,
      mimeType: f.type,
    });
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]);
      }}
      onClick={() => ref.current?.click()}
      style={{
        border: `1.5px dashed ${drag ? "#6366F1" : "#E0E0E0"}`,
        borderRadius: 14,
        padding: label ? "1.5rem 1rem" : "2.5rem 1rem",
        textAlign: "center",
        cursor: "pointer",
        background: drag ? "#F5F3FF" : "#FAFAFA",
        transition: "all 0.15s",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: label ? 140 : 180,
      }}
    >
      {label ? (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: (labelColor || "#6366F1") + "20",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 800, color: labelColor }}>
            {label}
          </span>
        </div>
      ) : (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#AAA"
          strokeWidth="1.8"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      )}
      <p style={{ fontSize: 13, fontWeight: 500, color: "#555", margin: 0 }}>
        {label ? `Add creative ${label}` : "Drop creative or click to upload"}
      </p>
      <p style={{ fontSize: 11, color: "#BBB", margin: 0 }}>
        JPG · PNG · WEBP · MP4 · MOV
      </p>
      <input
        ref={ref}
        type="file"
        style={{ display: "none" }}
        accept="image/*,video/mp4,video/quicktime"
        onChange={(e) => {
          if (e.target.files?.[0]) handle(e.target.files[0]);
        }}
      />
    </div>
  );
}

// ─── CREATIVE PREVIEW ────────────────────────────────────────
function CreativePreview({
  creative,
  onRemove,
  label,
  labelColor,
  compact,
}: {
  creative: CreativeFile;
  onRemove?: () => void;
  label?: string;
  labelColor?: string;
  compact?: boolean;
}) {
  if (!creative) return null;
  const h = compact ? 140 : 260;
  return (
    <div
      style={{
        position: "relative",
        border: "1px solid #EFEFEF",
        borderRadius: 14,
        overflow: "hidden",
        background: "#F5F5F5",
      }}
    >
      {label && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 2,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: labelColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>
            {label}
          </span>
        </div>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            zIndex: 2,
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.5)",
            border: "none",
            color: "#fff",
            cursor: "pointer",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      )}
      {creative.type === "video" ? (
        <div
          style={{
            height: h,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#111",
            color: "#888",
            fontSize: 13,
          }}
        >
          🎬 {creative.name}
        </div>
      ) : (
        <img
          src={creative.dataUrl || ""}
          alt=""
          style={{
            width: "100%",
            height: h,
            objectFit: "contain",
            display: "block",
          }}
        />
      )}
    </div>
  );
}

// ─── MODEL SELECTOR ──────────────────────────────────────────
function ModelSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = MODELS.find((m) => m.id === value) || MODELS[1];
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const creditColor = (c: number) => {
    if (c <= 1) return { bg: "#F0FDF4", text: "#15803D" };
    if (c <= 3) return { bg: "#FFFBEB", text: "#B45309" };
    if (c <= 4) return { bg: "#EEF2FF", text: "#4338CA" };
    return { bg: "#FEF2F2", text: "#B91C1C" };
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          border: `1px solid ${open ? "#6366F1" : "#EFEFEF"}`,
          borderRadius: 8,
          background: "#FAFAFA",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "#111",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}>
              C
            </span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: "#222" }}>
            {selected.name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 20,
              background: creditColor(selected.credits).bg,
              color: creditColor(selected.credits).text,
            }}
          >
            {selected.credits} credit{selected.credits !== 1 ? "s" : ""}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#AAA"
            strokeWidth="2.5"
            style={{
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #EFEFEF",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "6px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {MODELS.map((m) => {
              const isSel = m.id === value;
              const { bg, text } = creditColor(m.credits);
              return (
                <div
                  key={m.id}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 10px",
                    borderRadius: 7,
                    cursor: "pointer",
                    background: isSel ? "#F5F3FF" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSel)
                      (e.currentTarget as HTMLDivElement).style.background =
                        "#FAFAFA";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSel)
                      (e.currentTarget as HTMLDivElement).style.background =
                        "transparent";
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: isSel ? "#6366F1" : "#111",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span
                        style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}
                      >
                        C
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: isSel ? 600 : 500,
                        color: isSel ? "#6366F1" : "#222",
                        margin: 0,
                      }}
                    >
                      {m.name}
                    </p>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: bg,
                        color: text,
                      }}
                    >
                      {m.credits} credit{m.credits !== 1 ? "s" : ""}
                    </span>
                    {isSel && (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#6366F1"
                        strokeWidth="2.5"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisLoader({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3.5rem 1rem",
        background: "#fff",
        border: "1px solid #EFEFEF",
        borderRadius: 14,
        marginTop: 10,
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#6366F1"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ animation: "spin 1s linear infinite", marginBottom: 16 }}
      >
        <style>{`@keyframes spin{100%{transform:rotate(360deg)}}`}</style>
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <p
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "#111",
          margin: "0 0 6px",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 12,
          color: "#888",
          margin: 0,
          textAlign: "center",
          maxWidth: 280,
          lineHeight: 1.5,
        }}
      >
        Scanning visual hierarchy, cognitive load, and behavioural triggers...
      </p>
    </div>
  );
}

// ─── SINGLE RESULT ───────────────────────────────────────────
function SingleResult({
  creative,
  result,
  threshold,
  onReset,
  onExport,
  model,
  client,
  platform,
  industry,
}: {
  creative: CreativeFile | null;
  result: AnalysisResult;
  threshold: number;
  onReset: () => void;
  onExport: () => void;
  model?: string;
  client?: string;
  platform?: string;
  industry?: string;
}) {
  const [tab, setTab] = useState("analysis");
  const passed = result.pass;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1.25rem",
        marginTop: "1rem",
      }}
    >
      <div
        style={{
          borderRadius: 16,
          padding: "1.25rem 1.5rem",
          background: passed ? "#F0FDF4" : "#FEF2F2",
          border: `1px solid ${passed ? "#BBF7D0" : "#FECACA"}`,
          display: "flex",
          alignItems: "center",
          gap: "1.25rem",
        }}
      >
        <RadialScore
          score={result.overall_score}
          size={72}
          color={scoreColor(result.overall_score)}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 9px",
                borderRadius: 20,
                background: passed ? "#22C55E" : "#EF4444",
                color: "#fff",
              }}
            >
              {passed ? "PASS" : "FAIL"}
            </span>
            <span style={{ fontSize: 11, color: "#AAA" }}>
              threshold {threshold}
            </span>
          </div>
          <p
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#111",
              margin: "0 0 2px",
            }}
          >
            {result.overall_score}/100 — {result.overall_verdict}
          </p>
          <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
            {verdictText(result.overall_score)}
          </p>
        </div>
      </div>
      {creative?.dataUrl && (
        <CreativePreview creative={creative} compact={false} />
      )}
      <div
        style={{
          display: "flex",
          gap: 6,
          background: "#EFEFEF",
          borderRadius: 10,
          padding: 4,
        }}
      >
        {[
          ["analysis", "Analysis"],
          ["heatmap", "Attention map"],
          ["benchmarks", "Benchmarks"],
        ].map(([t, l]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "7px 0",
              borderRadius: 8,
              border: "none",
              fontSize: 12,
              fontWeight: 500,
              background: tab === t ? "#fff" : "transparent",
              color: tab === t ? "#111" : "#888",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              cursor: "pointer",
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "analysis" && (
        <>
          <div>
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#BBB",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Dimension breakdown
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              {DIMS.map((d) => {
                const dim = result.dimensions?.[d.key] || {
                  score: 0,
                  recommendation: "Data missing.",
                };
                const { bg, text } = scoreBg(dim.score);
                return (
                  <div
                    key={d.key}
                    style={{
                      background: "#fff",
                      border: "1px solid #F0F0F0",
                      borderRadius: 12,
                      padding: "12px 14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{ fontSize: 12, fontWeight: 600, color: "#222" }}
                      >
                        {d.name}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 20,
                          background: bg,
                          color: text,
                        }}
                      >
                        {dim.score}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 3,
                        background: "#F0F0F0",
                        borderRadius: 2,
                        marginBottom: 7,
                      }}
                    >
                      <div
                        style={{
                          height: 3,
                          borderRadius: 2,
                          width: `${dim.score}%`,
                          background: scoreColor(dim.score),
                          transition: "width 0.7s ease",
                        }}
                      />
                    </div>
                    <p
                      style={{
                        fontSize: 12,
                        color: "#777",
                        lineHeight: 1.5,
                        margin: 0,
                      }}
                    >
                      {dim.recommendation}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <div
            style={{
              background: "#fff",
              border: "1px solid #F0F0F0",
              borderRadius: 14,
              padding: "1.25rem",
            }}
          >
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#BBB",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Top fixes
            </p>
            {(result.top_fixes || []).map((fix, i) => {
              const colors = ["#EF4444", "#F59E0B", "#6366F1"];
              const labels = ["Critical", "Important", "Nice to have"];
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 10,
                    paddingBottom: i < 2 ? 12 : 0,
                    marginBottom: i < 2 ? 12 : 0,
                    borderBottom: i < 2 ? "1px solid #F8F8F8" : "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 20,
                      background: colors[i] + "18",
                      color: colors[i],
                      flexShrink: 0,
                      height: "fit-content",
                    }}
                  >
                    {labels[i]}
                  </span>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#333",
                      lineHeight: 1.55,
                      margin: 0,
                    }}
                  >
                    {fix}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
      {tab === "heatmap" && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #F0F0F0",
            borderRadius: 14,
            padding: "1.25rem",
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "#BBB",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Attention map
          </p>
          {creative?.type === "video" ? (
            <p
              style={{
                fontSize: 13,
                color: "#AAA",
                textAlign: "center",
                padding: "2rem 0",
              }}
            >
              Attention mapping is for static images only
            </p>
          ) : !creative?.dataUrl ? (
            <p
              style={{
                fontSize: 13,
                color: "#AAA",
                textAlign: "center",
                padding: "2rem 0",
              }}
            >
              Image unavailable for saved analyses.
            </p>
          ) : (
            <>
              <HeatmapCanvas
                dataUrl={creative.dataUrl}
                zones={result.attention_zones || []}
              />
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {(result.attention_zones || []).map((z) => (
                  <div
                    key={z.priority}
                    style={{
                      flex: 1,
                      minWidth: 140,
                      background: "#FAFAFA",
                      border: "1px solid #F0F0F0",
                      borderRadius: 8,
                      padding: "8px 12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          background:
                            z.priority === 1
                              ? "#EF4444"
                              : z.priority === 2
                                ? "#F59E0B"
                                : "#EAB308",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            color: "#fff",
                          }}
                        >
                          {z.priority}
                        </span>
                      </div>
                      <span
                        style={{ fontSize: 12, fontWeight: 600, color: "#222" }}
                      >
                        {z.label}
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 11,
                        color: "#888",
                        margin: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {z.note}
                    </p>
                  </div>
                ))}
              </div>
              <p
                style={{
                  fontSize: 10,
                  color: "#CCC",
                  marginTop: 10,
                  textAlign: "center",
                }}
              >
                Zones based on AI visual analysis — not pixel-level eye tracking
              </p>
            </>
          )}
        </div>
      )}
      {tab === "benchmarks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!result.industry_benchmarks ? (
            <div
              style={{
                background: "#fff",
                border: "1px solid #F0F0F0",
                borderRadius: 14,
                padding: "2rem",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 24, margin: "0 0 8px" }}>📊</p>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#222",
                  margin: "0 0 4px",
                }}
              >
                No industry selected
              </p>
              <p style={{ fontSize: 13, color: "#AAA", margin: 0 }}>
                Select an industry in the config panel before analysing to get
                real-world campaign benchmarks.
              </p>
            </div>
          ) : (
            <>
              {creative?.dataUrl && (
                <CreativePreview creative={creative} compact={false} />
              )}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #F0F0F0",
                  borderRadius: 14,
                  padding: "1.25rem",
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#BBB",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 10,
                  }}
                >
                  What top campaigns are doing
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "#444",
                    lineHeight: 1.65,
                    margin: 0,
                  }}
                >
                  {result.industry_benchmarks.summary}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#BBB",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    margin: 0,
                  }}
                >
                  Real-world examples
                </p>
                {(result.industry_benchmarks.examples || []).map(
                  (ex: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        background: "#fff",
                        border: "1px solid #F0F0F0",
                        borderRadius: 12,
                        padding: "1rem 1.25rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: i === 0 ? "#6366F1" : "#F59E0B",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: "#fff",
                            }}
                          >
                            {i + 1}
                          </span>
                        </div>
                        <div>
                          <p
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#111",
                              margin: 0,
                            }}
                          >
                            {ex.brand}
                          </p>
                          <p style={{ fontSize: 11, color: "#888", margin: 0 }}>
                            {ex.campaign}
                          </p>
                        </div>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            background: "#F5F3FF",
                            borderRadius: 8,
                            padding: "8px 10px",
                          }}
                        >
                          <p
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#6366F1",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              margin: "0 0 3px",
                            }}
                          >
                            Technique
                          </p>
                          <p
                            style={{
                              fontSize: 12,
                              color: "#444",
                              margin: 0,
                              lineHeight: 1.5,
                            }}
                          >
                            {ex.technique}
                          </p>
                        </div>
                        <div
                          style={{
                            background: "#F0FDF4",
                            borderRadius: 8,
                            padding: "8px 10px",
                          }}
                        >
                          <p
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#15803D",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              margin: "0 0 3px",
                            }}
                          >
                            What you can learn
                          </p>
                          <p
                            style={{
                              fontSize: 12,
                              color: "#444",
                              margin: 0,
                              lineHeight: 1.5,
                            }}
                          >
                            {ex.lesson}
                          </p>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 12,
                  padding: "1rem 1.25rem",
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#B91C1C",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    margin: "0 0 6px",
                  }}
                >
                  The gap
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "#333",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {result.industry_benchmarks.gap}
                </p>
              </div>
            </>
          )}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button
          onClick={onReset}
          style={{
            padding: "12px",
            borderRadius: 10,
            border: "1px solid #EFEFEF",
            background: "#fff",
            fontSize: 13,
            fontWeight: 500,
            color: "#444",
            cursor: "pointer",
          }}
        >
          Back
        </button>
        <button
          onClick={onExport}
          style={{
            padding: "12px",
            borderRadius: 10,
            border: "none",
            background: "#111",
            fontSize: 13,
            fontWeight: 500,
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Export PDF
        </button>
      </div>
    </div>
  );
}

// ─── AB RESULTS ──────────────────────────────────────────────
function ABResults({
  analysedCreatives,
  winner,
  onExport,
}: {
  analysedCreatives: AnalysedCreative[];
  winner: AnalysedCreative | null;
  threshold?: number;
  onExport: () => void;
}) {
  const [activeTab, setActiveTab] = useState("comparison");
  const [detailIdx, setDetailIdx] = useState(analysedCreatives[0]?.index ?? 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {winner && (
        <div
          style={{
            borderRadius: 14,
            padding: "1rem 1.25rem",
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: LABEL_COLORS[winner.index],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>
              {LABELS[winner.index]}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#92400E",
                margin: 0,
              }}
            >
              Creative {LABELS[winner.index]} leads —{" "}
              {winner.result.overall_score}/100
            </p>
            <p style={{ fontSize: 12, color: "#B45309", margin: 0 }}>
              {winner.result.overall_verdict}
            </p>
          </div>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 20,
              background: "#F59E0B",
              color: "#fff",
            }}
          >
            WINNER
          </span>
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 6,
          background: "#EFEFEF",
          borderRadius: 10,
          padding: 4,
        }}
      >
        {[
          ["comparison", "Side by side"],
          ["heatmaps", "Attention maps"],
          ["detail", "Drill down"],
        ].map(([t, l]) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              flex: 1,
              padding: "7px 0",
              borderRadius: 8,
              border: "none",
              fontSize: 12,
              fontWeight: 500,
              background: activeTab === t ? "#fff" : "transparent",
              color: activeTab === t ? "#111" : "#888",
              boxShadow:
                activeTab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              cursor: "pointer",
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {activeTab === "comparison" && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #F0F0F0",
            borderRadius: 14,
            padding: "1.25rem",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `2fr ${analysedCreatives.map(() => "1fr").join(" ")}`,
              gap: 8,
              marginBottom: 16,
              paddingBottom: 14,
              borderBottom: "1px solid #F5F5F5",
            }}
          >
            <div />
            {analysedCreatives.map((c) => (
              <div key={c.index} style={{ textAlign: "center" }}>
                {c.type === "image" && c.dataUrl ? (
                  <img
                    src={c.dataUrl}
                    alt=""
                    style={{
                      width: "100%",
                      height: 60,
                      objectFit: "cover",
                      borderRadius: 6,
                      marginBottom: 6,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: 60,
                      background: "#F5F5F5",
                      borderRadius: 6,
                      marginBottom: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span style={{ fontSize: 10, color: "#AAA" }}>Video</span>
                  </div>
                )}
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: LABEL_COLORS[c.index],
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto 4px",
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 800, color: "#fff" }}>
                    {LABELS[c.index]}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: LABEL_COLORS[c.index],
                    margin: 0,
                  }}
                >
                  {c.result.overall_score}
                </p>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 20,
                    background: c.result.pass ? "#F0FDF4" : "#FEF2F2",
                    color: c.result.pass ? "#15803D" : "#B91C1C",
                  }}
                >
                  {c.result.pass ? "PASS" : "FAIL"}
                </span>
              </div>
            ))}
          </div>
          {DIMS.map((d) => {
            const scores = analysedCreatives.map(
              (c) => c.result.dimensions[d.key]?.score || 0,
            );
            const maxScore = Math.max(...scores);
            return (
              <div
                key={d.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: `2fr ${analysedCreatives.map(() => "1fr").join(" ")}`,
                  gap: 8,
                  paddingBottom: 10,
                  marginBottom: 10,
                  borderBottom: "1px solid #F8F8F8",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 12, color: "#555", fontWeight: 500 }}>
                  {d.name}
                </span>
                {analysedCreatives.map((c) => {
                  const s = c.result.dimensions[d.key]?.score || 0;
                  const isWin = s === maxScore;
                  return (
                    <div key={c.index} style={{ textAlign: "center" }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: isWin ? LABEL_COLORS[c.index] : "#CCC",
                        }}
                      >
                        {s}
                      </span>
                      {isWin && (
                        <div
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: "50%",
                            background: LABEL_COLORS[c.index],
                            margin: "3px auto 0",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      {activeTab === "heatmaps" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {analysedCreatives.map((c) =>
            c.type === "image" ? (
              <div
                key={c.index}
                style={{
                  background: "#fff",
                  border: "1px solid #F0F0F0",
                  borderRadius: 14,
                  padding: "1.25rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: LABEL_COLORS[c.index],
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span
                      style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}
                    >
                      {LABELS[c.index]}
                    </span>
                  </div>
                  <span
                    style={{ fontSize: 13, fontWeight: 600, color: "#222" }}
                  >
                    Creative {LABELS[c.index]} — Attention map
                  </span>
                </div>
                <HeatmapCanvas
                  dataUrl={c.dataUrl || ""}
                  zones={c.result.attention_zones || []}
                />
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {(c.result.attention_zones || []).map((z) => (
                    <div
                      key={z.priority}
                      style={{
                        flex: 1,
                        minWidth: 120,
                        background: "#FAFAFA",
                        borderRadius: 8,
                        padding: "7px 10px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          marginBottom: 3,
                        }}
                      >
                        <div
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            background:
                              z.priority === 1
                                ? "#EF4444"
                                : z.priority === 2
                                  ? "#F59E0B"
                                  : "#EAB308",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 8,
                              fontWeight: 800,
                              color: "#fff",
                            }}
                          >
                            {z.priority}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#222",
                          }}
                        >
                          {z.label}
                        </span>
                      </div>
                      <p style={{ fontSize: 10, color: "#888", margin: 0 }}>
                        {z.note}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                key={c.index}
                style={{
                  background: "#FAFAFA",
                  border: "1px solid #F0F0F0",
                  borderRadius: 14,
                  padding: "1.25rem",
                  textAlign: "center",
                }}
              >
                <span style={{ fontSize: 12, color: "#AAA" }}>
                  Attention mapping not available for video
                </span>
              </div>
            ),
          )}
          <p style={{ fontSize: 10, color: "#CCC", textAlign: "center" }}>
            Zones based on AI visual analysis — not pixel-level eye tracking
          </p>
        </div>
      )}
      {activeTab === "detail" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {analysedCreatives.map((c) => (
              <button
                key={c.index}
                onClick={() => setDetailIdx(c.index)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: `1px solid ${detailIdx === c.index ? LABEL_COLORS[c.index] : "#EFEFEF"}`,
                  background:
                    detailIdx === c.index
                      ? LABEL_COLORS[c.index] + "12"
                      : "#fff",
                  color: detailIdx === c.index ? LABEL_COLORS[c.index] : "#888",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Creative {LABELS[c.index]}
              </button>
            ))}
          </div>
          {(() => {
            const c = analysedCreatives.find((c) => c.index === detailIdx);
            if (!c) return null;
            const others = analysedCreatives.filter(
              (o) => o.index !== detailIdx,
            );
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <CreativePreview creative={c} compact />
                {DIMS.map((d) => {
                  const dim = c.result.dimensions[d.key] || {
                    score: 0,
                    recommendation: "Data missing.",
                  };
                  const { bg, text } = scoreBg(dim.score);
                  return (
                    <div
                      key={d.key}
                      style={{
                        background: "#fff",
                        border: "1px solid #F0F0F0",
                        borderRadius: 12,
                        padding: "12px 14px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "#222",
                          }}
                        >
                          {d.name}
                        </span>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                          }}
                        >
                          {others.map((o) => {
                            const diff =
                              dim.score -
                              (o.result.dimensions[d.key]?.score || 0);
                            return (
                              <span
                                key={o.index}
                                style={{
                                  fontSize: 10,
                                  color: diff >= 0 ? "#22C55E" : "#EF4444",
                                  fontWeight: 600,
                                }}
                              >
                                vs {LABELS[o.index]}: {diff >= 0 ? "+" : ""}
                                {diff}
                              </span>
                            );
                          })}{" "}
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "2px 7px",
                              borderRadius: 20,
                              background: bg,
                              color: text,
                            }}
                          >
                            {dim.score}
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          height: 3,
                          background: "#F0F0F0",
                          borderRadius: 2,
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            height: 3,
                            borderRadius: 2,
                            width: `${dim.score}%`,
                            background: scoreColor(dim.score),
                            transition: "width 0.7s ease",
                          }}
                        />
                      </div>
                      <p
                        style={{
                          fontSize: 12,
                          color: "#777",
                          lineHeight: 1.5,
                          margin: 0,
                        }}
                      >
                        {dim.recommendation}
                      </p>
                    </div>
                  );
                })}{" "}
              </div>
            );
          })()}
        </div>
      )}
      <button
        onClick={onExport}
        style={{
          width: "100%",
          padding: "12px",
          borderRadius: 10,
          border: "none",
          background: "#111",
          fontSize: 13,
          fontWeight: 600,
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Export full comparison report
      </button>
    </div>
  );
}

// ─── TEAM MANAGER (full page, Chatling-style) ────────────────
// Replace the entire TeamManager function in App.tsx with this:

function TeamManager({ session }: { session: any }) {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [teamView, setTeamView] = useState<"members" | "credits" | "invite">(
    "members",
  );

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  // Members
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Credits
  const [allocAmount, setAllocAmount] = useState("");
  const [allocating, setAllocating] = useState(false);

  // Invite
  const [inviteExpiration, setInviteExpiration] = useState<
    "never" | "24h" | "7d"
  >("never");
  const [activeInviteLink, setActiveInviteLink] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  useEffect(() => {
    fetchMyTeams();
  }, []);

  const fetchMyTeams = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("team_members")
      .select(
        `role, joined_at, teams(id, name, credits_pool, org_id, organisations(name, credits_pool))`,
      )
      .eq("user_id", session.user.id);
    if (error) {
      const fallback = await supabase
        .from("team_members")
        .select("role, joined_at, teams(*)")
        .eq("user_id", session.user.id);
      if (!fallback.error && fallback.data) {
        setTeams(fallback.data);
        if (!activeTeamId && fallback.data.length > 0)
          setActiveTeamId((fallback.data[0].teams as any).id);
      }
    } else if (data) {
      setTeams(data);
      if (!activeTeamId && data.length > 0)
        setActiveTeamId((data[0].teams as any).id);
    }
    setLoading(false);
  };

  const activeTeamData = teams.find(
    (t) => (t.teams as any).id === activeTeamId,
  );
  const isAdmin = activeTeamData?.role === "admin";

  useEffect(() => {
    if (!activeTeamId) return;
    loadMembers(activeTeamId);
    setActiveInviteLink("");
    setInviteStatus(null);
    setInviteEmail("");
    setAllocAmount("");
    setTeamView("members");
  }, [activeTeamId]);

  const loadMembers = async (teamId: string) => {
    setLoadingMembers(true);
    const { data } = await supabase
      .from("team_members")
      .select(`id, role, user_id, profiles!left(full_name, email)`)
      .eq("team_id", teamId);
    if (data) setTeamMembers(data);
    setLoadingMembers(false);
  };

  const handleCreate = async () => {
    if (!orgName.trim() || !teamName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.rpc("create_org_and_team", {
      org_name: orgName.trim(),
      team_name: teamName.trim(),
    });
    if (error || !data?.success)
      alert("Error: " + (error?.message || "Unknown error"));
    else {
      setOrgName("");
      setTeamName("");
      setShowCreate(false);
      await fetchMyTeams();
    }
    setCreating(false);
  };

  const updateMemberRole = async (memberId: string, newRole: string) => {
    await supabase
      .from("team_members")
      .update({ role: newRole })
      .eq("id", memberId);
    setTeamMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
    );
  };

  const removeMember = async (memberId: string, userId: string) => {
    if (userId === session.user.id) {
      alert("You cannot remove yourself from the team.");
      return;
    }
    if (!window.confirm("Remove this member from the team?")) return;
    await supabase.from("team_members").delete().eq("id", memberId);
    setTeamMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const handleAllocateCredits = async () => {
    const amt = parseInt(allocAmount);
    if (!amt || amt <= 0 || !activeTeamData) return;
    setAllocating(true);
    const { data, error } = await supabase.rpc("allocate_credits_to_team", {
      p_org_id: activeTeamData.teams.org_id,
      p_team_id: activeTeamData.teams.id,
      p_amount: amt,
    });
    if (error || !data?.success)
      alert(error?.message || data?.error || "Allocation failed");
    else {
      alert(`Successfully allocated ${amt} credits!`);
      setAllocAmount("");
      fetchMyTeams();
    }
    setAllocating(false);
  };

  const generateInvite = async () => {
    if (!activeTeamData) return;
    let expiresAt: string | null = null;
    if (inviteExpiration === "24h")
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    else if (inviteExpiration === "7d")
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("team_invites")
      .insert({
        team_id: activeTeamData.teams.id,
        org_id: activeTeamData.teams.org_id,
        created_by: session.user.id,
        is_active: true,
        expires_at: expiresAt,
      })
      .select("token")
      .single();
    if (data)
      setActiveInviteLink(`${window.location.origin}/?invite=${data.token}`);
    else {
      console.error(error);
      setInviteStatus({
        type: "error",
        msg: "Failed to generate invite link.",
      });
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(activeInviteLink);
    setInviteStatus({ type: "success", msg: "Link copied!" });
  };

  const sendEmailInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      setInviteStatus({ type: "error", msg: "Enter a valid email." });
      return;
    }
    setSendingInvite(true);
    setInviteStatus(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: inviteEmail.trim(),
        options: { emailRedirectTo: activeInviteLink },
      });
      if (error) throw error;
      setInviteStatus({
        type: "success",
        msg: `Invite sent to ${inviteEmail}!`,
      });
      setInviteEmail("");
    } catch (err: any) {
      setInviteStatus({
        type: "error",
        msg: err.message || "Failed to send invite.",
      });
    }
    setSendingInvite(false);
  };

  const filteredMembers = teamMembers.filter((m) => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return (
      (m.profiles?.full_name || "").toLowerCase().includes(q) ||
      (m.profiles?.email || "").toLowerCase().includes(q)
    );
  });

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 300,
        }}
      >
        <p style={{ color: "#888", fontSize: 13 }}>Loading teams...</p>
      </div>
    );

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.75rem",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "#111",
              margin: "0 0 4px",
            }}
          >
            Teams
          </h1>
          <p style={{ fontSize: 13, color: "#999", margin: 0 }}>
            Manage your teams, members, and credits.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "none",
            background: "#111",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + New team
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #EFEFEF",
            borderRadius: 14,
            padding: "1.25rem",
            marginBottom: "1.25rem",
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#111",
              margin: "0 0 14px",
            }}
          >
            Create organisation & team
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#888",
                  display: "block",
                  marginBottom: 5,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Organisation
              </label>
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Acme Corp"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  border: "1px solid #EFEFEF",
                  borderRadius: 8,
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box" as any,
                  color: "#111",
                }}
              />
            </div>
            <div>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#888",
                  display: "block",
                  marginBottom: 5,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Team name
              </label>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Growth Team"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  border: "1px solid #EFEFEF",
                  borderRadius: 8,
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box" as any,
                  color: "#111",
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleCreate}
              disabled={creating || !orgName.trim() || !teamName.trim()}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "none",
                background:
                  orgName.trim() && teamName.trim() ? "#6366F1" : "#F0F0F0",
                color: orgName.trim() && teamName.trim() ? "#fff" : "#AAA",
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  orgName.trim() && teamName.trim() ? "pointer" : "not-allowed",
              }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "1px solid #EFEFEF",
                background: "#fff",
                color: "#555",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {teams.length === 0 && !showCreate ? (
        <div
          style={{
            padding: "4rem",
            background: "#fff",
            border: "1px solid #EFEFEF",
            borderRadius: 14,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#F5F3FF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6366F1"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <p
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: "#111",
              margin: "0 0 6px",
            }}
          >
            No teams yet
          </p>
          <p style={{ color: "#AAA", fontSize: 13, marginBottom: 18 }}>
            Create your first team to collaborate with others.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "none",
              background: "#6366F1",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Create first team
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 1fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* ── LEFT: Team list ── */}
          <div
            style={{
              background: "#fff",
              border: "1px solid #EFEFEF",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "12px 14px",
                borderBottom: "1px solid #F5F5F5",
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#BBB",
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  margin: 0,
                }}
              >
                Your teams
              </p>
            </div>
            <div style={{ padding: "6px" }}>
              {teams.map((t, i) => {
                const team = t.teams as any;
                const isActive = team.id === activeTeamId;
                return (
                  <button
                    key={i}
                    onClick={() => setActiveTeamId(team.id)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 9,
                      border: "none",
                      background: isActive ? "#F5F3FF" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                      gap: 2,
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? "#6366F1" : "#222",
                      }}
                    >
                      {team.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: isActive ? "#A5B4FC" : "#BBB",
                      }}
                    >
                      {team.organisations?.name || "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: Team detail ── */}
          {activeTeamData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {/* Team header card */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #EFEFEF",
                  borderRadius: 14,
                  padding: "1.25rem 1.5rem",
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 3,
                    }}
                  >
                    <h2
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "#111",
                        margin: 0,
                      }}
                    >
                      {(activeTeamData.teams as any).name}
                    </h2>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 20,
                        background: isAdmin ? "#F5F3FF" : "#F4F4F5",
                        color: isAdmin ? "#6366F1" : "#888",
                      }}
                    >
                      {activeTeamData.role.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: "#AAA", margin: 0 }}>
                    {(activeTeamData.teams as any).organisations?.name}
                  </p>
                </div>
                <div
                  style={{
                    background: "#F5F3FF",
                    borderRadius: 10,
                    padding: "10px 16px",
                    textAlign: "right",
                    flexShrink: 0,
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#6366F1",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      margin: "0 0 2px",
                    }}
                  >
                    Credits
                  </p>
                  <p
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: "#6366F1",
                      margin: 0,
                      lineHeight: 1,
                    }}
                  >
                    {(activeTeamData.teams as any).credits_pool ?? 0}
                  </p>
                </div>
              </div>

              {/* Sub-nav tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  background: "#EFEFEF",
                  borderRadius: 10,
                  padding: 4,
                  marginBottom: 16,
                }}
              >
                {(
                  [
                    ["members", "Members"],
                    ...(isAdmin
                      ? [
                          ["credits", "Credits"],
                          ["invite", "Invite"],
                        ]
                      : []),
                  ] as [typeof teamView, string][]
                ).map(([view, label]) => (
                  <button
                    key={view}
                    onClick={() => setTeamView(view)}
                    style={{
                      flex: 1,
                      padding: "8px 0",
                      borderRadius: 8,
                      border: "none",
                      fontSize: 13,
                      fontWeight: 500,
                      background: teamView === view ? "#fff" : "transparent",
                      color: teamView === view ? "#111" : "#888",
                      boxShadow:
                        teamView === view
                          ? "0 1px 3px rgba(0,0,0,0.08)"
                          : "none",
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ── MEMBERS ── */}
              {teamView === "members" && (
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #EFEFEF",
                    borderRadius: 14,
                    padding: "1.25rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 14,
                    }}
                  >
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#111",
                        margin: 0,
                      }}
                    >
                      Members{" "}
                      <span
                        style={{ fontSize: 12, color: "#AAA", fontWeight: 400 }}
                      >
                        ({teamMembers.length})
                      </span>
                    </p>
                    <div style={{ position: "relative" }}>
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#BBB"
                        strokeWidth="2"
                        style={{
                          position: "absolute",
                          left: 9,
                          top: "50%",
                          transform: "translateY(-50%)",
                        }}
                      >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <input
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        placeholder="Search…"
                        style={{
                          padding: "7px 10px 7px 28px",
                          border: "1px solid #EFEFEF",
                          borderRadius: 8,
                          fontSize: 12,
                          outline: "none",
                          width: 160,
                          background: "#FAFAFA",
                          color: "#111",
                        }}
                      />
                    </div>
                  </div>
                  {loadingMembers ? (
                    <p
                      style={{
                        color: "#AAA",
                        fontSize: 13,
                        textAlign: "center",
                        padding: "2rem 0",
                      }}
                    >
                      Loading…
                    </p>
                  ) : filteredMembers.length === 0 ? (
                    <p
                      style={{
                        color: "#AAA",
                        fontSize: 13,
                        textAlign: "center",
                        padding: "2rem 0",
                      }}
                    >
                      No members found.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {filteredMembers.map((member) => (
                        <div
                          key={member.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "12px 14px",
                            border: "1px solid #F5F5F5",
                            borderRadius: 10,
                            background: "#FAFAFA",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: "50%",
                                background: "#EEF2FF",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: "#6366F1",
                                }}
                              >
                                {(member.profiles?.full_name ||
                                  member.profiles?.email ||
                                  "?")[0].toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "#111",
                                  margin: 0,
                                }}
                              >
                                {member.profiles?.full_name || "Guest"}
                              </p>
                              <p
                                style={{
                                  fontSize: 11,
                                  color: "#AAA",
                                  margin: 0,
                                }}
                              >
                                {member.profiles?.email || "—"}
                              </p>
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            {member.user_id === session.user.id ? (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: "3px 10px",
                                  borderRadius: 20,
                                  background: "#F5F3FF",
                                  color: "#6366F1",
                                }}
                              >
                                YOU · {member.role.toUpperCase()}
                              </span>
                            ) : isAdmin ? (
                              <>
                                <select
                                  value={member.role}
                                  onChange={(e) =>
                                    updateMemberRole(member.id, e.target.value)
                                  }
                                  style={{
                                    padding: "5px 8px",
                                    borderRadius: 6,
                                    border: "1px solid #EFEFEF",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    background: "#fff",
                                    color: "#444",
                                    cursor: "pointer",
                                    outline: "none",
                                  }}
                                >
                                  <option value="member">Member</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <button
                                  onClick={() =>
                                    removeMember(member.id, member.user_id)
                                  }
                                  style={{
                                    padding: "5px 10px",
                                    borderRadius: 6,
                                    border: "1px solid #FECACA",
                                    background: "#FEF2F2",
                                    color: "#B91C1C",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  Remove
                                </button>
                              </>
                            ) : (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  padding: "3px 10px",
                                  borderRadius: 20,
                                  background: "#F4F4F5",
                                  color: "#888",
                                }}
                              >
                                {member.role.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── CREDITS ── */}
              {teamView === "credits" && isAdmin && (
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #EFEFEF",
                    borderRadius: 14,
                    padding: "1.25rem",
                  }}
                >
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#111",
                      margin: "0 0 4px",
                    }}
                  >
                    Credit allocation
                  </p>
                  <p
                    style={{ fontSize: 13, color: "#AAA", margin: "0 0 20px" }}
                  >
                    Transfer credits from the org pool to this team.
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      marginBottom: 20,
                    }}
                  >
                    <div
                      style={{
                        background: "#F5F3FF",
                        borderRadius: 12,
                        padding: "1.25rem",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#6366F1",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          margin: "0 0 8px",
                        }}
                      >
                        Org pool
                      </p>
                      <p
                        style={{
                          fontSize: 30,
                          fontWeight: 700,
                          color: "#6366F1",
                          margin: 0,
                          lineHeight: 1,
                        }}
                      >
                        {(activeTeamData.teams as any).organisations
                          ?.credits_pool ?? 0}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: "#A5B4FC",
                          margin: "6px 0 0",
                        }}
                      >
                        Available to allocate
                      </p>
                    </div>
                    <div
                      style={{
                        background: "#F0FDF4",
                        borderRadius: 12,
                        padding: "1.25rem",
                      }}
                    >
                      <p
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#15803D",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          margin: "0 0 8px",
                        }}
                      >
                        Team balance
                      </p>
                      <p
                        style={{
                          fontSize: 30,
                          fontWeight: 700,
                          color: "#15803D",
                          margin: 0,
                          lineHeight: 1,
                        }}
                      >
                        {(activeTeamData.teams as any).credits_pool ?? 0}
                      </p>
                      <p
                        style={{
                          fontSize: 11,
                          color: "#86EFAC",
                          margin: "6px 0 0",
                        }}
                      >
                        Current balance
                      </p>
                    </div>
                  </div>
                  <div
                    style={{
                      background: "#FAFAFA",
                      border: "1px solid #EFEFEF",
                      borderRadius: 12,
                      padding: "1.25rem",
                    }}
                  >
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#555",
                        display: "block",
                        marginBottom: 10,
                      }}
                    >
                      Transfer amount
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="number"
                        placeholder="e.g. 50"
                        value={allocAmount}
                        onChange={(e) => setAllocAmount(e.target.value)}
                        style={{
                          flex: 1,
                          padding: "10px 12px",
                          border: "1px solid #EFEFEF",
                          borderRadius: 8,
                          fontSize: 13,
                          outline: "none",
                          color: "#111",
                          background: "#fff",
                        }}
                      />
                      <button
                        onClick={handleAllocateCredits}
                        disabled={allocating}
                        style={{
                          padding: "0 20px",
                          borderRadius: 8,
                          border: "none",
                          background: "#6366F1",
                          color: "#fff",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: allocating ? "not-allowed" : "pointer",
                          opacity: allocating ? 0.7 : 1,
                        }}
                      >
                        {allocating ? "Moving…" : "Transfer"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── INVITE ── */}
              {teamView === "invite" && isAdmin && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #EFEFEF",
                      borderRadius: 14,
                      padding: "1.25rem",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#111",
                        margin: "0 0 4px",
                      }}
                    >
                      Generate invite link
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        color: "#AAA",
                        margin: "0 0 16px",
                      }}
                    >
                      Anyone with this link can join the team.
                    </p>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#888",
                        display: "block",
                        marginBottom: 8,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Link expiration
                    </label>
                    <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                      {(["never", "24h", "7d"] as const).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setInviteExpiration(opt)}
                          style={{
                            flex: 1,
                            padding: "8px 0",
                            borderRadius: 8,
                            border: `1px solid ${inviteExpiration === opt ? "#6366F1" : "#EFEFEF"}`,
                            background:
                              inviteExpiration === opt ? "#F5F3FF" : "#fff",
                            color:
                              inviteExpiration === opt ? "#6366F1" : "#555",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {opt === "never"
                            ? "Never"
                            : opt === "24h"
                              ? "24 hours"
                              : "7 days"}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={generateInvite}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: 8,
                        border: "none",
                        background: "#111",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Generate link
                    </button>
                    {activeInviteLink && (
                      <div
                        style={{
                          marginTop: 14,
                          background: "#FAFAFA",
                          border: "1px solid #EFEFEF",
                          borderRadius: 10,
                          padding: "12px 14px",
                        }}
                      >
                        <p
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#BBB",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            margin: "0 0 8px",
                          }}
                        >
                          Invite link
                        </p>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            readOnly
                            value={activeInviteLink}
                            style={{
                              flex: 1,
                              padding: "9px 12px",
                              border: "1px solid #EFEFEF",
                              borderRadius: 8,
                              fontSize: 12,
                              background: "#fff",
                              color: "#555",
                              outline: "none",
                            }}
                          />
                          <button
                            onClick={copyLink}
                            style={{
                              padding: "0 14px",
                              borderRadius: 8,
                              border: "none",
                              background: "#F5F3FF",
                              color: "#6366F1",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      background: "#fff",
                      border: "1px solid #EFEFEF",
                      borderRadius: 14,
                      padding: "1.25rem",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "#111",
                        margin: "0 0 4px",
                      }}
                    >
                      Send via email
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        color: "#AAA",
                        margin: "0 0 14px",
                      }}
                    >
                      Send a magic link directly to a colleague's inbox.
                    </p>
                    {!activeInviteLink && (
                      <p
                        style={{
                          fontSize: 12,
                          color: "#F59E0B",
                          background: "#FFFBEB",
                          border: "1px solid #FDE68A",
                          borderRadius: 8,
                          padding: "8px 12px",
                          margin: "0 0 12px",
                        }}
                      >
                        Generate an invite link first before sending via email.
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        disabled={!activeInviteLink}
                        style={{
                          flex: 1,
                          padding: "10px 12px",
                          border: "1px solid #EFEFEF",
                          borderRadius: 8,
                          fontSize: 13,
                          outline: "none",
                          color: "#111",
                          background: activeInviteLink ? "#fff" : "#FAFAFA",
                        }}
                      />
                      <button
                        onClick={sendEmailInvite}
                        disabled={
                          sendingInvite || !inviteEmail || !activeInviteLink
                        }
                        style={{
                          padding: "0 16px",
                          borderRadius: 8,
                          border: "none",
                          background: "#111",
                          color: "#fff",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor:
                            sendingInvite || !inviteEmail || !activeInviteLink
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            sendingInvite || !inviteEmail || !activeInviteLink
                              ? 0.5
                              : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {sendingInvite ? "Sending…" : "Send"}
                      </button>
                    </div>
                    {inviteStatus && (
                      <div
                        style={{
                          marginTop: 10,
                          padding: "9px 12px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 500,
                          background:
                            inviteStatus.type === "success"
                              ? "#F0FDF4"
                              : "#FEF2F2",
                          color:
                            inviteStatus.type === "success"
                              ? "#15803D"
                              : "#B91C1C",
                        }}
                      >
                        {inviteStatus.msg}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                background: "#fff",
                border: "1px solid #EFEFEF",
                borderRadius: 14,
                padding: "4rem",
                textAlign: "center",
              }}
            >
              <p style={{ color: "#AAA", fontSize: 13 }}>
                Select a team from the left
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────
export default function App({
  session,
}: {
  session: import("@supabase/supabase-js").Session;
}) {
  const [activeTeam, setActiveTeam] = useState<{
    id: string;
    name: string;
    org_id: string;
    org_name: string;
  } | null>(null);
  const [userTeams, setUserTeams] = useState<any[]>([]);
  const [teamSwitcherOpen, setTeamSwitcherOpen] = useState(false);
  const [currentView, setCurrentView] = useState<
    "analyzer" | "dashboard" | "brands" | "profile" | "teams"
  >("analyzer");
  const [profile, setProfile] = useState<any>(null);
  const [analysesHistory, setAnalysesHistory] = useState<any[]>([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [mode, setMode] = useState("single");
  const [showBrandMgr, setShowBrandMgr] = useState(false);
  const [brands, setBrands] = useState<BrandMap>({});
  const [selectedBrand, setSelectedBrand] = useState("");
  const [brandNotes, setBrandNotes] = useState("");
  const [brandFiles, setBrandFiles] = useState<BrandFile[]>([]);
  const [client, setClient] = useState("");
  const [platform, setPlatform] = useState("");
  const [threshold, setThreshold] = useState(65);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(MODELS[1].id);
  const [single, setSingle] = useState<CreativeFile | null>(null);
  const [singleResult, setSingleResult] = useState<AnalysisResult | null>(null);
  const [singleAnalysing, setSingleAnalysing] = useState(false);
  const [creatives, setCreatives] = useState<
    ((CreativeFile & { result?: AnalysisResult }) | null)[]
  >([null, null]);
  const [abAnalysing, setAbAnalysing] = useState<number | null>(null);
  const [industry, setIndustry] = useState("");
  const [historyCreative, setHistoryCreative] = useState<CreativeFile | null>(
    null,
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [concept, setConcept] = useState("");
  const [conceptThreshold, setConceptThreshold] = useState(70);
  const [referenceLinks, setReferenceLinks] = useState<string[]>([""]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const fetchUserData = async () => {
    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    if (prof) {
      setProfile(prof);
      setEditName(prof.full_name || "");
      setEditCompany(prof.company || "");
    }
    let histQuery = supabase
      .from("analyses")
      .select("*")
      .order("created_at", { ascending: false });
    if (activeTeam?.id) histQuery = histQuery.eq("team_id", activeTeam.id);
    else histQuery = histQuery.eq("user_id", session.user.id);
    const { data: hist } = await histQuery;
    if (hist) setAnalysesHistory(hist);
  };

  useEffect(() => {
    if (!session?.user?.id) return;
    const loadTeams = async () => {
      const { data } = await supabase
        .from("team_members")
        .select(`role, teams(id, name, org_id, organisations(name))`)
        .eq("user_id", session.user.id);
      if (data && data.length > 0) {
        setUserTeams(data);
        const first = data[0].teams as any;
        setActiveTeam({
          id: first.id,
          name: first.name,
          org_id: first.org_id,
          org_name: first.organisations?.name || "—",
        });
      }
    };
    loadTeams();
    fetchUserData();
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get("invite");
    if (inviteToken) {
      supabase
        .rpc("join_team_via_invite", { invite_token: inviteToken })
        .then(({ data, error }) => {
          if (error) alert("Failed to join team.");
          else if (data?.success) {
            alert("Successfully joined the team!");
            setCurrentView("teams");
            window.history.replaceState({}, document.title, "/");
          } else alert(data?.error || "Invalid invite link.");
        });
    }
  }, [session]);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadBrandsFromSupabase(session.user.id, activeTeam?.id).then((b) =>
      setBrands(b),
    );
    fetchUserData();
  }, [activeTeam?.id]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editName,
        company: editCompany,
      })
      .eq("id", session.user.id);
    if (!error) {
      setProfile({ ...profile, full_name: editName, company: editCompany });
      alert("Profile updated successfully!");
    } else alert("Failed to update profile: " + error.message);
    setSavingProfile(false);
  };

  const deleteAnalysis = async (id: string) => {
    if (
      !window.confirm(
        "Are you sure you want to permanently delete this report?",
      )
    )
      return;
    const item = analysesHistory.find((h) => h.id === id);
    if (item?.result?.creative_storage_path)
      await supabase.storage
        .from("brand-assets")
        .remove([item.result.creative_storage_path]);
    await supabase.from("analyses").delete().eq("id", id);
    setAnalysesHistory((prev) => prev.filter((i) => i.id !== id));
  };

  const handleViewHistory = async (item: any) => {
    setViewingHistoryItem(item);
    setHistoryCreative(null);
    setIsLoadingHistory(true);
    if (item.result?.creative_storage_path) {
      try {
        const { data, error } = await supabase.storage
          .from("brand-assets")
          .download(item.result.creative_storage_path);
        if (data && !error) {
          const dataUrl = await new Promise<string>((res) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result as string);
            reader.readAsDataURL(data);
          });
          setHistoryCreative({
            file: new File([data], item.result.creative_name || "creative"),
            type: item.result.creative_type || "image",
            dataUrl,
            name: item.result.creative_name || "Archived Creative",
            mimeType: item.result.creative_mimeType || data.type,
          });
        }
      } catch (err) {
        console.error("Failed to load archived creative:", err);
      }
    }
    setIsLoadingHistory(false);
  };

  const addReferenceLink = () => {
    if (referenceLinks.length < 3) setReferenceLinks((prev) => [...prev, ""]);
  };
  const updateReferenceLink = (idx: number, val: string) =>
    setReferenceLinks((prev) => prev.map((l, i) => (i === idx ? val : l)));
  const removeReferenceLink = (idx: number) =>
    setReferenceLinks((prev) => prev.filter((_, i) => i !== idx));

  const buildSystem = (isVideo: boolean) => {
    const fileContext = brandFiles
      .filter((f) => f.extractedText)
      .map((f) => `[Brand file: ${f.name}]\n${f.extractedText}`)
      .join("\n\n");
    const industrySection = industry
      ? `
  "industry_benchmarks": {
    "summary": "<2-3 sentences on what the best ${industry} campaigns globally are doing in 2024-2025>",
    "examples": [
      { "brand": "<real brand>", "campaign": "<real campaign>", "technique": "<technique>", "lesson": "<lesson>" },
      { "brand": "<real brand>", "campaign": "<real campaign>", "technique": "<technique>", "lesson": "<lesson>" }
    ],
    "gap": "<single sentence — the biggest difference between this creative and what top ${industry} players are doing>"
  },`
      : "";
    return `You are a senior creative strategist at No Fluff, a behavioural marketing agency for D2C brands. Analyse advertising creatives through consumer psychology, visual hierarchy, and conversion optimisation.${industry ? ` Use your web search tool to find current 2024-2025 ${industry} campaign examples before completing the industry_benchmarks section.` : ""}

Return ONLY raw JSON. No markdown. No backticks. No explanation. Start with { end with }.

{
  "overall_score": <integer 0-100>,
  "overall_verdict": "<one punchy sentence>",
  "pass": <true if score >= ${threshold}, else false>,
  "dimensions": {
    "visual_hierarchy": { "score": <0-100>, "recommendation": "<specific 1-2 sentence observation>" },
    "clarity_readability": { "score": <0-100>, "recommendation": "<specific observation>" },
    "three_second_test": { "score": <0-100>, "recommendation": "<specific observation>" },
    "behavioural_triggers": { "score": <0-100>, "recommendation": "<psychology principles present or missing>" },
    "cta_strength": { "score": <0-100>, "recommendation": "<specific observation>" },
    "cognitive_load": { "score": <0-100>, "recommendation": "<specific observation>" },
    "emotional_resonance": { "score": <0-100>, "recommendation": "<specific observation>" },
    "brand_consistency": { "score": <0-100>, "recommendation": "<specific observation>" },
    "concept_alignment": { "score": <0-100>, "recommendation": "<how clearly the creative communicates the intended concept>" }
  },
  "top_fixes": ["<most impactful fix>", "<second fix>", "<third fix>"],
  "attention_zones": [
    { "priority": 1, "label": "<element>", "x": <0.0-1.0>, "y": <0.0-1.0>, "w": <0.0-1.0>, "h": <0.0-1.0>, "note": "<why this draws attention>" },
    { "priority": 2, "label": "<element>", "x": <0.0-1.0>, "y": <0.0-1.0>, "w": <0.0-1.0>, "h": <0.0-1.0>, "note": "<note>" },
    { "priority": 3, "label": "<element>", "x": <0.0-1.0>, "y": <0.0-1.0>, "w": <0.0-1.0>, "h": <0.0-1.0>, "note": "<note>" }
  ]${industry ? `,${industrySection}` : ""}
}

x/y = top-left corner as fraction of image width/height. w/h = width/height as fraction.
${platform ? `Platform: ${platform}.` : ""}${client ? ` Client: ${client}.` : ""}${industry ? ` Industry: ${industry}.` : ""}${brandNotes ? ` Brand notes: ${brandNotes}.` : ""}${fileContext ? `\n\nBrand guideline documents:\n${fileContext}` : ""}
${concept ? `\nConcept / campaign goal: "${concept}". Score concept_alignment on how clearly and directly the creative communicates this specific goal. Flag in your recommendation if it falls below ${conceptThreshold}/100.` : "\nNo concept provided — score concept_alignment based on general message clarity."}
${
  referenceLinks.filter((l) => l.trim()).length > 0
    ? `\nReference creatives provided by the client — use these for stylistic and tonal benchmarking only:\n${referenceLinks
        .filter((l) => l.trim())
        .map((l, i) => `${i + 1}. ${l}`)
        .join("\n")}`
    : ""
}
${isVideo ? "Video creative — benchmark against best-practice standards for the format." : ""}
Be specific. Reference actual elements visible. No generic advice.`;
  };

  const callAPI = async (creative: CreativeFile): Promise<AnalysisResult> => {
    const isVideo = creative.type === "video";
    const contentParts: object[] = [];
    for (const bf of brandFiles.filter(
      (f) => f.type.startsWith("image/") && f.dataUrl,
    )) {
      contentParts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: bf.type,
          data: bf.dataUrl.split(",")[1],
        },
      });
      contentParts.push({ type: "text", text: `[Brand asset: ${bf.name}]` });
    }
    if (!isVideo) {
      const raw = await toBase64Raw(creative.file);
      contentParts.push({
        type: "image",
        source: { type: "base64", media_type: creative.mimeType, data: raw },
      });
      contentParts.push({
        type: "text",
        text: "Analyse this creative. Return raw JSON only, starting with {",
      });
    } else
      contentParts.push({
        type: "text",
        text: `Video file: "${creative.name}". Provide the JSON analysis. Raw JSON only, starting with {`,
      });
    const messages = [
      {
        role: "user",
        content: isVideo ? contentParts[contentParts.length - 1] : contentParts,
      },
    ];
    const requestBody: Record<string, unknown> = {
      model: selectedModel,
      max_tokens: 4000,
      system: buildSystem(isVideo),
      messages,
    };
    if (industry)
      requestBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const resp = await fetch("/api/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.error?.message || `API error ${resp.status}`);
    }
    const data = await resp.json();
    const rawText = (data.content || [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text || "")
      .join("")
      .trim();
    const start = rawText.indexOf("{"),
      end = rawText.lastIndexOf("}");
    if (start === -1 || end === -1)
      throw new Error("No JSON found in response");
    const parsed = JSON.parse(rawText.slice(start, end + 1));
    if (!parsed.dimensions || !parsed.overall_score)
      throw new Error("Incomplete analysis returned — please try again.");
    return parsed;
  };

  const saveAnalysisRecord = async (
    score: number,
    pass: boolean,
    fullResult: AnalysisResult,
    creative: CreativeFile | null,
    analysisType: string,
  ) => {
    let updatedResult = { ...fullResult };
    if (creative?.file) {
      const safeName = creative.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const storagePath = `${session.user.id}/analyses/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage
        .from("brand-assets")
        .upload(storagePath, creative.file);
      if (!error) {
        updatedResult.creative_storage_path = storagePath;
        updatedResult.creative_name = creative.name;
        updatedResult.creative_type = creative.type;
        updatedResult.creative_mimeType = creative.mimeType;
      } else console.error("Failed to upload creative:", error);
    }
    const creditsUsed =
      MODELS.find((m) => m.id === selectedModel)?.credits || 1;
    await supabase.from("analyses").insert({
      user_id: session.user.id,
      team_id: activeTeam?.id || null,
      org_id: activeTeam?.org_id || null,
      client: client || "Unnamed Analysis",
      platform: platform || "Unknown",
      industry: industry || "Unknown",
      concept: concept || null,
      type: analysisType,
      model: selectedModel,
      credits_used: creditsUsed,
      overall_score: score,
      pass,
      result: updatedResult,
    });
    fetchUserData();
  };

  const runSingle = async () => {
    if (!single) return;
    setSingleAnalysing(true);
    setError(null);
    setSingleResult(null);
    try {
      const res = await callAPI(single);
      setSingleResult(res);
      await saveAnalysisRecord(
        res.overall_score,
        res.pass,
        res,
        single,
        "Single",
      );
    } catch (err) {
      setError((err as Error).message);
    }
    setSingleAnalysing(false);
  };

  const runAB = async () => {
    if (creatives.filter(Boolean).length < 2) return;
    setError(null);
    for (let i = 0; i < creatives.length; i++) {
      if (!creatives[i]) continue;
      setAbAnalysing(i);
      try {
        const result = await callAPI(creatives[i] as CreativeFile);
        setCreatives((prev) => {
          const n = [...prev];
          if (n[i]) n[i] = { ...(n[i] as CreativeFile), result };
          return n;
        });
        await saveAnalysisRecord(
          result.overall_score,
          result.pass,
          result,
          creatives[i] as CreativeFile,
          "A/B Comparison",
        );
      } catch (err) {
        setError(`Creative ${LABELS[i]}: ${(err as Error).message}`);
      }
    }
    setAbAnalysing(null);
  };

  const exportReport = async (
    items: AnalysedCreative[],
    creative: CreativeFile | null = null,
  ) => {
    try {
      // Single creative export
      if (items.length === 1) {
        const item = items[0];
        const heatmap = await generateHeatmapCanvas(
          creative || item,
          item.result.attention_zones || [],
        );
        await generatePDF({
          creative: creative || item,
          result: item.result,
          heatmapDataUrl: heatmap,
          client: client || "Unnamed",
          platform: platform || "—",
          industry: industry || "—",
          threshold,
          model: selectedModel,
          date: new Date().toLocaleDateString("en-GB"),
        });
      } else {
        // A/B: export each creative as a separate PDF page set
        // For multi-creative, export winner first then others sequentially
        for (const item of items) {
          const heatmap = await generateHeatmapCanvas(
            item,
            item.result.attention_zones || [],
          );
          await generatePDF({
            creative: item,
            result: item.result,
            heatmapDataUrl: heatmap,
            client: `${client || "Unnamed"} — Creative ${LABELS[item.index]}`,
            platform: platform || "—",
            industry: industry || "—",
            threshold,
            model: selectedModel,
            date: new Date().toLocaleDateString("en-GB"),
          });
        }
      }
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Check the console for details.");
    }
  };

  const brandList = Object.keys(brands);
  const analysedCreatives = creatives
    .map((c, i) =>
      c && (c as AnalysedCreative).result
        ? ({ ...c, index: i } as AnalysedCreative)
        : null,
    )
    .filter((c): c is AnalysedCreative => c !== null);
  const winner =
    analysedCreatives.length > 1
      ? analysedCreatives.reduce((a, b) =>
          a.result.overall_score > b.result.overall_score ? a : b,
        )
      : null;

  const generateHeatmapCanvas = async (
    creative: CreativeFile | null,
    zones: Zone[],
  ): Promise<string | undefined> => {
    if (
      !creative ||
      creative.type !== "image" ||
      !creative.dataUrl ||
      !zones?.length
    )
      return undefined;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const img = new Image();
    await new Promise((resolve) => {
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        zones.forEach((zone) => {
          const x = zone.x * img.naturalWidth,
            y = zone.y * img.naturalHeight,
            w = zone.w * img.naturalWidth,
            h = zone.h * img.naturalHeight;
          const cx2 = x + w / 2,
            cy2 = y + h / 2;
          const grad = ctx.createRadialGradient(
            cx2,
            cy2,
            0,
            cx2,
            cy2,
            Math.max(w, h) * 0.65,
          );
          const col =
            zone.priority === 1
              ? "rgba(239,68,68,0.5)"
              : zone.priority === 2
                ? "rgba(251,146,60,0.4)"
                : "rgba(250,204,21,0.3)";
          grad.addColorStop(0, col);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(x - w * 0.15, y - h * 0.15, w * 1.3, h * 1.3);
          ctx.strokeStyle =
            zone.priority === 1
              ? "rgba(239,68,68,0.85)"
              : zone.priority === 2
                ? "rgba(251,146,60,0.75)"
                : "rgba(202,138,4,0.7)";
          ctx.lineWidth = Math.max(2, img.naturalWidth * 0.003);
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
          const labelText = `${zone.priority}. ${zone.label}`,
            fs = Math.max(12, img.naturalWidth * 0.016);
          ctx.font = `bold ${fs}px system-ui`;
          const tw = ctx.measureText(labelText).width,
            pad = 6,
            bh = fs + pad * 2,
            bx = x,
            by = Math.max(0, y - bh - 2);
          ctx.fillStyle =
            zone.priority === 1
              ? "rgba(239,68,68,0.92)"
              : zone.priority === 2
                ? "rgba(251,146,60,0.92)"
                : "rgba(202,138,4,0.92)";
          ctx.beginPath();
          ctx.roundRect(bx, by, tw + pad * 2, bh, 4);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, bx + pad, by + bh / 2);
        });
        resolve(true);
      };
      img.src = creative.dataUrl as string;
    });
    return canvas.toDataURL("image/png");
  };

  const Sidebar = () => (
    <aside
      style={{
        width: isSidebarOpen ? 260 : 76,
        transition: "width 0.3s ease",
        background: "#fff",
        borderRight: "1px solid #EFEFEF",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
        overflow: "hidden",
        zIndex: 100,
      }}
    >
      <div style={{ borderBottom: "1px solid #EFEFEF" }}>
        <div
          style={{
            padding: isSidebarOpen
              ? "1.25rem 1rem 0.75rem"
              : "1.25rem 0 0.75rem",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              justifyContent: isSidebarOpen ? "flex-start" : "center",
              width: "100%",
              paddingLeft: isSidebarOpen ? 4 : 0,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                background: "#111",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 12, color: "#fff", fontWeight: 800 }}>
                P
              </span>
            </div>
            {isSidebarOpen && (
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>
                Preflyght
              </span>
            )}
          </div>
        </div>

        {/* Team switcher */}
        {isSidebarOpen && userTeams.length > 0 && (
          <div style={{ padding: "0 0.75rem 0.75rem" }}>
            <div
              onClick={() => setTeamSwitcherOpen((o) => !o)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #F0F0F0",
                background: "#FAFAFA",
                cursor: "pointer",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#AAA",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    margin: "0 0 1px",
                  }}
                >
                  {activeTeam?.org_name || "Personal"}
                </p>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#111",
                    margin: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {activeTeam?.name || "My team"}
                </p>
              </div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#AAA"
                strokeWidth="2.5"
                style={{
                  flexShrink: 0,
                  marginLeft: 8,
                  transform: teamSwitcherOpen
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {teamSwitcherOpen && (
              <div
                style={{
                  marginTop: 4,
                  background: "#fff",
                  border: "1px solid #EFEFEF",
                  borderRadius: 8,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.07)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "4px" }}>
                  {userTeams.map((t, i) => {
                    const team = t.teams as any;
                    const isCurrent = team.id === activeTeam?.id;
                    return (
                      <div
                        key={i}
                        onClick={() => {
                          setActiveTeam({
                            id: team.id,
                            name: team.name,
                            org_id: team.org_id,
                            org_name: team.organisations?.name || "—",
                          });
                          setTeamSwitcherOpen(false);
                        }}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 6,
                          cursor: "pointer",
                          background: isCurrent ? "#F5F3FF" : "transparent",
                        }}
                      >
                        <p
                          style={{
                            fontSize: 12,
                            fontWeight: isCurrent ? 600 : 500,
                            color: isCurrent ? "#6366F1" : "#222",
                            margin: 0,
                          }}
                        >
                          {team.name}
                        </p>
                        <p
                          style={{
                            fontSize: 10,
                            color: isCurrent ? "#6366F1" : "#AAA",
                            margin: 0,
                          }}
                        >
                          {team.organisations?.name}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          padding: "0.75rem 0.5rem",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          overflowY: "auto",
        }}
      >
        {(
          [
            [
              "analyzer",
              "Analyser",
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>,
            ],
            [
              "dashboard",
              "History",
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>,
            ],
            [
              "brands",
              "Brands",
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>,
            ],
            [
              "teams",
              "Teams",
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>,
            ],
            [
              "profile",
              "Profile",
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>,
            ],
          ] as [string, string, React.ReactNode][]
        ).map(([view, label, icon]) => {
          const active = currentView === view;
          return (
            <button
              key={view}
              onClick={() => setCurrentView(view as typeof currentView)}
              title={!isSidebarOpen ? label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: isSidebarOpen ? "9px 12px" : "9px 0",
                justifyContent: isSidebarOpen ? "flex-start" : "center",
                borderRadius: 8,
                border: "none",
                background: active ? "#F5F3FF" : "transparent",
                color: active ? "#6366F1" : "#555",
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {icon}
              {isSidebarOpen && label}
            </button>
          );
        })}
      </nav>

      {/* Bottom — credits + toggle */}
      <div
        style={{
          padding: "0.75rem 0.5rem",
          borderTop: "1px solid #EFEFEF",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {isSidebarOpen && profile && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              background: "#FAFAFA",
              border: "1px solid #F0F0F0",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#AAA",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                Credits
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>
                {profile.credits_balance ?? 0}
              </span>
            </div>
            <div style={{ height: 4, background: "#F0F0F0", borderRadius: 2 }}>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  width: `${Math.min(100, ((profile.credits_balance || 0) / 100) * 100)}%`,
                  background: "#6366F1",
                  transition: "width 0.5s ease",
                }}
              />
            </div>
          </div>
        )}
        <button
          onClick={() => setIsSidebarOpen((o) => !o)}
          title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isSidebarOpen ? "flex-start" : "center",
            gap: 8,
            padding: isSidebarOpen ? "8px 10px" : "8px 0",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "#AAA",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            width: "100%",
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{
              transform: isSidebarOpen ? "rotate(0deg)" : "rotate(180deg)",
              transition: "transform 0.3s",
            }}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {isSidebarOpen && "Collapse"}
        </button>
        {isSidebarOpen && (
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "#CCC",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 500,
              width: "100%",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        )}
      </div>
    </aside>
  );

  // ─── MAIN LAYOUT ───────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "var(--font-sans,system-ui)",
        background: "#FAFAFA",
        minHeight: "100vh",
      }}
    >
      <Sidebar />
      {showBrandMgr && (
        <BrandManager
          userId={session.user.id}
          teamId={activeTeam?.id}
          selectedBrand={selectedBrand}
          onSelect={(n, notes, files) => {
            setSelectedBrand(n);
            setBrandNotes(notes || "");
            setBrandFiles(files || []);
            if (n) setClient(n);
          }}
          onClose={() => setShowBrandMgr(false)}
          onUpdated={(b) => setBrands(b)}
        />
      )}

      <main
        style={{
          marginLeft: isSidebarOpen ? 260 : 76,
          flex: 1,
          padding: "2rem 1.5rem",
          transition: "margin-left 0.3s ease",
          maxWidth: "100%",
        }}
      >
        <div>
          {/* ── ANALYSER VIEW ── */}
          {currentView === "analyzer" && (
            <div>
              <div style={{ marginBottom: "1.75rem" }}>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: "#111",
                    margin: "0 0 4px",
                    textAlign: "left",
                  }}
                >
                  Creative Analyser
                </h1>
                <p
                  style={{
                    fontSize: 13,
                    color: "#999",
                    margin: 0,
                    textAlign: "left",
                  }}
                >
                  Pre-flight analysis powered by behavioural science
                </p>
              </div>

              {/* Config panel */}
              {!(
                singleResult ||
                (mode === "ab" && analysedCreatives.length > 0)
              ) && (
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #EFEFEF",
                    borderRadius: 14,
                    padding: "1.25rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#BBB",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 14,
                    }}
                  >
                    Configuration
                  </p>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#888",
                          display: "block",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Brand / client
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          marginBottom: selectedBrand ? 8 : 0,
                        }}
                      >
                        <select
                          value={selectedBrand}
                          onChange={(e) => {
                            const n = e.target.value;
                            setSelectedBrand(n);
                            if (n && brands[n]) {
                              setBrandNotes(brands[n].notes);
                              setBrandFiles(brands[n].files || []);
                              setClient(n);
                            } else {
                              setBrandNotes("");
                              setBrandFiles([]);
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: "9px 10px",
                            border: "1px solid #EFEFEF",
                            borderRadius: 8,
                            fontSize: 13,
                            background: "#FAFAFA",
                            color: "#333",
                            outline: "none",
                          }}
                        >
                          <option value="">No brand selected</option>
                          {brandList.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setShowBrandMgr(true)}
                          style={{
                            padding: "0 14px",
                            border: "1px solid #EFEFEF",
                            borderRadius: 8,
                            background: "#fff",
                            cursor: "pointer",
                            color: "#555",
                            fontSize: 12,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Manage brands
                        </button>
                      </div>
                      {/* Brand preview card — only shows when a brand is selected */}
                      {selectedBrand && brands[selectedBrand] && (
                        <div
                          style={{
                            background: "#F5F3FF",
                            border: "1px solid #E0DBFF",
                            borderRadius: 10,
                            padding: "10px 14px",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 12,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                marginBottom: 4,
                              }}
                            >
                              <div
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 5,
                                  background: "#6366F1",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 800,
                                    color: "#fff",
                                  }}
                                >
                                  {selectedBrand[0].toUpperCase()}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "#6366F1",
                                }}
                              >
                                {selectedBrand}
                              </span>
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  padding: "1px 6px",
                                  borderRadius: 20,
                                  background: "#6366F1",
                                  color: "#fff",
                                }}
                              >
                                Active
                              </span>
                            </div>
                            {brands[selectedBrand].notes && (
                              <p
                                style={{
                                  fontSize: 11,
                                  color: "#6366F180",
                                  margin: "0 0 6px",
                                  lineHeight: 1.5,
                                  overflow: "hidden",
                                  display: "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical" as any,
                                }}
                              >
                                {brands[selectedBrand].notes}
                              </p>
                            )}
                            {(brands[selectedBrand].files || []).length > 0 && (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 4,
                                  flexWrap: "wrap",
                                }}
                              >
                                {(brands[selectedBrand].files || []).map(
                                  (f, i) => (
                                    <span
                                      key={i}
                                      style={{
                                        fontSize: 10,
                                        padding: "2px 7px",
                                        borderRadius: 4,
                                        background: "#fff",
                                        color: "#6366F1",
                                        border: "1px solid #E0DBFF",
                                      }}
                                    >
                                      {f.type.startsWith("image/")
                                        ? "🖼️"
                                        : f.type === "application/pdf"
                                          ? "📄"
                                          : "📝"}{" "}
                                      {f.name.length > 18
                                        ? f.name.slice(0, 18) + "…"
                                        : f.name}
                                    </span>
                                  ),
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setSelectedBrand("");
                              setBrandNotes("");
                              setBrandFiles([]);
                              setClient("");
                            }}
                            style={{
                              padding: "3px 8px",
                              borderRadius: 6,
                              border: "1px solid #E0DBFF",
                              background: "#fff",
                              color: "#6366F1",
                              fontSize: 11,
                              cursor: "pointer",
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#888",
                          display: "block",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Platform
                      </label>
                      <select
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "9px 10px",
                          border: "1px solid #EFEFEF",
                          borderRadius: 8,
                          fontSize: 13,
                          background: "#FAFAFA",
                          color: "#333",
                          outline: "none",
                        }}
                      >
                        <option value="">Select platform…</option>
                        {PLATFORMS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#888",
                          display: "block",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Industry
                      </label>
                      <select
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "9px 10px",
                          border: "1px solid #EFEFEF",
                          borderRadius: 8,
                          fontSize: 13,
                          background: "#FAFAFA",
                          color: "#333",
                          outline: "none",
                        }}
                      >
                        <option value="">No industry benchmarks</option>
                        {INDUSTRIES.map((i) => (
                          <option key={i} value={i}>
                            {i}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#888",
                          display: "block",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Pass threshold: {threshold}
                      </label>
                      <input
                        type="range"
                        min={40}
                        max={90}
                        value={threshold}
                        onChange={(e) => setThreshold(parseInt(e.target.value))}
                        style={{
                          width: "100%",
                          marginTop: 4,
                          accentColor: "#6366F1",
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#888",
                        display: "block",
                        marginBottom: 6,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Concept / campaign goal{" "}
                      <span
                        style={{
                          fontSize: 10,
                          color: "#CCC",
                          fontWeight: 400,
                          textTransform: "none",
                        }}
                      >
                        optional
                      </span>
                    </label>
                    <input
                      value={concept}
                      onChange={(e) => setConcept(e.target.value)}
                      placeholder="e.g. Drive trial of new SPF moisturiser among women 25–40"
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        border: "1px solid #EFEFEF",
                        borderRadius: 8,
                        fontSize: 13,
                        outline: "none",
                        background: "#FAFAFA",
                        color: "#333",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  {concept && (
                    <div
                      style={{
                        marginBottom: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#888",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          flexShrink: 0,
                        }}
                      >
                        Concept threshold: {conceptThreshold}
                      </label>
                      <input
                        type="range"
                        min={40}
                        max={90}
                        value={conceptThreshold}
                        onChange={(e) =>
                          setConceptThreshold(parseInt(e.target.value))
                        }
                        style={{ flex: 1, accentColor: "#6366F1" }}
                      />
                    </div>
                  )}
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#888",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Reference creatives{" "}
                        <span
                          style={{
                            fontSize: 10,
                            color: "#CCC",
                            fontWeight: 400,
                            textTransform: "none",
                          }}
                        >
                          optional · up to 3 URLs
                        </span>
                      </label>
                      {referenceLinks.length < 3 && (
                        <button
                          onClick={addReferenceLink}
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 6,
                            border: "1px solid #E0DBFF",
                            background: "#F5F3FF",
                            color: "#6366F1",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          + Add
                        </button>
                      )}
                    </div>
                    {referenceLinks.map((l, i) => (
                      <div
                        key={i}
                        style={{ display: "flex", gap: 6, marginBottom: 6 }}
                      >
                        <input
                          value={l}
                          onChange={(e) =>
                            updateReferenceLink(i, e.target.value)
                          }
                          placeholder="https://example.com/ad-image.jpg"
                          style={{
                            flex: 1,
                            padding: "8px 12px",
                            border: "1px solid #EFEFEF",
                            borderRadius: 8,
                            fontSize: 12,
                            outline: "none",
                            background: "#FAFAFA",
                            color: "#333",
                          }}
                        />
                        {referenceLinks.length > 1 && (
                          <button
                            onClick={() => removeReferenceLink(i)}
                            style={{
                              padding: "0 10px",
                              border: "1px solid #EFEFEF",
                              borderRadius: 8,
                              background: "#fff",
                              color: "#AAA",
                              cursor: "pointer",
                              fontSize: 13,
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <ModelSelector
                    value={selectedModel}
                    onChange={setSelectedModel}
                  />
                </div>
              )}

              {/* Mode toggle */}
              {!(
                singleResult ||
                (mode === "ab" && analysedCreatives.length > 0)
              ) && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginBottom: "1.25rem",
                    background: "#EFEFEF",
                    borderRadius: 10,
                    padding: 4,
                  }}
                >
                  {[
                    ["single", "Single creative"],
                    ["ab", "A/B comparison"],
                  ].map(([m, l]) => (
                    <button
                      key={m}
                      onClick={() => {
                        setMode(m);
                        setError(null);
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 0",
                        borderRadius: 8,
                        border: "none",
                        fontSize: 13,
                        fontWeight: 500,
                        background: mode === m ? "#fff" : "transparent",
                        color: mode === m ? "#111" : "#888",
                        boxShadow:
                          mode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                        cursor: "pointer",
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}

              {/* Single mode */}
              {mode === "single" && !singleResult && !singleAnalysing && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  {single ? (
                    <CreativePreview
                      creative={single}
                      onRemove={() => setSingle(null)}
                    />
                  ) : (
                    <UploadZone onFile={(f) => setSingle(f)} />
                  )}
                  {single && (
                    <button
                      onClick={runSingle}
                      style={{
                        width: "100%",
                        padding: "13px",
                        borderRadius: 10,
                        border: "none",
                        background: "#111",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Analyse creative
                    </button>
                  )}
                </div>
              )}
              {mode === "single" && singleAnalysing && (
                <AnalysisLoader label="Analysing your creative…" />
              )}
              {mode === "single" && singleResult && !singleAnalysing && (
                <SingleResult
                  creative={single}
                  result={singleResult}
                  threshold={threshold}
                  model={selectedModel}
                  client={client}
                  platform={platform}
                  industry={industry}
                  onReset={() => {
                    setSingleResult(null);
                    setSingle(null);
                  }}
                  onExport={() => {
                    if (single && singleResult)
                      exportReport(
                        [{ ...single, result: singleResult, index: 0 }],
                        single,
                      );
                  }}
                />
              )}

              {/* A/B mode */}
              {mode === "ab" && analysedCreatives.length === 0 && (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        creatives.length <= 2 ? "1fr 1fr" : "1fr 1fr 1fr",
                      gap: 12,
                    }}
                  >
                    {creatives.map((c, i) => (
                      <div key={i}>
                        {c ? (
                          <CreativePreview
                            creative={c}
                            label={LABELS[i]}
                            labelColor={LABEL_COLORS[i]}
                            onRemove={() =>
                              setCreatives((prev) => {
                                const n = [...prev];
                                n[i] = null;
                                return n;
                              })
                            }
                            compact
                          />
                        ) : (
                          <UploadZone
                            onFile={(f) =>
                              setCreatives((prev) => {
                                const n = [...prev];
                                n[i] = f;
                                return n;
                              })
                            }
                            label={LABELS[i]}
                            labelColor={LABEL_COLORS[i]}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  {creatives.length < 4 && (
                    <button
                      onClick={() => setCreatives((prev) => [...prev, null])}
                      style={{
                        width: "100%",
                        padding: "10px",
                        borderRadius: 10,
                        border: "1.5px dashed #E0E0E0",
                        background: "#FAFAFA",
                        color: "#888",
                        fontSize: 13,
                        cursor: "pointer",
                        fontWeight: 500,
                      }}
                    >
                      + Add Creative {LABELS[creatives.length]}
                    </button>
                  )}
                  {creatives.filter(Boolean).length >= 2 &&
                    abAnalysing === null && (
                      <button
                        onClick={runAB}
                        style={{
                          width: "100%",
                          padding: "13px",
                          borderRadius: 10,
                          border: "none",
                          background: "#111",
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Run A/B analysis ({creatives.filter(Boolean).length}{" "}
                        creatives)
                      </button>
                    )}
                  {abAnalysing !== null && (
                    <AnalysisLoader
                      label={`Analysing creative ${LABELS[abAnalysing]}…`}
                    />
                  )}
                </div>
              )}
              {mode === "ab" && analysedCreatives.length > 0 && (
                <div>
                  <button
                    onClick={() => {
                      setCreatives([null, null]);
                    }}
                    style={{
                      marginBottom: 12,
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "1px solid #EFEFEF",
                      background: "#fff",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#555",
                      cursor: "pointer",
                    }}
                  >
                    ← New comparison
                  </button>
                  <ABResults
                    analysedCreatives={analysedCreatives}
                    winner={winner}
                    threshold={threshold}
                    onExport={() => exportReport(analysedCreatives)}
                  />
                </div>
              )}

              {error && (
                <div
                  style={{
                    marginTop: 12,
                    padding: "12px 14px",
                    borderRadius: 10,
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    fontSize: 13,
                    color: "#B91C1C",
                  }}
                >
                  ⚠ {error}
                </div>
              )}
            </div>
          )}

          {/* ── HISTORY / DASHBOARD VIEW ── */}
          {currentView === "dashboard" && (
            <div>
              <div style={{ marginBottom: "1.75rem" }}>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: "#111",
                    margin: "0 0 4px",
                    textAlign: "left",
                  }}
                >
                  Analysis history
                </h1>
                <p
                  style={{
                    fontSize: 13,
                    color: "#999",
                    margin: 0,
                    textAlign: "left",
                  }}
                >
                  {analysesHistory.length} report
                  {analysesHistory.length !== 1 ? "s" : ""} saved
                </p>
              </div>
              {viewingHistoryItem ? (
                <div>
                  <button
                    onClick={() => {
                      setViewingHistoryItem(null);
                      setHistoryCreative(null);
                    }}
                    style={{
                      marginBottom: 12,
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: "1px solid #EFEFEF",
                      background: "#fff",
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#555",
                      cursor: "pointer",
                    }}
                  >
                    ← Back to history
                  </button>
                  {isLoadingHistory && (
                    <AnalysisLoader label="Loading archived creative…" />
                  )}
                  <SingleResult
                    creative={historyCreative}
                    result={viewingHistoryItem.result}
                    threshold={
                      viewingHistoryItem.result?.pass !== undefined
                        ? threshold
                        : 65
                    }
                    client={viewingHistoryItem.client}
                    platform={viewingHistoryItem.platform}
                    industry={viewingHistoryItem.industry}
                    onReset={() => {
                      setViewingHistoryItem(null);
                      setHistoryCreative(null);
                    }}
                    onExport={() => {
                      if (historyCreative)
                        exportReport(
                          [
                            {
                              ...historyCreative,
                              result: viewingHistoryItem.result,
                              index: 0,
                            },
                          ],
                          historyCreative,
                        );
                    }}
                  />
                </div>
              ) : analysesHistory.length === 0 ? (
                <div
                  style={{
                    padding: "4rem",
                    background: "#fff",
                    border: "1px solid #EFEFEF",
                    borderRadius: 14,
                    textAlign: "center",
                  }}
                >
                  <p style={{ fontSize: 24, margin: "0 0 8px" }}>📭</p>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#222",
                      margin: "0 0 4px",
                    }}
                  >
                    No analyses yet
                  </p>
                  <p style={{ fontSize: 13, color: "#AAA", margin: 0 }}>
                    Run your first creative analysis to see it here.
                  </p>
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {analysesHistory.map((item) => {
                    const s = item.overall_score || 0;
                    const { bg, text } = scoreBg(s);
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleViewHistory(item)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          padding: "14px 16px",
                          background: "#fff",
                          border: "1px solid #EFEFEF",
                          borderRadius: 12,
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) =>
                          ((
                            e.currentTarget as HTMLDivElement
                          ).style.borderColor = "#6366F1")
                        }
                        onMouseLeave={(e) =>
                          ((
                            e.currentTarget as HTMLDivElement
                          ).style.borderColor = "#EFEFEF")
                        }
                      >
                        <RadialScore
                          score={s}
                          size={48}
                          color={scoreColor(s)}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#111",
                              margin: "0 0 2px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.client || "Unnamed"}
                          </p>
                          <p style={{ fontSize: 11, color: "#888", margin: 0 }}>
                            {item.platform || "—"} · {item.type || "Single"} ·{" "}
                            {new Date(item.created_at).toLocaleDateString(
                              "en-GB",
                            )}
                          </p>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: bg,
                              color: text,
                            }}
                          >
                            {s}/100
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: 20,
                              background: item.pass ? "#F0FDF4" : "#FEF2F2",
                              color: item.pass ? "#15803D" : "#B91C1C",
                            }}
                          >
                            {item.pass ? "PASS" : "FAIL"}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteAnalysis(item.id);
                            }}
                            style={{
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: "1px solid #FECACA",
                              background: "#FEF2F2",
                              color: "#B91C1C",
                              fontSize: 11,
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── BRANDS VIEW ── */}
          {currentView === "brands" && (
            <div style={{ marginBottom: "1.75rem" }}>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#111",
                  margin: "0 0 4px",
                  textAlign: "left",
                }}
              >
                Brand guidelines
              </h1>
              <p
                style={{
                  fontSize: 13,
                  color: "#999",
                  margin: 0,
                  textAlign: "left",
                }}
              >
                Manage your brand assets and guidelines for analysis.
              </p>
              <BrandManager
                userId={session.user.id}
                teamId={activeTeam?.id}
                isModal={false}
                selectedBrand={selectedBrand}
                onSelect={(n, notes, files) => {
                  setSelectedBrand(n);
                  setBrandNotes(notes || "");
                  setBrandFiles(files || []);
                  if (n) setClient(n);
                }}
                onClose={() => {}}
                onUpdated={(b) => setBrands(b)}
              />
            </div>
          )}

          {/* ── TEAMS VIEW ── */}
          {currentView === "teams" && <TeamManager session={session} />}

          {/* ── PROFILE VIEW ── */}
          {currentView === "profile" && (
            <div>
              <div style={{ marginBottom: "1.75rem" }}>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: "#111",
                    margin: "0 0 4px",
                    textAlign: "left",
                  }}
                >
                  Profile
                </h1>
                <p
                  style={{
                    fontSize: 13,
                    color: "#999",
                    margin: 0,
                    textAlign: "left",
                  }}
                >
                  Manage your account settings.
                </p>
              </div>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #EFEFEF",
                    borderRadius: 14,
                    padding: "1.5rem",
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#BBB",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 14,
                    }}
                  >
                    Account
                  </p>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#888",
                          display: "block",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Full name
                      </label>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Your name"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          border: "1px solid #E5E7EB",
                          borderRadius: 8,
                          fontSize: 13,
                          outline: "none",
                          boxSizing: "border-box",
                          color: "#111",
                          background: "#fff",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#888",
                          display: "block",
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Company
                      </label>
                      <input
                        value={editCompany}
                        onChange={(e) => setEditCompany(e.target.value)}
                        placeholder="Your company"
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          border: "1px solid #E5E7EB",
                          borderRadius: 8,
                          fontSize: 13,
                          outline: "none",
                          boxSizing: "border-box",
                          color: "#111",
                          background: "#fff",
                        }}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: "#AAA", marginBottom: 16 }}>
                    Email: {session.user.email}
                  </p>
                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 8,
                      border: "none",
                      background: savingProfile ? "#F0F0F0" : "#111",
                      color: savingProfile ? "#AAA" : "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: savingProfile ? "not-allowed" : "pointer",
                    }}
                  >
                    {savingProfile ? "Saving…" : "Save profile"}
                  </button>
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #EFEFEF",
                    borderRadius: 14,
                    padding: "1.5rem",
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#BBB",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 14,
                    }}
                  >
                    Credits
                  </p>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div
                      style={{
                        background: "#F5F3FF",
                        borderRadius: 12,
                        padding: "1rem 1.25rem",
                        flex: 1,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#6366F1",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          margin: "0 0 6px",
                        }}
                      >
                        Balance
                      </p>
                      <p
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          color: "#6366F1",
                          margin: 0,
                        }}
                      >
                        {profile?.credits_balance ?? 0}
                      </p>
                    </div>
                    <div
                      style={{
                        background: "#FAFAFA",
                        borderRadius: 12,
                        padding: "1rem 1.25rem",
                        flex: 1,
                      }}
                    >
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#888",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          margin: "0 0 6px",
                        }}
                      >
                        Total used
                      </p>
                      <p
                        style={{
                          fontSize: 28,
                          fontWeight: 700,
                          color: "#111",
                          margin: 0,
                        }}
                      >
                        {profile?.credits_used ?? 0}
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    background: "#FEF2F2",
                    border: "1px solid #FECACA",
                    borderRadius: 14,
                    padding: "1.25rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#B91C1C",
                        margin: "0 0 2px",
                      }}
                    >
                      Sign out
                    </p>
                    <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>
                      You will be redirected to the login screen.
                    </p>
                  </div>
                  <button
                    onClick={() => supabase.auth.signOut()}
                    style={{
                      padding: "9px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "#EF4444",
                      color: "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
