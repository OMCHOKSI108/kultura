"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { User, Lock, Mail, LogOut, CheckCircle2, AlertCircle, X, Shield, ArrowRight } from "lucide-react";

interface AuthModalProps {
  isMandatory?: boolean;
}

export function AuthModal({ isMandatory = false }: AuthModalProps) {
  const { user, isAuthenticated, login, logout, isAuthModalOpen, closeAuthModal } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // If mandatory and user is unauthenticated, always show modal
  if (!isAuthModalOpen && (!isMandatory || isAuthenticated)) return null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setError("Please provide username/email and password.");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await login(identifier, password);
      setSuccess("Authenticated successfully!");
      setTimeout(() => {
        closeAuthModal();
      }, 600);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to sign in. Please verify your credentials.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl transition-all"
        style={{
          background: "#18181B",
          border: "1px solid #27272A",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* Close Button - hidden in mandatory private mode when unauthenticated */}
        {(!isMandatory || isAuthenticated) && (
          <button
            onClick={closeAuthModal}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#27272A] transition"
            aria-label="Close authentication modal"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {isAuthenticated && user ? (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg"
                style={{
                  background: user.role === "admin" ? "linear-gradient(135deg, #FF2D7A, #7928CA)" : "#27272A",
                  color: "#FFF",
                }}
              >
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  {user.username}
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      user.role === "admin"
                        ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                        : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    }`}
                  >
                    {user.role}
                  </span>
                </h3>
                <p className="text-xs text-gray-400">{user.email}</p>
              </div>
            </div>

            <div className="bg-[#202024] p-3.5 rounded-xl border border-[#2E2E33] mb-6 space-y-1.5 text-xs text-gray-300">
              <div className="flex justify-between">
                <span className="text-gray-400">User ID</span>
                <span className="font-mono text-gray-200">{user.id.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Stored Sessions</span>
                <span className="font-semibold text-white">{user.sessions_count ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Account Status</span>
                <span className="text-emerald-400 flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              </div>
            </div>

            <div className="border-t border-[#27272A] pt-4 flex gap-2">
              <button
                onClick={async () => {
                  await logout();
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold border border-red-500/20 transition"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
              <button
                onClick={closeAuthModal}
                className="flex-1 py-2 px-3 rounded-xl bg-[#27272A] hover:bg-[#323236] text-white text-xs font-semibold transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 mb-3">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">Sign In to Kultura</h3>
              <p className="text-xs text-gray-400 mt-1">
                Enter your UserID or Email and password to access your isolated chat history.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  UserID or Email
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="omchoksi99@gmail.com or username"
                    className="w-full bg-[#121214] border border-[#27272A] focus:border-pink-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-600 outline-none transition"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-[#121214] border border-[#27272A] focus:border-pink-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-600 outline-none transition"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-xs text-white transition mt-2 shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #FF2D7A, #7928CA)",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? "Authenticating..." : (
                  <>
                    Sign In <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
