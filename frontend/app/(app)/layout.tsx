"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Wallet, TrendingUp, List, Plus, Settings, LogOut, DollarSign } from "lucide-react";

const NAV_ITEMS = [
    { href: "/dashboard", Icon: TrendingUp, label: "Dashboard" },
    { href: "/transactions", Icon: List, label: "Transactions" },
    { href: "/add", Icon: Plus, label: "Add Transaction" },
    { href: "/income", Icon: DollarSign, label: "Income" },
    { href: "/settings", Icon: Settings, label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [user, setUser] = useState<{ name: string } | null>(null);

    useEffect(() => {
        const stored = localStorage.getItem("user");
        if (!stored) { router.push("/login"); return; }
        setUser(JSON.parse(stored));
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        router.push("/login");
    };

    return (
        <div className="min-h-screen bg-[#F7F7F5]">
            {/* ── Sidebar ── */}
            <aside className="fixed left-0 top-0 h-full w-56 bg-white border-r border-[#EBEBEB] flex flex-col z-10">
                {/* Logo */}
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
            <main className="ml-56">
                {children}
            </main>
        </div>
    );
}
