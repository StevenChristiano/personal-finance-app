"use client";

import { useEffect, useState } from "react";
import { modelApi, settingsApi, syncThresholdCache, type ColdStartStatus } from "@/lib/api";
import { Info, Save, RotateCcw } from "lucide-react";

const DEFAULT_WARNING = 50;
const DEFAULT_ANOMALY = 60;

const CATEGORY_DESCRIPTIONS: Record<string, { icon: string; description: string; is_excluded: boolean }> = {
    Food: { icon: "🍔", description: "Daily meals, snacks, coffee, groceries, dining out.", is_excluded: false },
    Transport: { icon: "🚗", description: "Fuel, ride-hailing, parking, public transport.", is_excluded: false },
    Lifestyle: { icon: "👕", description: "Fashion, haircuts, gym, beauty, personal care.", is_excluded: false },
    Entertainment: { icon: "🎮", description: "Movies, concerts, games, hobbies, recreation.", is_excluded: false },
    Utilities: { icon: "💡", description: "Electricity, water, internet, gas bills.", is_excluded: false },
    Telecommunication: { icon: "📱", description: "Mobile data plans and top-ups.", is_excluded: false },
    Subscription: { icon: "📺", description: "Netflix, Spotify, apps, digital memberships.", is_excluded: false },
    Health: { icon: "🏥", description: "Doctor visits, medicine, hospital fees.", is_excluded: true },
    Education: { icon: "📚", description: "Tuition, books, courses, workshops.", is_excluded: true },
    "Big Expense": { icon: "💰", description: "Electronics, furniture, travel, large purchases.", is_excluded: true },
};

export default function SettingsPage() {
    const [warningThreshold, setWarningThreshold] = useState(DEFAULT_WARNING);
    const [anomalyThreshold, setAnomalyThreshold] = useState(DEFAULT_ANOMALY);
    const [coldStart, setColdStart] = useState<ColdStartStatus | null>(null);
    const [modelStatus, setModelStatus] = useState<{ status: string; message: string; transaction_count?: number; last_trained?: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        settingsApi.get()
            .then((data) => {
                setWarningThreshold(Math.round(data.warning_threshold * 100));
                setAnomalyThreshold(Math.round(data.anomaly_threshold * 100));
                syncThresholdCache(data);
            })
            .catch(() => {
                const w = localStorage.getItem("threshold_warning");
                const a = localStorage.getItem("threshold_anomaly");
                if (w) setWarningThreshold(parseInt(w));
                if (a) setAnomalyThreshold(parseInt(a));
            });

        Promise.all([modelApi.coldStartStatus(), modelApi.modelStatus()])
            .then(([cold, model]) => { setColdStart(cold); setModelStatus(model); })
            .catch(console.error);
    }, []);

    const handleSave = async () => {
        setError("");
        if (warningThreshold >= anomalyThreshold) { setError("Warning threshold must be lower than anomaly threshold."); return; }
        if (warningThreshold < 10 || anomalyThreshold > 95) { setError("Thresholds must be between 10% and 95%."); return; }
        setSaving(true);
        try {
            const data = await settingsApi.update({
                warning_threshold: warningThreshold / 100,
                anomaly_threshold: anomalyThreshold / 100,
            });
            syncThresholdCache(data);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        setWarningThreshold(DEFAULT_WARNING);
        setAnomalyThreshold(DEFAULT_ANOMALY);
        setSaving(true);
        try {
            const data = await settingsApi.update({
                warning_threshold: DEFAULT_WARNING / 100,
                anomaly_threshold: DEFAULT_ANOMALY / 100,
            });
            syncThresholdCache(data);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to reset settings.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-[#1A1A1A]">Settings</h1>
                <p className="text-[#6B7280] text-sm mt-0.5">Configure anomaly detection thresholds and view model status</p>
            </div>

            {/* 2-column grid */}
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">

                {/* ── LEFT COLUMN ── */}
                <div className="space-y-6">

                    {/* Threshold Settings */}
                    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
                        <div className="flex items-center gap-2 mb-5">
                            <h2 className="text-base font-semibold text-[#1A1A1A]">Anomaly Detection Thresholds</h2>
                            <div className="group relative">
                                <Info size={15} className="text-[#9CA3AF] cursor-help" />
                                <div className="absolute left-5 -top-1 w-64 p-3 rounded-xl bg-[#1A1A1A] text-white text-xs leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                                    Thresholds define when a transaction score triggers an alert. Saved to your account — apply across all devices.
                                </div>
                            </div>
                        </div>

                        {error && <div className="mb-4 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">{error}</div>}
                        {saved && <div className="mb-4 px-4 py-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] text-sm">✓ Thresholds saved successfully!</div>}

                        {/* Warning Threshold */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-[#374151]">Warning Threshold</label>
                                <div className="flex items-center gap-1">
                                    <span className="text-xl font-bold text-[#D97706]">{warningThreshold}</span>
                                    <span className="text-sm text-[#9CA3AF]">%</span>
                                </div>
                            </div>
                            <input type="range" min="10" max="90" value={warningThreshold}
                                onChange={(e) => setWarningThreshold(parseInt(e.target.value))}
                                className="w-full accent-[#D97706]" />
                            <div className="flex justify-between text-xs text-[#9CA3AF] mt-1"><span>10%</span><span>90%</span></div>
                        </div>

                        {/* Anomaly Threshold */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-[#374151]">Anomaly Threshold</label>
                                <div className="flex items-center gap-1">
                                    <span className="text-xl font-bold text-[#DC2626]">{anomalyThreshold}</span>
                                    <span className="text-sm text-[#9CA3AF]">%</span>
                                </div>
                            </div>
                            <input type="range" min="20" max="95" value={anomalyThreshold}
                                onChange={(e) => setAnomalyThreshold(parseInt(e.target.value))}
                                className="w-full accent-[#DC2626]" />
                            <div className="flex justify-between text-xs text-[#9CA3AF] mt-1"><span>20%</span><span>95%</span></div>
                        </div>

                        {/* Preview Bar */}
                        <div className="mb-6 p-4 rounded-xl bg-[#F9FAFB] border border-[#EBEBEB]">
                            <p className="text-xs font-medium text-[#6B7280] mb-3">Live Preview</p>
                            <div className="relative h-3 bg-[#E5E7EB] rounded-full overflow-hidden">
                                <div className="absolute left-0 top-0 h-full bg-[#16A34A] rounded-full" style={{ width: `${warningThreshold}%` }} />
                                <div className="absolute top-0 h-full bg-[#F59E0B] rounded-full" style={{ left: `${warningThreshold}%`, width: `${anomalyThreshold - warningThreshold}%` }} />
                                <div className="absolute top-0 h-full bg-[#DC2626] rounded-full" style={{ left: `${anomalyThreshold}%`, right: 0 }} />
                            </div>
                            <div className="flex justify-between text-xs mt-2">
                                <span className="text-[#16A34A] font-medium">Normal (&lt;{warningThreshold}%)</span>
                                <span className="text-[#F59E0B] font-medium">Warning ({warningThreshold}–{anomalyThreshold}%)</span>
                                <span className="text-[#DC2626] font-medium">Anomaly (&gt;{anomalyThreshold}%)</span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button onClick={handleReset} disabled={saving}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#374151] hover:bg-[#F9FAFB] transition-colors disabled:opacity-50">
                                <RotateCcw size={14} />Reset
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors disabled:opacity-50">
                                <Save size={14} />{saving ? "Saving..." : "Save Thresholds"}
                            </button>
                        </div>
                    </div>

                    {/* Category Reference */}
                    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-6">
                        <h2 className="text-base font-semibold text-[#1A1A1A] mb-4">Category Reference</h2>
                        <div className="space-y-2">
                            {Object.entries(CATEGORY_DESCRIPTIONS).map(([cat, info]) => (
                                <div key={cat} className="flex items-start gap-3 p-3 rounded-xl hover:bg-[#F9FAFB] transition-colors">
                                    <span className="text-xl">{info.icon}</span>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium text-[#1A1A1A]">{cat}</p>
                                            {info.is_excluded && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#F3F4F6] text-[#9CA3AF]">no anomaly scan</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-[#6B7280] mt-0.5">{info.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── RIGHT COLUMN ── */}
                <div className="space-y-4 xl:sticky xl:top-8">

                    {/* Model Status */}
                    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5">
                        <h2 className="text-sm font-semibold text-[#1A1A1A] mb-4">Model Status</h2>
                        {modelStatus ? (
                            <div>
                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-3 ${modelStatus.status === "personal" ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#E0E7FF] text-[#3730A3]"}`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    {modelStatus.status === "personal" ? "Personal Model Active" : "Global Model (Cold Start)"}
                                </div>
                                <p className="text-sm text-[#6B7280]">{modelStatus.message}</p>
                                {modelStatus.transaction_count !== undefined && (
                                    <p className="text-xs text-[#9CA3AF] mt-2">Trained on {modelStatus.transaction_count} transactions</p>
                                )}
                                {modelStatus.last_trained && (
                                    <p className="text-xs text-[#9CA3AF]">Last trained: {new Date(modelStatus.last_trained).toLocaleString()}</p>
                                )}
                            </div>
                        ) : <p className="text-sm text-[#9CA3AF]">Loading model status...</p>}
                    </div>

                    {/* Cold Start Progress */}
                    {coldStart && !coldStart.is_ready && (
                        <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5">
                            <h2 className="text-sm font-semibold text-[#1A1A1A] mb-4">Cold Start Progress</h2>
                            <div className="space-y-3">
                                {[
                                    { label: "Global Model", progress: coldStart.progress_global, min: coldStart.min_global, color: "bg-[#1A1A1A]" },
                                    { label: "Personal Model", progress: coldStart.progress_personal, min: coldStart.min_personal, color: "bg-[#6366F1]" },
                                ].map((item) => (
                                    <div key={item.label}>
                                        <div className="flex justify-between text-xs text-[#6B7280] mb-1">
                                            <span>{item.label}</span>
                                            <span>{coldStart.total_transactions}/{item.min} transactions</span>
                                        </div>
                                        <div className="h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
                                            <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${item.progress}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Current Threshold Summary */}
                    <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5">
                        <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Current Thresholds</h2>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-[#6B7280]">Normal</span>
                                <span className="text-xs font-medium text-[#16A34A]">&lt; {warningThreshold}%</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-[#6B7280]">Warning</span>
                                <span className="text-xs font-medium text-[#D97706]">{warningThreshold}% – {anomalyThreshold}%</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-[#6B7280]">Anomaly</span>
                                <span className="text-xs font-medium text-[#DC2626]">&gt; {anomalyThreshold}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
