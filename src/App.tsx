import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import { generatePDF } from "./generatePDF";

// --- CONSTANTS ---
const DIMS = [
  { key: "visual_hierarchy", name: "Visual hierarchy" },
  { key: "clarity_readability", name: "Clarity & readability" },
  { key: "three_second_test", name: "3-second test" },
  { key: "behavioural_triggers", name: "Behavioural triggers" },
  { key: "cta_strength", name: "CTA strength" },
  { key: "cognitive_load", name: "Cognitive load" },
  { key: "emotional_resonance", name: "Emotional resonance" },
  { key: "brand_consistency", name: "Brand consistency" },
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

// --- TYPES & INTERFACES ---
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

// --- UTILITIES ---
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

async function loadBrandsFromSupabase(userId: string): Promise<BrandMap> {
  const { data: brands, error } = await supabase
    .from("brands")
    .select("*, brand_files(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
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
          if (data) {
            dataUrl = await new Promise((res) => {
              const reader = new FileReader();
              reader.onload = () => res(reader.result as string);
              reader.readAsDataURL(data);
            });
          }
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

// --- COMPONENTS ---
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

function HeatmapCanvas({ dataUrl, zones }: { dataUrl: string; zones: Zone[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!canvasRef.current || !zones?.length || !dataUrl) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      zones.forEach((zone) => {
        const x = zone.x * img.naturalWidth,
          y = zone.y * img.naturalHeight;
        const w = zone.w * img.naturalWidth,
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
        const labelText = `${zone.priority}. ${zone.label}`;
        const fs = Math.max(12, img.naturalWidth * 0.016);
        ctx.font = `bold ${fs}px system-ui`;
        const tw = ctx.measureText(labelText).width,
          pad = 6,
          bh = fs + pad * 2;
        const bx = x,
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

function BrandManager({
  onSelect,
  selectedBrand,
  onClose,
  onUpdated,
  userId,
  isModal = true,
}: {
  onSelect: (name: string, notes: string, files?: BrandFile[]) => void;
  selectedBrand: string;
  onClose: () => void;
  onUpdated: (b: BrandMap) => void;
  userId: string;
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
    loadBrandsFromSupabase(userId).then((b) => {
      setBrands(b);
      onUpdated(b);
    });
  }, [userId]);

  const handleFileUpload = async (f: File) => {
    setUploading(true);
    try {
      const isImage = f.type.startsWith("image/");
      const isPdf = f.type === "application/pdf";
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
          .insert({ user_id: userId, name: name.trim(), notes })
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
              name: rawFile.name,
              mime_type: rawFile.type,
              extracted_text: f.extractedText || null,
              storage_path: storagePath,
            })
            .select()
            .single();
          savedFiles.push({ ...f, id: fileRecord.id, storagePath });
        } else {
          savedFiles.push(f);
        }
      }
      const updated = await loadBrandsFromSupabase(userId);
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
    const updated = await loadBrandsFromSupabase(userId);
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
            transition: "all 0.15s",
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
  const creditColor = (credits: number) => {
    if (credits <= 1) return { bg: "#F0FDF4", text: "#15803D" };
    if (credits <= 3) return { bg: "#FFFBEB", text: "#B45309" };
    if (credits <= 4) return { bg: "#EEF2FF", text: "#4338CA" };
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
          transition: "border-color 0.15s",
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
              const isSelected = m.id === value;
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
                    background: isSelected ? "#F5F3FF" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected)
                      (e.currentTarget as HTMLDivElement).style.background =
                        "#FAFAFA";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected)
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
                        background: isSelected ? "#6366F1" : "#111",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "background 0.15s",
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
                        fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? "#6366F1" : "#222",
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
                    {isSelected && (
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
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
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
      {creative && creative.dataUrl && (
        <CreativePreview
          creative={creative}
          onRemove={undefined}
          label={undefined}
          labelColor={undefined}
          compact={false}
        />
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
                dataUrl={creative?.dataUrl || ""}
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
              {/* Creative reference */}
              {creative && creative.dataUrl && (
                <CreativePreview
                  creative={creative}
                  onRemove={undefined}
                  label={undefined}
                  labelColor={undefined}
                  compact={false}
                />
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
                <CreativePreview
                  creative={c}
                  onRemove={undefined}
                  label={undefined}
                  labelColor={undefined}
                  compact
                />
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
                          })}
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
                })}
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

function TeamManager({ session }: { session: any }) {
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // --- ORG CREATION ---
  const [showCreate, setShowCreate] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  // --- INVITE MODAL ---
  const [inviteTargetTeam, setInviteTargetTeam] = useState<string | null>(null);
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

  // --- MANAGE TEAM MODAL ---
  const [manageTeam, setManageTeam] = useState<any | null>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [allocAmount, setAllocAmount] = useState("");
  const [allocating, setAllocating] = useState(false);

  useEffect(() => {
    fetchMyTeams();
  }, []);

  const fetchMyTeams = async () => {
    setLoading(true);

    // 1. Try the full nested query
    const { data, error } = await supabase
      .from("team_members")
      .select(
        `
        role, 
        joined_at, 
        teams (
          id, 
          name, 
          credits_pool, 
          org_id, 
          organisations (
            name, 
            credits_pool
          )
        )
      `,
      )
      .eq("user_id", session.user.id);

    if (error) {
      console.error("Supabase full query failed:", error);

      // 2. If the nested join fails (usually due to schema cache), try a simpler fallback query
      const fallback = await supabase
        .from("team_members")
        .select("role, joined_at, teams(*)")
        .eq("user_id", session.user.id);

      if (fallback.error) {
        console.error("Supabase fallback query failed:", fallback.error);
        alert("Could not load your teams. Check browser console for details.");
      } else if (fallback.data) {
        setTeams(fallback.data);
      }
    } else if (data) {
      setTeams(data);
    }

    setLoading(false);
  };

  const handleCreate = async () => {
    if (!orgName.trim() || !teamName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.rpc("create_org_and_team", {
      org_name: orgName.trim(),
      team_name: teamName.trim(),
    });

    if (error || !data?.success) {
      alert(
        "Error creating organization: " + (error?.message || "Unknown error"),
      );
    } else {
      setOrgName("");
      setTeamName("");
      setShowCreate(false);
      fetchMyTeams();
    }
    setCreating(false);
  };

  const [inviteTargetOrgId, setInviteTargetOrgId] = useState<string | null>(
    null,
  );

  const openInviteModal = (teamId: string, orgId: string) => {
    setInviteTargetTeam(teamId);
    setInviteTargetOrgId(orgId);
    setActiveInviteLink("");
    setInviteStatus(null);
    setInviteEmail("");
    setInviteExpiration("never");
  };

  const generateInvite = async () => {
    if (!inviteTargetTeam) return;

    let expiresAt = null;
    if (inviteExpiration === "24h") {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (inviteExpiration === "7d") {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }

    const { data, error } = await supabase
      .from("team_invites")
      .insert({
        team_id: inviteTargetTeam,
        org_id: inviteTargetOrgId, // ← added
        created_by: session.user.id,
        is_active: true, // ← added
        expires_at: expiresAt,
      })
      .select("token")
      .single();

    if (data) {
      const link = `${window.location.origin}/?invite=${data.token}`;
      setActiveInviteLink(link);
    } else {
      console.error("Invite error:", error);
      setInviteStatus({
        type: "error",
        msg: "Failed to generate invite link.",
      });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(activeInviteLink);
    setInviteStatus({ type: "success", msg: "Link copied to clipboard!" });
  };

  const sendEmailInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      setInviteStatus({
        type: "error",
        msg: "Please enter a valid email address.",
      });
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

  const openManageModal = async (teamData: any) => {
    setManageTeam(teamData);
    // Fetch members. Fails gracefully if profiles join isn't perfect.
    const { data } = await supabase
      .from("team_members")
      .select(`id, role, user_id, profiles!left(full_name, email)`)
      .eq("team_id", teamData.teams.id);
    if (data) setTeamMembers(data);
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

  const handleAllocateCredits = async () => {
    const amt = parseInt(allocAmount);
    if (!amt || amt <= 0 || !manageTeam) return;
    setAllocating(true);

    const { data, error } = await supabase.rpc("allocate_credits_to_team", {
      p_org_id: manageTeam.teams.org_id,
      p_team_id: manageTeam.teams.id,
      p_amount: amt,
    });

    if (error || !data?.success) {
      alert(error?.message || data?.error || "Allocation failed");
    } else {
      alert(`Successfully allocated ${amt} credits to team!`);
      setAllocAmount("");
      fetchMyTeams(); // Refreshes org and team credit UI naturally
      setManageTeam(null); // Close modal to refresh stale state easily
    }
    setAllocating(false);
  };

  if (loading) return <p style={{ color: "#888" }}>Loading teams...</p>;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "#111",
            margin: "0 0 6px",
          }}
        >
          Teams & Credits
        </h1>
        <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
          Manage your teams, invite members, and allocate credits.
        </p>
      </div>

      {!showCreate && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "1rem",
          }}
        >
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#111",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Create Workspace
          </button>
        </div>
      )}

      {showCreate && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #EFEFEF",
            borderRadius: 14,
            padding: "1.5rem",
            marginBottom: "2rem",
          }}
        >
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            Create New Organization & Team
          </h3>
          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
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
                Organization Name
              </label>
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Acme Corp"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #EFEFEF",
                  borderRadius: 8,
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
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
                First Team Name
              </label>
              <input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Growth Team"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: "1px solid #EFEFEF",
                  borderRadius: 8,
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleCreate}
              disabled={creating || !orgName.trim() || !teamName.trim()}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 8,
                border: "none",
                background: "#6366F1",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  creating || !orgName.trim() || !teamName.trim()
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  creating || !orgName.trim() || !teamName.trim() ? 0.7 : 1,
              }}
            >
              {creating ? "Creating..." : "Create Workspace"}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 8,
                border: "1px solid #EFEFEF",
                background: "#fff",
                color: "#555",
                fontSize: 13,
                fontWeight: 600,
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
            padding: "3rem",
            background: "#fff",
            borderRadius: 14,
            textAlign: "center",
            border: "1px solid #EFEFEF",
          }}
        >
          <p style={{ color: "#888", fontSize: 14, marginBottom: 16 }}>
            You are not part of any teams yet.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "#6366F1",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Create Your First Workspace
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {teams.map((t, i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                border: "1px solid #EFEFEF",
                borderRadius: 14,
                padding: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 16,
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, color: "#111" }}>
                    {t.teams.name}
                  </h3>
                  <p style={{ fontSize: 12, color: "#888", margin: "2px 0 0" }}>
                    Org: {t.teams.organisations?.name}
                  </p>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: t.role === "admin" ? "#6366F1" : "#888",
                      background: t.role === "admin" ? "#F5F3FF" : "#F4F4F5",
                      padding: "2px 8px",
                      borderRadius: 20,
                      display: "inline-block",
                      marginTop: 8,
                    }}
                  >
                    {t.role.toUpperCase()}
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
                      textTransform: "uppercase",
                      margin: "0 0 4px",
                    }}
                  >
                    Team Credits
                  </p>
                  <p
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      margin: 0,
                      color: "#111",
                    }}
                  >
                    {t.teams.credits_pool}
                  </p>
                </div>
              </div>

              {t.role === "admin" && (
                <div
                  style={{
                    borderTop: "1px solid #F5F5F5",
                    paddingTop: 16,
                    marginTop: 16,
                    display: "flex",
                    gap: 8,
                  }}
                >
                  <button
                    onClick={() => openInviteModal(t.teams.id, t.teams.org_id)}
                    style={{
                      flex: 1,
                      background: "#111",
                      color: "#fff",
                      border: "none",
                      padding: "8px 14px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Invite Member
                  </button>
                  <button
                    onClick={() => openManageModal(t)}
                    style={{
                      flex: 1,
                      background: "#fff",
                      color: "#444",
                      border: "1px solid #EFEFEF",
                      padding: "8px 14px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Manage Team & Credits
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* --- MANAGE TEAM MODAL --- */}
      {manageTeam && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "2rem",
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
              position: "relative",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <button
              onClick={() => setManageTeam(null)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "none",
                border: "none",
                fontSize: 18,
                cursor: "pointer",
                color: "#888",
              }}
            >
              ✕
            </button>
            <h2 style={{ margin: "0 0 16px", fontSize: 20, color: "#111" }}>
              Manage Workspace
            </h2>

            {/* Credit Transfer Section */}
            <div
              style={{
                background: "#FAFAFA",
                borderRadius: 12,
                padding: "1.25rem",
                border: "1px solid #EFEFEF",
                marginBottom: "1.5rem",
              }}
            >
              <h4 style={{ margin: "0 0 12px", fontSize: 13, color: "#444" }}>
                Allocate Credits to Team
              </h4>
              <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
                Your Organization has{" "}
                <strong>{manageTeam.teams.organisations?.credits_pool}</strong>{" "}
                total credits available.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  placeholder="Amount"
                  value={allocAmount}
                  onChange={(e) => setAllocAmount(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "10px",
                    borderRadius: 8,
                    border: "1px solid #EFEFEF",
                    fontSize: 13,
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleAllocateCredits}
                  disabled={allocating}
                  style={{
                    padding: "0 16px",
                    borderRadius: 8,
                    border: "none",
                    background: "#6366F1",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {allocating ? "Moving..." : "Transfer"}
                </button>
              </div>
            </div>

            {/* Team Members List */}
            <h4 style={{ margin: "0 0 12px", fontSize: 13, color: "#444" }}>
              Team Members
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {teamMembers.map((member) => (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px",
                    border: "1px solid #EFEFEF",
                    borderRadius: 8,
                  }}
                >
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
                    <p style={{ fontSize: 11, color: "#888", margin: 0 }}>
                      {member.profiles?.email || "User"}
                    </p>
                  </div>
                  {member.user_id !== session.user.id && (
                    <select
                      value={member.role}
                      onChange={(e) =>
                        updateMemberRole(member.id, e.target.value)
                      }
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        border: "1px solid #E5E7EB",
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
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- INVITE MODAL OVERLAY --- */}
      {inviteTargetTeam && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "2rem",
              width: "100%",
              maxWidth: 440,
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
              position: "relative",
            }}
          >
            <button
              onClick={() => setInviteTargetTeam(null)}
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                background: "none",
                border: "none",
                fontSize: 18,
                cursor: "pointer",
                color: "#888",
              }}
            >
              ✕
            </button>

            <h2 style={{ margin: "0 0 8px", fontSize: 20, color: "#111" }}>
              Invite Team Member
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#666" }}>
              Generate a secure link to join this team.
            </p>

            {!activeInviteLink ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#AAA",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Link Expiration
                </label>
                <select
                  value={inviteExpiration}
                  onChange={(e: any) => setInviteExpiration(e.target.value)}
                  style={{
                    padding: "10px",
                    borderRadius: 8,
                    border: "1px solid #EFEFEF",
                    fontSize: 13,
                  }}
                >
                  <option value="never">Never expires</option>
                  <option value="24h">Expires in 24 hours</option>
                  <option value="7d">Expires in 7 days</option>
                </select>
                <button
                  onClick={generateInvite}
                  style={{
                    padding: "10px",
                    borderRadius: 8,
                    border: "none",
                    background: "#111",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    marginTop: 8,
                  }}
                >
                  Generate Invite Link
                </button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: "1.5rem" }}>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#AAA",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 6,
                      display: "block",
                    }}
                  >
                    Invite Link
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      readOnly
                      value={activeInviteLink}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        border: "1px solid #EFEFEF",
                        borderRadius: 8,
                        fontSize: 13,
                        background: "#FAFAFA",
                        color: "#555",
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={copyToClipboard}
                      style={{
                        padding: "0 16px",
                        borderRadius: 8,
                        border: "none",
                        background: "#F5F3FF",
                        color: "#6366F1",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    height: 1,
                    background: "#EFEFEF",
                    margin: "1.5rem 0",
                  }}
                />

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#AAA",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginBottom: 6,
                      display: "block",
                    }}
                  >
                    Send via Email
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "10px 12px",
                        border: "1px solid #EFEFEF",
                        borderRadius: 8,
                        fontSize: 13,
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      onClick={sendEmailInvite}
                      disabled={sendingInvite || !inviteEmail}
                      style={{
                        padding: "0 16px",
                        borderRadius: 8,
                        border: "none",
                        background: "#111",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor:
                          sendingInvite || !inviteEmail
                            ? "not-allowed"
                            : "pointer",
                        opacity: sendingInvite || !inviteEmail ? 0.7 : 1,
                      }}
                    >
                      {sendingInvite ? "Sending..." : "Send"}
                    </button>
                  </div>
                </div>

                {inviteStatus && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: "10px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 500,
                      background:
                        inviteStatus.type === "success" ? "#F0FDF4" : "#FEF2F2",
                      color:
                        inviteStatus.type === "success" ? "#15803D" : "#B91C1C",
                    }}
                  >
                    {inviteStatus.msg}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App({
  session,
}: {
  session: import("@supabase/supabase-js").Session;
}) {
  const [currentView, setCurrentView] = useState<
    "analyzer" | "dashboard" | "brands" | "profile" | "teams"
  >("analyzer");
  const [profile, setProfile] = useState<any>(null);
  const [analysesHistory, setAnalysesHistory] = useState<any[]>([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState<any>(null);

  // Editing profile state
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
    const { data: hist } = await supabase
      .from("analyses")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (hist) setAnalysesHistory(hist);
  };

  useEffect(() => {
    if (session?.user?.id) {
      loadBrandsFromSupabase(session.user.id).then((b) => setBrands(b));
      fetchUserData();

      // Check for team invites in the URL
      const params = new URLSearchParams(window.location.search);
      const inviteToken = params.get("invite");

      if (inviteToken) {
        supabase
          .rpc("join_team_via_invite", { invite_token: inviteToken })
          .then(({ data, error }) => {
            if (error) alert("Failed to join team.");
            else if (data?.success) {
              alert("Successfully joined the team!");
              setCurrentView("teams"); // Redirect them to their new team page
              window.history.replaceState({}, document.title, "/"); // Clean the URL
            } else {
              alert(data?.error || "Invalid invite link.");
            }
          });
      }
    }
  }, [session, currentView]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: editName,
        company: editCompany,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    if (!error) {
      setProfile({ ...profile, full_name: editName, company: editCompany });
      alert("Profile updated successfully!");
    } else {
      alert("Failed to update profile: " + error.message);
    }
    setSavingProfile(false);
  };

  const deleteAnalysis = async (id: string) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to permanently delete this report?",
    );
    if (!confirmDelete) return;

    const itemToDelete = analysesHistory.find((h) => h.id === id);
    if (itemToDelete?.result?.creative_storage_path) {
      await supabase.storage
        .from("brand-assets")
        .remove([itemToDelete.result.creative_storage_path]);
    }

    await supabase.from("analyses").delete().eq("id", id);
    setAnalysesHistory((prev) => prev.filter((item) => item.id !== id));
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

  const buildSystem = (isVideo: boolean) => {
    const fileContext = brandFiles
      .filter((f) => f.extractedText)
      .map((f) => `[Brand file: ${f.name}]\n${f.extractedText}`)
      .join("\n\n");

    const industrySection = industry
      ? `
  "industry_benchmarks": {
    "summary": "<2-3 sentences on what the best ${industry} campaigns globally are doing in 2024-2025, based on current web knowledge>",
    "examples": [
      {
        "brand": "<real brand name>",
        "campaign": "<real campaign name>",
        "technique": "<what creative or psychological technique makes it work>",
        "lesson": "<one direct sentence on what this specific creative could learn from it>"
      },
      {
        "brand": "<real brand name>",
        "campaign": "<real campaign name>",
        "technique": "<technique>",
        "lesson": "<lesson>"
      }
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
    "brand_consistency": { "score": <0-100>, "recommendation": "<specific observation>" }
  },
  "top_fixes": ["<most impactful fix>", "<second fix>", "<third fix>"],
  "attention_zones": [
    { "priority": 1, "label": "<element e.g. Headline>", "x": <0.0-1.0>, "y": <0.0-1.0>, "w": <0.0-1.0>, "h": <0.0-1.0>, "note": "<why this draws attention>" },
    { "priority": 2, "label": "<element>", "x": <0.0-1.0>, "y": <0.0-1.0>, "w": <0.0-1.0>, "h": <0.0-1.0>, "note": "<note>" },
    { "priority": 3, "label": "<element>", "x": <0.0-1.0>, "y": <0.0-1.0>, "w": <0.0-1.0>, "h": <0.0-1.0>, "note": "<note>" }
  ]${industry ? `,${industrySection}` : ""}
}

x/y = top-left corner as fraction of image width/height. w/h = width/height as fraction.
${platform ? `Platform: ${platform}.` : ""}${client ? ` Client: ${client}.` : ""}${industry ? ` Industry: ${industry}.` : ""}${brandNotes ? ` Brand notes: ${brandNotes}.` : ""}${fileContext ? `\n\nBrand guideline documents:\n${fileContext}` : ""}${isVideo ? " Video creative — benchmark against best-practice standards for the format." : ""}
Be specific. Reference actual elements visible. No generic advice.`;
  };

  const callAPI = async (creative: CreativeFile): Promise<AnalysisResult> => {
    const isVideo = creative.type === "video";
    const contentParts: object[] = [];
    const brandImageFiles = brandFiles.filter(
      (f) => f.type.startsWith("image/") && f.dataUrl,
    );
    for (const bf of brandImageFiles) {
      const raw = bf.dataUrl.split(",")[1];
      contentParts.push({
        type: "image",
        source: { type: "base64", media_type: bf.type, data: raw },
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
    } else {
      contentParts.push({
        type: "text",
        text: `Video file: "${creative.name}". Provide the JSON analysis. Raw JSON only, starting with {`,
      });
    }
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

    if (industry) {
      requestBody.tools = [{ type: "web_search_20250305", name: "web_search" }];
    }

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

    if (creative && creative.file) {
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
      } else {
        console.error("Failed to upload creative:", error);
      }
    }

    const creditsUsed =
      MODELS.find((m) => m.id === selectedModel)?.credits || 1;
    await supabase.from("analyses").insert({
      user_id: session.user.id,
      client: client || "Unnamed Analysis",
      platform: platform || "Unknown",
      industry: industry || "Unknown",
      type: analysisType,
      model: selectedModel,
      credits_used: creditsUsed,
      overall_score: score,
      pass: pass,
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
    const filled = creatives.filter(Boolean);
    if (filled.length < 2) return;
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

  const exportReport = (items: AnalysedCreative[]) => {
    try {
      const lines = [
        "NO FLUFF CREATIVE ANALYSER — REPORT",
        "=====================================",
        `Date: ${new Date().toLocaleDateString("en-GB")}`,
        client ? `Client: ${client}` : "",
        platform ? `Platform: ${platform}` : "",
        "",
        ...items.map((r) =>
          [
            `${items.length > 1 ? `--- CREATIVE ${LABELS[r.index]} ---` : "--- ANALYSIS ---"}`,
            `Score: ${r.result?.overall_score || 0}/100 — ${r.result?.pass ? "PASS" : "FAIL"} (threshold ${threshold})`,
            `Verdict: ${r.result?.overall_verdict || "N/A"}`,
            "",
            "Dimensions:",
            ...DIMS.map(
              (d) =>
                `  ${d.name}: ${r.result?.dimensions?.[d.key]?.score || 0}/100\n    → ${r.result?.dimensions?.[d.key]?.recommendation || "N/A"}`,
            ),
            "",
            "Top fixes:",
            ...(r.result?.top_fixes || []).map((f, j) => `  ${j + 1}. ${f}`),
            "",
          ].join("\n"),
        ),
      ]
        .filter(Boolean)
        .join("\n");

      const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const safeClient = (client || "unnamed").replace(/[^a-z0-9]/gi, "_");
      a.download = `NF_Creative_Report_${safeClient}_${new Date().toISOString().slice(0, 10)}.txt`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please check the console for details.");
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

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
      <div
        style={{
          padding: isSidebarOpen ? "1.5rem" : "1.5rem 0",
          display: "flex",
          justifyContent: isSidebarOpen ? "space-between" : "center",
          alignItems: "center",
          borderBottom: "1px solid #EFEFEF",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: "center",
            width: "100%",
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
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>
              NF
            </span>
          </div>
          {isSidebarOpen && (
            <span
              style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.05em" }}
            >
              PREFLYGHT
            </span>
          )}
        </div>
      </div>

      <nav
        style={{
          padding: "1rem 0.5rem",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => {
            setCurrentView("analyzer");
            setViewingHistoryItem(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px",
            borderRadius: 8,
            border: "none",
            background: currentView === "analyzer" ? "#F5F3FF" : "transparent",
            color: currentView === "analyzer" ? "#6366F1" : "#555",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s",
            justifyContent: isSidebarOpen ? "flex-start" : "center",
            whiteSpace: "nowrap",
          }}
          title={!isSidebarOpen ? "Analyzer Workspace" : undefined}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          {isSidebarOpen && <span>Analyzer Workspace</span>}
        </button>
        <button
          onClick={() => {
            setCurrentView("brands");
            setViewingHistoryItem(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px",
            borderRadius: 8,
            border: "none",
            background: currentView === "brands" ? "#F5F3FF" : "transparent",
            color: currentView === "brands" ? "#6366F1" : "#555",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s",
            justifyContent: isSidebarOpen ? "flex-start" : "center",
            whiteSpace: "nowrap",
          }}
          title={!isSidebarOpen ? "Brand Assets" : undefined}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
            <line x1="7" y1="7" x2="7.01" y2="7"></line>
          </svg>
          {isSidebarOpen && <span>Brand Assets</span>}
        </button>
        <button
          onClick={() => {
            setCurrentView("teams");
            setViewingHistoryItem(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px",
            borderRadius: 8,
            border: "none",
            background: currentView === "teams" ? "#F5F3FF" : "transparent",
            color: currentView === "teams" ? "#6366F1" : "#555",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s",
            justifyContent: isSidebarOpen ? "flex-start" : "center",
            whiteSpace: "nowrap",
          }}
          title={!isSidebarOpen ? "Teams" : undefined}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          {isSidebarOpen && <span>Teams & Credits</span>}
        </button>
        <button
          onClick={() => {
            setCurrentView("dashboard");
            setViewingHistoryItem(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px",
            borderRadius: 8,
            border: "none",
            background: currentView === "dashboard" ? "#F5F3FF" : "transparent",
            color: currentView === "dashboard" ? "#6366F1" : "#555",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s",
            justifyContent: isSidebarOpen ? "flex-start" : "center",
            whiteSpace: "nowrap",
          }}
          title={!isSidebarOpen ? "Dashboard History" : undefined}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="9" y1="21" x2="9" y2="9"></line>
          </svg>
          {isSidebarOpen && <span>Dashboard History</span>}
        </button>
        <button
          onClick={() => {
            setCurrentView("profile");
            setViewingHistoryItem(null);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px",
            borderRadius: 8,
            border: "none",
            background: currentView === "profile" ? "#F5F3FF" : "transparent",
            color: currentView === "profile" ? "#6366F1" : "#555",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s",
            justifyContent: isSidebarOpen ? "flex-start" : "center",
            whiteSpace: "nowrap",
          }}
          title={!isSidebarOpen ? "Profile & Settings" : undefined}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          {isSidebarOpen && <span>Profile & Settings</span>}
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px",
            borderRadius: 8,
            border: "none",
            background: "transparent",
            color: "#888",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.15s",
            justifyContent: isSidebarOpen ? "flex-start" : "center",
            whiteSpace: "nowrap",
            marginTop: "auto",
          }}
          title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            {isSidebarOpen ? (
              <polyline points="15 18 9 12 15 6"></polyline>
            ) : (
              <polyline points="9 18 15 12 9 6"></polyline>
            )}
          </svg>
          {isSidebarOpen && <span>Collapse Sidebar</span>}
        </button>
      </nav>

      <div
        style={{
          padding: isSidebarOpen ? "1.5rem" : "1.5rem 0.5rem",
          borderTop: "1px solid #EFEFEF",
          background: "#FAFAFA",
          overflow: "hidden",
        }}
      >
        {isSidebarOpen ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#AAA",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  margin: "0 0 6px",
                  whiteSpace: "nowrap",
                }}
              >
                Remaining Credits
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ fontSize: 24, fontWeight: 700, color: "#111" }}>
                  {profile?.credits_remaining || 0}
                </span>
                <span style={{ fontSize: 12, color: "#888" }}>/ tokens</span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 16,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#222",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "150px",
                  }}
                >
                  {profile?.full_name || session.user.email?.split("@")[0]}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#888",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "150px",
                  }}
                >
                  {profile?.company || "User"}
                </span>
              </div>
              <button
                onClick={() => supabase.auth.signOut()}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#AAA",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                background: "#EFEFEF",
                padding: "4px 8px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 700,
                color: "#111",
              }}
              title="Remaining Credits"
            >
              {profile?.credits_remaining || 0}
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#AAA",
              }}
              title="Sign out"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#FAFAFA",
        fontFamily: "var(--font-sans,system-ui)",
        overflowX: "hidden",
      }}
    >
      {/* Fallback modal if triggered inside Analyzer view */}
      {showBrandMgr && currentView !== "brands" && (
        <BrandManager
          selectedBrand={selectedBrand}
          onSelect={(n, notes, files) => {
            setSelectedBrand(n);
            setBrandNotes(notes || "");
            setBrandFiles(files || []);
            if (n) setClient(n);
          }}
          onClose={() => setShowBrandMgr(false)}
          onUpdated={(b) => setBrands(b)}
          userId={session.user.id}
          isModal={true}
        />
      )}

      <Sidebar />

      <main
        style={{
          marginLeft: isSidebarOpen ? 260 : 76,
          transition: "margin-left 0.3s ease",
          flex: 1,
          padding: "3rem",
          height: "100vh",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        {currentView === "teams" && <TeamManager session={session} />}
        {/* === BRAND MANAGER VIEW === */}
        {currentView === "brands" && (
          <div style={{ width: "100%", maxWidth: 1000, margin: "0 auto" }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: "#111",
                margin: "0 0 6px",
              }}
            >
              Brand Assets
            </h1>
            <p style={{ fontSize: 14, color: "#888", marginBottom: "2rem" }}>
              Manage your clients' brand guidelines, rules, and visual assets.
            </p>
            <BrandManager
              selectedBrand={selectedBrand}
              onSelect={(n, notes, files) => {
                setSelectedBrand(n);
                setBrandNotes(notes || "");
                setBrandFiles(files || []);
                if (n) setClient(n);
              }}
              onClose={() => {}}
              onUpdated={(b) => setBrands(b)}
              userId={session.user.id}
              isModal={false}
            />
          </div>
        )}

        {/* === PROFILE & SETTINGS VIEW === */}
        {currentView === "profile" && (
          <div style={{ width: "100%", maxWidth: 600, margin: "0 auto" }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: "#111",
                margin: "0 0 6px",
              }}
            >
              Profile & Settings
            </h1>
            <p style={{ fontSize: 14, color: "#888", marginBottom: "2rem" }}>
              Manage your account details and view your subscription.
            </p>

            <div
              style={{
                background: "#fff",
                border: "1px solid #F0F0F0",
                borderRadius: 14,
                padding: "1.5rem",
              }}
            >
              <div style={{ marginBottom: "1.25rem" }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#AAA",
                    display: "block",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Email Address
                </label>
                <input
                  value={session.user.email || ""}
                  disabled
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #EFEFEF",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#888",
                    background: "#FAFAFA",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#AAA",
                    display: "block",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Full Name
                </label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #EFEFEF",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#222",
                    background: "#fff",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#AAA",
                    display: "block",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Company
                </label>
                <input
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1px solid #EFEFEF",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#222",
                    background: "#fff",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#AAA",
                    display: "block",
                    marginBottom: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Credits Remaining
                </label>
                <div
                  style={{
                    display: "inline-block",
                    background: "#F5F3FF",
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#6366F1",
                  }}
                >
                  {profile?.credits_remaining || 0} tokens
                </div>
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 10,
                  border: "none",
                  background: savingProfile ? "#F0F0F0" : "#111",
                  color: savingProfile ? "#AAA" : "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: savingProfile ? "not-allowed" : "pointer",
                }}
              >
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </div>
        )}

        {/* === DASHBOARD VIEW === */}
        {currentView === "dashboard" && (
          <div style={{ width: "100%", margin: "0 auto" }}>
            {viewingHistoryItem ? (
              <div style={{ maxWidth: 900, margin: "0 auto" }}>
                <button
                  onClick={() => setViewingHistoryItem(null)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid #EFEFEF",
                    background: "#fff",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#555",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: "1.5rem",
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
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                  </svg>
                  Back to History
                </button>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #F0F0F0",
                    borderRadius: 14,
                    padding: "1.25rem",
                    marginBottom: "1rem",
                  }}
                >
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: 5,
                    }}
                  >
                    Archived Report Context
                  </p>
                  <div
                    style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}
                  >
                    <div>
                      <span style={{ fontSize: 11, color: "#888" }}>
                        Client:
                      </span>{" "}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111",
                        }}
                      >
                        {viewingHistoryItem.client}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: "#888" }}>
                        Platform:
                      </span>{" "}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111",
                        }}
                      >
                        {viewingHistoryItem.platform}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: "#888" }}>
                        Industry:
                      </span>{" "}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111",
                        }}
                      >
                        {viewingHistoryItem.industry || "—"}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: "#888" }}>
                        Model:
                      </span>{" "}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111",
                        }}
                      >
                        {MODELS.find((m) => m.id === viewingHistoryItem.model)
                          ?.name ||
                          viewingHistoryItem.model ||
                          "—"}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: "#888" }}>Date:</span>{" "}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111",
                        }}
                      >
                        {new Date(
                          viewingHistoryItem.created_at,
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {isLoadingHistory ? (
                  <div
                    style={{
                      padding: "3rem",
                      textAlign: "center",
                      background: "#fff",
                      borderRadius: 14,
                      border: "1px solid #EFEFEF",
                    }}
                  >
                    <p style={{ color: "#888", fontSize: 13 }}>
                      Loading archived creative...
                    </p>
                  </div>
                ) : viewingHistoryItem.result ? (
                  <SingleResult
                    creative={historyCreative}
                    result={viewingHistoryItem.result}
                    threshold={65}
                    model={
                      MODELS.find((m) => m.id === viewingHistoryItem.model)
                        ?.name || viewingHistoryItem.model
                    }
                    client={viewingHistoryItem.client}
                    platform={viewingHistoryItem.platform}
                    industry={viewingHistoryItem.industry}
                    onReset={() => setViewingHistoryItem(null)}
                    onExport={async () => {
                      let heatmapDataUrl: string | undefined = undefined;
                      if (
                        historyCreative?.type === "image" &&
                        historyCreative.dataUrl &&
                        viewingHistoryItem.result?.attention_zones?.length
                      ) {
                        const canvas = document.createElement("canvas");
                        const ctx = canvas.getContext("2d");
                        if (ctx) {
                          const img = new Image();
                          await new Promise((resolve) => {
                            img.onload = () => {
                              canvas.width = img.naturalWidth;
                              canvas.height = img.naturalHeight;
                              ctx.drawImage(img, 0, 0);
                              viewingHistoryItem.result.attention_zones.forEach(
                                (zone: Zone) => {
                                  const x = zone.x * img.naturalWidth,
                                    y = zone.y * img.naturalHeight;
                                  const w = zone.w * img.naturalWidth,
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
                                  ctx.fillRect(
                                    x - w * 0.15,
                                    y - h * 0.15,
                                    w * 1.3,
                                    h * 1.3,
                                  );
                                  ctx.strokeStyle =
                                    zone.priority === 1
                                      ? "rgba(239,68,68,0.85)"
                                      : zone.priority === 2
                                        ? "rgba(251,146,60,0.75)"
                                        : "rgba(202,138,4,0.7)";
                                  ctx.lineWidth = Math.max(
                                    2,
                                    img.naturalWidth * 0.003,
                                  );
                                  ctx.setLineDash([6, 4]);
                                  ctx.strokeRect(x, y, w, h);
                                  ctx.setLineDash([]);
                                  const labelText = `${zone.priority}. ${zone.label}`;
                                  const fs = Math.max(
                                    12,
                                    img.naturalWidth * 0.016,
                                  );
                                  ctx.font = `bold ${fs}px system-ui`;
                                  const tw = ctx.measureText(labelText).width,
                                    pad = 6,
                                    bh = fs + pad * 2;
                                  const bx = x,
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
                                  ctx.fillText(
                                    labelText,
                                    bx + pad,
                                    by + bh / 2,
                                  );
                                },
                              );
                              resolve(true);
                            };
                            img.src = historyCreative.dataUrl as string;
                          });
                          heatmapDataUrl = canvas.toDataURL("image/png");
                        }
                      }

                      await generatePDF({
                        creative: historyCreative,
                        result: viewingHistoryItem.result,
                        heatmapDataUrl,
                        client: viewingHistoryItem.client,
                        platform: viewingHistoryItem.platform,
                        industry: viewingHistoryItem.industry || "",
                        threshold: 65,
                        model:
                          MODELS.find((m) => m.id === viewingHistoryItem.model)
                            ?.name || viewingHistoryItem.model,
                        date: new Date(
                          viewingHistoryItem.created_at,
                        ).toLocaleDateString("en-GB"),
                      });
                    }}
                  />
                ) : (
                  <div
                    style={{
                      padding: "2rem",
                      textAlign: "center",
                      background: "#FEF2F2",
                      color: "#B91C1C",
                      borderRadius: 14,
                    }}
                  >
                    <p style={{ fontWeight: 600, margin: 0 }}>
                      Legacy Report Data Missing
                    </p>
                    <p style={{ fontSize: 13, margin: "4px 0 0" }}>
                      This analysis was run before full JSON results were saved
                      to the database.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <>
                <h1
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    color: "#111",
                    margin: "0 0 6px",
                  }}
                >
                  Analysis History
                </h1>
                <p
                  style={{ fontSize: 14, color: "#888", marginBottom: "2rem" }}
                >
                  Review your past creative performance and download archived
                  reports.
                </p>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #EFEFEF",
                    borderRadius: 14,
                    overflowX: "auto",
                    width: "100%",
                  }}
                >
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      textAlign: "left",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: "#FAFAFA",
                          borderBottom: "1px solid #EFEFEF",
                        }}
                      >
                        <th
                          style={{
                            padding: "12px 16px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#AAA",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Date
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#AAA",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Client / Campaign
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#AAA",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Platform
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#AAA",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Industry
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#AAA",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Type
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#AAA",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Model
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#AAA",
                            textTransform: "uppercase",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Score
                        </th>
                        <th
                          style={{
                            padding: "12px 16px",
                            fontSize: 11,
                            fontWeight: 700,
                            color: "#AAA",
                            textTransform: "uppercase",
                            textAlign: "right",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysesHistory.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            style={{
                              padding: "3rem 1rem",
                              textAlign: "center",
                              color: "#888",
                              fontSize: 13,
                            }}
                          >
                            No analyses run yet. Head to the workspace to get
                            started!
                          </td>
                        </tr>
                      ) : (
                        analysesHistory.map((item) => (
                          <tr
                            key={item.id}
                            style={{
                              borderBottom: "1px solid #F5F5F5",
                              transition: "background 0.15s",
                            }}
                          >
                            <td
                              style={{
                                padding: "14px 16px",
                                fontSize: 13,
                                color: "#555",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {new Date(item.created_at).toLocaleDateString()}
                            </td>
                            <td
                              style={{
                                padding: "14px 16px",
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#111",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.client}
                            </td>
                            <td
                              style={{
                                padding: "14px 16px",
                                fontSize: 13,
                                color: "#555",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.platform}
                            </td>
                            <td
                              style={{
                                padding: "14px 16px",
                                fontSize: 13,
                                color: "#555",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.industry || "—"}
                            </td>
                            <td
                              style={{
                                padding: "14px 16px",
                                fontSize: 13,
                                color: "#555",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.type || "Single"}
                            </td>
                            <td
                              style={{
                                padding: "14px 16px",
                                fontSize: 13,
                                color: "#555",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {MODELS.find((m) => m.id === item.model)?.name ||
                                item.model ||
                                "—"}
                            </td>
                            <td
                              style={{
                                padding: "14px 16px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: scoreColor(item.overall_score),
                                  }}
                                >
                                  {item.overall_score}
                                </span>
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: 20,
                                    background: item.pass
                                      ? "#F0FDF4"
                                      : "#FEF2F2",
                                    color: item.pass ? "#15803D" : "#B91C1C",
                                  }}
                                >
                                  {item.pass ? "PASS" : "FAIL"}
                                </span>
                              </div>
                            </td>
                            <td
                              style={{
                                padding: "14px 16px",
                                textAlign: "right",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "flex-end",
                                  gap: 8,
                                }}
                              >
                                <button
                                  onClick={() => handleViewHistory(item)}
                                  style={{
                                    fontSize: 11,
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    border: "1px solid #EFEFEF",
                                    background: "#fff",
                                    cursor: "pointer",
                                    color: "#444",
                                    fontWeight: 500,
                                  }}
                                >
                                  View Report
                                </button>
                                <button
                                  onClick={() => deleteAnalysis(item.id)}
                                  style={{
                                    fontSize: 11,
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    border: "1px solid #FECACA",
                                    background: "#FEF2F2",
                                    cursor: "pointer",
                                    color: "#B91C1C",
                                    fontWeight: 500,
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* === ANALYZER WORKSPACE === */}
        {currentView === "analyzer" && (
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                marginBottom: "1.75rem",
                textAlign: "center",
              }}
            >
              <div>
                <h1
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    color: "#111",
                    margin: 0,
                    textAlign: "center",
                  }}
                >
                  Analyzer Workspace
                </h1>
                <p
                  style={{
                    fontSize: 14,
                    color: "#888",
                    marginTop: 4,
                    textAlign: "center",
                  }}
                >
                  Pre-flight analysis powered by behavioural science
                </p>
              </div>
            </div>

            {/* Mode toggle */}
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
                    transition: "all 0.15s",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Config */}
            <div
              style={{
                background: "#fff",
                border: "1px solid #F0F0F0",
                borderRadius: 14,
                padding: "1.25rem",
                marginBottom: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
                      display: "block",
                      marginBottom: 5,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Client / campaign
                  </label>
                  <input
                    value={client}
                    onChange={(e) => setClient(e.target.value)}
                    placeholder="e.g. Sirf Coffee — Diwali"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #EFEFEF",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#222",
                      background: "#FAFAFA",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
                      display: "block",
                      marginBottom: 5,
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
                      padding: "8px 12px",
                      border: "1px solid #EFEFEF",
                      borderRadius: 8,
                      fontSize: 13,
                      color: platform ? "#222" : "#AAA",
                      background: "#FAFAFA",
                      outline: "none",
                    }}
                  >
                    <option value="">Select platform</option>
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
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
                      display: "block",
                      marginBottom: 5,
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
                      padding: "8px 12px",
                      border: `1px solid ${industry ? "#6366F1" : "#EFEFEF"}`,
                      borderRadius: 8,
                      fontSize: 13,
                      color: industry ? "#6366F1" : "#AAA",
                      background: "#FAFAFA",
                      outline: "none",
                    }}
                  >
                    <option value="">Select industry…</option>
                    {INDUSTRIES.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#AAA",
                    display: "block",
                    marginBottom: 5,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Model
                </label>
                <ModelSelector
                  value={selectedModel}
                  onChange={setSelectedModel}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: "#AAA",
                    display: "block",
                    marginBottom: 5,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Brand guidelines
                </label>
                {brandList.length > 0 ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <select
                      value={selectedBrand}
                      onChange={(e) => {
                        const n = e.target.value;
                        setSelectedBrand(n);
                        setBrandNotes(brands[n]?.notes || "");
                        setBrandFiles(brands[n]?.files || []);
                        if (n) setClient(n);
                      }}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        border: `1px solid ${selectedBrand ? "#6366F1" : "#EFEFEF"}`,
                        borderRadius: 8,
                        fontSize: 13,
                        color: selectedBrand ? "#6366F1" : "#AAA",
                        background: "#FAFAFA",
                        outline: "none",
                      }}
                    >
                      <option value="">Select saved brand…</option>
                      {brandList.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setCurrentView("brands")}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1px solid #EFEFEF",
                        background: "#fff",
                        fontSize: 12,
                        color: "#666",
                        cursor: "pointer",
                      }}
                    >
                      Manage
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCurrentView("brands")}
                    style={{
                      width: "100%",
                      padding: "9px",
                      borderRadius: 8,
                      border: "1px dashed #DDD",
                      background: "#FAFAFA",
                      fontSize: 13,
                      color: "#888",
                      cursor: "pointer",
                    }}
                  >
                    + Save a brand guideline
                  </button>
                )}
                {selectedBrand && (brandNotes || brandFiles.length > 0) && (
                  <div
                    style={{
                      marginTop: 6,
                      background: "#F5F3FF",
                      padding: "8px 10px",
                      borderRadius: 6,
                    }}
                  >
                    {brandNotes && (
                      <p
                        style={{
                          fontSize: 11,
                          color: "#6366F1",
                          margin: 0,
                          lineHeight: 1.4,
                        }}
                      >
                        Using: <strong>{selectedBrand}</strong> —{" "}
                        {brandNotes.length > 80
                          ? brandNotes.slice(0, 80) + "…"
                          : brandNotes}
                      </p>
                    )}
                    {brandFiles.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          flexWrap: "wrap",
                          marginTop: brandNotes ? 5 : 0,
                        }}
                      >
                        {brandFiles.map((f, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: 10,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "#E0DBFF",
                              color: "#6366F1",
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
                            {f.extractedText && (
                              <span style={{ color: "#10B981" }}> ✓</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {!selectedBrand && (
                <div>
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
                      display: "block",
                      marginBottom: 5,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Or enter brand notes manually
                  </label>
                  <textarea
                    value={brandNotes}
                    onChange={(e) => setBrandNotes(e.target.value)}
                    placeholder="e.g. Primary red #E63030, bold sans-serif, no lifestyle imagery…"
                    rows={2}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #EFEFEF",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#222",
                      background: "#FAFAFA",
                      outline: "none",
                      resize: "vertical",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              )}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                  }}
                >
                  <label
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#AAA",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Pass threshold
                  </label>
                  <span
                    style={{ fontSize: 12, fontWeight: 600, color: "#222" }}
                  >
                    {threshold}/100
                  </span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={90}
                  step={5}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#111" }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    color: "#CCC",
                    marginTop: 2,
                  }}
                >
                  <span>40 — lenient</span>
                  <span>90 — strict</span>
                </div>
              </div>
            </div>

            {/* SINGLE MODE */}
            {mode === "single" && (
              <>
                {!single && (
                  <UploadZone
                    onFile={(f) => {
                      setSingle(f);
                      setSingleResult(null);
                      setError(null);
                    }}
                  />
                )}
                {single && !singleResult && !singleAnalysing && (
                  <>
                    <CreativePreview
                      creative={single}
                      onRemove={() => {
                        setSingle(null);
                        setSingleResult(null);
                      }}
                    />
                    <button
                      onClick={runSingle}
                      style={{
                        width: "100%",
                        padding: 13,
                        borderRadius: 12,
                        border: "none",
                        background: "#111",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        marginTop: 10,
                      }}
                    >
                      Analyse creative
                    </button>
                  </>
                )}
                {singleAnalysing && (
                  <AnalysisLoader label="Analysing Creative..." />
                )}
                {singleResult && (
                  <SingleResult
                    creative={single}
                    result={singleResult}
                    threshold={threshold}
                    model={
                      MODELS.find((m) => m.id === selectedModel)?.name ||
                      selectedModel
                    }
                    client={client}
                    platform={platform}
                    industry={industry}
                    onReset={() => {
                      setSingle(null);
                      setSingleResult(null);
                    }}
                    onExport={async () => {
                      let heatmapDataUrl: string | undefined = undefined;
                      if (
                        single?.type === "image" &&
                        single.dataUrl &&
                        singleResult?.attention_zones?.length
                      ) {
                        const canvas = document.createElement("canvas");
                        const ctx = canvas.getContext("2d");
                        if (ctx) {
                          const img = new Image();
                          await new Promise((resolve) => {
                            img.onload = () => {
                              canvas.width = img.naturalWidth;
                              canvas.height = img.naturalHeight;
                              ctx.drawImage(img, 0, 0);
                              singleResult.attention_zones.forEach((zone) => {
                                const x = zone.x * img.naturalWidth,
                                  y = zone.y * img.naturalHeight;
                                const w = zone.w * img.naturalWidth,
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
                                ctx.fillRect(
                                  x - w * 0.15,
                                  y - h * 0.15,
                                  w * 1.3,
                                  h * 1.3,
                                );
                                ctx.strokeStyle =
                                  zone.priority === 1
                                    ? "rgba(239,68,68,0.85)"
                                    : zone.priority === 2
                                      ? "rgba(251,146,60,0.75)"
                                      : "rgba(202,138,4,0.7)";
                                ctx.lineWidth = Math.max(
                                  2,
                                  img.naturalWidth * 0.003,
                                );
                                ctx.setLineDash([6, 4]);
                                ctx.strokeRect(x, y, w, h);
                                ctx.setLineDash([]);
                                const labelText = `${zone.priority}. ${zone.label}`;
                                const fs = Math.max(
                                  12,
                                  img.naturalWidth * 0.016,
                                );
                                ctx.font = `bold ${fs}px system-ui`;
                                const tw = ctx.measureText(labelText).width,
                                  pad = 6,
                                  bh = fs + pad * 2;
                                const bx = x,
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
                            img.src = single.dataUrl as string;
                          });
                          heatmapDataUrl = canvas.toDataURL("image/png");
                        }
                      }
                      await generatePDF({
                        creative: single,
                        result: singleResult,
                        heatmapDataUrl,
                        client,
                        platform,
                        industry,
                        threshold,
                        model:
                          MODELS.find((m) => m.id === selectedModel)?.name ||
                          selectedModel,
                        date: new Date().toLocaleDateString("en-GB"),
                      });
                    }}
                  />
                )}
              </>
            )}

            {/* AB MODE */}
            {mode === "ab" && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      creatives.length <= 2 ? "1fr 1fr" : "1fr 1fr 1fr",
                    gap: 10,
                    marginBottom: "1rem",
                  }}
                >
                  {creatives.map((c, i) =>
                    c ? (
                      <div key={i}>
                        <CreativePreview
                          creative={c as CreativeFile}
                          onRemove={() =>
                            setCreatives((prev) => {
                              const n = [...prev];
                              n[i] = null;
                              return n;
                            })
                          }
                          label={LABELS[i]}
                          labelColor={LABEL_COLORS[i]}
                          compact
                        />
                        {(c as AnalysedCreative).result && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 10px",
                              background: "#fff",
                              border: "1px solid #EFEFEF",
                              borderTop: "none",
                              borderRadius: "0 0 14px 14px",
                            }}
                          >
                            <RadialScore
                              score={
                                (c as AnalysedCreative).result.overall_score
                              }
                              size={38}
                              color={LABEL_COLORS[i]}
                            />
                            <div style={{ flex: 1 }}>
                              <p
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: LABEL_COLORS[i],
                                  margin: 0,
                                }}
                              >
                                {(c as AnalysedCreative).result.overall_score}
                                /100
                              </p>
                              <p
                                style={{
                                  fontSize: 10,
                                  color: "#888",
                                  margin: 0,
                                }}
                              >
                                {verdictText(
                                  (c as AnalysedCreative).result.overall_score,
                                )}
                              </p>
                            </div>
                            <span
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: 20,
                                background: (c as AnalysedCreative).result.pass
                                  ? "#F0FDF4"
                                  : "#FEF2F2",
                                color: (c as AnalysedCreative).result.pass
                                  ? "#15803D"
                                  : "#B91C1C",
                              }}
                            >
                              {(c as AnalysedCreative).result.pass
                                ? "PASS"
                                : "FAIL"}
                            </span>
                          </div>
                        )}
                        {abAnalysing === i && (
                          <div
                            style={{
                              padding: "16px",
                              textAlign: "center",
                              background: "#fff",
                              borderRadius: "0 0 14px 14px",
                              border: "1px solid #EFEFEF",
                              borderTop: "none",
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <svg
                              width="20"
                              height="20"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={LABEL_COLORS[i]}
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ animation: "spin 1s linear infinite" }}
                            >
                              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#333",
                              }}
                            >
                              Analysing {LABELS[i]}…
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <UploadZone
                        key={i}
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
                    ),
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
                  {creatives.length < 4 && (
                    <button
                      onClick={() => setCreatives((prev) => [...prev, null])}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: 10,
                        border: "1px dashed #DDD",
                        background: "#fff",
                        fontSize: 13,
                        color: "#888",
                        cursor: "pointer",
                      }}
                    >
                      + Add {LABELS[creatives.length]}
                    </button>
                  )}
                  <button
                    onClick={runAB}
                    disabled={
                      creatives.filter(Boolean).length < 2 ||
                      abAnalysing !== null
                    }
                    style={{
                      flex: 2,
                      padding: "10px",
                      borderRadius: 10,
                      border: "none",
                      background:
                        creatives.filter(Boolean).length < 2 ||
                        abAnalysing !== null
                          ? "#F5F5F5"
                          : "#111",
                      color:
                        creatives.filter(Boolean).length < 2 ||
                        abAnalysing !== null
                          ? "#AAA"
                          : "#fff",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {abAnalysing !== null
                      ? `Analysing ${LABELS[abAnalysing]}…`
                      : `Analyse all (${creatives.filter(Boolean).length})`}
                  </button>
                </div>
                {analysedCreatives.length >= 2 && (
                  <ABResults
                    analysedCreatives={analysedCreatives}
                    winner={winner}
                    threshold={threshold}
                    onExport={() => exportReport(analysedCreatives)}
                  />
                )}
              </>
            )}
            {error && (
              <div
                style={{
                  marginTop: 10,
                  padding: "12px 16px",
                  background: "#FEF2F2",
                  borderRadius: 10,
                  fontSize: 13,
                  color: "#B91C1C",
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
