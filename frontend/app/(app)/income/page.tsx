"use client";

import { useEffect, useRef, useState } from "react";
import { incomeApi, type Income } from "@/lib/api";
import { Plus, Trash2, RefreshCw, TrendingUp, ChevronLeft, ChevronRight, ChevronDown, Repeat2 } from "lucide-react";

const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function formatRupiah(amount: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}
function formatRupiahCompact(amount: number) {
    if (amount >= 1_000_000_000) return `Rp ${(amount / 1_000_000_000).toFixed(1)}M`;
    if (amount >= 1_000_000)     return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
    return formatRupiah(amount);
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

interface YearlySummary { year: number; total: number; }
interface RecurringSource { source: string; amount: number; }
interface Summary {
    total_all_time: number;
    yearly: YearlySummary[];
    recurring_sources: RecurringSource[];
}

export default function IncomePage() {
    const today = new Date();

    const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
    const [viewYear,  setViewYear]  = useState(today.getFullYear());
    const [showPicker,  setShowPicker]  = useState(false);
    const [pickerYear,  setPickerYear]  = useState(today.getFullYear());
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

    const isCurrentMonth = viewMonth === today.getMonth() + 1 && viewYear === today.getFullYear();
    const monthLabel = new Date(viewYear, viewMonth - 1, 1)
        .toLocaleDateString("id-ID", { month: "long", year: "numeric" });

    const goToPrevMonth = () => {
        if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
    };
    const goToNextMonth = () => {
        if (isCurrentMonth) return;
        if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
    };

    const [incomes, setIncomes]       = useState<Income[]>([]);
    const [loading, setLoading]       = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showForm, setShowForm]     = useState(false);
    const [summary, setSummary]       = useState<Summary | null>(null);
    const [sources, setSources]       = useState<string[]>([]);
    const [togglingId, setTogglingId] = useState<number | null>(null);

    const [amountRaw,     setAmountRaw]     = useState("");
    const [amountDisplay, setAmountDisplay] = useState("");
    const [source,       setSource]       = useState("");
    const [date,         setDate]         = useState(today.toISOString().slice(0, 10));
    const [isRecurring,  setIsRecurring]  = useState(false);

    const fetchIncomes = async () => {
        setLoading(true);
        try {
            const data = await incomeApi.getAll(viewMonth, viewYear);
            setIncomes(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchSummary = async () => {
        try {
            const [sum, src] = await Promise.all([
                incomeApi.getSummary(),
                incomeApi.getSources(),
            ]);
            setSummary(sum);
            setSources(src.sources);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchSummary(); }, []);
    useEffect(() => { fetchIncomes(); }, [viewMonth, viewYear]);

    const handleToggleRecurring = async (id: number) => {
        setTogglingId(id);
        try {
            const updated = await incomeApi.toggleRecurring(id);
            if (updated.is_recurring) {
                // Toggle ON — fetchIncomes agar _ensure_recurring_income
                // ter-trigger di backend dan generate bulan-bulan berikutnya
                await fetchIncomes();
            } else {
                // Toggle OFF — update state lokal saja, future entries
                // sudah di-soft-delete oleh backend
                setIncomes(prev => prev.map(i => i.id === id ? { ...i, is_recurring: updated.is_recurring } : i));
            }
            fetchSummary();
        } catch (e) { console.error(e); }
        finally { setTogglingId(null); }
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, "");
        setAmountRaw(raw);
        setAmountDisplay(raw ? new Intl.NumberFormat("id-ID").format(parseInt(raw)) : "");
    };

    const handleSubmit = async () => {
        if (!amountRaw || !source) return;
        setSubmitting(true);
        try {
            await incomeApi.create({
                amount      : parseFloat(amountRaw),
                source,
                date        : new Date(date).toISOString(),
                is_recurring: isRecurring,
            });
            setAmountRaw(""); setAmountDisplay(""); setSource("");
            setDate(today.toISOString().slice(0, 10)); setIsRecurring(false);
            setShowForm(false);
            await fetchIncomes();
            await fetchSummary();
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await incomeApi.delete(id);
            setIncomes(prev => prev.filter(i => i.id !== id));
            fetchSummary();
        } catch (e) {
            console.error(e);
        }
    };

    const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-[#6B7280] text-sm">Loading...</div>
            </div>
        );
    }

    return (
        <div className="p-8 mx-auto">

            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#1A1A1A]">Income</h1>
                    <p className="text-[#6B7280] text-sm mt-0.5">{monthLabel}</p>
                </div>
                <button
                    onClick={() => setShowForm(v => !v)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors"
                >
                    <Plus size={16} />Add Income
                </button>
            </div>

            {/* Month Navigation */}
            <div className="relative mb-6" ref={pickerRef}>
                <div className="flex items-center justify-between bg-white border border-[#EBEBEB] rounded-2xl px-4 py-3">
                    <button
                        onClick={goToPrevMonth}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm text-[#6B7280] hover:text-[#1A1A1A] hover:bg-[#F3F4F6] font-medium transition-all"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    {/* Clickable month label — opens picker */}
                    <button
                        onClick={() => { setPickerYear(viewYear); setShowPicker(v => !v); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-[#F3F4F6] transition-all group"
                    >
                        <span className="text-sm font-semibold text-[#1A1A1A]">{monthLabel}</span>
                        {isCurrentMonth && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-[#F0FDF4] text-[#16A34A] font-semibold border border-[#BBF7D0]">
                                This month
                            </span>
                        )}
                        <ChevronDown size={14} className={`text-[#9CA3AF] transition-transform ${showPicker ? "rotate-180" : ""}`} />
                    </button>

                    <button
                        onClick={goToNextMonth}
                        disabled={isCurrentMonth}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm text-[#6B7280] hover:text-[#1A1A1A] hover:bg-[#F3F4F6] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Month/Year Picker Dropdown */}
                {showPicker && (
                    <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 bg-white border border-[#EBEBEB] rounded-2xl shadow-xl p-4 w-72">
                        {/* Year selector */}
                        <div className="flex items-center justify-between mb-3">
                            <button
                                onClick={() => setPickerYear(y => y - 1)}
                                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#6B7280] hover:text-[#1A1A1A] transition-all"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span className="text-sm font-bold text-[#1A1A1A]">{pickerYear}</span>
                            <button
                                onClick={() => setPickerYear(y => y + 1)}
                                disabled={pickerYear >= today.getFullYear()}
                                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#6B7280] hover:text-[#1A1A1A] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>

                        {/* Month grid */}
                        <div className="grid grid-cols-3 gap-1.5">
                            {MONTHS_ID.map((name, idx) => {
                                const m = idx + 1;
                                const isFuture = pickerYear > today.getFullYear() ||
                                    (pickerYear === today.getFullYear() && m > today.getMonth() + 1);
                                const isSelected = m === viewMonth && pickerYear === viewYear;
                                const isCurrent  = m === today.getMonth() + 1 && pickerYear === today.getFullYear();
                                return (
                                    <button
                                        key={m}
                                        disabled={isFuture}
                                        onClick={() => {
                                            setViewMonth(m);
                                            setViewYear(pickerYear);
                                            setShowPicker(false);
                                        }}
                                        className={`py-2 rounded-xl text-xs font-semibold transition-all
                                            ${isFuture ? "opacity-25 cursor-not-allowed text-[#9CA3AF]" :
                                              isSelected ? "bg-[#1A1A1A] text-white" :
                                              isCurrent  ? "bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]" :
                                                           "text-[#374151] hover:bg-[#F3F4F6]"
                                            }`}
                                    >
                                        {name.slice(0, 3)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Summary Stats — 3 cards */}
            <div className="grid grid-cols-3 gap-3 mb-6">
                {/* Monthly */}
                <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-4">
                    <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide mb-1">This Month</p>
                    <p className="text-xl font-bold text-[#16A34A] leading-tight">{formatRupiah(totalIncome)}</p>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">{monthLabel}</p>
                </div>
                {/* This year */}
                <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
                    <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide mb-1">This Year</p>
                    <p className="text-xl font-bold text-[#1A1A1A] leading-tight">
                        {formatRupiah(summary?.yearly.find(y => y.year === viewYear)?.total ?? 0)}
                    </p>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">{viewYear}</p>
                </div>
                {/* All time */}
                <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4">
                    <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide mb-1">All Time</p>
                    <p className="text-xl font-bold text-[#1A1A1A] leading-tight">
                        {formatRupiah(summary?.total_all_time ?? 0)}
                    </p>
                    <p className="text-xs text-[#9CA3AF] mt-0.5">{summary?.yearly.length ?? 0} year(s)</p>
                </div>
            </div>

            {/* Recurring Sources — active list */}
            {summary && summary.recurring_sources.length > 0 && (
                <div className="bg-white border border-[#EBEBEB] rounded-2xl p-4 mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Repeat2 size={14} className="text-[#4F46E5]" />
                        <p className="text-xs font-bold text-[#374151] uppercase tracking-wide">Active Recurring</p>
                        <span className="ml-auto text-xs text-[#9CA3AF]">auto-generates every month</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {summary.recurring_sources.map(rs => (
                            <div key={rs.source} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EEF2FF] border border-[#C7D2FE]">
                                <Repeat2 size={11} className="text-[#4F46E5]" />
                                <span className="text-xs font-semibold text-[#4F46E5]">{rs.source}</span>
                                <span className="text-xs text-[#818CF8]">{formatRupiahCompact(rs.amount)}</span>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-[#C4C9D4] mt-2">To stop a recurring income, toggle it off in the list below.</p>
                </div>
            )}

            {/* Add Form */}
            {showForm && (
                <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6 mb-6">
                    <h3 className="text-sm font-semibold text-[#1A1A1A] mb-6">Add New Income</h3>
                    <div className="space-y-6">

                        {/* Big amount input */}
                        <div>
                            <label className="block text-xs font-bold text-[#6B7280] uppercase tracking-wider mb-3">
                                Amount (Rp)
                            </label>
                            <div className="relative group">
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-3xl font-bold transition-colors group-focus-within:text-[#1A1A1A]">
                                    Rp
                                </span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={amountDisplay}
                                    onChange={handleAmountChange}
                                    placeholder="0"
                                    className="w-full pl-16 pr-0 py-2 border-b-2 border-[#E5E7EB] bg-transparent text-[#1A1A1A] font-black text-5xl placeholder-[#D1D5DB] focus:outline-none focus:border-[#1A1A1A] transition-colors"
                                />
                            </div>
                            {amountRaw && (
                                <p className="text-xs font-bold text-[#9CA3AF] mt-3 tracking-wide">
                                    {formatRupiah(parseInt(amountRaw))}
                                </p>
                            )}
                        </div>

                        {/* Source — datalist combo (free text + suggestions) */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-[#6B7280] font-bold uppercase tracking-wider block mb-1.5">
                                    Source / Label
                                </label>
                                <input
                                    type="text"
                                    list="income-sources-list"
                                    placeholder="e.g. Salary, Freelance"
                                    value={source}
                                    onChange={e => setSource(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border border-[#EBEBEB] text-sm text-[#1A1A1A] placeholder:text-[#C4C9D4] focus:outline-none focus:border-[#1A1A1A] transition-colors"
                                />
                                <datalist id="income-sources-list">
                                    {sources.map(s => <option key={s} value={s} />)}
                                </datalist>
                            </div>
                            <div>
                                <label className="text-xs text-[#6B7280] font-bold uppercase tracking-wider block mb-1.5">
                                    Date
                                </label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl border border-[#EBEBEB] text-sm text-[#1A1A1A] focus:outline-none focus:border-[#1A1A1A] transition-colors"
                                />
                            </div>
                        </div>

                        {/* Recurring toggle */}
                        <div>
                            <label className="flex items-center gap-2.5 cursor-pointer w-fit">
                                <div
                                    onClick={() => setIsRecurring(v => !v)}
                                    className={`w-10 h-6 rounded-full transition-colors relative ${isRecurring ? "bg-[#4F46E5]" : "bg-[#E5E7EB]"}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isRecurring ? "left-5" : "left-1"}`} />
                                </div>
                                <span className="text-sm text-[#374151]">Recurring monthly</span>
                            </label>
                            {isRecurring && (
                                <p className="text-xs text-[#6B7280] bg-[#EEF2FF] border border-[#C7D2FE] rounded-xl px-3 py-2 mt-2">
                                    💡 Income ini akan otomatis muncul tiap bulan. Bisa dinonaktifkan kapanpun lewat toggle di list.
                                </p>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || !amountRaw || !source}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? <><RefreshCw size={14} className="animate-spin" />Saving...</> : <>Save Income</>}
                            </button>
                            <button
                                onClick={() => setShowForm(false)}
                                className="px-4 py-2.5 rounded-xl border border-[#EBEBEB] text-sm text-[#6B7280] hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Income List */}
            <div className="bg-white border border-[#EBEBEB] rounded-2xl overflow-hidden">
                {incomes.length === 0 ? (
                    <div className="p-12 text-center">
                        <p className="text-[#9CA3AF] text-sm">No income recorded for {monthLabel}.</p>
                        <p className="text-[#C4C9D4] text-xs mt-1">
                            {isCurrentMonth ? 'Click "Add Income" to get started.' : "No data for this month."}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-[#F3F4F6]">
                        {incomes.map(income => (
                            <div key={income.id} className="flex items-center justify-between px-5 py-4 group">
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${income.is_recurring ? "bg-[#EEF2FF]" : "bg-[#F0FDF4]"}`}>
                                        {income.is_recurring
                                            ? <Repeat2 size={14} className="text-[#4F46E5]" />
                                            : <TrendingUp size={14} className="text-[#16A34A]" />
                                        }
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-[#1A1A1A]">{income.source}</p>
                                        <p className="text-xs text-[#9CA3AF]">{formatDate(income.date)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <p className="text-sm font-semibold text-[#16A34A]">{formatRupiah(income.amount)}</p>

                                    {/* Recurring toggle */}
                                    <button
                                        onClick={() => handleToggleRecurring(income.id)}
                                        disabled={togglingId === income.id}
                                        title={income.is_recurring ? "Click to stop recurring" : "Click to make recurring"}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                                            income.is_recurring
                                                ? "bg-[#EEF2FF] text-[#4F46E5] hover:bg-[#E0E7FF]"
                                                : "bg-[#F3F4F6] text-[#9CA3AF] hover:bg-[#E5E7EB] opacity-0 group-hover:opacity-100"
                                        }`}
                                    >
                                        {togglingId === income.id
                                            ? <RefreshCw size={11} className="animate-spin" />
                                            : <Repeat2 size={11} />
                                        }
                                        {income.is_recurring ? "recurring" : "set recurring"}
                                    </button>

                                    <button
                                        onClick={() => handleDelete(income.id)}
                                        className="text-[#D1D5DB] hover:text-[#DC2626] transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
}