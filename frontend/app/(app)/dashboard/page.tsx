"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { statsApi, transactionApi, modelApi, incomeApi, type Stats, type Transaction, type ColdStartStatus, type Balance } from "@/lib/api";
import { AlertTriangle, TrendingUp, TrendingDown, Wallet, Plus, Bell, RefreshCw, Sparkles, ArrowUp, ArrowDown, Minus, ChevronLeft, ChevronRight, ChevronDown, ArrowUpDown } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
    Food: "#FF6B6B", Transport: "#4ECDC4", Lifestyle: "#45B7D1",
    Entertainment: "#96CEB4", Utilities: "#FFEAA7", Telecommunication: "#DDA0DD",
    Subscription: "#98D8C8", Health: "#FF8C94", Education: "#A8E6CF", "Big Expense": "#FFD3A5",
};
const CATEGORY_ICONS: Record<string, string> = {
    Food: "🍔", Transport: "🚗", Lifestyle: "👕", Entertainment: "🎮",
    Utilities: "💡", Telecommunication: "📱", Subscription: "📺",
    Health: "🏥", Education: "📚", "Big Expense": "💰",
};
const MONTHS_ID = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatRupiah(amount: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}
function formatRupiahShort(amount: number) {
    if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)} Mil`;
    if (amount >= 1_000)     return `Rp ${(amount / 1_000).toFixed(0)} K`;
    return `Rp ${amount}`;
}
function formatLastTrained(dateStr: string) {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1)    return "just now";
    if (diff < 60)   return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
}

interface MonthlyStats    { month: number; year: number; label: string; total_amount: number; transaction_count: number; anomaly_count: number; }
interface MonthlyBalance  { month: number; year: number; label: string; income: number; spent: number; balance: number; }
interface LowDataCategory { category: string; count: number; min_required: number; }
interface ModelStatus     { status: string; message: string; transaction_count?: number; last_trained?: string; }

export default function DashboardPage() {
    const now    = new Date();
    const todayM = now.getMonth() + 1;
    const todayY = now.getFullYear();

    // Month selector state
    const [viewMonth, setViewMonth] = useState(todayM);
    const [viewYear,  setViewYear]  = useState(todayY);
    const [showPicker, setShowPicker] = useState(false);
    const [pickerYear, setPickerYear] = useState(todayY);
    const pickerRef = useRef<HTMLDivElement>(null);

    const isCurrentMonth = viewMonth === todayM && viewYear === todayY;

    // Monthly Summary year pagination
    const [summaryYear, setSummaryYear]         = useState(todayY);
    const [showYearPicker, setShowYearPicker]   = useState(false);
    const summaryYearPickerRef                  = useRef<HTMLDivElement>(null);

    // Monthly Summary sort
    const [sortCol, setSortCol] = useState<"month" | "income" | "spent" | "balance">("month");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const prevMonth = viewMonth === 1 ? 12 : viewMonth - 1;
    const prevYear  = viewMonth === 1 ? viewYear - 1 : viewYear;
    const monthLabel = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Data state
    const [user, setUser]                   = useState<{ name: string } | null>(null);
    const [stats, setStats]                 = useState<Stats | null>(null);
    const [prevStats, setPrevStats]         = useState<Stats | null>(null);
    const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
    const [coldStart, setColdStart]         = useState<ColdStartStatus | null>(null);
    const [modelStatus, setModelStatus]     = useState<ModelStatus | null>(null);
    const [monthlyStats, setMonthlyStats]   = useState<MonthlyStats[]>([]);
    const [monthlyBalance, setMonthlyBalance] = useState<MonthlyBalance[]>([]);
    const [balance, setBalance]             = useState<Balance | null>(null);
    const [loading, setLoading]             = useState(true);
    const [retraining, setRetraining]       = useState(false);
    const [retrainSuccess, setRetrainSuccess] = useState(false);
    const [lowDataCategories, setLowDataCategories] = useState<LowDataCategory[]>([]);

    // Close picker on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (summaryYearPickerRef.current && !summaryYearPickerRef.current.contains(e.target as Node)) setShowYearPicker(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Static data — load once
    useEffect(() => {
        const stored = localStorage.getItem("user");
        if (stored) setUser(JSON.parse(stored));
        const fetchStatic = async () => {
            try {
                const [coldData, modelData, monthlyData, recentTx, monthlyBal] = await Promise.all([
                    modelApi.coldStartStatus(),
                    modelApi.modelStatus(),
                    statsApi.getMonthly(6),
                    transactionApi.getAll(todayM, todayY),
                    (incomeApi as any).getMonthlyBalance(),
                ]);
                setColdStart(coldData);
                setModelStatus(modelData);
                setMonthlyStats(monthlyData);
                setRecentTransactions(recentTx.slice(0, 5));
                setMonthlyBalance(monthlyBal);
            } catch (e) { console.error(e); }
        };
        fetchStatic();
    }, []);

    // Dynamic data — reload on month/year change
    useEffect(() => {
        const fetchMonthly = async () => {
            setLoading(true);
            try {
                const [statsData, prevStatsData, balanceData] = await Promise.all([
                    statsApi.get(viewMonth, viewYear),
                    statsApi.get(prevMonth, prevYear),
                    incomeApi.getBalance(viewMonth, viewYear),
                ]);
                setStats(statsData);
                setPrevStats(prevStatsData);
                setBalance(balanceData);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        fetchMonthly();
    }, [viewMonth, viewYear]);

    const handleRetrain = async () => {
        setRetraining(true); setRetrainSuccess(false); setLowDataCategories([]);
        try {
            const retrainData = await modelApi.retrain() as { low_data_categories?: LowDataCategory[] };
            const modelData   = await modelApi.modelStatus();
            setModelStatus(modelData);
            setLowDataCategories(retrainData.low_data_categories || []);
            setRetrainSuccess(true);
            setTimeout(() => setRetrainSuccess(false), 4000);
        } catch (e) { console.error(e); }
        finally { setRetraining(false); }
    };

    const goToPrevMonth = () => {
        if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };
    const goToNextMonth = () => {
        if (isCurrentMonth) return;
        if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };

    // Derived data
    const topCategories = stats
        ? Object.entries(stats.by_category)
            .map(([name, data]) => ({ name, total: data.total, count: data.count, anomaly_count: data.anomaly_count }))
            .sort((a, b) => b.total - a.total).slice(0, 5)
        : [];
    const totalSpend = topCategories.reduce((s, c) => s + c.total, 0) || 1;

    const momChange = (stats && prevStats && prevStats.total_amount > 0)
        ? ((stats.total_amount - prevStats.total_amount) / prevStats.total_amount) * 100
        : null;

    const pieData = stats ? Object.entries(stats.by_category).map(([name, data]) => ({ name, value: data.total })) : [];

    const anomalyTransactions = stats
        ? [] // will be fetched per selected month below
        : [];

    // Monthly balance — add % change, filter by summaryYear, sort
    const monthlyWithChange = monthlyBalance.map((row, idx) => {
        const prev = monthlyBalance[idx + 1]; // already sorted newest first
        const spentChange  = prev && prev.spent  > 0 ? ((row.spent  - prev.spent)  / prev.spent)  * 100 : null;
        const incomeChange = prev && prev.income > 0 ? ((row.income - prev.income) / prev.income) * 100 : null;
        return { ...row, spentChange, incomeChange };
    });

    const filteredMonthly = monthlyWithChange.filter(r => r.year === summaryYear);

    const sortedMonthly = [...filteredMonthly].sort((a, b) => {
        if (sortCol === "month") {
            // sort by time order
            const ta = a.year * 100 + a.month;
            const tb = b.year * 100 + b.month;
            return sortDir === "asc" ? ta - tb : tb - ta;
        }
        const va = a[sortCol as "income" | "spent" | "balance"];
        const vb = b[sortCol as "income" | "spent" | "balance"];
        return sortDir === "asc" ? va - vb : vb - va;
    });

    const handleSummarySort = (col: typeof sortCol) => {
        if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortCol(col); setSortDir(col === "month" ? "desc" : "desc"); }
    };

    // Available years in monthly balance data
    const availableYears = Array.from(new Set(monthlyBalance.map(r => r.year))).sort((a, b) => b - a);

    // Income MoM change for stat card
    const incomeChange = (balance && prevStats)
        ? (() => {
            // find prev month income from monthlyBalance
            const prevMon = monthlyBalance.find(r => r.month === prevMonth && r.year === prevYear);
            const currMon = monthlyBalance.find(r => r.month === viewMonth && r.year === viewYear);
            if (prevMon && prevMon.income > 0 && currMon)
                return ((currMon.income - prevMon.income) / prevMon.income) * 100;
            return null;
        })()
        : null;

    // Anomaly transactions for selected month
    const [monthAnomalies, setMonthAnomalies] = useState<Transaction[]>([]);
    useEffect(() => {
        const fetch = async () => {
            try {
                const txs = await transactionApi.getAll(viewMonth, viewYear);
                setMonthAnomalies(txs.filter(t => t.anomaly_status === "anomaly" || t.anomaly_status === "warning").slice(0, 5));
            } catch (e) { console.error(e); }
        };
        fetch();
    }, [viewMonth, viewYear]);

    return (
        <div className="p-4 md:p-8">

            {/* ── HEADER ── */}
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#1A1A1A]">
                        Good {now.getHours() < 12 ? "Morning" : now.getHours() < 17 ? "Afternoon" : "Evening"}, {user?.name?.split(" ")[0]} 👋
                    </h1>
                    <p className="text-[#6B7280] text-sm mt-0.5">
                        {now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                    </p>
                </div>
                <Link href="/add" className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors w-full sm:w-auto">
                    <Plus size={16} />Add Transaction
                </Link>
            </div>

            {/* ── SECTION: ALWAYS CURRENT MONTH ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Recent Transactions — col-span-1 */}
                <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="text-sm font-semibold text-[#1A1A1A]">Recent Expenses</h3>
                            <p className="text-xs text-[#9CA3AF] mt-0.5">{MONTHS_ID[todayM]} {todayY}</p>
                        </div>
                        <Link href="/transactions" className="text-xs text-[#6B7280] hover:text-[#1A1A1A]">See more detail</Link>
                    </div>
                    {recentTransactions.length > 0 ? (
                        <div className="space-y-2">
                            {recentTransactions.map(t => (
                                <div key={t.id} className="flex items-center justify-between py-1.5">
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-base">{CATEGORY_ICONS[t.category_name] || "💳"}</span>
                                        <div>
                                            <p className="text-xs font-medium text-[#1A1A1A]">{t.category_name}</p>
                                            <p className="text-xs text-[#9CA3AF]">{t.note || "—"}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs font-semibold text-[#1A1A1A]">{formatRupiahShort(t.amount)}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-[#9CA3AF] text-center py-6">No transactions yet.</p>
                    )}
                </div>

                {/* Monthly Summary cards — col-span-2 */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
                    {/* Header with year pagination */}
                    <div className="px-5 py-3 border-b border-[#EBEBEB] flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-[#1A1A1A]">Monthly Summary</h3>
                            <p className="text-xs text-[#9CA3AF] mt-0.5">Income, Expense, and Monthly Balance</p>
                        </div>
                        {/* Year navigator */}
                        <div className="relative flex items-center gap-1" ref={summaryYearPickerRef}>
                            <button
                                onClick={() => setSummaryYear(y => {
                                    const idx = availableYears.indexOf(y);
                                    return availableYears[idx + 1] ?? y;
                                })}
                                disabled={availableYears.indexOf(summaryYear) >= availableYears.length - 1}
                                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#6B7280] disabled:opacity-30 transition-colors">
                                <ChevronLeft size={14} />
                            </button>
                            <button
                                onClick={() => setShowYearPicker(v => !v)}
                                className="px-3 py-1 rounded-lg bg-[#F3F4F6] hover:bg-[#E5E7EB] text-sm font-semibold text-[#1A1A1A] transition-colors min-w-[52px] text-center">
                                {summaryYear}
                            </button>
                            <button
                                onClick={() => setSummaryYear(y => {
                                    const idx = availableYears.indexOf(y);
                                    return availableYears[idx - 1] ?? y;
                                })}
                                disabled={summaryYear >= todayY}
                                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#6B7280] disabled:opacity-30 transition-colors">
                                <ChevronRight size={14} />
                            </button>
                            {/* Year dropdown */}
                            {showYearPicker && availableYears.length > 0 && (
                                <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-[#EBEBEB] rounded-xl shadow-lg py-1 min-w-[80px]">
                                    {availableYears.map(y => (
                                        <button key={y} onClick={() => { setSummaryYear(y); setShowYearPicker(false); }}
                                            className={`w-full px-4 py-1.5 text-sm text-left hover:bg-[#F3F4F6] transition-colors ${y === summaryYear ? "font-bold text-[#1A1A1A]" : "text-[#6B7280]"}`}>
                                            {y}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Sortable header */}
                    <div className="grid grid-cols-4 px-5 py-2.5 bg-[#F9FAFB] border-b border-[#EBEBEB] text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                        <button onClick={() => handleSummarySort("month")} className="flex items-center gap-1 hover:text-[#1A1A1A] transition-colors">
                            Bulan {sortCol === "month" ? (sortDir === "asc" ? <ArrowUp size={10}/> : <ArrowDown size={10}/>) : <ArrowUpDown size={10} className="opacity-30"/>}
                        </button>
                        <button onClick={() => handleSummarySort("income")} className="flex items-center justify-end gap-1 hover:text-[#1A1A1A] transition-colors">
                            Income {sortCol === "income" ? (sortDir === "asc" ? <ArrowUp size={10}/> : <ArrowDown size={10}/>) : <ArrowUpDown size={10} className="opacity-30"/>}
                        </button>
                        <button onClick={() => handleSummarySort("spent")} className="flex items-center justify-end gap-1 hover:text-[#1A1A1A] transition-colors">
                            Expense {sortCol === "spent" ? (sortDir === "asc" ? <ArrowUp size={10}/> : <ArrowDown size={10}/>) : <ArrowUpDown size={10} className="opacity-30"/>}
                        </button>
                        <button onClick={() => handleSummarySort("balance")} className="flex items-center justify-end gap-1 hover:text-[#1A1A1A] transition-colors">
                            Balance {sortCol === "balance" ? (sortDir === "asc" ? <ArrowUp size={10}/> : <ArrowDown size={10}/>) : <ArrowUpDown size={10} className="opacity-30"/>}
                        </button>
                    </div>
                    <div className="divide-y divide-[#F3F4F6] max-h-64 overflow-y-auto">
                        {sortedMonthly.length === 0 ? (
                            <p className="text-xs text-[#9CA3AF] text-center py-8">Tidak ada data untuk {summaryYear}.</p>
                        ) : sortedMonthly.map(row => {
                            const isNow = row.month === todayM && row.year === todayY;
                            return (
                                <div key={`${row.year}-${row.month}`}
                                    className={`grid grid-cols-4 px-5 py-3 items-center ${isNow ? "bg-[#F8FAFF]" : "hover:bg-[#FAFAFA]"} transition-colors`}>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-medium text-[#1A1A1A]">{row.label}</span>
                                        {isNow && <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#EEF2FF] text-[#4F46E5] font-semibold">Now</span>}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-[#1A1A1A]">{formatRupiah(row.income)}</p>
                                        {row.incomeChange !== null && (
                                            <span className={`text-xs flex items-center justify-end gap-0.5 ${row.incomeChange > 0 ? "text-[#16A34A]" : row.incomeChange < 0 ? "text-[#DC2626]" : "text-[#9CA3AF]"}`}>
                                                {row.incomeChange > 0 ? <ArrowUp size={9}/> : row.incomeChange < 0 ? <ArrowDown size={9}/> : <Minus size={9}/>}
                                                {Math.abs(row.incomeChange).toFixed(1)}%
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-[#1A1A1A]">{formatRupiah(row.spent)}</p>
                                        {row.spentChange !== null && (
                                            <span className={`text-xs flex items-center justify-end gap-0.5 ${row.spentChange > 0 ? "text-[#DC2626]" : row.spentChange < 0 ? "text-[#16A34A]" : "text-[#9CA3AF]"}`}>
                                                {row.spentChange > 0 ? <ArrowUp size={9}/> : row.spentChange < 0 ? <ArrowDown size={9}/> : <Minus size={9}/>}
                                                {Math.abs(row.spentChange).toFixed(1)}%
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-semibold ${row.balance >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}`}>
                                            {row.balance >= 0 ? "+" : ""}{formatRupiah(row.balance)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ── MODEL STATUS ── */}
            {coldStart && !coldStart.is_ready && (
                <div className="mb-6 p-4 rounded-2xl bg-[#FEF3E8] border border-[#FED7AA] flex items-start gap-3">
                    <AlertTriangle size={18} className="text-[#F97316] mt-0.5 shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-[#9A3412]">Building your personal model</p>
                        <p className="text-xs text-[#C2410C] mt-0.5">{coldStart.total_transactions}/{coldStart.min_global} expenses. Using global model for now.</p>
                        <div className="mt-2 h-1.5 bg-[#FED7AA] rounded-full overflow-hidden">
                            <div className="h-full bg-[#F97316] rounded-full" style={{ width: `${coldStart.progress_global}%` }} />
                        </div>
                    </div>
                    <span className="text-sm font-bold text-[#F97316]">{Math.round(coldStart.progress_global)}%</span>
                </div>
            )}
            {modelStatus && (
                <div className="mb-6 flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${modelStatus.status === "personal" ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#E0E7FF] text-[#3730A3]"}`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {modelStatus.status === "personal" ? "Personal Model Active" : "Global Model (Cold Start)"}
                    </span>
                    {modelStatus.status === "personal" && modelStatus.last_trained && (
                        <span className="text-xs text-[#9CA3AF]">Last trained {formatLastTrained(modelStatus.last_trained)} · {modelStatus.transaction_count} expenses</span>
                    )}
                    {coldStart?.is_ready && (
                        <button onClick={handleRetrain} disabled={retraining}
                            className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
                                retrainSuccess ? "bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7]"
                                : modelStatus.status === "personal" ? "bg-white border border-[#EBEBEB] text-[#6B7280] hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
                                : "bg-[#1A1A1A] text-white hover:bg-[#333]"}`}>
                            {retrainSuccess ? <>✓ Model Updated</>
                                : retraining ? <><RefreshCw size={12} className="animate-spin" />Training...</>
                                : modelStatus.status === "personal" ? <><RefreshCw size={12} />Retrain Model</>
                                : <><Sparkles size={12} />Personalize Now</>}
                        </button>
                    )}
                </div>
            )}
            {lowDataCategories.length > 0 && (
                <div className="mb-6 p-4 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A]">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={16} className="text-[#D97706] mt-0.5 shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-[#92400E]">Some categories need more data</p>
                            <p className="text-xs text-[#B45309] mt-0.5 mb-3">These categories may produce false anomaly alerts.</p>
                            <div className="space-y-2">
                                {lowDataCategories.map(cat => (
                                    <div key={cat.category} className="flex items-center gap-3">
                                        <span className="text-xs text-[#92400E] w-32 font-medium">{cat.category}</span>
                                        <div className="flex-1 h-1.5 bg-[#FDE68A] rounded-full overflow-hidden">
                                            <div className="h-full bg-[#F59E0B] rounded-full" style={{ width: `${Math.min((cat.count / cat.min_required) * 100, 100)}%` }} />
                                        </div>
                                        <span className="text-xs text-[#B45309] w-16 text-right">{cat.count}/{cat.min_required}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <button onClick={() => setLowDataCategories([])} className="text-[#D97706] text-xs">✕</button>
                    </div>
                </div>
            )}

            {/* ── MONTH SELECTOR (seperti income page) ── */}
            <div className="relative mb-6" ref={pickerRef}>
                <div className="flex items-center justify-between bg-white border border-[#EBEBEB] rounded-2xl px-4 py-3">
                    <button onClick={goToPrevMonth}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm text-[#6B7280] hover:text-[#1A1A1A] hover:bg-[#F3F4F6] transition-all">
                        <ChevronLeft size={16} />
                    </button>
                    <button onClick={() => { setPickerYear(viewYear); setShowPicker(v => !v); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-[#F3F4F6] transition-all">
                        <span className="text-sm font-semibold text-[#1A1A1A]">{monthLabel}</span>
                        {isCurrentMonth && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[#F0FDF4] text-[#16A34A] font-semibold border border-[#BBF7D0]">This month</span>
                        )}
                        <ChevronDown size={14} className={`text-[#9CA3AF] transition-transform ${showPicker ? "rotate-180" : ""}`} />
                    </button>
                    <button onClick={goToNextMonth} disabled={isCurrentMonth}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm text-[#6B7280] hover:text-[#1A1A1A] hover:bg-[#F3F4F6] transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                        <ChevronRight size={16} />
                    </button>
                </div>

                {showPicker && (
                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 bg-white border border-[#EBEBEB] rounded-2xl shadow-xl p-4 w-72">
                        <div className="flex items-center justify-between mb-3">
                            <button onClick={() => setPickerYear(y => y - 1)} className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#6B7280]"><ChevronLeft size={16} /></button>
                            <span className="text-sm font-bold text-[#1A1A1A]">{pickerYear}</span>
                            <button onClick={() => setPickerYear(y => y + 1)} disabled={pickerYear >= todayY}
                                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#6B7280] disabled:opacity-30"><ChevronRight size={16} /></button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                            {MONTHS_ID.slice(1).map((name, idx) => {
                                const m = idx + 1;
                                const isFuture   = pickerYear > todayY || (pickerYear === todayY && m > todayM);
                                const isSelected = m === viewMonth && pickerYear === viewYear;
                                const isCurrent  = m === todayM && pickerYear === todayY;
                                return (
                                    <button key={m} disabled={isFuture}
                                        onClick={() => { setViewMonth(m); setViewYear(pickerYear); setShowPicker(false); }}
                                        className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                                            isFuture   ? "opacity-25 cursor-not-allowed text-[#9CA3AF]"
                                            : isSelected ? "bg-[#1A1A1A] text-white"
                                            : isCurrent  ? "bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]"
                                            : "text-[#374151] hover:bg-[#F3F4F6]"
                                        }`}>
                                        {name.slice(0, 3)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ── SECTION: FOLLOWS MONTH FILTER ── */}
            {loading ? (
                <div className="h-40 flex items-center justify-center text-[#9CA3AF] text-sm">Loading {monthLabel}...</div>
            ) : (<>

            {/* Stat Cards Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className={`rounded-2xl p-5 border ${(balance?.monthly_balance ?? 0) >= 0 ? "bg-[#F0FDF4] border-[#BBF7D0]" : "bg-[#FEF2F2] border-[#FECACA]"}`}>
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">Monthly Balance</p>
                        <Wallet size={14} className={(balance?.monthly_balance ?? 0) >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"} />
                    </div>
                    <p className={`text-2xl font-bold ${(balance?.monthly_balance ?? 0) >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"}`}>{formatRupiah(balance?.monthly_balance || 0)}</p>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">Income − Expense {monthLabel}</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-[#EBEBEB]">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">Income</p>
                        <TrendingUp size={14} className="text-[#16A34A]" />
                    </div>
                    <p className="text-2xl font-bold text-[#1A1A1A]">{formatRupiah(balance?.monthly_income || 0)}</p>
                    {incomeChange !== null ? (
                        <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            incomeChange > 0 ? "bg-[#F0FDF4] text-[#16A34A]" : incomeChange < 0 ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#F3F4F6] text-[#6B7280]"}`}>
                            {incomeChange > 0 ? <ArrowUp size={10}/> : incomeChange < 0 ? <ArrowDown size={10}/> : <Minus size={10}/>}
                            {Math.abs(incomeChange).toFixed(1)}% vs {MONTHS_SHORT[prevMonth]}
                        </div>
                    ) : (
                        <p className="text-xs text-[#9CA3AF] mt-0.5">{monthLabel}</p>
                    )}
                </div>
                <div className="bg-white rounded-2xl p-5 border border-[#EBEBEB]">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">Expense</p>
                        <TrendingDown size={14} className="text-[#6B7280]" />
                    </div>
                    <p className="text-2xl font-bold text-[#1A1A1A]">{formatRupiah(stats?.total_amount || 0)}</p>
                    {momChange !== null ? (
                        <div className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            momChange > 0 ? "bg-[#FEF2F2] text-[#DC2626]" : momChange < 0 ? "bg-[#F0FDF4] text-[#16A34A]" : "bg-[#F3F4F6] text-[#6B7280]"}`}>
                            {momChange > 0 ? <ArrowUp size={10}/> : momChange < 0 ? <ArrowDown size={10}/> : <Minus size={10}/>}
                            {Math.abs(momChange).toFixed(1)}% vs {MONTHS_SHORT[prevMonth]}
                        </div>
                    ) : (
                        <p className="text-xs text-[#9CA3AF] mt-0.5">{stats?.total_transactions || 0} transactions</p>
                    )}
                </div>
            </div>

            {/* Stat Cards Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-2xl p-5 border border-[#EBEBEB]">
                    <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">Total Balance</p>
                    <p className={`text-2xl font-bold mt-1 ${(balance?.total_balance ?? 0) >= 0 ? "text-[#1A1A1A]" : "text-[#DC2626]"}`}>{formatRupiah(balance?.total_balance || 0)}</p>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">All time</p>
                </div>
                <div className="bg-white rounded-2xl p-5 border border-[#EBEBEB]">
                    <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">Average / Expense</p>
                    <p className="text-2xl font-bold mt-1 text-[#1A1A1A]">{formatRupiah(stats?.average_amount || 0)}</p>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">{monthLabel}</p>
                </div>
                <div className={`${stats?.anomaly_count ? "bg-[#FEF2F2]" : "bg-white"} rounded-2xl p-5 border border-[#EBEBEB]`}>
                    <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">Anomalies Detected</p>
                    <p className={`text-2xl font-bold mt-1 ${stats?.anomaly_count ? "text-[#DC2626]" : "text-[#1A1A1A]"}`}>{stats?.anomaly_count || 0}</p>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">{monthLabel}</p>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
                    <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">Spending by Category</h3>
                    {pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <PieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                                    {pieData.map((entry, index) => <Cell key={index} fill={CATEGORY_COLORS[entry.name] || "#E5E7EB"} />)}
                                </Pie>
                                <Tooltip formatter={(value) => formatRupiah(value as number)} />
                                <Legend iconType="circle" iconSize={8}
                                    formatter={(value) => <span className="text-xs text-[#6B7280]">{CATEGORY_ICONS[value] || ""} {value}</span>} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-60 flex items-center justify-center text-[#9CA3AF] text-sm">No data for {monthLabel}.</div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-[#1A1A1A]">Top Spending Categories</h3>
                        <span className="text-xs text-[#9CA3AF]">{monthLabel}</span>
                    </div>
                    {topCategories.length > 0 ? (
                        <div className="space-y-3.5">
                            {topCategories.map((cat, i) => {
                                const pct = (cat.total / totalSpend) * 100;
                                return (
                                    <div key={cat.name}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-[#9CA3AF] w-4">#{i + 1}</span>
                                                <span className="text-sm">{CATEGORY_ICONS[cat.name] || "💳"}</span>
                                                <span className="text-sm font-medium text-[#1A1A1A]">{cat.name}</span>
                                                {cat.anomaly_count > 0 && (
                                                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#FEF2F2] text-[#DC2626] font-medium">{cat.anomaly_count}⚠</span>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0 ml-2">
                                                <span className="text-sm font-semibold text-[#1A1A1A]">{formatRupiahShort(cat.total)}</span>
                                                <span className="text-xs text-[#9CA3AF] ml-1">{pct.toFixed(0)}%</span>
                                            </div>
                                        </div>
                                        <div className="h-1.5 bg-[#F3F4F6] rounded-full overflow-hidden">
                                            <div className="h-full rounded-full transition-all duration-500"
                                                style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[cat.name] || "#1A1A1A" }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="h-48 flex items-center justify-center text-[#9CA3AF] text-sm">No spending data for {monthLabel}.</div>
                    )}
                </div>
            </div>

            {/* Anomaly Alerts — follows month filter */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5 mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <Bell size={15} className="text-[#DC2626]" />
                    <h3 className="text-sm font-semibold text-[#1A1A1A]">Anomaly Alerts</h3>
                    <span className="text-xs text-[#9CA3AF] ml-auto">{monthLabel}</span>
                </div>
                {monthAnomalies.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                        {monthAnomalies.map(t => (
                            <div key={t.id} className={`flex items-center justify-between p-3 rounded-xl ${t.anomaly_status === "anomaly" ? "bg-[#FEF2F2]" : "bg-[#FFFBEB]"}`}>
                                <div className="flex items-center gap-2">
                                    <span className="text-base">{CATEGORY_ICONS[t.category_name] || "💳"}</span>
                                    <div>
                                        <p className="text-xs font-medium text-[#1A1A1A]">{t.category_name}</p>
                                        <p className="text-xs text-[#6B7280]">{formatRupiah(t.amount)}</p>
                                    </div>
                                </div>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.anomaly_status === "anomaly" ? "bg-[#DC2626] text-white" : "bg-[#F59E0B] text-white"}`}>
                                    {t.anomaly_status}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-[#9CA3AF] text-center py-3">No anomalies detected for {monthLabel} 🎉</p>
                )}
            </div>

            {/* Monthly Trend Chart */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-[#1A1A1A]">Monthly Spending Trend</h3>
                        <p className="text-xs text-[#9CA3AF] mt-0.5">Last 6 months</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[#6B7280]">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1A1A1A] inline-block" />Total Expense</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#FCA5A5] inline-block" />Anomalies</span>
                    </div>
                </div>
                {monthlyStats.length > 0 && monthlyStats.some(m => m.total_amount > 0) ? (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={monthlyStats} barGap={4} barCategoryGap="30%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={70} />
                            <Tooltip
                                formatter={(value, name) => [name === "total_amount" ? formatRupiah(value as number) : value, name === "total_amount" ? "Total Expense" : "Anomalies"]}
                                contentStyle={{ borderRadius: "12px", border: "1px solid #EBEBEB", fontSize: "12px" }}
                            />
                            <Bar dataKey="total_amount" fill="#1A1A1A" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="anomaly_count" fill="#FCA5A5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-56 flex items-center justify-center text-[#9CA3AF] text-sm">No spending data yet.</div>
                )}
            </div>

            </>)}
        </div>
    );
}