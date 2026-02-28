"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { transactionApi, type Transaction } from "@/lib/api";
import { Trash2, Plus, ChevronLeft, ChevronRight, AlertCircle, AlertTriangle, CheckCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

const CATEGORY_ICONS: Record<string, string> = {
    Food: "🍔", Transport: "🚗", Lifestyle: "👕", Entertainment: "🎮",
    Utilities: "💡", Telecommunication: "📱", Subscription: "📺",
    Health: "🏥", Education: "📚", "Big Expense": "💰",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatRupiah(amount: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function formatDate(ts: string) {
    return new Date(ts).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TransactionsPage() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [sortKey, setSortKey] = useState<string>("timestamp");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
    const [showPicker, setShowPicker] = useState(false);
    const [pickerYear, setPickerYear] = useState(now.getFullYear());
    const pickerRef = useRef<HTMLDivElement>(null);

    // Close picker on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowPicker(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        fetchTransactions();
    }, [month, year]);

    const fetchTransactions = async () => {
        setLoading(true);
        setSelectedCategory("all"); // reset filter on month change
        try {
            const data = await transactionApi.getAll(month, year);
            setTransactions(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        setDeletingId(id);
        try {
            await transactionApi.delete(id);
            setTransactions(prev => prev.filter(t => t.id !== id));
            setConfirmDelete(null);
        } catch (e) {
            console.error(e);
        } finally {
            setDeletingId(null);
        }
    };

    const prevMonth = () => {
        if (month === 1) { setMonth(12); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    };

    const nextMonth = () => {
        if (month === 12) { setMonth(1); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    };

    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
    const anomalyCount = transactions.filter(t => t.anomaly_status === "anomaly").length;
    const warningCount = transactions.filter(t => t.anomaly_status === "warning").length;

    // Unique categories present in this month
    const availableCategories = Array.from(new Set(transactions.map(t => t.category_name))).sort();

    // Apply category filter
    const filteredTransactions = selectedCategory === "all"
        ? transactions
        : transactions.filter(t => t.category_name === selectedCategory);

    const filteredAnomalies = filteredTransactions.filter(t => t.anomaly_status === "anomaly").length;
    const filteredWarnings = filteredTransactions.filter(t => t.anomaly_status === "warning").length;

    // Sort
    const handleSort = (key: string) => {
        if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortKey(key); setSortDir("asc"); }
    };
    const SortIcon = ({ col }: { col: string }) => {
        if (sortKey !== col) return <ArrowUpDown size={11} className="ml-1 opacity-30" />;
        return sortDir === "asc" ? <ArrowUp size={11} className="ml-1" /> : <ArrowDown size={11} className="ml-1" />;
    };
    const statusOrder = { anomaly: 2, warning: 1, normal: 0 };
    const sortedTransactions = [...filteredTransactions].sort((a, b) => {
        let va: string | number = 0;
        let vb: string | number = 0;
        if (sortKey === "category") { va = a.category_name; vb = b.category_name; }
        if (sortKey === "note") { va = a.note || ""; vb = b.note || ""; }
        if (sortKey === "timestamp") { va = a.timestamp; vb = b.timestamp; }
        if (sortKey === "amount") { va = a.amount; vb = b.amount; }
        if (sortKey === "status") { va = statusOrder[a.anomaly_status as keyof typeof statusOrder] ?? -1; vb = statusOrder[b.anomaly_status as keyof typeof statusOrder] ?? -1; }
        if (sortKey === "score") { va = a.anomaly_score ?? -1; vb = b.anomaly_score ?? -1; }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
    });

    const getStatusBadge = (status?: string) => {
        if (status === "anomaly") return <span className="flex items-center gap-1 text-xs font-medium text-[#DC2626] bg-[#FEF2F2] px-2 py-0.5 rounded-full"><AlertCircle size={10} />Anomaly</span>;
        if (status === "warning") return <span className="flex items-center gap-1 text-xs font-medium text-[#D97706] bg-[#FFFBEB] px-2 py-0.5 rounded-full"><AlertTriangle size={10} />Warning</span>;
        if (status === "normal") return <span className="flex items-center gap-1 text-xs font-medium text-[#16A34A] bg-[#F0FDF4] px-2 py-0.5 rounded-full"><CheckCircle size={10} />Normal</span>;
        return <span className="text-xs text-[#9CA3AF]">—</span>;
    };

    return (
        <div className="p-8">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#1A1A1A]">Transactions</h1>
                    <p className="text-[#6B7280] text-sm mt-0.5">Track and manage your spending history</p>
                </div>
                <Link href="/add"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors">
                    <Plus size={16} />Add Transaction
                </Link>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                    { label: "Total Spent", value: formatRupiah(totalAmount), sub: `${transactions.length} transactions` },
                    {
                        label: "Average / Transaction",
                        value: formatRupiah(transactions.length > 0 ? totalAmount / transactions.length : 0),
                        sub: `${MONTHS[month - 1]} ${year}`,
                    },
                    {
                        label: "Anomalies Detected", value: anomalyCount,
                        sub: warningCount > 0 ? `${warningCount} warning${warningCount > 1 ? "s" : ""}` : "No warnings",
                        color: anomalyCount > 0 ? "bg-[#FEF2F2]" : "bg-white",
                        textColor: anomalyCount > 0 ? "text-[#DC2626]" : "text-[#1A1A1A]",
                    },
                ].map((card, i) => (
                    <div key={i} className={`${card.color || "bg-white"} rounded-2xl p-5 border border-[#EBEBEB]`}>
                        <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">{card.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${card.textColor || "text-[#1A1A1A]"}`}>{card.value}</p>
                        <p className="text-xs text-[#9CA3AF] mt-0.5">{card.sub}</p>
                    </div>
                ))}
            </div>

            {/* Month Navigator */}
            <div className="flex items-center justify-between mb-6 bg-white rounded-2xl border border-[#EBEBEB] p-4 relative" ref={pickerRef}>
                <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-[#F7F7F5] transition-colors">
                    <ChevronLeft size={18} className="text-[#6B7280]" />
                </button>

                {/* Clickable label */}
                <button onClick={() => { setPickerYear(year); setShowPicker(p => !p); }}
                    className="text-center group">
                    <p className="font-semibold text-[#1A1A1A] group-hover:text-[#6B7280] transition-colors underline-offset-2 group-hover:underline cursor-pointer">
                        {MONTHS[month - 1]} {year}
                    </p>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">{transactions.length} transactions · {formatRupiah(totalAmount)}</p>
                </button>

                <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-[#F7F7F5] transition-colors">
                    <ChevronRight size={18} className="text-[#6B7280]" />
                </button>

                {/* Picker Popover */}
                {showPicker && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border border-[#EBEBEB] rounded-2xl shadow-lg p-4 z-20 w-64">
                        {/* Year navigation */}
                        <div className="flex items-center justify-between mb-3">
                            <button onClick={() => setPickerYear(y => y - 1)}
                                className="p-1.5 rounded-lg hover:bg-[#F7F7F5] transition-colors">
                                <ChevronLeft size={14} className="text-[#6B7280]" />
                            </button>
                            <span className="text-sm font-semibold text-[#1A1A1A]">{pickerYear}</span>
                            <button onClick={() => setPickerYear(y => y + 1)}
                                className="p-1.5 rounded-lg hover:bg-[#F7F7F5] transition-colors">
                                <ChevronRight size={14} className="text-[#6B7280]" />
                            </button>
                        </div>
                        {/* Month grid */}
                        <div className="grid grid-cols-3 gap-1.5">
                            {MONTHS.map((m, i) => {
                                const isActive = (i + 1) === month && pickerYear === year;
                                return (
                                    <button key={m} onClick={() => {
                                        setMonth(i + 1);
                                        setYear(pickerYear);
                                        setShowPicker(false);
                                    }}
                                        className={`py-1.5 rounded-xl text-xs font-medium transition-colors ${isActive
                                            ? "bg-[#1A1A1A] text-white"
                                            : "hover:bg-[#F7F7F5] text-[#374151]"
                                            }`}>
                                        {m.slice(0, 3)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Category Filter Pills */}
            {!loading && availableCategories.length > 1 && (
                <div className="flex gap-2 mb-4 flex-wrap">
                    <button onClick={() => setSelectedCategory("all")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${selectedCategory === "all"
                            ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                            : "bg-white text-[#6B7280] border-[#EBEBEB] hover:border-[#9CA3AF]"
                            }`}>
                        All ({transactions.length})
                    </button>
                    {availableCategories.map(cat => (
                        <button key={cat} onClick={() => setSelectedCategory(cat)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${selectedCategory === cat
                                ? "bg-[#1A1A1A] text-white border-[#1A1A1A]"
                                : "bg-white text-[#6B7280] border-[#EBEBEB] hover:border-[#9CA3AF]"
                                }`}>
                            {CATEGORY_ICONS[cat] || "💳"} {cat} ({transactions.filter(t => t.category_name === cat).length})
                        </button>
                    ))}
                </div>
            )}

            {/* Summary Pills */}
            {filteredTransactions.length > 0 && (
                <div className="flex gap-3 mb-5">
                    <div className="px-3 py-1.5 rounded-full bg-white border border-[#EBEBEB] text-xs text-[#6B7280]">
                        <span className="font-semibold text-[#1A1A1A]">{filteredTransactions.length}</span> {selectedCategory === "all" ? "total" : selectedCategory}
                    </div>
                    {filteredAnomalies > 0 && (
                        <div className="px-3 py-1.5 rounded-full bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#DC2626]">
                            <span className="font-semibold">{filteredAnomalies}</span> anomaly
                        </div>
                    )}
                    {filteredWarnings > 0 && (
                        <div className="px-3 py-1.5 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#D97706]">
                            <span className="font-semibold">{filteredWarnings}</span> warning
                        </div>
                    )}
                </div>
            )}

            {/* Transactions List */}
            {loading ? (
                <div className="text-center py-16 text-[#9CA3AF] text-sm">Loading...</div>
            ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-[#EBEBEB]">
                    <p className="text-[#9CA3AF] text-sm">
                        {selectedCategory === "all"
                            ? `No transactions in ${MONTHS[month - 1]} ${year}`
                            : `No "${selectedCategory}" transactions this month`}
                    </p>
                    {selectedCategory !== "all" ? (
                        <button onClick={() => setSelectedCategory("all")}
                            className="mt-3 text-sm text-[#1A1A1A] font-medium hover:underline">
                            Clear filter
                        </button>
                    ) : (
                        <Link href="/add" className="inline-flex items-center gap-1.5 mt-3 text-sm text-[#1A1A1A] font-medium hover:underline">
                            <Plus size={14} />Add your first transaction
                        </Link>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
                    <div className="grid grid-cols-12 px-5 py-3 bg-[#F9FAFB] border-b border-[#EBEBEB] text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                        {[{ label: "Category", key: "category", span: "col-span-3" },
                        { label: "Note", key: "note", span: "col-span-3" },
                        { label: "Date & Time", key: "timestamp", span: "col-span-2" }].map(col => (
                            <button key={col.key} onClick={() => handleSort(col.key)}
                                className={`${col.span} flex items-center hover:text-[#1A1A1A] transition-colors ${sortKey === col.key ? "text-[#1A1A1A]" : ""
                                    }`}>
                                {col.label}<SortIcon col={col.key} />
                            </button>
                        ))}
                        <button onClick={() => handleSort("amount")}
                            className={`col-span-2 flex items-center justify-end hover:text-[#1A1A1A] transition-colors ${sortKey === "amount" ? "text-[#1A1A1A]" : ""
                                }`}>
                            Amount<SortIcon col="amount" />
                        </button>
                        <button onClick={() => handleSort("status")}
                            className={`col-span-1 flex items-center justify-center hover:text-[#1A1A1A] transition-colors ${sortKey === "status" ? "text-[#1A1A1A]" : ""
                                }`}>
                            Status<SortIcon col="status" />
                        </button>
                        <button onClick={() => handleSort("score")}
                            className={`col-span-1 flex items-center justify-center hover:text-[#1A1A1A] transition-colors ${sortKey === "score" ? "text-[#1A1A1A]" : ""
                                }`}>
                            Score<SortIcon col="score" />
                        </button>
                    </div>
                    {sortedTransactions.map((t) => (
                        <div key={t.id}
                            className={`grid grid-cols-12 px-5 py-4 border-b border-[#F3F4F6] last:border-0 items-center hover:bg-[#FAFAFA] transition-colors group ${t.anomaly_status === "anomaly" ? "bg-[#FFF8F8]" :
                                t.anomaly_status === "warning" ? "bg-[#FFFEF5]" : ""
                                }`}>
                            <div className="col-span-3 flex items-center gap-2.5">
                                <span className="text-lg">{CATEGORY_ICONS[t.category_name] || "💳"}</span>
                                <span className="text-sm font-medium text-[#1A1A1A]">{t.category_name}</span>
                            </div>
                            <div className="col-span-3">
                                <span className="text-sm text-[#6B7280] truncate block">{t.note || "—"}</span>
                            </div>
                            <div className="col-span-2">
                                <span className="text-xs text-[#9CA3AF]">{formatDate(t.timestamp)}</span>
                            </div>
                            <div className="col-span-2 text-right">
                                <span className="text-sm font-semibold text-[#1A1A1A]">{formatRupiah(t.amount)}</span>
                            </div>
                            <div className="col-span-1 flex justify-center">
                                {t.is_excluded ? <span className="text-xs text-[#D1D5DB]">—</span> : getStatusBadge(t.anomaly_status)}
                            </div>
                            <div className="col-span-1 flex items-center justify-center gap-2">
                                {!t.is_excluded && t.anomaly_score != null ? (
                                    <span className={`text-xs font-medium ${t.anomaly_status === "anomaly" ? "text-[#DC2626]" :
                                        t.anomaly_status === "warning" ? "text-[#D97706]" : "text-[#16A34A]"
                                        }`}>
                                        {(t.anomaly_score * 100).toFixed(0)}%
                                    </span>
                                ) : (
                                    <span className="text-xs text-[#D1D5DB]">—</span>
                                )}
                                <button
                                    onClick={() => setConfirmDelete(t.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626] transition-all">
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6 w-full max-w-sm">
                        <h3 className="font-semibold text-[#1A1A1A] mb-2">Delete Transaction?</h3>
                        <p className="text-sm text-[#6B7280] mb-5">This action cannot be undone.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDelete(null)}
                                className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors">
                                Cancel
                            </button>
                            <button onClick={() => handleDelete(confirmDelete)} disabled={deletingId === confirmDelete}
                                className="flex-1 py-2.5 rounded-xl bg-[#DC2626] text-white text-sm font-medium hover:bg-[#B91C1C] transition-colors disabled:opacity-50">
                                {deletingId === confirmDelete ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
