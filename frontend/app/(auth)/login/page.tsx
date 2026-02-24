"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const user = await authApi.login(email, password);
      localStorage.setItem("token", user.access_token);
      localStorage.setItem("user", JSON.stringify({ user_id: user.user_id, name: user.name }));
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login gagal. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center p-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-[#E8F4F0] opacity-60" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-[#FEF3E8] opacity-60" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1A1A1A] mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="white"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-[#1A1A1A] tracking-tight" style={{ fontFamily: "Georgia, serif" }}>
            SpendIt
          </h1>
          <p className="text-[#6B7280] mt-1 text-sm">Spot Big Spends. Stay in Control.</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-sm border border-[#EBEBEB] p-8">
          <h2 className="text-xl font-semibold text-[#1A1A1A] mb-6">Login</h2>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="youremail123@email.com"
                required
                className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#1A1A1A] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent transition text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] text-[#1A1A1A] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#1A1A1A] focus:border-transparent transition text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[#1A1A1A] text-white font-medium text-sm hover:bg-[#333] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? "Login..." : "Login"}
            </button>
          </form>

          <p className="text-center text-sm text-[#6B7280] mt-6">
            Don't have an account?{" "}
            <Link href="/register" className="text-[#1A1A1A] font-medium hover:underline">
              Register Now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}