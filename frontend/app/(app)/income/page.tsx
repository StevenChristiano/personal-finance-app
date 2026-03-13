"use client";

import { useEffect, useState } from "react";
import { incomeApi, type Income } from "@/lib/api";
import { Plus, Trash2, RefreshCw, TrendingUp } from "lucide-react";

function formatRupiah(amount: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function IncomePage() {
    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const [incomes, setIncomes]       = useState<Income[]>([]);
    const [loading, setLoading]       = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showForm, setShowForm]     = useState(false);

    const [form, setForm] = useState({
        amount      : "",
        source      : "",
        date        : now.toISOString().slice(0, 10),
        is_recurring: false,
    });

    const fetchIncomes = async () => {
        try {
            const data = await incomeApi.getAll(month, year);
            setIncomes(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchIncomes(); }, []);

    const handleSubmit = async () => {
        if (!form.amount || !form.source) return;
        setSubmitting(true);
        try {
            await incomeApi.create({
                amount      : parseFloat(form.amount),
                source      : form.source,
                date        : new Date(form.date).toISOString(),
                is_recurring: form.is_recurring,
            });
            setForm({ amount: "", source: "", date: now.toISOString().slice(0, 10), is_recurring: false });
            setShowForm(false);
            await fetchIncomes();
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
        <div className="p-8 max-w-3xl mx-auto">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#1A1A1A]">Income</h1>
                    <p className="text-[#6B7280] text-sm mt-0.5">
                        {now.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(v => !v)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors"
                >
                    <Plus size={16} />Add Income
                </button>
            </div>

            {/* Summary Card */}
            <div className="bg-[#F0FDF4] border border-[#BBF7D0] rounded-2xl p-5 mb-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#16A34A] flex items-center justify-center shrink-0">
                    <TrendingUp size={18} className="text-white" />
                </div>
                <div>
                    <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">Total Income This Month</p>
                    <p className="text-2xl font-bold text-[#16A34A]">{formatRupiah(totalIncome)}</p>
                </div>
            </div>

            {/* Add Form */}
            {showForm && (
                <div className="bg-white border border-[#EBEBEB] rounded-2xl p-6 mb-6">
                    <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">Add New Income</h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-[#6B7280] font-medium block mb-1.5">Source / Label</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Salary, Freelance"
                                    value={form.source}
                                    onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-[#EBEBEB] text-sm text-[#1A1A1A] placeholder:text-[#C4C9D4] focus:outline-none focus:border-[#1A1A1A] transition-colors"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-[#6B7280] font-medium block mb-1.5">Amount (Rp)</label>
                                <input
                                    type="number"
                                    placeholder="e.g. 5000000"
                                    value={form.amount}
                                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-[#EBEBEB] text-sm text-[#1A1A1A] placeholder:text-[#C4C9D4] focus:outline-none focus:border-[#1A1A1A] transition-colors"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-[#6B7280] font-medium block mb-1.5">Date</label>
                                <input
                                    type="date"
                                    value={form.date}
                                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                    className="w-full px-3 py-2.5 rounded-xl border border-[#EBEBEB] text-sm text-[#1A1A1A] placeholder:text-[#C4C9D4] focus:outline-none focus:border-[#1A1A1A] transition-colors"
                                />
                            </div>
                            <div className="flex items-end pb-1">
                                <label className="flex items-center gap-2.5 cursor-pointer">
                                    <div
                                        onClick={() => setForm(f => ({ ...f, is_recurring: !f.is_recurring }))}
                                        className={`w-10 h-6 rounded-full transition-colors relative ${form.is_recurring ? "bg-[#1A1A1A]" : "bg-[#E5E7EB]"}`}
                                    >
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.is_recurring ? "left-5" : "left-1"}`} />
                                    </div>
                                    <span className="text-sm text-[#374151]">Recurring monthly</span>
                                </label>
                            </div>
                        </div>
                        {form.is_recurring && (
                            <p className="text-xs text-[#6B7280] bg-[#F9FAFB] rounded-xl px-3 py-2">
                                💡 Income ini akan otomatis muncul tiap bulan dengan jumlah yang sama.
                            </p>
                        )}
                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || !form.amount || !form.source}
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
                        <p className="text-[#9CA3AF] text-sm">No income recorded this month.</p>
                        <p className="text-[#C4B5FD] text-xs mt-1">Click "Add Income" to get started.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-[#F3F4F6]">
                        {incomes.map(income => (
                            <div key={income.id} className="flex items-center justify-between px-5 py-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-xl bg-[#F0FDF4] flex items-center justify-center">
                                        <TrendingUp size={14} className="text-[#16A34A]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-[#1A1A1A]">{income.source}</p>
                                        <p className="text-xs text-[#9CA3AF]">
                                            {formatDate(income.date)}
                                            {income.is_recurring && (
                                                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-[#EEF2FF] text-[#4F46E5] text-xs font-medium">
                                                    recurring
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <p className="text-sm font-semibold text-[#16A34A]">{formatRupiah(income.amount)}</p>
                                    <button
                                        onClick={() => handleDelete(income.id)}
                                        className="text-[#D1D5DB] hover:text-[#DC2626] transition-colors"
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