"use client";

import { useEffect, useState } from "react";

import { categoryApi, settingsApi, statsApi, syncThresholdCache, transactionApi, type Category, type Stats } from "@/lib/api";
import { CheckCircle, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!categoryId) return;
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

    const getStatusStyle = (status?: string) => {
        if (status === "anomaly") return { bg: "bg-[#FEF2F2]", border: "border-[#FECACA]", text: "text-[#DC2626]", icon: <AlertCircle size={20} className="text-[#DC2626]" /> };
        if (status === "warning") return { bg: "bg-[#FFFBEB]", border: "border-[#FDE68A]", text: "text-[#D97706]", icon: <AlertTriangle size={20} className="text-[#D97706]" /> };
        return { bg: "bg-[#F0FDF4]", border: "border-[#BBF7D0]", text: "text-[#16A34A]", icon: <CheckCircle size={20} className="text-[#16A34A]" /> };
    };

    return (
        <div className="p-8 pb-20">
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

                        <form onSubmit={handleSubmit} className="space-y-8 max-w-3xl">

                            {/* LARGE Amount Input */}
                            <div>
                                <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">Amount (Rp)</label>
                                <div className="relative group">
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-3xl font-bold transition-colors group-focus-within:text-[#1A1A1A]">Rp</span>
                                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0" required min="1"
                                        className="w-full pl-16 pr-0 py-2 border-b-2 border-[#E5E7EB] bg-transparent text-[#1A1A1A] font-black text-5xl placeholder-[#D1D5DB] focus:outline-none focus:border-[#1A1A1A] transition-colors" />
                                </div>
                                {amount && <p className="text-xs font-bold text-[#9CA3AF] mt-3 tracking-wide">{formatRupiah(parseFloat(amount) || 0)}</p>}
                            </div>

                            {/* Wide Category Selector */}
                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <label className="text-xs font-bold text-[#6B7280] uppercase tracking-wider">Category</label>
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

                            <button type="submit" disabled={loading || !categoryId}
                                className="w-full md:w-auto px-10 py-4 rounded-xl bg-[#1A1A1A] text-white font-bold text-[15px] hover:bg-[#333] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3">
                                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                                {loading ? "Analyzing..." : "Save Transaction"}
                            </button>
                        </form>
                    </div>

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

                    {/* Permanent Category Guide Card */}
                    <div className="bg-[#1A1A1A] rounded-2xl p-5 text-white">
                        <div className="flex items-center gap-2 mb-4">
                            <Info size={18} className="text-[#9CA3AF]" />
                            <h2 className="text-sm font-semibold text-white">Category Guide</h2>
                        </div>
                        <div className="space-y-5">
                            {Object.entries(CATEGORY_DESCRIPTIONS).slice(0, 4).map(([cat, desc]) => (
                                <div key={cat} className="flex gap-3 items-start border-l-[3px] border-[#333] pl-3">
                                    <span className="text-xl shrink-0 leading-none">{CATEGORY_ICONS[cat]}</span>
                                    <div>
                                        <p className="text-[13px] font-bold text-white mb-1">{cat}</p>
                                        <p className="text-[11px] text-[#9CA3AF] leading-relaxed line-clamp-2">{desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] font-bold text-[#6B7280] uppercase tracking-widest mt-6 text-center border-t border-white/10 pt-4">
                            SpendIt Engine v1.0
                        </p>
                    </div>

                </div>

            </div>{/* end grid */}

            {/* The modal is no longer needed as the guide is permanently in the sidebar */}
        </div>
    );
}
