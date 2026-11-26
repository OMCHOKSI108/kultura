"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import {
  fetchUsersApi,
  createUserApi,
  deleteUserApi,
  updateUserPasswordApi,
} from "@/lib/api";
import type { User, CreateUserPayload } from "@/types/auth";
import {
  Users,
  UserPlus,
  Trash2,
  KeyRound,
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowLeft,
  Lock,
  Mail,
  User as UserIcon,
  MessageSquare,
  ShieldCheck,
  Eye,
  EyeOff,
} from "lucide-react";

export function UsersManagementView({ onClose }: { onClose: () => void }) {
  const { user: currentUser, isAdmin, openAuthModal } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Form state for creating user
  const [formData, setFormData] = useState<CreateUserPayload>({
    username: "",
    email: "",
    password: "",
    role: "user",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchUsersApi();
      setUsers(data);
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.username.trim() || !formData.password.trim()) {
      setFormError("UserID/Username and Password are required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      // Auto-generate email if left empty
      const payload: CreateUserPayload = {
        username: formData.username.trim(),
        email: formData.email.trim() || `${formData.username.trim().toLowerCase()}@kultura.local`,
        password: formData.password,
        role: formData.role,
      };

      const created = await createUserApi(payload);
      setFormSuccess(`User '${created.username}' created successfully!`);
      setFormData({
        username: "",
        email: "",
        password: "",
        role: "user",
      });
      loadUsers();
      setTimeout(() => {
        setIsCreateOpen(false);
        setFormSuccess(null);
      }, 1000);
    } catch (err: any) {
      setFormError(err?.message || "Failed to create user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteUser(userToDelete: User) {
    if (userToDelete.id === currentUser?.id) {
      alert("You cannot delete your own logged-in account.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete user '${userToDelete.username}'? All their private chat sessions and query data will be permanently wiped.`
    );
    if (!confirmed) return;

    try {
      await deleteUserApi(userToDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
    } catch (err: any) {
      alert(err?.message || "Failed to delete user");
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTargetUser || !newPassword.trim()) return;

    try {
      await updateUserPasswordApi(resetTargetUser.id, newPassword.trim());
      alert(`Password for user '${resetTargetUser.username}' updated successfully.`);
      setResetTargetUser(null);
      setNewPassword("");
    } catch (err: any) {
      alert(err?.message || "Failed to update password");
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-[#121214] text-gray-200 overflow-y-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#222225] bg-[#17171A]">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#252528] transition"
            title="Back to Chat"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white flex items-center gap-2">
              User Management & Access Control
              <span className="text-[10px] bg-pink-500/20 text-pink-400 border border-pink-500/30 px-2 py-0.5 rounded-full font-bold">
                Admin Area
              </span>
            </h1>
            <p className="text-xs text-gray-400">
              Create and manage isolated user accounts (UserID + Password). Each user’s queries and session history are strictly private.
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-white shadow-md hover:opacity-90 transition"
            style={{ background: "linear-gradient(135deg, #FF2D7A, #7928CA)" }}
          >
            <UserPlus className="w-4 h-4" /> Create New User
          </button>
        )}
      </div>

      {/* Non-Admin Notification */}
      {!isAdmin ? (
        <div className="m-6 p-8 rounded-2xl bg-[#1A1A1E] border border-[#27272A] text-center max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-white">Administrator Privileges Required</h2>
          <p className="text-xs text-gray-400">
            You are currently browsing as a standard user or unauthenticated guest. Sign in with the system administrator credentials configured in your <code className="text-pink-400 bg-pink-950/40 px-1 py-0.5 rounded">.env</code> (<code className="text-gray-300">ADMIN_ID</code> & <code className="text-gray-300">ADMIN_PASS</code>) to create and manage accounts.
          </p>
          <button
            onClick={openAuthModal}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white shadow-md hover:opacity-90 transition"
            style={{ background: "linear-gradient(135deg, #FF2D7A, #7928CA)" }}
          >
            Sign In as Admin
          </button>
        </div>
      ) : (
        <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
          {/* Quick Metrics & Search Bar */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center">
            <div className="flex items-center gap-3">
              <div className="bg-[#1A1A1E] border border-[#27272A] px-4 py-2.5 rounded-xl flex items-center gap-3 text-xs">
                <span className="text-gray-400">Total Users:</span>
                <span className="font-bold text-white text-sm">{users.length}</span>
              </div>
              <div className="bg-[#1A1A1E] border border-[#27272A] px-4 py-2.5 rounded-xl flex items-center gap-3 text-xs">
                <span className="text-gray-400">Isolated Sessions:</span>
                <span className="font-bold text-emerald-400 text-sm">
                  {users.reduce((acc, u) => acc + (u.sessions_count || 0), 0)}
                </span>
              </div>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search user or email..."
                className="w-full bg-[#18181B] border border-[#27272A] focus:border-pink-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 outline-none transition"
              />
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-[#17171A] border border-[#222225] rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#222225] bg-[#1C1C20] text-gray-400 uppercase text-[11px] tracking-wider font-semibold">
                    <th className="py-3.5 px-4">User Details</th>
                    <th className="py-3.5 px-4">Role</th>
                    <th className="py-3.5 px-4">Stored Sessions</th>
                    <th className="py-3.5 px-4">Created Date</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222225]">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        Loading users...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        No users found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => {
                      const isCurrent = u.id === currentUser?.id;
                      return (
                        <tr key={u.id} className="hover:bg-[#1C1C20]/60 transition">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
                                style={{
                                  background:
                                    u.role === "admin"
                                      ? "linear-gradient(135deg, #FF2D7A, #7928CA)"
                                      : "#2E2E33",
                                  color: "#FFF",
                                }}
                              >
                                {u.username.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-semibold text-white flex items-center gap-2">
                                  {u.username}
                                  {isCurrent && (
                                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-gray-400 text-[11px]">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                u.role === "admin"
                                  ? "bg-pink-500/20 text-pink-400 border border-pink-500/30"
                                  : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                              }`}
                            >
                              {u.role === "admin" && <ShieldCheck className="w-3 h-3" />}
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 text-gray-300">
                              <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
                              <span className="font-mono font-medium">{u.sessions_count ?? 0}</span>
                              <span className="text-gray-500 text-[11px]">isolated chats</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-gray-400 font-mono text-[11px]">
                            {new Date(u.created_at).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setResetTargetUser(u);
                                  setNewPassword("");
                                }}
                                title="Reset Password"
                                className="p-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-[#252528] transition"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u)}
                                disabled={isCurrent}
                                title={isCurrent ? "Cannot delete yourself" : "Delete User"}
                                className={`p-1.5 rounded-lg transition ${
                                  isCurrent
                                    ? "opacity-30 cursor-not-allowed text-gray-600"
                                    : "text-gray-400 hover:text-red-400 hover:bg-[#252528]"
                                }`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div
            className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl transition-all"
            style={{
              background: "#18181B",
              border: "1px solid #27272A",
            }}
          >
            <button
              onClick={() => setIsCreateOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#27272A] transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-5">
              <div className="w-10 h-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400 mb-3">
                <UserPlus className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold text-white">Create New User</h3>
              <p className="text-xs text-gray-400 mt-1">
                Configure UserID and credentials. Passwords are encrypted with bcrypt (12 rounds) and access tokens are signed via JWT.
              </p>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  UserID / Username <span className="text-pink-400">*</span>
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. dev_sarah or john_doe"
                    className="w-full bg-[#121214] border border-[#27272A] focus:border-pink-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-600 outline-none transition"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  Email Address <span className="text-gray-500 font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="user@kultura.ai"
                    className="w-full bg-[#121214] border border-[#27272A] focus:border-pink-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-600 outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  Password <span className="text-pink-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full bg-[#121214] border border-[#27272A] focus:border-pink-500 rounded-xl pl-9 pr-10 py-2 text-xs text-white placeholder-gray-600 outline-none transition"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  Account Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: "user" })}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${
                      formData.role === "user"
                        ? "bg-pink-500/10 border-pink-500 text-pink-400"
                        : "bg-[#121214] border-[#27272A] text-gray-400 hover:text-gray-300"
                    }`}
                  >
                    Standard User
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, role: "admin" })}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition ${
                      formData.role === "admin"
                        ? "bg-pink-500/10 border-pink-500 text-pink-400"
                        : "bg-[#121214] border-[#27272A] text-gray-400 hover:text-gray-300"
                    }`}
                  >
                    Administrator
                  </button>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-[#27272A] hover:bg-[#323236] text-gray-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2 rounded-xl font-semibold text-xs text-white shadow-lg transition"
                  style={{
                    background: "linear-gradient(135deg, #FF2D7A, #7928CA)",
                    opacity: isSubmitting ? 0.7 : 1,
                  }}
                >
                  {isSubmitting ? "Creating..." : "Save User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-2xl p-6 bg-[#18181B] border border-[#27272A] shadow-2xl">
            <button
              onClick={() => setResetTargetUser(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-[#27272A] transition"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-semibold text-white flex items-center gap-2 mb-1">
              <KeyRound className="w-4 h-4 text-amber-400" /> Reset Password
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Enter a new password for user <span className="font-semibold text-white">{resetTargetUser.username}</span>.
            </p>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full bg-[#121214] border border-[#27272A] focus:border-pink-500 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-600 outline-none transition"
                  required
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="flex-1 py-2 rounded-xl bg-[#27272A] hover:bg-[#323236] text-gray-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl font-semibold text-xs text-white bg-amber-500 hover:bg-amber-600 transition shadow-lg"
                >
                  Save Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
