import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabase";
import { generatePDF } from "./generatePDF";

// ─── CONSTANTS ───────────────────────────────────────────────
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

// ─── TYPES ───────────────────────────────────────────────────
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

// ─── Team flat entry (what we work with in the grid) ─────────
interface TeamCard {
  teamId: string;
  teamName: string;
  clientName: string | null; // null = internal/no client
  orgId: string;
  orgName: string;
  role: string;
  creditsPool: number;
}

// ─── HELPERS ─────────────────────────────────────────────────
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
    const ab = await file.arrayBuffer();
    const lib = await import(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" as any
    );
    lib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    const pdf = await lib.getDocument({ data: ab }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const p = await pdf.getPage(i);
      const c = await p.getTextContent();
      text += c.items.map((x: any) => x.str).join(" ") + "\n";
    }
    return text.trim();
  } catch {
    return "";
  }
}
async function extractDocxText(file: File): Promise<string> {
  try {
    const m = await import("mammoth");
    const ab = await file.arrayBuffer();
    return (await m.extractRawText({ arrayBuffer: ab })).value.trim();
  } catch {
    return "";
  }
}
async function loadBrandsFromSupabase(
  userId: string,
  teamId?: string,
): Promise<BrandMap> {
  let q = supabase.from("brands").select("*, brand_files(*)");
  if (teamId) q = q.eq("team_id", teamId);
  else q = q.eq("user_id", userId).is("team_id", null);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error || !data) return {};
  const map: BrandMap = {};
  for (const brand of data) {
    const files: BrandFile[] = await Promise.all(
      (brand.brand_files || []).map(async (f: any) => {
        let dataUrl = "";
        if (f.storage_path && f.mime_type?.startsWith("image/")) {
          const { data: blob } = await supabase.storage
            .from("brand-assets")
            .download(f.storage_path);
          if (blob)
            dataUrl = await new Promise((res) => {
              const r = new FileReader();
              r.onload = () => res(r.result as string);
              r.readAsDataURL(blob);
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
    map[brand.name] = {
      id: brand.id,
      notes: brand.notes || "",
      updatedAt: new Date(brand.updated_at).getTime(),
      files,
    };
  }
  return map;
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
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current || !zones?.length || !dataUrl) return;
    const canvas = ref.current,
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      zones.forEach((z) => {
        const x = z.x * img.naturalWidth,
          y = z.y * img.naturalHeight,
          w = z.w * img.naturalWidth,
          h = z.h * img.naturalHeight;
        const cx = x + w / 2,
          cy = y + h / 2;
        const grad = ctx.createRadialGradient(
          cx,
          cy,
          0,
          cx,
          cy,
          Math.max(w, h) * 0.65,
        );
        const col =
          z.priority === 1
            ? "rgba(239,68,68,0.5)"
            : z.priority === 2
              ? "rgba(251,146,60,0.4)"
              : "rgba(250,204,21,0.3)";
        grad.addColorStop(0, col);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x - w * 0.15, y - h * 0.15, w * 1.3, h * 1.3);
        ctx.strokeStyle =
          z.priority === 1
            ? "rgba(239,68,68,0.85)"
            : z.priority === 2
              ? "rgba(251,146,60,0.75)"
              : "rgba(202,138,4,0.7)";
        ctx.lineWidth = Math.max(2, img.naturalWidth * 0.003);
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
        const lbl = `${z.priority}. ${z.label}`,
          fs = Math.max(12, img.naturalWidth * 0.016);
        ctx.font = `bold ${fs}px system-ui`;
        const tw = ctx.measureText(lbl).width,
          pad = 6,
          bh = fs + pad * 2,
          bx = x,
          by = Math.max(0, y - bh - 2);
        ctx.fillStyle =
          z.priority === 1
            ? "rgba(239,68,68,0.92)"
            : z.priority === 2
              ? "rgba(251,146,60,0.92)"
              : "rgba(202,138,4,0.92)";
        ctx.beginPath();
        ctx.roundRect(bx, by, tw + pad * 2, bh, 4);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "middle";
        ctx.fillText(lbl, bx + pad, by + bh / 2);
      });
    };
    img.src = dataUrl;
  }, [dataUrl, zones]);
  return (
    <canvas
      ref={ref}
      style={{ width: "100%", display: "block", borderRadius: 10 }}
    />
  );
}

// ─── FILE PREVIEW MODAL ──────────────────────────────────────
function FilePreviewModal({
  file,
  onClose,
}: {
  file: BrandFile;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isImg = file.type?.startsWith("image/"),
    isPdf = file.type === "application/pdf";
  useEffect(() => {
    if (file.dataUrl) {
      setUrl(file.dataUrl);
      return;
    }
    if (!file.storagePath) return;
    setLoading(true);
    supabase.storage
      .from("brand-assets")
      .download(file.storagePath)
      .then(({ data, error }) => {
        if (data && !error) setUrl(URL.createObjectURL(data));
        setLoading(false);
      });
  }, [file]);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "100%",
          maxWidth: 780,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid #F0F0F0",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 18 }}>
              {isImg ? "🖼️" : isPdf ? "📄" : "📝"}
            </span>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#111",
                margin: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name}
            </p>
          </div>
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
        </div>
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isImg ? "1.25rem" : 0,
            minHeight: 0,
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "4rem",
              }}
            >
              <p style={{ fontSize: 13, color: "#888", margin: 0 }}>Loading…</p>
            </div>
          ) : isImg && url ? (
            <img
              src={url}
              alt={file.name}
              style={{
                width: "100%",
                height: "auto",
                borderRadius: 10,
                display: "block",
              }}
            />
          ) : isPdf && url ? (
            <iframe
              src={url}
              style={{
                width: "100%",
                height: "600px",
                border: "none",
                display: "block",
              }}
              title={file.name}
            />
          ) : file.extractedText ? (
            <div
              style={{
                background: "#FAFAFA",
                borderRadius: 10,
                padding: "1.25rem",
                margin: "1.25rem",
              }}
            >
              <pre
                style={{
                  fontSize: 12,
                  color: "#444",
                  lineHeight: 1.7,
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                }}
              >
                {file.extractedText}
              </pre>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "3rem" }}>
              <p style={{ fontSize: 32, margin: "0 0 12px" }}>📎</p>
              <p style={{ fontSize: 13, color: "#AAA", margin: 0 }}>
                Preview not available
              </p>
            </div>
          )}
        </div>
        <div
          style={{
            padding: "12px 18px",
            borderTop: "1px solid #F0F0F0",
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "1px solid #EFEFEF",
              background: "#fff",
              fontSize: 13,
              color: "#555",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
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
  const [previewFile, setPreviewFile] = useState<BrandFile | null>(null);
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
      const isImg = f.type.startsWith("image/"),
        isPdf = f.type === "application/pdf";
      const isDocx =
        f.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      let dataUrl = "",
        extractedText = "";
      if (isImg) dataUrl = await toBase64(f);
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
          const raw = (f as any)._file as File;
          const sp = `${userId}/${brandId}/${Date.now()}_${raw.name}`;
          await supabase.storage.from("brand-assets").upload(sp, raw);
          const { data: fr } = await supabase
            .from("brand_files")
            .insert({
              brand_id: brandId,
              user_id: userId,
              team_id: teamId || null,
              name: raw.name,
              mime_type: raw.type,
              extracted_text: f.extractedText || null,
              storage_path: sp,
            })
            .select()
            .single();
          savedFiles.push({ ...f, id: fr.id, storagePath: sp });
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
      console.error(err);
    }
    setSaving(false);
  };
  const del = async (n: string) => {
    const brand = brands[n];
    if (!brand?.id) return;
    const fps = (brand.files || [])
      .filter((f) => f.storagePath)
      .map((f) => f.storagePath as string);
    if (fps.length > 0) await supabase.storage.from("brand-assets").remove(fps);
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
  const fileIcon = (t: string) =>
    t.startsWith("image/") ? "🖼️" : t === "application/pdf" ? "📄" : "📝";
  const EyeIcon = () => (
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
  const content = (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: "1.5rem",
        width: "100%",
        maxWidth: isModal ? 480 : 900,
        maxHeight: isModal ? "85vh" : "auto",
        overflowY: "auto",
        boxShadow: isModal ? "0 20px 60px rgba(0,0,0,0.2)" : "none",
        border: isModal ? "none" : "1px solid #EFEFEF",
      }}
    >
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
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
            gridTemplateColumns: isModal
              ? "1fr"
              : "repeat(auto-fill,minmax(280px,1fr))",
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
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewFile(f);
                      }}
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "#F5F3FF",
                        color: "#6366F1",
                        border: "1px solid #E0DBFF",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      {fileIcon(f.type)}{" "}
                      {f.name.length > 20 ? f.name.slice(0, 20) + "…" : f.name}{" "}
                      <EyeIcon />
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
          placeholder="Colours, fonts, tone, visual rules…"
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
            {uploading ? "Processing…" : "📎 Upload brand guideline"}
          </p>
          <p style={{ fontSize: 11, color: "#CCC", margin: "4px 0 0" }}>
            PDF · Word · PNG · JPG · SVG
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
                <span
                  onClick={() => setPreviewFile(f)}
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {fileIcon(f.type)}{" "}
                  {f.name.length > 22 ? f.name.slice(0, 22) + "…" : f.name}{" "}
                  <EyeIcon />
                </span>
                {f.extractedText && (
                  <span style={{ color: "#10B981", fontSize: 9 }}>✓</span>
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
    const isV = f.type.startsWith("video");
    const du = isV ? null : await toBase64(f);
    onFile({
      file: f,
      type: isV ? "video" : "image",
      dataUrl: du,
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
  const sel = MODELS.find((m) => m.id === value) || MODELS[1];
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cc = (c: number) =>
    c <= 1
      ? { bg: "#F0FDF4", text: "#15803D" }
      : c <= 3
        ? { bg: "#FFFBEB", text: "#B45309" }
        : c <= 4
          ? { bg: "#EEF2FF", text: "#4338CA" }
          : { bg: "#FEF2F2", text: "#B91C1C" };
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
            {sel.name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: 20,
              background: cc(sel.credits).bg,
              color: cc(sel.credits).text,
            }}
          >
            {sel.credits} credit{sel.credits !== 1 ? "s" : ""}
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
              const { bg, text } = cc(m.credits);
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
  client,
  platform,
  industry,
}: {
  creative: CreativeFile | null;
  result: AnalysisResult;
  threshold: number;
  onReset: () => void;
  onExport: () => void;
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
                Select an industry in the config panel to get real-world
                benchmarks.
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
            const mx = Math.max(...scores);
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
                  const isW = s === mx;
                  return (
                    <div key={c.index} style={{ textAlign: "center" }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: isW ? LABEL_COLORS[c.index] : "#CCC",
                        }}
                      >
                        {s}
                      </span>
                      {isW && (
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

// ─── TEAM SETTINGS VIEW ──────────────────────────────────────
function TeamSettingsView({
  session,
  team,
  onTeamUpdated,
  onTeamDeleted,
}: {
  session: any;
  team: TeamCard;
  onTeamUpdated: (t: TeamCard) => void;
  onTeamDeleted: () => void;
}) {
  const [tab, setTab] = useState<"members" | "credits" | "invite">("members");
  const [members, setMembers] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [teamName, setTeamName] = useState(team.teamName);
  const [renaming, setRenaming] = useState(false);
  const [allocAmount, setAllocAmount] = useState("");
  const [allocating, setAllocating] = useState(false);
  const [orgCredits, setOrgCredits] = useState(0);
  const [inviteExpiration, setInviteExpiration] = useState<
    "never" | "24h" | "7d"
  >("never");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);

  useEffect(() => {
    loadMembers();
    loadOrgCredits();
  }, [team.teamId]);

  const loadMembers = async () => {
    setLoadingMembers(true);
    const { data } = await supabase
      .from("team_members")
      .select("id,role,user_id,profiles!left(full_name,email)")
      .eq("team_id", team.teamId);
    if (data) setMembers(data);
    setLoadingMembers(false);
  };
  const loadOrgCredits = async () => {
    const { data } = await supabase
      .from("organisations")
      .select("credits_pool")
      .eq("id", team.orgId)
      .single();
    if (data) setOrgCredits(data.credits_pool);
  };

  const handleRename = async () => {
    if (!teamName.trim() || renaming) return;
    setRenaming(true);
    await supabase
      .from("teams")
      .update({ name: teamName.trim() })
      .eq("id", team.teamId);
    onTeamUpdated({ ...team, teamName: teamName.trim() });
    setRenaming(false);
  };
  const handleDelete = async () => {
    if (!confirm(`Delete "${team.teamName}"? This cannot be undone.`)) return;
    await supabase.from("teams").delete().eq("id", team.teamId);
    onTeamDeleted();
  };
  const updateMemberRole = async (memberId: string, newRole: string) => {
    await supabase
      .from("team_members")
      .update({ role: newRole })
      .eq("id", memberId);
    setMembers((p) =>
      p.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)),
    );
  };
  const removeMember = async (memberId: string, userId: string) => {
    if (userId === session.user.id) {
      alert("You cannot remove yourself.");
      return;
    }
    if (!confirm("Remove this member?")) return;
    await supabase.from("team_members").delete().eq("id", memberId);
    setMembers((p) => p.filter((m) => m.id !== memberId));
  };
  const handleAllocate = async () => {
    const amt = parseInt(allocAmount);
    if (!amt || amt <= 0) return;
    setAllocating(true);
    const { data, error } = await supabase.rpc("allocate_credits_to_team", {
      p_org_id: team.orgId,
      p_team_id: team.teamId,
      p_amount: amt,
    });
    if (error || !data?.success)
      alert(error?.message || data?.error || "Failed");
    else {
      alert(`Allocated ${amt} credits!`);
      setAllocAmount("");
      onTeamUpdated({ ...team, creditsPool: team.creditsPool + amt });
      loadOrgCredits();
    }
    setAllocating(false);
  };
  const generateInvite = async () => {
    let expiresAt: string | null = null;
    if (inviteExpiration === "24h")
      expiresAt = new Date(Date.now() + 86400000).toISOString();
    else if (inviteExpiration === "7d")
      expiresAt = new Date(Date.now() + 604800000).toISOString();
    const { data } = await supabase
      .from("team_invites")
      .insert({
        team_id: team.teamId,
        org_id: team.orgId,
        created_by: session.user.id,
        is_active: true,
        expires_at: expiresAt,
      })
      .select("token")
      .single();
    if (data) setInviteLink(`${window.location.origin}/?invite=${data.token}`);
  };
  const sendEmailInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      setInviteStatus({ type: "error", msg: "Enter a valid email." });
      return;
    }
    setSendingInvite(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: inviteEmail.trim(),
        options: { emailRedirectTo: inviteLink },
      });
      if (error) throw error;
      setInviteStatus({
        type: "success",
        msg: `Invite sent to ${inviteEmail}!`,
      });
      setInviteEmail("");
    } catch (e: any) {
      setInviteStatus({ type: "error", msg: e.message });
    }
    setSendingInvite(false);
  };

  const isAdmin = team.role === "admin";
  const filtered = members.filter((m) => {
    if (!memberSearch.trim()) return true;
    const q = memberSearch.toLowerCase();
    return (
      (m.profiles?.full_name || "").toLowerCase().includes(q) ||
      (m.profiles?.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div style={{ marginBottom: "1.75rem" }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#111",
            margin: "0 0 4px",
          }}
        >
          Team settings
        </h1>
        <p style={{ fontSize: 13, color: "#999", margin: 0 }}>
          {team.clientName ? `${team.clientName} · ` : ""}
          {team.teamName}
        </p>
      </div>

      {/* Rename / delete — admin only */}
      {isAdmin && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #EFEFEF",
            borderRadius: 14,
            padding: "1.25rem",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#111",
              margin: "0 0 12px",
            }}
          >
            General
          </p>
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
            Team name
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              style={{
                flex: 1,
                padding: "9px 12px",
                border: "1px solid #EFEFEF",
                borderRadius: 8,
                fontSize: 13,
                outline: "none",
                color: "#111",
              }}
            />
            <button
              onClick={handleRename}
              disabled={
                renaming || !teamName.trim() || teamName === team.teamName
              }
              style={{
                padding: "0 18px",
                borderRadius: 8,
                border: "none",
                background:
                  teamName.trim() && teamName !== team.teamName
                    ? "#111"
                    : "#F0F0F0",
                color:
                  teamName.trim() && teamName !== team.teamName
                    ? "#fff"
                    : "#AAA",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {renaming ? "Saving…" : "Rename"}
            </button>
          </div>
          <div
            style={{
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid #F5F5F5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
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
                Delete team
              </p>
              <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>
                This action cannot be undone.
              </p>
            </div>
            <button
              onClick={handleDelete}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "#EF4444",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Sub-nav */}
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
        {[
          ["members", "Members"],
          ...(isAdmin
            ? [
                ["credits", "Credits"],
                ["invite", "Invite"],
              ]
            : []),
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v as typeof tab)}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              background: tab === v ? "#fff" : "transparent",
              color: tab === v ? "#111" : "#888",
              boxShadow: tab === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              cursor: "pointer",
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "members" && (
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
              <span style={{ fontSize: 12, color: "#AAA", fontWeight: 400 }}>
                ({members.length})
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
          ) : filtered.length === 0 ? (
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
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((m) => (
                <div
                  key={m.id}
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
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
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
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#6366F1",
                        }}
                      >
                        {(m.profiles?.full_name ||
                          m.profiles?.email ||
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
                        {m.profiles?.full_name || "Guest"}
                      </p>
                      <p style={{ fontSize: 11, color: "#AAA", margin: 0 }}>
                        {m.profiles?.email || "—"}
                      </p>
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {m.user_id === session.user.id ? (
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
                        YOU · {m.role.toUpperCase()}
                      </span>
                    ) : isAdmin ? (
                      <>
                        <select
                          value={m.role}
                          onChange={(e) =>
                            updateMemberRole(m.id, e.target.value)
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
                          onClick={() => removeMember(m.id, m.user_id)}
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
                        {m.role.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "credits" && isAdmin && (
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
          <p style={{ fontSize: 13, color: "#AAA", margin: "0 0 20px" }}>
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
                {orgCredits}
              </p>
              <p style={{ fontSize: 11, color: "#A5B4FC", margin: "6px 0 0" }}>
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
                {team.creditsPool}
              </p>
              <p style={{ fontSize: 11, color: "#86EFAC", margin: "6px 0 0" }}>
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
                onClick={handleAllocate}
                disabled={allocating}
                style={{
                  padding: "0 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#6366F1",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  opacity: allocating ? 0.7 : 1,
                }}
              >
                {allocating ? "Moving…" : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "invite" && isAdmin && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
            <p style={{ fontSize: 13, color: "#AAA", margin: "0 0 16px" }}>
              Anyone with this link can join the team.
            </p>
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
                    background: inviteExpiration === opt ? "#F5F3FF" : "#fff",
                    color: inviteExpiration === opt ? "#6366F1" : "#555",
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
            {inviteLink && (
              <div
                style={{
                  marginTop: 14,
                  background: "#FAFAFA",
                  border: "1px solid #EFEFEF",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    readOnly
                    value={inviteLink}
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
                    onClick={() => {
                      navigator.clipboard.writeText(inviteLink);
                      setInviteStatus({ type: "success", msg: "Copied!" });
                    }}
                    style={{
                      padding: "0 14px",
                      borderRadius: 8,
                      border: "none",
                      background: "#F5F3FF",
                      color: "#6366F1",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
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
            {!inviteLink && (
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
                Generate an invite link first.
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={!inviteLink}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  border: "1px solid #EFEFEF",
                  borderRadius: 8,
                  fontSize: 13,
                  outline: "none",
                  color: "#111",
                  background: inviteLink ? "#fff" : "#FAFAFA",
                }}
              />
              <button
                onClick={sendEmailInvite}
                disabled={sendingInvite || !inviteEmail || !inviteLink}
                style={{
                  padding: "0 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  opacity:
                    sendingInvite || !inviteEmail || !inviteLink ? 0.5 : 1,
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
                    inviteStatus.type === "success" ? "#F0FDF4" : "#FEF2F2",
                  color:
                    inviteStatus.type === "success" ? "#15803D" : "#B91C1C",
                }}
              >
                {inviteStatus.msg}
              </div>
            )}
          </div>
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
  // ── Layer 1 state ─────────────────────────────────────────
  const [allTeams, setAllTeams] = useState<TeamCard[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [activeTeam, setActiveTeam] = useState<TeamCard | null>(null); // null = Layer 1 grid

  // ── Layer 2 state ─────────────────────────────────────────
  const [currentView, setCurrentView] = useState<
    "analyzer" | "history" | "brands" | "settings"
  >("analyzer");
  const [profile, setProfile] = useState<any>(null);
  const [analysesHistory, setAnalysesHistory] = useState<any[]>([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState<any>(null);
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
  const [analyserPreviewFile, setAnalyserPreviewFile] =
    useState<BrandFile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  // New client/team creation
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  // ── Load all teams flat ────────────────────────────────────
  const loadAllTeams = async () => {
    setLoadingTeams(true);
    const { data } = await supabase
      .from("team_members")
      .select(
        "role, teams(id, name, credits_pool, org_id, client_id, clients(id,name), organisations(id,name))",
      )
      .eq("user_id", session.user.id);
    if (!data) {
      setLoadingTeams(false);
      return;
    }
    const cards: TeamCard[] = data
      .map((row: any) => {
        const team = row.teams;
        return {
          teamId: team.id,
          teamName: team.name,
          clientName: team.clients?.name || null,
          orgId: team.organisations?.id || "",
          orgName: team.organisations?.name || "",
          role: row.role,
          creditsPool: team.credits_pool || 0,
        };
      })
      .filter((c: TeamCard) => c.teamId);
    setAllTeams(cards);
    setLoadingTeams(false);
  };

  const fetchProfile = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    if (data) setProfile(data);
  };

  const fetchHistory = async (teamId: string) => {
    const { data } = await supabase
      .from("analyses")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });
    if (data) setAnalysesHistory(data);
  };

  useEffect(() => {
    loadAllTeams();
    fetchProfile();
    // Handle invite tokens
    const inviteToken = new URLSearchParams(window.location.search).get(
      "invite",
    );
    if (inviteToken) {
      supabase
        .rpc("join_team_via_invite", { invite_token: inviteToken })
        .then(({ data }) => {
          if (data?.success) {
            alert("Successfully joined the team!");
            window.history.replaceState({}, document.title, "/");
            loadAllTeams();
          } else alert(data?.error || "Invalid invite link.");
        });
    }
  }, []);

  // When entering a team, load its data
  const enterTeam = (team: TeamCard) => {
    setActiveTeam(team);
    setCurrentView("analyzer");
    setSingleResult(null);
    setSingle(null);
    setCreatives([null, null]);
    fetchHistory(team.teamId);
    loadBrandsFromSupabase(session.user.id, team.teamId).then((b) =>
      setBrands(b),
    );
  };

  const exitToGrid = () => {
    setActiveTeam(null);
    setSingleResult(null);
    setSingle(null);
    setCreatives([null, null]);
    setViewingHistoryItem(null);
    loadAllTeams();
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim() || !newTeamName.trim()) return;
    setCreating(true);
    // Get first org (No Fluff)
    const { data: memberData } = await supabase
      .from("team_members")
      .select("teams(organisations(id))")
      .eq("user_id", session.user.id)
      .limit(1)
      .single();
    const orgId = (memberData?.teams as any)?.organisations?.id;
    if (!orgId) {
      alert("No organisation found.");
      setCreating(false);
      return;
    }
    const { data, error } = await supabase.rpc("create_client_and_team", {
      p_org_id: orgId,
      p_client_name: newClientName.trim(),
      p_team_name: newTeamName.trim(),
    });
    if (error || !data?.success)
      alert("Error: " + (error?.message || "Unknown"));
    else {
      setNewClientName("");
      setNewTeamName("");
      setShowNewClient(false);
      await loadAllTeams();
    }
    setCreating(false);
  };

  // ── Analysis helpers ───────────────────────────────────────
  const buildSystem = (isVideo: boolean) => {
    const fc = brandFiles
      .filter((f) => f.extractedText)
      .map((f) => `[Brand file: ${f.name}]\n${f.extractedText}`)
      .join("\n\n");
    const is = industry
      ? `"industry_benchmarks": { "summary": "<2-3 sentences>", "examples": [{ "brand":"<>","campaign":"<>","technique":"<>","lesson":"<>" },{ "brand":"<>","campaign":"<>","technique":"<>","lesson":"<>" }], "gap": "<single sentence>" },`
      : "";
    return `You are a senior creative strategist at No Fluff, a behavioural marketing agency for D2C brands. Analyse advertising creatives through consumer psychology, visual hierarchy, and conversion optimisation.${industry ? ` Use your web search tool to find current 2024-2025 ${industry} campaign examples before completing the industry_benchmarks section.` : ""}

Return ONLY raw JSON. No markdown. No backticks. No explanation. Start with { end with }.

{ "overall_score":<0-100>, "overall_verdict":"<one punchy sentence>", "pass":<true if score>=${threshold}>, "dimensions":{ "visual_hierarchy":{"score":<0-100>,"recommendation":"<specific observation>"},"clarity_readability":{"score":<0-100>,"recommendation":"<>"},"three_second_test":{"score":<0-100>,"recommendation":"<>"},"behavioural_triggers":{"score":<0-100>,"recommendation":"<>"},"cta_strength":{"score":<0-100>,"recommendation":"<>"},"cognitive_load":{"score":<0-100>,"recommendation":"<>"},"emotional_resonance":{"score":<0-100>,"recommendation":"<>"},"brand_consistency":{"score":<0-100>,"recommendation":"<>"},"concept_alignment":{"score":<0-100>,"recommendation":"<>"} }, "top_fixes":["<>","<>","<>"], "attention_zones":[{"priority":1,"label":"<>","x":<0-1>,"y":<0-1>,"w":<0-1>,"h":<0-1>,"note":"<>"},{"priority":2,"label":"<>","x":<0-1>,"y":<0-1>,"w":<0-1>,"h":<0-1>,"note":"<>"},{"priority":3,"label":"<>","x":<0-1>,"y":<0-1>,"w":<0-1>,"h":<0-1>,"note":"<>"}]${industry ? `,${is}` : ""} }

${platform ? `Platform: ${platform}.` : ""}${client ? ` Client: ${client}.` : ""}${industry ? ` Industry: ${industry}.` : ""}${brandNotes ? ` Brand notes: ${brandNotes}.` : ""}${fc ? `\n\nBrand guideline documents:\n${fc}` : ""}
${concept ? `\nConcept: "${concept}". Score concept_alignment on how clearly it communicates this goal.` : "\nNo concept — score concept_alignment on general message clarity."}
${
  referenceLinks.filter((l) => l.trim()).length > 0
    ? `\nReference creatives:\n${referenceLinks
        .filter((l) => l.trim())
        .map((l, i) => `${i + 1}. ${l}`)
        .join("\n")}`
    : ""
}
${isVideo ? "Video creative — benchmark against best-practice standards for the format." : ""}
Be specific. Reference actual elements. No generic advice.`;
  };

  const callAPI = async (creative: CreativeFile): Promise<AnalysisResult> => {
    const isV = creative.type === "video";
    const parts: object[] = [];
    for (const bf of brandFiles.filter(
      (f) => f.type.startsWith("image/") && f.dataUrl,
    )) {
      parts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: bf.type,
          data: bf.dataUrl.split(",")[1],
        },
      });
      parts.push({ type: "text", text: `[Brand asset: ${bf.name}]` });
    }
    if (!isV) {
      const raw = await toBase64Raw(creative.file);
      parts.push({
        type: "image",
        source: { type: "base64", media_type: creative.mimeType, data: raw },
      });
      parts.push({
        type: "text",
        text: "Analyse this creative. Return raw JSON only, starting with {",
      });
    } else
      parts.push({
        type: "text",
        text: `Video file: "${creative.name}". Return raw JSON only, starting with {`,
      });
    const body: Record<string, unknown> = {
      model: selectedModel,
      max_tokens: 4000,
      system: buildSystem(isV),
      messages: [
        { role: "user", content: isV ? parts[parts.length - 1] : parts },
      ],
    };
    if (industry)
      body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const resp = await fetch("/api/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.error?.message || `API error ${resp.status}`);
    }
    const data = await resp.json();
    const raw = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text || "")
      .join("")
      .trim();
    const s = raw.indexOf("{"),
      e = raw.lastIndexOf("}");
    if (s === -1 || e === -1) throw new Error("No JSON found in response");
    const parsed = JSON.parse(raw.slice(s, e + 1));
    if (!parsed.dimensions || !parsed.overall_score)
      throw new Error("Incomplete analysis — please try again.");
    return parsed;
  };

  const saveAnalysisRecord = async (
    score: number,
    pass: boolean,
    fullResult: AnalysisResult,
    creative: CreativeFile | null,
    analysisType: string,
  ) => {
    if (!activeTeam) return;
    let updated = { ...fullResult };
    if (creative?.file) {
      const safe = creative.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const sp = `${session.user.id}/analyses/${Date.now()}_${safe}`;
      const { error } = await supabase.storage
        .from("brand-assets")
        .upload(sp, creative.file);
      if (!error) {
        updated.creative_storage_path = sp;
        updated.creative_name = creative.name;
        updated.creative_type = creative.type;
        updated.creative_mimeType = creative.mimeType;
      }
    }
    const creditsUsed =
      MODELS.find((m) => m.id === selectedModel)?.credits || 1;
    const { data: deduct } = await supabase.rpc("deduct_team_credits", {
      p_team_id: activeTeam.teamId,
      p_user_id: session.user.id,
      p_amount: creditsUsed,
    });
    if (!deduct?.success)
      throw new Error(deduct?.error || "Insufficient credits");
    await supabase
      .from("analyses")
      .insert({
        user_id: session.user.id,
        team_id: activeTeam.teamId,
        org_id: activeTeam.orgId,
        client: client || "Unnamed",
        platform: platform || "Unknown",
        industry: industry || "Unknown",
        concept: concept || null,
        type: analysisType,
        model: selectedModel,
        credits_used: creditsUsed,
        overall_score: score,
        pass,
        result: updated,
      });
    setActiveTeam((prev) =>
      prev ? { ...prev, creditsPool: prev.creditsPool - creditsUsed } : prev,
    );
    fetchHistory(activeTeam.teamId);
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
        zones.forEach((z) => {
          const x = z.x * img.naturalWidth,
            y = z.y * img.naturalHeight,
            w = z.w * img.naturalWidth,
            h = z.h * img.naturalHeight;
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
            z.priority === 1
              ? "rgba(239,68,68,0.5)"
              : z.priority === 2
                ? "rgba(251,146,60,0.4)"
                : "rgba(250,204,21,0.3)";
          grad.addColorStop(0, col);
          grad.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(x - w * 0.15, y - h * 0.15, w * 1.3, h * 1.3);
          ctx.strokeStyle =
            z.priority === 1
              ? "rgba(239,68,68,0.85)"
              : z.priority === 2
                ? "rgba(251,146,60,0.75)"
                : "rgba(202,138,4,0.7)";
          ctx.lineWidth = Math.max(2, img.naturalWidth * 0.003);
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
          const lbl = `${z.priority}. ${z.label}`,
            fs = Math.max(12, img.naturalWidth * 0.016);
          ctx.font = `bold ${fs}px system-ui`;
          const tw = ctx.measureText(lbl).width,
            pad = 6,
            bh = fs + pad * 2,
            bx = x,
            by = Math.max(0, y - bh - 2);
          ctx.fillStyle =
            z.priority === 1
              ? "rgba(239,68,68,0.92)"
              : z.priority === 2
                ? "rgba(251,146,60,0.92)"
                : "rgba(202,138,4,0.92)";
          ctx.beginPath();
          ctx.roundRect(bx, by, tw + pad * 2, bh, 4);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.textBaseline = "middle";
          ctx.fillText(lbl, bx + pad, by + bh / 2);
        });
        resolve(true);
      };
      img.src = creative.dataUrl as string;
    });
    return canvas.toDataURL("image/png");
  };

  const exportReport = async (
    items: AnalysedCreative[],
    creative: CreativeFile | null = null,
  ) => {
    try {
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
      console.error(err);
      alert("Export failed.");
    }
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
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.readAsDataURL(data);
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
        console.error(err);
      }
    }
    setIsLoadingHistory(false);
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

  // ── LAYER 1: Teams Grid ────────────────────────────────────
  if (!activeTeam) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#FAFAFA",
          fontFamily: "system-ui",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            background: "#fff",
            borderBottom: "1px solid #EFEFEF",
            padding: "0 2rem",
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: "#111",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 13, color: "#fff", fontWeight: 800 }}>
                P
              </span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>
              Preflyght
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {profile && (
              <span style={{ fontSize: 13, color: "#888" }}>
                {profile.full_name || profile.email}
              </span>
            )}
            <button
              onClick={() => setShowNewClient(true)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "#111",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + New client
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #EFEFEF",
                background: "#fff",
                color: "#888",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        <div
          style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}
        >
          <div style={{ marginBottom: "2rem" }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#111",
                margin: "0 0 4px",
              }}
            >
              Teams
            </h1>
            <p style={{ fontSize: 14, color: "#999", margin: 0 }}>
              Select a team to start analysing
            </p>
          </div>

          {/* New client modal */}
          {showNewClient && (
            <div
              style={{
                background: "#fff",
                border: "1px solid #EFEFEF",
                borderRadius: 14,
                padding: "1.5rem",
                marginBottom: "1.5rem",
              }}
            >
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#111",
                  margin: "0 0 14px",
                }}
              >
                New client + team
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
                    Client name
                  </label>
                  <input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="e.g. Zero Grid"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      border: "1px solid #EFEFEF",
                      borderRadius: 8,
                      fontSize: 13,
                      outline: "none",
                      boxSizing: "border-box",
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
                    First team name
                  </label>
                  <input
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="e.g. Performance"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      border: "1px solid #EFEFEF",
                      borderRadius: 8,
                      fontSize: 13,
                      outline: "none",
                      boxSizing: "border-box",
                      color: "#111",
                    }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleCreateClient}
                  disabled={
                    creating || !newClientName.trim() || !newTeamName.trim()
                  }
                  style={{
                    padding: "9px 18px",
                    borderRadius: 8,
                    border: "none",
                    background:
                      newClientName.trim() && newTeamName.trim()
                        ? "#6366F1"
                        : "#F0F0F0",
                    color:
                      newClientName.trim() && newTeamName.trim()
                        ? "#fff"
                        : "#AAA",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {creating ? "Creating…" : "Create"}
                </button>
                <button
                  onClick={() => setShowNewClient(false)}
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

          {loadingTeams ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "6rem",
              }}
            >
              <p style={{ fontSize: 13, color: "#AAA" }}>Loading teams…</p>
            </div>
          ) : allTeams.length === 0 ? (
            <div
              style={{
                background: "#fff",
                border: "1px solid #EFEFEF",
                borderRadius: 16,
                padding: "5rem",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 40, margin: "0 0 12px" }}>🏗️</p>
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#222",
                  margin: "0 0 6px",
                }}
              >
                No teams yet
              </p>
              <p style={{ fontSize: 14, color: "#AAA", margin: "0 0 20px" }}>
                Create your first client and team to get started.
              </p>
              <button
                onClick={() => setShowNewClient(true)}
                style={{
                  padding: "10px 22px",
                  borderRadius: 8,
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                + New client
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
                gap: 16,
              }}
            >
              {allTeams.map((team) => (
                <div
                  key={team.teamId}
                  onClick={() => enterTeam(team)}
                  style={{
                    background: "#fff",
                    border: "1px solid #EFEFEF",
                    borderRadius: 14,
                    padding: "1.25rem 1.5rem",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      "#6366F1";
                    (e.currentTarget as HTMLDivElement).style.boxShadow =
                      "0 4px 16px rgba(99,102,241,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      "#EFEFEF";
                    (e.currentTarget as HTMLDivElement).style.boxShadow =
                      "none";
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: "#111",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span
                        style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}
                      >
                        {(team.clientName || team.teamName)[0].toUpperCase()}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 9px",
                        borderRadius: 20,
                        background:
                          team.role === "admin" ? "#F5F3FF" : "#F4F4F5",
                        color: team.role === "admin" ? "#6366F1" : "#888",
                      }}
                    >
                      {team.role.toUpperCase()}
                    </span>
                  </div>
                  {/* Names */}
                  {team.clientName && (
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#AAA",
                        margin: "0 0 2px",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {team.clientName}
                    </p>
                  )}
                  <p
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#111",
                      margin: "0 0 12px",
                    }}
                  >
                    {team.teamName}
                  </p>
                  {/* Credits */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingTop: 12,
                      borderTop: "1px solid #F5F5F5",
                    }}
                  >
                    <span style={{ fontSize: 12, color: "#AAA" }}>Credits</span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: team.creditsPool > 0 ? "#6366F1" : "#EF4444",
                      }}
                    >
                      {team.creditsPool}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── LAYER 2: Inside a team ─────────────────────────────────
  const mode_state = useState("single");
  const [mode, setMode] = [mode_state[0], mode_state[1]];

  return (
    <div
      style={{
        display: "flex",
        fontFamily: "system-ui",
        background: "#FAFAFA",
        minHeight: "100vh",
      }}
    >
      {/* ── SIDEBAR ── */}
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
        {/* Back + breadcrumb */}
        <div
          style={{
            padding: "1rem 0.75rem 0.75rem",
            borderBottom: "1px solid #EFEFEF",
          }}
        >
          <button
            onClick={exitToGrid}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px 8px",
              borderRadius: 8,
              width: "100%",
              marginBottom: isSidebarOpen ? 10 : 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F5F5F5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#888"
              strokeWidth="2.5"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {isSidebarOpen && (
              <span style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>
                All teams
              </span>
            )}
          </button>
          {isSidebarOpen && (
            <div style={{ padding: "0 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "#111",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}
                  >
                    {(activeTeam.clientName ||
                      activeTeam.teamName)[0].toUpperCase()}
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  {activeTeam.clientName && (
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: "#AAA",
                        margin: 0,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {activeTeam.clientName}
                    </p>
                  )}
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#111",
                      margin: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {activeTeam.teamName}
                  </p>
                </div>
              </div>
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
                "history",
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
                "settings",
                "Settings",
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

        {/* Bottom */}
        <div
          style={{
            padding: "0.75rem 0.5rem",
            borderTop: "1px solid #EFEFEF",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {isSidebarOpen && (
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
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: activeTeam.creditsPool > 0 ? "#111" : "#EF4444",
                  }}
                >
                  {activeTeam.creditsPool}
                </span>
              </div>
              <div
                style={{ height: 4, background: "#F0F0F0", borderRadius: 2 }}
              >
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    width: `${Math.min(100, (activeTeam.creditsPool / 200) * 100)}%`,
                    background: "#6366F1",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
              <p style={{ fontSize: 10, color: "#BBB", margin: "4px 0 0" }}>
                Team pool
              </p>
            </div>
          )}
          <button
            onClick={() => setIsSidebarOpen((o) => !o)}
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

      {/* ── MAIN ── */}
      <main
        style={{
          marginLeft: isSidebarOpen ? 260 : 76,
          flex: 1,
          padding: "2rem 1.5rem",
          transition: "margin-left 0.3s ease",
        }}
      >
        <div style={{ maxWidth: 900 }}>
          {analyserPreviewFile && (
            <FilePreviewModal
              file={analyserPreviewFile}
              onClose={() => setAnalyserPreviewFile(null)}
            />
          )}
          {showBrandMgr && (
            <BrandManager
              userId={session.user.id}
              teamId={activeTeam.teamId}
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

          {/* ── ANALYSER ── */}
          {currentView === "analyzer" && (
            <div>
              <div style={{ marginBottom: "1.75rem" }}>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: "#111",
                    margin: "0 0 4px",
                  }}
                >
                  Creative Analyser
                </h1>
                <p style={{ fontSize: 13, color: "#999", margin: 0 }}>
                  Pre-flight analysis powered by behavioural science
                  {activeTeam.creditsPool === 0 && (
                    <span style={{ color: "#EF4444" }}> · No credits</span>
                  )}
                </p>
              </div>
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
                      Concept{" "}
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
                          onClick={() => setReferenceLinks((p) => [...p, ""])}
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
                            setReferenceLinks((p) =>
                              p.map((x, j) => (j === i ? e.target.value : x)),
                            )
                          }
                          placeholder="https://example.com/ad.jpg"
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
                            onClick={() =>
                              setReferenceLinks((p) =>
                                p.filter((_, j) => j !== i),
                              )
                            }
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
                    onClick={() => setCreatives([null, null])}
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

          {/* ── HISTORY ── */}
          {currentView === "history" && (
            <div>
              <div style={{ marginBottom: "1.75rem" }}>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: "#111",
                    margin: "0 0 4px",
                  }}
                >
                  Analysis history
                </h1>
                <p style={{ fontSize: 13, color: "#999", margin: 0 }}>
                  {analysesHistory.length} report
                  {analysesHistory.length !== 1 ? "s" : ""} ·{" "}
                  {activeTeam.clientName ? `${activeTeam.clientName} · ` : ""}
                  {activeTeam.teamName}
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
                    threshold={threshold}
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
                              if (confirm("Delete this report?")) {
                                supabase
                                  .from("analyses")
                                  .delete()
                                  .eq("id", item.id)
                                  .then(() => fetchHistory(activeTeam.teamId));
                              }
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

          {/* ── BRANDS ── */}
          {currentView === "brands" && (
            <div>
              <div style={{ marginBottom: "1.75rem" }}>
                <h1
                  style={{
                    fontSize: 22,
                    fontWeight: 600,
                    color: "#111",
                    margin: "0 0 4px",
                  }}
                >
                  Brand guidelines
                </h1>
                <p style={{ fontSize: 13, color: "#999", margin: 0 }}>
                  Manage brand assets ·{" "}
                  {activeTeam.clientName ? `${activeTeam.clientName} · ` : ""}
                  {activeTeam.teamName}
                </p>
              </div>
              <BrandManager
                userId={session.user.id}
                teamId={activeTeam.teamId}
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

          {/* ── SETTINGS ── */}
          {currentView === "settings" && (
            <TeamSettingsView
              session={session}
              team={activeTeam}
              onTeamUpdated={(updated) => {
                setActiveTeam(updated);
                setAllTeams((prev) =>
                  prev.map((t) => (t.teamId === updated.teamId ? updated : t)),
                );
              }}
              onTeamDeleted={exitToGrid}
            />
          )}
        </div>
      </main>
    </div>
  );
}
