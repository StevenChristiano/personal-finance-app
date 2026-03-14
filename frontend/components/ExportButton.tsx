"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, X, RefreshCw } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ExportButtonProps {
    month: number;
    year: number;
    warningThreshold?: number;
    anomalyThreshold?: number;
}

export default function ExportButton({ month, year, warningThreshold = 0.5, anomalyThreshold = 0.6 }: ExportButtonProps) {
    const [showModal,     setShowModal]     = useState(false);
    const [includeScore,  setIncludeScore]  = useState(false);
    const [exporting,     setExporting]     = useState<"excel" | "pdf" | null>(null);

    const MONTHS_ID = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
                       "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

    const handleExport = async (format: "excel" | "pdf") => {
        setExporting(format);
        try {
            const token  = localStorage.getItem("token");
            const params = new URLSearchParams({
                month             : String(month),
                year              : String(year),
                include_score     : String(includeScore),
                warning_threshold : String(warningThreshold),
                anomaly_threshold : String(anomalyThreshold),
            });
            const res = await fetch(
                `${API_URL}/transactions/export/${format}?${params}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) throw new Error("Export failed");

            const blob     = await res.blob();
            const url      = URL.createObjectURL(blob);
            const a        = document.createElement("a");
            a.href         = url;
            a.download     = `transaksi_${MONTHS_ID[month].toLowerCase()}_${year}.${format === "excel" ? "xlsx" : "pdf"}`;
            a.click();
            URL.revokeObjectURL(url);
            setShowModal(false);
        } catch (e) {
            console.error(e);
        } finally {
            setExporting(null);
        }
    };

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1A1A1A] text-white text-sm font-medium hover:bg-[#333] transition-colors"
            >
                <Download size={15} />
                Export
            </button>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                    <div className="bg-white rounded-2xl shadow-xl p-6 w-80">

                        {/* Header */}
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h3 className="text-sm font-bold text-[#1A1A1A]">Export Transaksi</h3>
                                <p className="text-xs text-[#9CA3AF] mt-0.5">{MONTHS_ID[month]} {year}</p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-1.5 rounded-lg hover:bg-[#F3F4F6] text-[#9CA3AF] hover:text-[#1A1A1A] transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Include score toggle */}
                        <div className="mb-5 p-3 rounded-xl bg-[#F9FAFB] border border-[#EBEBEB]">
                            <label className="flex items-center justify-between cursor-pointer">
                                <div>
                                    <p className="text-sm font-medium text-[#374151]">Sertakan Anomaly Score</p>
                                    <p className="text-xs text-[#9CA3AF]">Tambah kolom score (0–100%) di export</p>
                                </div>
                                <div
                                    onClick={() => setIncludeScore(v => !v)}
                                    className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ml-3 ${includeScore ? "bg-[#4F46E5]" : "bg-[#E5E7EB]"}`}
                                >
                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${includeScore ? "left-4" : "left-0.5"}`} />
                                </div>
                            </label>
                        </div>

                        {/* Export buttons */}
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => handleExport("excel")}
                                disabled={exporting !== null}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] hover:bg-[#DCFCE7] transition-colors disabled:opacity-50"
                            >
                                {exporting === "excel"
                                    ? <RefreshCw size={16} className="animate-spin" />
                                    : <FileSpreadsheet size={16} />
                                }
                                <div className="text-left">
                                    <p className="text-sm font-semibold">Excel (.xlsx)</p>
                                    <p className="text-xs opacity-70">Spreadsheet dengan formatting</p>
                                </div>
                            </button>

                            <button
                                onClick={() => handleExport("pdf")}
                                disabled={exporting !== null}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] hover:bg-[#FEE2E2] transition-colors disabled:opacity-50"
                            >
                                {exporting === "pdf"
                                    ? <RefreshCw size={16} className="animate-spin" />
                                    : <FileText size={16} />
                                }
                                <div className="text-left">
                                    <p className="text-sm font-semibold">PDF</p>
                                    <p className="text-xs opacity-70">Laporan siap cetak</p>
                                </div>
                            </button>
                        </div>

                    </div>
                </div>
            )}
        </>
    );
}