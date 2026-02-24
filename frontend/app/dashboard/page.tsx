"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { statsApi, transactionApi, modelApi, type Stats, type Transaction, type ColdStartStatus } from "@/lib/api";
import { AlertTriangle, TrendingUp, Wallet, Plus, LogOut, List, Settings, Bell } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  Food: "#FF6B6B",
  Transport: "#4ECDC4",
  Lifestyle: "#45B7D1",
  Entertainment: "#96CEB4",
  Utilities: "#FFEAA7",
  Telecommunication: "#DDA0DD",
  Subscription: "#98D8C8",
  Health: "#FF8C94",
  Education: "#A8E6CF",
  "Big Expense": "#FFD3A5",
};

const CATEGORY_ICONS: Record<string, string> = {
  Food: "🍔", Transport: "🚗", Lifestyle: "👕", Entertainment: "🎮",
  Utilities: "💡", Telecommunication: "📱", Subscription: "📺",
  Health: "🏥", Education: "📚", "Big Expense": "💰",
};

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [coldStart, setColdStart] = useState<ColdStartStatus | null>(null);
  const [modelStatus, setModelStatus] = useState<{ status: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (!stored) { router.push("/login"); return; }
    setUser(JSON.parse(stored));

    const fetchAll = async () => {
      try {
        const [statsData, txData, coldData, modelData] = await Promise.all([
          statsApi.get(month, year),
          transactionApi.getAll(month, year),
          modelApi.coldStartStatus(),
          modelApi.modelStatus(),
        ]);
        setStats(statsData);
        setRecentTransactions(txData.slice(0, 5));
        setColdStart(coldData);
        setModelStatus(modelData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const pieData = stats
    ? Object.entries(stats.by_category).map(([name, data]) => ({
        name, value: data.total, count: data.count,
      }))
    : [];

  const anomalyTransactions = recentTransactions.filter(t => t.anomaly_status === "anomaly" || t.anomaly_status === "warning");

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center">
        <div className="text-[#6B7280] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-56 bg-white border-r border-[#EBEBEB] flex flex-col z-10">
        <div className="p-6 border-b border-[#EBEBEB]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center">
              <Wallet size={14} color="white" />
            </div>
            <span className="font-bold text-[#1A1A1A] text-lg" style={{ fontFamily: "Georgia, serif" }}>
              SpendIt
            </span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {[
            { href: "/dashboard", icon: <TrendingUp size={16} />, label: "Dashboard", active: true },
            { href: "/transactions", icon: <List size={16} />, label: "Transactions" },
            { href: "/add", icon: <Plus size={16} />, label: "Add Transaction" },
            { href: "/settings", icon: <Settings size={16} />, label: "Settings" },
          ].map((item) => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                item.active ? "bg-[#1A1A1A] text-white" : "text-[#6B7280] hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
              }`}>
              {item.icon}{item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-[#EBEBEB]">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-[#E5E7EB] flex items-center justify-center text-xs font-bold text-[#374151]">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <span className="text-sm text-[#374151] font-medium truncate">{user?.name}</span>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#DC2626] transition-colors w-full">
            <LogOut size={16} />Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-56 p-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A1A]">Good {now.getHours() < 12 ? "Morning" : now.getHours() < 17 ? "Afternoon" : "Evening"}, {user?.name?.split(" ")[0]} 👋</h1>
            <p className="text-[#6B7280] text-sm mt-0.5">
              {now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <Link href="/add"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors">
            <Plus size={16} />Add Transaction
          </Link>
        </div>

        {/* Cold Start Banner */}
        {coldStart && !coldStart.is_ready && (
          <div className="mb-6 p-4 rounded-2xl bg-[#FEF3E8] border border-[#FED7AA] flex items-start gap-3">
            <AlertTriangle size={18} className="text-[#F97316] mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[#9A3412]">Building your personal model</p>
              <p className="text-xs text-[#C2410C] mt-0.5">
                {coldStart.total_transactions}/{coldStart.min_global} transactions recorded. Using global model for now.
              </p>
              <div className="mt-2 h-1.5 bg-[#FED7AA] rounded-full overflow-hidden">
                <div className="h-full bg-[#F97316] rounded-full transition-all" style={{ width: `${coldStart.progress_global}%` }} />
              </div>
            </div>
            <span className="text-sm font-bold text-[#F97316]">{Math.round(coldStart.progress_global)}%</span>
          </div>
        )}

        {/* Model Status Badge */}
        {modelStatus && (
          <div className="mb-6">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              modelStatus.status === "personal" ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#E0E7FF] text-[#3730A3]"
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {modelStatus.status === "personal" ? "Personal Model Active" : "Global Model (Cold Start)"}
            </span>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Spent", value: formatRupiah(stats?.total_amount || 0), sub: `${stats?.total_transactions || 0} transactions`, color: "bg-white" },
            { label: "Average/Transaction", value: formatRupiah(stats?.average_amount || 0), sub: `This month`, color: "bg-white" },
            { label: "Anomalies Detected", value: stats?.anomaly_count || 0, sub: "This month", color: stats?.anomaly_count ? "bg-[#FEF2F2]" : "bg-white", textColor: stats?.anomaly_count ? "text-[#DC2626]" : "text-[#1A1A1A]" },
          ].map((card, i) => (
            <div key={i} className={`${card.color} rounded-2xl p-5 border border-[#EBEBEB]`}>
              <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">{card.label}</p>
              <p className={`text-2xl font-bold mt-1 ${card.textColor || "text-[#1A1A1A]"}`}>{card.value}</p>
              <p className="text-xs text-[#9CA3AF] mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
            <h3 className="text-sm font-semibold text-[#1A1A1A] mb-4">Spending by Category</h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                    paddingAngle={3} dataKey="value">
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={CATEGORY_COLORS[entry.name] || "#E5E7EB"} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatRupiah(value as number)} />
                  <Legend iconType="circle" iconSize={8}
                    formatter={(value) => <span className="text-xs text-[#6B7280]">{CATEGORY_ICONS[value] || ""} {value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-[#9CA3AF] text-sm">
                No data yet. Add your first transaction!
              </div>
            )}
          </div>

          {/* Anomaly Alerts + Recent */}
          <div className="space-y-4">
            {/* Anomaly Alerts */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Bell size={15} className="text-[#DC2626]" />
                <h3 className="text-sm font-semibold text-[#1A1A1A]">Anomaly Alerts</h3>
              </div>
              {anomalyTransactions.length > 0 ? (
                <div className="space-y-2">
                  {anomalyTransactions.map((t) => (
                    <div key={t.id} className={`flex items-center justify-between p-3 rounded-xl ${
                      t.anomaly_status === "anomaly" ? "bg-[#FEF2F2]" : "bg-[#FFFBEB]"
                    }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-base">{CATEGORY_ICONS[t.category_name] || "💳"}</span>
                        <div>
                          <p className="text-xs font-medium text-[#1A1A1A]">{t.category_name}</p>
                          <p className="text-xs text-[#6B7280]">{formatRupiah(t.amount)}</p>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        t.anomaly_status === "anomaly" ? "bg-[#DC2626] text-white" : "bg-[#F59E0B] text-white"
                      }`}>
                        {t.anomaly_status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#9CA3AF] text-center py-4">No anomalies detected 🎉</p>
              )}
            </div>

            {/* Recent Transactions */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#1A1A1A]">Recent Transactions</h3>
                <Link href="/transactions" className="text-xs text-[#6B7280] hover:text-[#1A1A1A]">See all</Link>
              </div>
              {recentTransactions.length > 0 ? (
                <div className="space-y-2">
                  {recentTransactions.map((t) => (
                    <div key={t.id} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{CATEGORY_ICONS[t.category_name] || "💳"}</span>
                        <div>
                          <p className="text-xs font-medium text-[#1A1A1A]">{t.category_name}</p>
                          <p className="text-xs text-[#9CA3AF]">{t.note || "—"}</p>
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-[#1A1A1A]">{formatRupiah(t.amount)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#9CA3AF] text-center py-4">No transactions yet.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}