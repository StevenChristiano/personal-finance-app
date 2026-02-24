"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { transactionApi, type Transaction } from "@/lib/api";
import { Trash2, Plus, ChevronLeft, ChevronRight, AlertCircle, AlertTriangle, CheckCircle } from "lucide-react";

const CATEGORY_ICONS: Record<string, string> = {
  Food: "🍔", Transport: "🚗", Lifestyle: "👕", Entertainment: "🎮",
  Utilities: "💡", Telecommunication: "📱", Subscription: "📺",
  Health: "🏥", Education: "📚", "Big Expense": "💰",
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function TransactionsPage() {
  const router = useRouter();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (!stored) { router.push("/login"); return; }
    fetchTransactions();
  }, [month, year]);

  const fetchTransactions = async () => {
    setLoading(true);
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

  const getStatusBadge = (status?: string) => {
    if (status === "anomaly") return <span className="flex items-center gap-1 text-xs font-medium text-[#DC2626] bg-[#FEF2F2] px-2 py-0.5 rounded-full"><AlertCircle size={10} />Anomaly</span>;
    if (status === "warning") return <span className="flex items-center gap-1 text-xs font-medium text-[#D97706] bg-[#FFFBEB] px-2 py-0.5 rounded-full"><AlertTriangle size={10} />Warning</span>;
    if (status === "normal") return <span className="flex items-center gap-1 text-xs font-medium text-[#16A34A] bg-[#F0FDF4] px-2 py-0.5 rounded-full"><CheckCircle size={10} />Normal</span>;
    return <span className="text-xs text-[#9CA3AF]">—</span>;
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-56 bg-white border-r border-[#EBEBEB] flex flex-col z-10">
        <div className="p-6 border-b border-[#EBEBEB]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center text-white text-xs font-bold">F</div>
            <span className="font-bold text-[#1A1A1A] text-lg" style={{ fontFamily: "Georgia, serif" }}>FinanceGuard</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {[
            { href: "/dashboard", label: "Dashboard" },
            { href: "/transactions", label: "Transactions", active: true },
            { href: "/add", label: "Add Transaction" },
            { href: "/settings", label: "Settings" },
          ].map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                item.active ? "bg-[#1A1A1A] text-white" : "text-[#6B7280] hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
              }`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="ml-56 p-8">
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

        {/* Month Navigator */}
        <div className="flex items-center justify-between mb-6 bg-white rounded-2xl border border-[#EBEBEB] p-4">
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-[#F7F7F5] transition-colors">
            <ChevronLeft size={18} className="text-[#6B7280]" />
          </button>
          <div className="text-center">
            <p className="font-semibold text-[#1A1A1A]">{MONTHS[month - 1]} {year}</p>
            <p className="text-xs text-[#9CA3AF] mt-0.5">{transactions.length} transactions · {formatRupiah(totalAmount)}</p>
          </div>
          <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-[#F7F7F5] transition-colors">
            <ChevronRight size={18} className="text-[#6B7280]" />
          </button>
        </div>

        {/* Summary Pills */}
        {transactions.length > 0 && (
          <div className="flex gap-3 mb-5">
            <div className="px-3 py-1.5 rounded-full bg-white border border-[#EBEBEB] text-xs text-[#6B7280]">
              <span className="font-semibold text-[#1A1A1A]">{transactions.length}</span> total
            </div>
            {anomalyCount > 0 && (
              <div className="px-3 py-1.5 rounded-full bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#DC2626]">
                <span className="font-semibold">{anomalyCount}</span> anomaly
              </div>
            )}
            {warningCount > 0 && (
              <div className="px-3 py-1.5 rounded-full bg-[#FFFBEB] border border-[#FDE68A] text-xs text-[#D97706]">
                <span className="font-semibold">{warningCount}</span> warning
              </div>
            )}
          </div>
        )}

        {/* Transactions List */}
        {loading ? (
          <div className="text-center py-16 text-[#9CA3AF] text-sm">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-[#EBEBEB]">
            <p className="text-[#9CA3AF] text-sm">No transactions in {MONTHS[month - 1]} {year}</p>
            <Link href="/add" className="inline-flex items-center gap-1.5 mt-3 text-sm text-[#1A1A1A] font-medium hover:underline">
              <Plus size={14} />Add your first transaction
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-12 px-5 py-3 bg-[#F9FAFB] border-b border-[#EBEBEB] text-xs font-medium text-[#6B7280] uppercase tracking-wide">
              <div className="col-span-3">Category</div>
              <div className="col-span-3">Note</div>
              <div className="col-span-2">Date & Time</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-1 text-center">Status</div>
              <div className="col-span-1 text-center">Score</div>
            </div>

            {/* Rows */}
            {transactions.map((t) => (
              <div key={t.id}
                className={`grid grid-cols-12 px-5 py-4 border-b border-[#F3F4F6] last:border-0 items-center hover:bg-[#FAFAFA] transition-colors group ${
                  t.anomaly_status === "anomaly" ? "bg-[#FFF8F8]" :
                  t.anomaly_status === "warning" ? "bg-[#FFFEF5]" : ""
                }`}>
                {/* Category */}
                <div className="col-span-3 flex items-center gap-2.5">
                  <span className="text-lg">{CATEGORY_ICONS[t.category_name] || "💳"}</span>
                  <span className="text-sm font-medium text-[#1A1A1A]">{t.category_name}</span>
                </div>

                {/* Note */}
                <div className="col-span-3">
                  <span className="text-sm text-[#6B7280] truncate block">{t.note || "—"}</span>
                </div>

                {/* Date */}
                <div className="col-span-2">
                  <span className="text-xs text-[#9CA3AF]">{formatDate(t.timestamp)}</span>
                </div>

                {/* Amount */}
                <div className="col-span-2 text-right">
                  <span className="text-sm font-semibold text-[#1A1A1A]">{formatRupiah(t.amount)}</span>
                </div>

                {/* Status */}
                <div className="col-span-1 flex justify-center">
                  {t.is_excluded
                    ? <span className="text-xs text-[#D1D5DB]">—</span>
                    : getStatusBadge(t.anomaly_status)}
                </div>

                {/* Score + Delete */}
                <div className="col-span-1 flex items-center justify-center gap-2">
                  {!t.is_excluded && t.anomaly_score != null ? (
                    <span className={`text-xs font-medium ${
                      t.anomaly_status === "anomaly" ? "text-[#DC2626]" :
                      t.anomaly_status === "warning" ? "text-[#D97706]" : "text-[#16A34A]"
                    }`}>
                      {(t.anomaly_score * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-xs text-[#D1D5DB]">—</span>
                  )}
                  <button
                    onClick={() => setConfirmDelete(t.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[#FEF2F2] text-[#9CA3AF] hover:text-[#DC2626] transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6 w-full max-w-sm">
            <h3 className="font-semibold text-[#1A1A1A] mb-2">Delete Transaction?</h3>
            <p className="text-sm text-[#6B7280] mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deletingId === confirmDelete}
                className="flex-1 py-2.5 rounded-xl bg-[#DC2626] text-white text-sm font-medium hover:bg-[#B91C1C] transition-colors disabled:opacity-50"
              >
                {deletingId === confirmDelete ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}