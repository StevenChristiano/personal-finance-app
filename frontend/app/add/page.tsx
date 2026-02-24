"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { categoryApi, transactionApi, type Category } from "@/lib/api";
import { ArrowLeft, CheckCircle, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

const CATEGORY_ICONS: Record<string, string> = {
  Food: "🍔", Transport: "🚗", Lifestyle: "👕", Entertainment: "🎮",
  Utilities: "💡", Telecommunication: "📱", Subscription: "📺",
  Health: "🏥", Education: "📚", "Big Expense": "💰",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  Food: "Daily food & beverage expenses — meals, snacks, coffee, groceries, and dining out.",
  Transport: "Commuting and travel costs — fuel, ride-hailing (Grab/Gojek), parking, and public transport.",
  Lifestyle: "Personal care and clothing — fashion, haircuts, gym, beauty products.",
  Entertainment: "Leisure activities — movies, concerts, games, hobbies, and recreation.",
  Utilities: "Household bills — electricity, water, internet, and gas.",
  Telecommunication: "Phone-related expenses — mobile data plans and top-ups.",
  Subscription: "Recurring digital services — streaming (Netflix, Spotify), apps, and memberships.",
  Health: "Medical expenses — doctor visits, medicine, hospital fees. (Not monitored for anomalies — occasional expense)",
  Education: "Learning costs — tuition, books, courses, and workshops. (Not monitored for anomalies — occasional expense)",
  "Big Expense": "Large one-time purchases — electronics, furniture, travel. (Not monitored for anomalies — occasional expense)",
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

interface TransactionResult {
  id: number;
  amount: number;
  category: string;
  anomaly_score?: number;
  anomaly_status?: string;
  is_excluded: boolean;
  message: string;
}

export default function AddTransactionPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [timestamp, setTimestamp] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransactionResult | null>(null);
  const [error, setError] = useState("");
  const [showCategoryInfo, setShowCategoryInfo] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (!stored) { router.push("/login"); return; }
    categoryApi.getAll().then(setCategories).catch(console.error);
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
      // Reset form
      setAmount("");
      setNote("");
      setCategoryId(null);
      // Scroll ke atas untuk tampilkan alert
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to add transaction.");
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
            { href: "/transactions", label: "Transactions" },
            { href: "/add", label: "Add Transaction", active: true },
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

      <main className="ml-56 p-8 max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <Link href="/dashboard" className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-[#EBEBEB] transition-colors">
            <ArrowLeft size={16} className="text-[#6B7280]" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Add Transaction</h1>
            <p className="text-[#6B7280] text-sm mt-0.5">Record your spending and detect anomalies</p>
          </div>
        </div>

        {/* Result Alert */}
        {result && (() => {
          const style = getStatusStyle(result.anomaly_status);
          return (
            <div className={`mb-6 p-4 rounded-2xl ${style.bg} border ${style.border}`}>
              <div className="flex items-start gap-3">
                {style.icon}
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[#16A34A] mb-1">✓ Transaction saved successfully!</p>
                  <p className={`font-medium text-sm ${style.text}`}>{result.message}</p>
                  {!result.is_excluded && result.anomaly_score !== undefined && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-[#6B7280]">Anomaly Score</p>
                        <p className="text-xs font-bold text-[#6B7280]">{(result.anomaly_score * 100).toFixed(1)}%</p>
                      </div>
                      <div className="h-2 bg-[#E5E7EB] rounded-full overflow-hidden w-full">
                        <div
                          className={`h-full rounded-full transition-all ${
                            result.anomaly_status === "anomaly" ? "bg-[#DC2626]" :
                            result.anomaly_status === "warning" ? "bg-[#F59E0B]" : "bg-[#16A34A]"
                          }`}
                          style={{ width: `${(result.anomaly_score * 100).toFixed(1)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-[#9CA3AF] mt-1">
                        <span>Normal</span>
                        <span>Warning (50%)</span>
                        <span>Anomaly (60%)</span>
                      </div>
                    </div>
                  )}
                  {result.is_excluded && (
                    <p className="text-xs text-[#6B7280] mt-1">This category is not monitored for anomalies.</p>
                  )}
                </div>
                <button onClick={() => setResult(null)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                  <X size={16} />
                </button>
              </div>
            </div>
          );
        })()}

        {/* Form */}
        <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Amount (Rp)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-sm font-medium">Rp</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                  min="1"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#1A1A1A] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent transition text-sm"
                />
              </div>
              {amount && (
                <p className="text-xs text-[#6B7280] mt-1">{formatRupiah(parseFloat(amount) || 0)}</p>
              )}
            </div>

            {/* Category */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-sm font-medium text-[#374151]">Category</label>
                <button
                  type="button"
                  onClick={() => setShowCategoryInfo(true)}
                  className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                >
                  <Info size={14} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryId(cat.id)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-xs font-medium transition-all ${
                      categoryId === cat.id
                        ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                        : "border-[#E5E7EB] bg-[#F9FAFB] text-[#6B7280] hover:border-[#9CA3AF]"
                    }`}
                  >
                    <span className="text-lg">{CATEGORY_ICONS[cat.name] || "💳"}</span>
                    <span className="text-center leading-tight">{cat.name}</span>
                    {cat.is_excluded && (
                      <span className="text-[8px] opacity-60">no scan</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">
                Note <span className="text-[#9CA3AF] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Lunch with team"
                className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#1A1A1A] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent transition text-sm"
              />
            </div>

            {/* Date & Time */}
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Date & Time</label>
              <input
                type="datetime-local"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#1A1A1A] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent transition text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !categoryId}
              className="w-full py-3.5 rounded-xl bg-[#1A1A1A] text-white font-medium text-sm hover:bg-[#333] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Analyzing..." : "Save Transaction"}
            </button>
          </form>
        </div>
      </main>

      {/* Category Info Modal */}
      {showCategoryInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-[#EBEBEB] w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-[#EBEBEB] sticky top-0 bg-white">
              <h3 className="font-semibold text-[#1A1A1A] text-sm">Category Guide</h3>
              <button onClick={() => setShowCategoryInfo(false)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {Object.entries(CATEGORY_DESCRIPTIONS).map(([cat, desc]) => (
                <div key={cat} className="flex gap-3 p-3 rounded-xl bg-[#F9FAFB]">
                  <span className="text-xl shrink-0">{CATEGORY_ICONS[cat]}</span>
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">{cat}</p>
                    <p className="text-xs text-[#6B7280] mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}