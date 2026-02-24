"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { modelApi, type ColdStartStatus } from "@/lib/api";
import { Info, Save, RotateCcw } from "lucide-react";

const DEFAULT_WARNING = 50;
const DEFAULT_ANOMALY = 60;

export default function SettingsPage() {
  const router = useRouter();
  const [warningThreshold, setWarningThreshold] = useState(DEFAULT_WARNING);
  const [anomalyThreshold, setAnomalyThreshold] = useState(DEFAULT_ANOMALY);
  const [coldStart, setColdStart] = useState<ColdStartStatus | null>(null);
  const [modelStatus, setModelStatus] = useState<{ status: string; message: string; transaction_count?: number; last_trained?: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (!stored) { router.push("/login"); return; }

    // Load saved thresholds from localStorage
    const savedWarning = localStorage.getItem("threshold_warning");
    const savedAnomaly = localStorage.getItem("threshold_anomaly");
    if (savedWarning) setWarningThreshold(parseInt(savedWarning));
    if (savedAnomaly) setAnomalyThreshold(parseInt(savedAnomaly));

    // Fetch model info
    Promise.all([modelApi.coldStartStatus(), modelApi.modelStatus()])
      .then(([cold, model]) => {
        setColdStart(cold);
        setModelStatus(model);
      })
      .catch(console.error);
  }, []);

  const handleSave = () => {
    setError("");
    if (warningThreshold >= anomalyThreshold) {
      setError("Warning threshold must be lower than anomaly threshold.");
      return;
    }
    if (warningThreshold < 10 || anomalyThreshold > 95) {
      setError("Thresholds must be between 10% and 95%.");
      return;
    }
    localStorage.setItem("threshold_warning", warningThreshold.toString());
    localStorage.setItem("threshold_anomaly", anomalyThreshold.toString());
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleReset = () => {
    setWarningThreshold(DEFAULT_WARNING);
    setAnomalyThreshold(DEFAULT_ANOMALY);
    localStorage.setItem("threshold_warning", DEFAULT_WARNING.toString());
    localStorage.setItem("threshold_anomaly", DEFAULT_ANOMALY.toString());
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const CATEGORY_DESCRIPTIONS: Record<string, { icon: string; description: string; is_excluded: boolean }> = {
    Food:             { icon: "🍔", description: "Daily meals, snacks, coffee, groceries, dining out.", is_excluded: false },
    Transport:        { icon: "🚗", description: "Fuel, ride-hailing, parking, public transport.", is_excluded: false },
    Lifestyle:        { icon: "👕", description: "Fashion, haircuts, gym, beauty, personal care.", is_excluded: false },
    Entertainment:    { icon: "🎮", description: "Movies, concerts, games, hobbies, recreation.", is_excluded: false },
    Utilities:        { icon: "💡", description: "Electricity, water, internet, gas bills.", is_excluded: false },
    Telecommunication:{ icon: "📱", description: "Mobile data plans and top-ups.", is_excluded: false },
    Subscription:     { icon: "📺", description: "Netflix, Spotify, apps, digital memberships.", is_excluded: false },
    Health:           { icon: "🏥", description: "Doctor visits, medicine, hospital fees.", is_excluded: true },
    Education:        { icon: "📚", description: "Tuition, books, courses, workshops.", is_excluded: true },
    "Big Expense":    { icon: "💰", description: "Electronics, furniture, travel, large purchases.", is_excluded: true },
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
            { href: "/add", label: "Add Transaction" },
            { href: "/settings", label: "Settings", active: true },
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
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1A1A1A]">Settings</h1>
          <p className="text-[#6B7280] text-sm mt-0.5">Configure anomaly detection thresholds and view model info</p>
        </div>

        {/* Threshold Settings */}
        <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6 mb-5">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-semibold text-[#1A1A1A]">Anomaly Detection Thresholds</h2>
            <div className="group relative">
              <Info size={13} className="text-[#9CA3AF] cursor-help" />
              <div className="absolute left-5 top-0 w-64 p-3 bg-[#1A1A1A] text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none leading-relaxed">
                Scores below warning = Normal. Between warning and anomaly = Warning. Above anomaly = Anomaly.
              </div>
            </div>
          </div>
          <p className="text-xs text-[#9CA3AF] mb-5">Adjust how sensitive the anomaly detection is for your spending.</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">{error}</div>
          )}

          {saved && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] text-sm">
              ✓ Settings saved successfully!
            </div>
          )}

          {/* Visual threshold bar */}
          <div className="mb-6 p-4 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB]">
            <p className="text-xs text-[#6B7280] mb-3 font-medium">Score Distribution Preview</p>
            <div className="relative h-6 rounded-full overflow-hidden flex">
              <div className="bg-[#16A34A] flex items-center justify-center text-white text-[10px] font-medium transition-all"
                style={{ width: `${warningThreshold}%` }}>
                {warningThreshold > 15 && "Normal"}
              </div>
              <div className="bg-[#F59E0B] flex items-center justify-center text-white text-[10px] font-medium transition-all"
                style={{ width: `${anomalyThreshold - warningThreshold}%` }}>
                {anomalyThreshold - warningThreshold > 8 && "Warning"}
              </div>
              <div className="bg-[#DC2626] flex items-center justify-center text-white text-[10px] font-medium transition-all flex-1">
                {(100 - anomalyThreshold) > 8 && "Anomaly"}
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-[#9CA3AF] mt-1">
              <span>0%</span>
              <span>{warningThreshold}%</span>
              <span>{anomalyThreshold}%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Warning Threshold */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#374151]">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#F59E0B] mr-2" />
                Warning Threshold
              </label>
              <span className="text-sm font-bold text-[#F59E0B]">{warningThreshold}%</span>
            </div>
            <input
              type="range" min={10} max={89} value={warningThreshold}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setWarningThreshold(val);
                if (val >= anomalyThreshold) setAnomalyThreshold(val + 1);
              }}
              className="w-full accent-[#F59E0B] h-2 rounded-full"
            />
            <p className="text-xs text-[#9CA3AF] mt-1">
              Transactions with score ≥ {warningThreshold}% will be flagged as warning.
            </p>
          </div>

          {/* Anomaly Threshold */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#374151]">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#DC2626] mr-2" />
                Anomaly Threshold
              </label>
              <span className="text-sm font-bold text-[#DC2626]">{anomalyThreshold}%</span>
            </div>
            <input
              type="range" min={11} max={95} value={anomalyThreshold}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setAnomalyThreshold(val);
                if (val <= warningThreshold) setWarningThreshold(val - 1);
              }}
              className="w-full accent-[#DC2626] h-2 rounded-full"
            />
            <p className="text-xs text-[#9CA3AF] mt-1">
              Transactions with score ≥ {anomalyThreshold}% will be flagged as anomaly.
            </p>
          </div>

          <div className="flex gap-3">
            <button onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors">
              <Save size={14} />Save Settings
            </button>
            <button onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-[#6B7280] text-sm font-medium hover:bg-[#F9FAFB] transition-colors">
              <RotateCcw size={14} />Reset to Default
            </button>
          </div>

          <p className="text-xs text-[#9CA3AF] mt-3">
            ⚠️ Note: These settings are saved locally and apply to the display only. To change the detection threshold in the model, update <code className="bg-[#F3F4F6] px-1 rounded">THRESHOLD_ANOMALY</code> and <code className="bg-[#F3F4F6] px-1 rounded">THRESHOLD_WARNING</code> in <code className="bg-[#F3F4F6] px-1 rounded">main.py</code>.
          </p>
        </div>

        {/* Model Status */}
        <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6 mb-5">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-4">Model Status</h2>
          {modelStatus && (
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-[#F3F4F6]">
                <span className="text-sm text-[#6B7280]">Active Model</span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  modelStatus.status === "personal" ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#E0E7FF] text-[#3730A3]"
                }`}>
                  {modelStatus.status === "personal" ? "Personal Model" : "Global Model"}
                </span>
              </div>
              {modelStatus.transaction_count && (
                <div className="flex items-center justify-between py-2 border-b border-[#F3F4F6]">
                  <span className="text-sm text-[#6B7280]">Trained on</span>
                  <span className="text-sm font-medium text-[#1A1A1A]">{modelStatus.transaction_count} transactions</span>
                </div>
              )}
              {modelStatus.last_trained && (
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-[#6B7280]">Last Trained</span>
                  <span className="text-sm font-medium text-[#1A1A1A]">
                    {new Date(modelStatus.last_trained).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cold Start Progress */}
        {coldStart && (
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6 mb-5">
            <h2 className="text-sm font-semibold text-[#1A1A1A] mb-1">Personal Model Progress</h2>
            <p className="text-xs text-[#9CA3AF] mb-4">
              Your personal model will be trained after {coldStart.min_global} transactions.
            </p>

            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[#6B7280]">Overall Progress</span>
              <span className="text-xs font-bold text-[#1A1A1A]">{coldStart.total_transactions}/{coldStart.min_global}</span>
            </div>
            <div className="h-2 bg-[#E5E7EB] rounded-full overflow-hidden mb-4">
              <div className="h-full bg-[#1A1A1A] rounded-full transition-all" style={{ width: `${coldStart.progress_global}%` }} />
            </div>

            <div className="space-y-2">
              {Object.entries(coldStart.category_status).map(([cat, status]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-sm w-36 text-[#374151] truncate">{cat}</span>
                  <div className="flex-1 h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${status.is_ready ? "bg-[#16A34A]" : "bg-[#93C5FD]"}`}
                      style={{ width: `${Math.min(status.count / status.min_required * 100, 100)}%` }} />
                  </div>
                  <span className="text-xs text-[#9CA3AF] w-12 text-right">{status.count}/{status.min_required}</span>
                  {status.is_ready && <span className="text-xs text-[#16A34A]">✓</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Reference */}
        <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-4">Category Reference</h2>
          <div className="space-y-2">
            {Object.entries(CATEGORY_DESCRIPTIONS).map(([cat, info]) => (
              <div key={cat} className="flex items-start gap-3 p-3 rounded-xl bg-[#F9FAFB]">
                <span className="text-lg flex-shrink-0">{info.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#1A1A1A]">{cat}</p>
                    {info.is_excluded && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F3F4F6] text-[#9CA3AF]">not monitored</span>
                    )}
                  </div>
                  <p className="text-xs text-[#6B7280] mt-0.5">{info.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}