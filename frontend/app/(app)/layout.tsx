"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Wallet, TrendingUp, List, Plus, Settings, LogOut, DollarSign, Menu, X } from "lucide-react";

const NAV_ITEMS = [
    { href: "/dashboard", Icon: TrendingUp, label: "Dashboard" },
    { href: "/transactions", Icon: List, label: "Expenses" },
    { href: "/add", Icon: Plus, label: "Add Expense" },
    { href: "/income", Icon: DollarSign, label: "Income" },
    { href: "/settings", Icon: Settings, label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<{ name: string } | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem("user");
        if (!stored) { router.push("/login"); return; }
        setUser(JSON.parse(stored));
    }, [router]);

    // Close mobile menu on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [pathname]);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        router.push("/login");
    };

    return (
        <div className="min-h-screen bg-[#F7F7F5]">
            {/* ── Mobile Header ── */}
            <div className="md:hidden sticky top-0 z-20 bg-white border-b border-[#EBEBEB] px-4 py-3 flex items-center gap-3">
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="p-1.5 -ml-1.5 rounded-lg text-[#1A1A1A] hover:bg-[#F3F4F6] transition-colors"
                >
                    <Menu size={22} />
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-[#1A1A1A] flex items-center justify-center">
                        <Wallet size={12} color="white" />
                    </div>
                    <span className="font-bold text-[#1A1A1A] text-base" style={{ fontFamily: "Georgia, serif" }}>
                        SpendIt
                    </span>
                </div>
            </div>

            {/* ── Mobile Menu Backdrop ── */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-30 md:hidden transition-opacity"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* ── Sidebar ── */}
            <aside className={`fixed left-0 top-0 h-full w-64 md:w-56 bg-white border-r border-[#EBEBEB] flex flex-col z-40 transition-transform duration-300 ease-in-out
                ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
            `}>
                {/* Logo */}
                <div className="p-6 border-b border-[#EBEBEB] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#1A1A1A] flex items-center justify-center">
                            <Wallet size={14} color="white" />
                        </div>
                        <span className="font-bold text-[#1A1A1A] text-lg" style={{ fontFamily: "Georgia, serif" }}>
                            SpendIt
                        </span>
                    </div>
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="md:hidden p-1 rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#1A1A1A]"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-4 space-y-1">
                    {NAV_ITEMS.map(({ href, Icon, label }) => (
                        <Link key={href} href={href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${pathname === href
                                ? "bg-[#1A1A1A] text-white"
                                : "text-[#6B7280] hover:bg-[#F7F7F5] hover:text-[#1A1A1A]"
                                }`}>
                            <Icon size={16} />{label}
                        </Link>
                    ))}
                </nav>

                {/* User + Logout */}
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

            {/* ── Page Content ── */}
            <main className="md:ml-56 min-h-screen">
                {children}
            </main>
        </div>
    );
}
