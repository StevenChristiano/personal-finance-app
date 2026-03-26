"use client";

import { useEffect, useRef, useState } from "react";

import {
    categoryApi, settingsApi, statsApi, syncThresholdCache, transactionApi,
    type Category, type Stats, type PreviewRow,
} from "@/lib/api";
import {
    CheckCircle, AlertTriangle, AlertCircle, Info, X,
    Download, Upload, Trash2, FileSpreadsheet, AlertOctagon,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, string> = {
    Food: "🍔", Transport: "🚗", Lifestyle: "👕", Entertainment: "🎮",
    Utilities: "💡", Telecommunication: "📱", Subscription: "📺",
    Health: "🏥", Education: "📚", "Big Expense": "💰",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
    Food: "Daily food & beverage expenses — meals, snacks, coffee, groceries, and dining out.",
    Transport: "Commuting and travel costs — fuel, ride-hailing (Grab/Gojek), parking, and public transport.",
    Lifestyle: "Personal care and clothing — fashion, haircuts, beauty products.",
    Entertainment: "Leisure activities — movies, concerts, games, hobbies, and recreation.",
    Utilities: "Household bills — electricity, water, internet, and gas.",
    Telecommunication: "Phone-related expenses — mobile data plans and top-ups.",
    Subscription: "Recurring digital services — streaming (Netflix, Spotify), apps, and memberships.",
    Health: "Medical expenses — doctor visits, medicine, hospital fees. (Not monitored — occasional expense)",
    Education: "Learning costs — tuition, books, courses. (Not monitored — occasional expense)",
    "Big Expense": "Large one-time purchases — electronics, furniture, travel. (Not monitored — occasional expense)",
};

function formatRupiah(amount: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function makeDefaultTimestamp() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
}

interface TransactionResult {
    id: number; amount: number; category: string;
    anomaly_score?: number; anomaly_status?: string;
    is_excluded: boolean; message: string;
}


export default function AddTransactionPage() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [amount, setAmount] = useState("");
    const [amountDisplay, setAmountDisplay] = useState("");
    const [categoryId, setCategoryId] = useState<number | null>(null);
    const [note, setNote] = useState("");
    const [timestamp, setTimestamp] = useState(makeDefaultTimestamp);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<TransactionResult | null>(null);
    const [error, setError] = useState("");
    const [showCategoryInfo, setShowCategoryInfo] = useState(false);
    const [thresholds, setThresholds] = useState({ warning: 50, anomaly: 60 });
    const [categoryStats, setCategoryStats] = useState<Stats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

    // ── Bulk-upload state ──────────────────────────────────────────────────────
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploadLoading, setUploadLoading] = useState(false);
    const [uploadError, setUploadError] = useState("");
    const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null);
    const [savingBulk, setSavingBulk] = useState(false);
    const [bulkSuccess, setBulkSuccess] = useState("");

    const fetchStats = () => {
        setStatsLoading(true);
        statsApi.get().then(setCategoryStats).catch(console.error).finally(() => setStatsLoading(false));
    };

    useEffect(() => {
        // Fetch thresholds from DB — fall back to localStorage cache if offline
        settingsApi.get()
            .then((data) => {
                setThresholds({
                    warning: Math.round(data.warning_threshold * 100),
                    anomaly: Math.round(data.anomaly_threshold * 100),
                });
                syncThresholdCache(data);
            })
            .catch(() => {
                const w = parseInt(localStorage.getItem("threshold_warning") || "50");
                const a = parseInt(localStorage.getItem("threshold_anomaly") || "60");
                setThresholds({ warning: w, anomaly: a });
            });
        categoryApi.getAll().then(setCategories).catch(console.error);
        fetchStats();
    }, []);

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, "");
        setAmount(raw);
        setAmountDisplay(raw ? new Intl.NumberFormat("id-ID").format(parseInt(raw)) : "");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || !categoryId) return;
        setError("");
        setLoading(true);
        setResult(null);
        try {
            const data = await transactionApi.create({
                amount: parseFloat(amount),
                category_id: categoryId,
                note: note || undefined,
                timestamp: new Date(timestamp).toISOString(),
            });
            setResult(data);
            fetchStats(); // Refresh right-column stats
            // Reset form — date resets to now
            setAmount("");
            setAmountDisplay("");
            setNote("");
            setCategoryId(null);
            setTimestamp(makeDefaultTimestamp());
            window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to add transaction.");
        } finally {
            setLoading(false);
        }
    };

    // ── Bulk upload handlers ───────────────────────────────────────────────────
    const handleDownloadTemplate = async () => {
        try { await transactionApi.downloadTemplate(); }
        catch { setUploadError("Failed to download template."); }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadError("");
        setUploadLoading(true);
        setBulkSuccess("");
        try {
            const preview = await transactionApi.uploadPreview(file);
            setPreviewRows(preview.rows);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                || (err instanceof Error ? err.message : "Failed to process file.");
            setUploadError(msg);
        } finally {
            setUploadLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDeletePreviewRow = (rowIdx: number) => {
        setPreviewRows((prev) => prev ? prev.filter((_, i) => i !== rowIdx) : null);
    };

    const handleCancelPreview = () => {
        setPreviewRows(null);
        setUploadError("");
    };

    const handleSaveBulk = async () => {
        if (!previewRows || previewRows.length === 0) return;
        const validRows = previewRows.filter((r) => r.errors.length === 0 && r.category_id !== null);
        if (validRows.length === 0) {
            setUploadError("No valid rows to save. Fix errors or remove invalid rows.");
            return;
        }
        setSavingBulk(true);
        setUploadError("");
        try {
            const result = await transactionApi.bulkSave(
                validRows.map((r) => ({
                    amount: r.amount,
                    category_id: r.category_id!,
                    note: r.note ?? undefined,
                    timestamp: r.timestamp,
                }))
            );
            setBulkSuccess(result.message);
            setPreviewRows(null);
            fetchStats();
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                || (err instanceof Error ? err.message : "Failed to save transactions.");
            setUploadError(msg);
        } finally {
            setSavingBulk(false);
        }
    };

    const getStatusStyle = (status?: string) => {
        if (status === "anomaly") return { bg: "bg-[#FEF2F2]", border: "border-[#FECACA]", text: "text-[#DC2626]", icon: <AlertCircle size={20} className="text-[#DC2626]" /> };
        if (status === "warning") return { bg: "bg-[#FFFBEB]", border: "border-[#FDE68A]", text: "text-[#D97706]", icon: <AlertTriangle size={20} className="text-[#D97706]" /> };
        return { bg: "bg-[#F0FDF4]", border: "border-[#BBF7D0]", text: "text-[#16A34A]", icon: <CheckCircle size={20} className="text-[#16A34A]" /> };
    };

    return (
        <div className="p-4 pb-24 md:p-8 md:pb-20">
            {/* Header */}
            <div className="mb-6 flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#1A1A1A]">Add Transaction</h1>
                    <p className="text-[#6B7280] text-sm mt-0.5">Record your spending and detect anomalies in real time</p>
                </div>
            </div>

            {/* Main Content Grid: Full width, 320px fixed sidebar */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">

                {/* ── LEFT COLUMN: WORKSPACE ── */}
                <div className="space-y-6">

                    {/* Result Alert */}
                    {result && (() => {
                        const style = getStatusStyle(result.anomaly_status);
                        return (
                            <div className={`p-6 rounded-2xl ${style.bg} border ${style.border} relative group`}>
                                <div className="flex items-start gap-4">
                                    <div className="p-2 rounded-xl bg-white/50">{style.icon}</div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-[#16A34A] mb-1">✓ Transaction saved successfully!</p>
                                        <p className={`font-medium text-[15px] leading-relaxed ${style.text}`}>{result.message}</p>

                                        {!result.is_excluded && result.anomaly_score !== undefined && (
                                            <div className="mt-4 max-w-lg">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <p className="text-[11px] uppercase tracking-wider font-bold text-[#6B7280]">Anomaly Probability</p>
                                                    <p className="text-sm font-black text-[#1A1A1A]">{(result.anomaly_score * 100).toFixed(1)}%</p>
                                                </div>
                                                <div className="h-2.5 bg-white/50 rounded-full overflow-hidden border border-[#00000005]">
                                                    <div className={`h-full rounded-full transition-all duration-700 ${result.anomaly_status === "anomaly" ? "bg-[#DC2626]" :
                                                        result.anomaly_status === "warning" ? "bg-[#F59E0B]" : "bg-[#16A34A]"
                                                        }`} style={{ width: `${(result.anomaly_score * 100).toFixed(1)}%` }} />
                                                </div>
                                                <div className="flex justify-between text-[10px] font-bold text-[#9CA3AF] mt-1.5 uppercase tracking-tighter">
                                                    <span>Normal</span>
                                                    <span>Warning ({thresholds.warning}%)</span>
                                                    <span>Anomaly ({thresholds.anomaly}%)</span>
                                                </div>
                                            </div>
                                        )}
                                        {result.is_excluded && <p className="text-xs font-semibold text-[#6B7280] mt-2 bg-white/50 inline-block px-2 py-1 rounded-lg">Category not monitored for anomalies</p>}
                                    </div>
                                    <button onClick={() => setResult(null)} className="text-[#9CA3AF] hover:text-[#6B7280] p-1 opacity-0 group-hover:opacity-100 transition-opacity"><X size={18} /></button>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Transaction Form Card */}
                    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
                        {error && <div className="mb-6 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">{error}</div>}

                        <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8 max-w-3xl">

                            {/* LARGE Amount Input */}
                            <div>
                                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">Amount (Rp)</label>
                                <div className="relative group">
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-3xl font-bold transition-colors group-focus-within:text-[#1A1A1A]">Rp</span>
                                    <input type="text" 
                                        inputMode="numeric" 
                                        value={amountDisplay} 
                                        onChange={handleAmountChange}
                                        placeholder="0" 
                                        className="w-full pl-16 pr-0 py-2 border-b-2 border-[#E5E7EB] bg-transparent text-[#1A1A1A] font-black text-5xl placeholder-[#D1D5DB] focus:outline-none focus:border-[#1A1A1A] transition-colors" />
                                </div>
                                {amount && <p className="text-xs font-bold text-[#9CA3AF] mt-3 tracking-wide">{formatRupiah(parseInt(amount) || 0)}</p>}
                            </div>

                            {/* Wide Category Selector */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Category</label>
                                    <div className="relative group">
                                        <button
                                            type="button"
                                            onClick={() => setShowCategoryInfo(true)}
                                            className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#F3F4F6] hover:bg-[#1A1A1A] hover:text-white text-[#6B7280] transition-all text-[10px] font-bold uppercase tracking-wide"
                                        >
                                            <Info size={11} />

                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                                    {categories.map((cat) => (
                                        <button key={cat.id} type="button" onClick={() => setCategoryId(cat.id)}
                                            className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-[13px] font-bold transition-all ${categoryId === cat.id
                                                ? "border-[#1A1A1A] bg-[#1A1A1A] text-white shadow-md scale-[1.02]"
                                                : "border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] hover:border-[#9CA3AF] hover:bg-white"
                                                }`}>
                                            <span className="text-2xl">{CATEGORY_ICONS[cat.name] || "💳"}</span>
                                            <span className="text-center leading-tight">{cat.name}</span>
                                            {cat.is_excluded && <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase ${categoryId === cat.id ? "bg-white/20 text-white" : "bg-[#EBEBEB] text-[#9CA3AF]"}`}>no scan</span>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Note & Timestamp (Side by side on wider screens) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">Note <span className="text-[#9CA3AF] font-normal lowercase">(optional)</span></label>
                                    <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Lunch with team"
                                        className="w-full px-5 py-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#1A1A1A] font-medium placeholder-[#D1D5DB] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:bg-white transition-all text-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">Date & Time</label>
                                    <input type="datetime-local" value={timestamp} onChange={(e) => setTimestamp(e.target.value)} required
                                        className="w-full px-5 py-4 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#1A1A1A] font-medium focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:bg-white transition-all text-sm" />
                                </div>
                            </div>

                            <button type="submit" disabled={loading || !categoryId || !amount   }
                                className="w-full md:w-auto px-10 py-4 rounded-xl bg-[#1A1A1A] text-white font-bold text-[15px] hover:bg-[#333] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3">
                                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {loading ? "Analyzing..." : "Save Transaction"}
                            </button>
                        </form>
                    </div>

                    {/* ── Bulk Upload Card ── */}
                    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
                        <div className="flex items-start gap-4 mb-5">
                            <div className="p-2.5 rounded-xl bg-[#F3F4F6]">
                                <FileSpreadsheet size={22} className="text-[#374151]" />
                            </div>
                            <div>
                                <h2 className="text-[15px] font-bold text-[#1A1A1A]">Bulk Upload via Excel</h2>
                                <p className="text-[13px] text-[#6B7280] mt-0.5">Add multiple transactions at once — download the template, fill in your data, then upload.</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            {/* Download Template */}
                            <button
                                type="button"
                                onClick={handleDownloadTemplate}
                                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#374151] font-semibold text-sm hover:border-[#1A1A1A] hover:bg-white transition-all"
                            >
                                <Download size={16} />
                                Download Template
                            </button>

                            {/* Upload Excel */}
                            <button
                                type="button"
                                disabled={uploadLoading}
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-[#1A1A1A] text-white font-semibold text-sm hover:bg-[#333] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {uploadLoading
                                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    : <Upload size={16} />
                                }
                                {uploadLoading ? "Processing…" : "Upload Excel File"}
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>

                        {/* Bulk success banner */}
                        {bulkSuccess && (
                            <div className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] text-sm font-semibold">
                                <CheckCircle size={16} />
                                {bulkSuccess}
                            </div>
                        )}

                        {/* Upload error banner */}
                        {uploadError && (
                            <div className="mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">
                                <AlertOctagon size={16} className="mt-0.5 shrink-0" />
                                <span>{uploadError}</span>
                            </div>
                        )}

                        <p className="text-[11px] text-[#9CA3AF] mt-4 font-medium">
                            Accepted formats: <span className="font-bold">.xlsx, .xls, .csv</span> &nbsp;·&nbsp; Required columns: <span className="font-bold">date, amount, category</span> &nbsp;·&nbsp; Optional: <span className="font-bold">note</span>
                        </p>
                    </div>

                    {/* ── Inline Preview ── */}
                    {previewRows && (() => {
                        const validCount = previewRows.filter((r) => r.errors.length === 0 && r.category_id !== null).length;
                        const invalidCount = previewRows.length - validCount;
                        return (
                            <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
                                {/* Preview Header */}
                                <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between gap-4 flex-wrap">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-xl bg-[#F3F4F6]">
                                            <FileSpreadsheet size={18} className="text-[#374151]" />
                                        </div>
                                        <div>
                                            <h3 className="text-[14px] font-bold text-[#1A1A1A]">
                                                Data Preview
                                                <span className="ml-2 text-[12px] font-semibold text-[#9CA3AF]">({previewRows.length} row{previewRows.length !== 1 ? "s" : ""})</span>
                                            </h3>
                                            <p className="text-[11px] text-[#6B7280] mt-0.5">
                                                <span className="text-[#16A34A] font-semibold">{validCount} valid</span>
                                                {invalidCount > 0 && <span className="text-[#DC2626] font-semibold"> &nbsp;·&nbsp; {invalidCount} with errors</span>}
                                                &nbsp;·&nbsp; Remove unwanted rows, then save
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {uploadError && <p className="text-[12px] text-[#DC2626] font-medium">{uploadError}</p>}
                                        <button
                                            type="button"
                                            onClick={handleCancelPreview}
                                            className="px-4 py-2 rounded-xl border border-[#E5E7EB] text-[#374151] font-semibold text-sm hover:border-[#9CA3AF] transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            disabled={savingBulk || validCount === 0}
                                            onClick={handleSaveBulk}
                                            className="px-4 py-2 rounded-xl bg-[#1A1A1A] text-white font-semibold text-sm hover:bg-[#333] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            {savingBulk && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                            {savingBulk ? "Saving…" : `Save ${validCount} Transaction${validCount !== 1 ? "s" : ""}`}
                                        </button>
                                    </div>
                                </div>

                                {/* Table */}
                                <div className="overflow-auto max-h-130">
                                    <table className="w-full text-sm border-collapse">
                                        <thead className="sticky top-0 bg-[#F9FAFB] border-b border-[#E5E7EB] z-10">
                                            <tr>
                                                {["#", "Date & Time", "Amount (Rp)", "Category", "Note", "Anomaly Score", "Status", ""].map((h) => (
                                                    <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider whitespace-nowrap">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewRows.map((row, idx) => {
                                                const hasError = row.errors.length > 0;
                                                const rowBg = hasError
                                                    ? "bg-[#FEF2F2]"
                                                    : row.anomaly_status === "anomaly"
                                                        ? "bg-[#FEF2F2]"
                                                        : row.anomaly_status === "warning"
                                                            ? "bg-[#FFFBEB]"
                                                            : "bg-white";

                                                const statusBadge = () => {
                                                    if (hasError) return (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEE2E2] text-[#DC2626]">
                                                            <AlertOctagon size={10} /> Error
                                                        </span>
                                                    );
                                                    if (row.is_excluded) return (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F3F4F6] text-[#6B7280]">
                                                            No Scan
                                                        </span>
                                                    );
                                                    if (row.anomaly_status === "anomaly") return (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEE2E2] text-[#DC2626]">
                                                            <AlertCircle size={10} /> Anomaly
                                                        </span>
                                                    );
                                                    if (row.anomaly_status === "warning") return (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#D97706]">
                                                            <AlertTriangle size={10} /> Warning
                                                        </span>
                                                    );
                                                    if (row.anomaly_status === "normal") return (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#DCFCE7] text-[#16A34A]">
                                                            <CheckCircle size={10} /> Normal
                                                        </span>
                                                    );
                                                    return <span className="text-[#9CA3AF] text-[10px]">—</span>;
                                                };

                                                return (
                                                    <tr key={idx} className={`${rowBg} border-b border-[#F3F4F6] hover:brightness-[0.97] transition-all`}>
                                                        <td className="px-4 py-3 text-[12px] font-bold text-[#9CA3AF]">{row._row}</td>
                                                        <td className="px-4 py-3 text-[13px] font-medium text-[#374151] whitespace-nowrap">
                                                            {new Date(row.timestamp).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
                                                        </td>
                                                        <td className="px-4 py-3 text-[13px] font-black text-[#1A1A1A] whitespace-nowrap">
                                                            {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(row.amount)}
                                                        </td>
                                                        <td className="px-4 py-3 whitespace-nowrap">
                                                            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#374151]">
                                                                <span>{CATEGORY_ICONS[row.category_name] || "💳"}</span>
                                                                {row.category_name}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-[13px] text-[#6B7280] max-w-40 truncate">
                                                            {row.note || <span className="text-[#D1D5DB]">—</span>}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {row.anomaly_score !== null && !row.is_excluded ? (
                                                                <div className="flex items-center gap-2 min-w-30">
                                                                    <div className="flex-1 h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full ${row.anomaly_status === "anomaly" ? "bg-[#DC2626]" : row.anomaly_status === "warning" ? "bg-[#F59E0B]" : "bg-[#16A34A]"}`}
                                                                            style={{ width: `${((row.anomaly_score ?? 0) * 100).toFixed(1)}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[11px] font-black text-[#374151] tabular-nums">
                                                                        {((row.anomaly_score ?? 0) * 100).toFixed(1)}%
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[#D1D5DB] text-[12px]">—</span>
                                                            )}
                                                            {hasError && (
                                                                <p className="text-[10px] text-[#DC2626] font-medium mt-1 max-w-40">
                                                                    {row.errors.join("; ")}
                                                                </p>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">{statusBadge()}</td>
                                                        <td className="px-4 py-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeletePreviewRow(idx)}
                                                                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-[#DC2626] hover:bg-[#FEF2F2] transition-all"
                                                                title="Remove row"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {previewRows.length === 0 && (
                                        <div className="py-10 text-center text-sm text-[#9CA3AF] font-medium">
                                            All rows removed. Click <span className="font-bold">Cancel</span> to dismiss.
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                </div>

                {/* ── RIGHT COLUMN: INSIGHTS ── */}
                <div className="space-y-4 xl:sticky xl:top-8">

                    {/* Monthly Budget Card */}
                    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold text-[#1A1A1A]">Monthly Budget</h2>
                            {statsLoading ? (
                                <div className="w-3 h-3 border-2 border-[#1A1A1A]/20 border-t-[#1A1A1A] rounded-full animate-spin" />
                            ) : (
                                <span className="text-[11px] font-bold text-[#1A1A1A] uppercase tracking-widest bg-[#F3F4F6] px-2 py-1 rounded-lg">
                                    {new Date().toLocaleString('default', { month: 'long' })}
                                </span>
                            )}
                        </div>

                        {categoryStats ? (() => {
                            const totalSpend = Object.values(categoryStats.by_category).reduce((s, v) => s + v.total, 0);
                            const sortedCats = Object.entries(categoryStats.by_category)
                                .sort(([, a], [, b]) => b.total - a.total);
                            return (
                                <>
                                    <div className="mb-5 pb-5 border-b border-[#F3F4F6]">
                                        <p className="text-[11px] text-[#6B7280] font-medium uppercase tracking-wider">Total Recorded</p>
                                        <p className="text-3xl font-black text-[#1A1A1A] mt-1.5 tracking-tight">
                                            {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(totalSpend)}
                                        </p>
                                        <p className="text-[11px] text-[#9CA3AF] font-bold mt-2 uppercase">{categoryStats.total_transactions} transactions</p>
                                    </div>
                                    <div className="space-y-4">
                                        {sortedCats.slice(0, 5).map(([cat, stat]) => {
                                            const pct = totalSpend > 0 ? (stat.total / totalSpend) * 100 : 0;
                                            const isCatExcluded = categories.find(c => c.name === cat)?.is_excluded;
                                            return (
                                                <div key={cat} className="group">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg group-hover:scale-110 transition-transform">{CATEGORY_ICONS[cat] || "💳"}</span>
                                                            <span className="text-xs font-bold text-[#374151]">{cat}</span>
                                                        </div>
                                                        <span className="text-xs font-black text-[#1A1A1A]">
                                                            {new Intl.NumberFormat("id-ID", { notation: "compact", currency: "IDR", style: "currency", minimumFractionDigits: 0 }).format(stat.total)}
                                                        </span>
                                                    </div>
                                                    <div className="h-2 bg-[#F9FAFB] border border-[#F3F4F6] rounded-full overflow-hidden mb-1.5">
                                                        <div className={`h-full rounded-full transition-all duration-1000 ${stat.anomaly_count > 0 ? "bg-[#DC2626]" : "bg-[#1A1A1A]"
                                                            }`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-bold text-[#9CA3AF] uppercase tracking-tighter">{pct.toFixed(0)}%</span>
                                                        {isCatExcluded ? (
                                                            <span className="text-[9px] font-bold text-[#D1D5DB] uppercase">No Scan</span>
                                                        ) : stat.anomaly_count > 0 ? (
                                                            <span className="text-[9px] text-[#DC2626] font-black uppercase tracking-tighter flex items-center gap-1">
                                                                {stat.anomaly_count} Anomaly
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-[#16A34A] font-bold">✓</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            );
                        })() : (
                            <div className="py-8 text-center text-sm text-[#9CA3AF] font-medium italic">No transactions this month.</div>
                        )}
                    </div>

                </div>

            </div > {/* end grid */}

            {/* ── Category Guide Modal ── */}
            {
                showCategoryInfo && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm"
                        style={{ background: "rgba(10, 10, 10, 0.6)" }}
                        onClick={(e) => { if (e.target === e.currentTarget) setShowCategoryInfo(false); }}
                    >
                        <div className="bg-[#F9FAFB] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-[#EBEBEB] animate-in fade-in zoom-in-95 duration-200">
                            {/* Modal Header */}
                            <div className="flex items-center justify-between px-8 py-6 bg-white border-b border-[#EBEBEB] shrink-0">
                                <div>
                                    <h2 className="text-xl font-black text-[#1A1A1A] tracking-tight">Category Guide</h2>
                                    <p className="text-sm text-[#6B7280] mt-1 font-medium">What each category covers & whether it's scanned for anomalies</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowCategoryInfo(false)}
                                    className="p-2.5 rounded-full bg-[#F3F4F6] text-[#6B7280] hover:text-[#1A1A1A] hover:bg-[#E5E7EB] hover:rotate-90 transition-all duration-300"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="overflow-y-auto flex-1 px-8 py-6 space-y-8 custom-scrollbar">

                                {/* Section: AI Monitored */}
                                <section>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#E5E7EB] to-transparent" />
                                        <span className="text-xs font-black text-[#1A1A1A] uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-[#EBEBEB] shadow-sm flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
                                            Actively Monitored
                                        </span>
                                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#E5E7EB] to-transparent" />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {Object.entries(CATEGORY_DESCRIPTIONS)
                                            .filter(([, desc]) => !desc.includes("(Not monitored"))
                                            .map(([cat, desc]) => (
                                                <div key={cat} className="group bg-white p-4 rounded-2xl border border-[#EBEBEB] hover:border-[#1A1A1A] hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-300 cursor-default">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <span className="text-3xl group-hover:scale-125 group-hover:rotate-6 transition-transform duration-300 origin-bottom-left">
                                                            {CATEGORY_ICONS[cat] || "💳"}
                                                        </span>
                                                        <h3 className="text-sm font-black text-[#1A1A1A]">{cat}</h3>
                                                    </div>
                                                    <p className="text-[13px] text-[#6B7280] leading-relaxed font-medium">
                                                        {desc}
                                                    </p>
                                                </div>
                                            ))}
                                    </div>
                                </section>

                                {/* Section: AI Ignored */}
                                <section>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#E5E7EB] to-transparent" />
                                        <span className="text-xs font-black text-[#6B7280] uppercase tracking-widest bg-[#F3F4F6] px-3 py-1 rounded-full border border-[#EBEBEB] flex items-center gap-1.5">
                                            <AlertCircle size={12} />
                                            AI Blindspots
                                        </span>
                                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#E5E7EB] to-transparent" />
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        {Object.entries(CATEGORY_DESCRIPTIONS)
                                            .filter(([, desc]) => desc.includes("(Not monitored"))
                                            .map(([cat, desc]) => {
                                                const cleanDesc = desc.replace(/ \(Not monitored[^)]*\)/, "");
                                                return (
                                                    <div key={cat} className="group flex items-start sm:items-center gap-4 bg-white p-4 rounded-2xl border border-dashed border-[#D1D5DB] hover:border-[#9CA3AF] hover:bg-[#F9FAFB] transition-colors cursor-default">
                                                        <span className="text-3xl grayscale group-hover:grayscale-0 transition-all duration-300">{CATEGORY_ICONS[cat] || "💳"}</span>
                                                        <div className="flex-1">
                                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                                <h3 className="text-sm font-black text-[#1A1A1A]">{cat}</h3>
                                                                <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-[#1A1A1A] text-white uppercase tracking-widest">NO SCAN</span>
                                                            </div>
                                                            <p className="text-[12px] text-[#6B7280] leading-relaxed font-medium">
                                                                {cleanDesc}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </section>

                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
