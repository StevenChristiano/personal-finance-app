"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { statsApi, transactionApi, modelApi, type Stats, type Transaction, type ColdStartStatus } from "@/lib/api";
import { AlertTriangle, Plus, Bell, RefreshCw, Sparkles } from "lucide-react";

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

function formatRupiah(amount: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(amount);
}

function formatRupiahShort(amount: number) {
    if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
    if (amount >= 1_000) return `Rp ${(amount / 1_000).toFixed(0)}rb`;
    return `Rp ${amount}`;
}

function formatLastTrained(dateStr: string) {
    const date = new Date(dateStr);
    const now  = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000 / 60); // minutes
    if (diff < 1)   return "just now";
    if (diff < 60)  return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
}

interface MonthlyStats {
    month: number; year: number; label: string;
    total_amount: number; transaction_count: number; anomaly_count: number;
}

interface LowDataCategory {
    category: string;
    count: number;
    min_required: number;
}

interface ModelStatus {
    status: string;
    message: string;
    transaction_count?: number;
    last_trained?: string;
}

export default function DashboardPage() {
    const [user, setUser] = useState<{ name: string } | null>(null);
    const [stats, setStats] = useState<Stats | null>(null);
    const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
    const [coldStart, setColdStart] = useState<ColdStartStatus | null>(null);
    const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
    const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [retraining, setRetraining] = useState(false);
    const [retrainSuccess, setRetrainSuccess] = useState(false);
    const [lowDataCategories, setLowDataCategories] = useState<LowDataCategory[]>([]);

    const now   = new Date();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    useEffect(() => {
        const stored = localStorage.getItem("user");
        if (stored) setUser(JSON.parse(stored));

        const fetchAll = async () => {
            try {
                const [statsData, txData, coldData, modelData, monthlyData] = await Promise.all([
                    statsApi.get(month, year),
                    transactionApi.getAll(month, year),
                    modelApi.coldStartStatus(),
                    modelApi.modelStatus(),
                    statsApi.getMonthly(6),
                ]);
                setStats(statsData);
                setRecentTransactions(txData.slice(0, 5));
                setColdStart(coldData);
                setModelStatus(modelData);
                setMonthlyStats(monthlyData);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const handleRetrain = async () => {
        setRetraining(true);
        setRetrainSuccess(false);
        setLowDataCategories([]);
        try {
            const retrainData = await modelApi.retrain() as { low_data_categories?: LowDataCategory[] };
            // Refresh model status after retrain
            const modelData = await modelApi.modelStatus();
            setModelStatus(modelData);
            setLowDataCategories(retrainData.low_data_categories || []);
            setRetrainSuccess(true);
            setTimeout(() => setRetrainSuccess(false), 4000);
        } catch (e) {
            console.error(e);
        } finally {
            setRetraining(false);
        }
    };

    const pieData = stats
        ? Object.entries(stats.by_category).map(([name, data]) => ({ name, value: data.total }))
        : [];

    const anomalyTransactions = recentTransactions.filter(
        t => t.anomaly_status === "anomaly" || t.anomaly_status === "warning"
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-[#6B7280] text-sm">Loading...</div>
            </div>
        );
    }

    return (
        <div className="p-8">
            {/* Header */}
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-[#1A1A1A]">
                        Good {now.getHours() < 12 ? "Morning" : now.getHours() < 17 ? "Afternoon" : "Evening"}, {user?.name?.split(" ")[0]} 👋
                    </h1>
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

            {/* Model Status + Retrain */}
            {modelStatus && (
                <div className="mb-6 flex items-center gap-3">
                    {/* Status badge */}
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                        modelStatus.status === "personal"
                            ? "bg-[#D1FAE5] text-[#065F46]"
                            : "bg-[#E0E7FF] text-[#3730A3]"
                    }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {modelStatus.status === "personal" ? "Personal Model Active" : "Global Model (Cold Start)"}
                    </span>

                    {/* Last trained info */}
                    {modelStatus.status === "personal" && modelStatus.last_trained && (
                        <span className="text-xs text-[#9CA3AF]">
                            Last trained {formatLastTrained(modelStatus.last_trained)} · {modelStatus.transaction_count} transactions
                        </span>
                    )}

                    {/* Retrain button — only show when enough data */}
                    {coldStart?.is_ready && (
                        <button
                            onClick={handleRetrain}
                            disabled={retraining}
                            className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                retrainSuccess
                                    ? "bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7]"
                                    : modelStatus.status === "personal"
                                    ? "bg-white border border-[#EBEBEB] text-[#6B7280] hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
                                    : "bg-[#1A1A1A] text-white hover:bg-[#333]"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {retrainSuccess ? (
                                <>✓ Model Updated</>
                            ) : retraining ? (
                                <>
                                    <RefreshCw size={12} className="animate-spin" />
                                    Training...
                                </>
                            ) : modelStatus.status === "personal" ? (
                                <>
                                    <RefreshCw size={12} />
                                    Retrain Model
                                </>
                            ) : (
                                <>
                                    <Sparkles size={12} />
                                    Personalize Now
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}

            {/* Low Data Categories Warning */}
            {lowDataCategories.length > 0 && (
                <div className="mb-6 p-4 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A]">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={16} className="text-[#D97706] mt-0.5 shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-medium text-[#92400E]">
                                Some categories need more data for accurate detection
                            </p>
                            <p className="text-xs text-[#B45309] mt-0.5 mb-3">
                                Transactions in these categories may result in false alarms until enough data is collected.
                            </p>
                            <div className="space-y-2">
                                {lowDataCategories.map((cat) => (
                                    <div key={cat.category} className="flex items-center gap-3">
                                        <span className="text-xs text-[#92400E] w-32 font-medium">{cat.category}</span>
                                        <div className="flex-1 h-1.5 bg-[#FDE68A] rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-[#F59E0B] rounded-full transition-all"
                                                style={{ width: `${Math.min((cat.count / cat.min_required) * 100, 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs text-[#B45309] w-16 text-right">
                                            {cat.count}/{cat.min_required}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <button
                            onClick={() => setLowDataCategories([])}
                            className="text-[#D97706] hover:text-[#92400E] text-xs shrink-0"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                    { label: "Total Spent", value: formatRupiah(stats?.total_amount || 0), sub: `${stats?.total_transactions || 0} transactions` },
                    { label: "Average/Transaction", value: formatRupiah(stats?.average_amount || 0), sub: "This month" },
                    {
                        label: "Anomalies Detected", value: stats?.anomaly_count || 0, sub: "This month",
                        color: stats?.anomaly_count ? "bg-[#FEF2F2]" : "bg-white",
                        textColor: stats?.anomaly_count ? "text-[#DC2626]" : "text-[#1A1A1A]",
                    },
                ].map((card, i) => (
                    <div key={i} className={`${card.color || "bg-white"} rounded-2xl p-5 border border-[#EBEBEB]`}>
                        <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide">{card.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${card.textColor || "text-[#1A1A1A]"}`}>{card.value}</p>
                        <p className="text-xs text-[#9CA3AF] mt-0.5">{card.sub}</p>
                    </div>
                ))}
            </div>

            {/* Row 1: Pie Chart + Anomaly/Recent */}
            <div className="grid grid-cols-2 gap-6 mb-6">
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

            {/* Row 2: Monthly Trend */}
            <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-[#1A1A1A]">Monthly Spending Trend</h3>
                        <p className="text-xs text-[#9CA3AF] mt-0.5">Last 6 months overview</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[#6B7280]">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#1A1A1A] inline-block" />Total Spent</span>
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#DC2626] inline-block" />Anomalies</span>
                    </div>
                </div>
                {monthlyStats.length > 0 && monthlyStats.some(m => m.total_amount > 0) ? (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={monthlyStats} barGap={4} barCategoryGap="30%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                            <YAxis tickFormatter={formatRupiahShort} tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={70} />
                            <Tooltip
                                formatter={(value, name) => [
                                    name === "total_amount" ? formatRupiah(value as number) : value,
                                    name === "total_amount" ? "Total Spent" : "Anomalies"
                                ]}
                                contentStyle={{ borderRadius: "12px", border: "1px solid #EBEBEB", fontSize: "12px" }}
                            />
                            <Bar dataKey="total_amount" fill="#1A1A1A" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="anomaly_count" fill="#FCA5A5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-56 flex items-center justify-center text-[#9CA3AF] text-sm">
                        No spending data yet in the last 6 months.
                    </div>
                )}
            </div>
        </div>
    );
}