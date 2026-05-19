"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Users, 
  BookOpen, 
  Activity, 
  Cpu, 
  LogOut, 
  ShieldAlert,
  Loader2,
  TrendingUp,
  PieChart as PieIcon,
  Trash2,
  Search,
  AlertTriangle
} from "lucide-react";
import { 
  PieChart, 
  Pie, 
  Cell, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import api from "../../../lib/api";
import { useAppStore } from "../../../lib/store";

// =======================================================================
// TypeScript Interfaces
// =======================================================================
interface AdminAnalytics {
  users: {
    total: number;
    students: number;
    teachers: number;
  };
  curriculums: {
    total_generated: number;
    currently_active: number;
  };
  engagement: {
    tasks_attempted: number;
    tasks_completed: number;
    overall_pass_rate_percentage: number;
  };
  platform_compute: {
    total_study_hours_allocated: number;
    ai_roadmap_ratio: number;
  };
}

interface UserDetail {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { accessToken, userRole, clearAuth, _hasHydrated } = useAppStore();
  
  // State Management
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [usersList, setUsersList] = useState<UserDetail[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State for Deletion
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserDetail | null>(null);

  useEffect(() => {
    if (!_hasHydrated) return;

    if (!accessToken) {
      clearAuth();
      router.push("/login");
      return;
    }

    const normalizedRole = String(userRole || "").toUpperCase().trim();
    const isAuthorized = normalizedRole === "SUPERADMIN" || normalizedRole === "ADMIN";

    if (!isAuthorized) {
      setError(`Client Security Block: Your current role is registered as "${userRole || 'Undefined/None'}". Admin privileges are required to view this dashboard.`);
      setLoading(false);
      return;
    }

    // Parallel fetch for both analytics and the user list to reduce perceived latency
    Promise.all([fetchAnalytics(), fetchUsersList()]).finally(() => {
      setLoading(false);
    });
  }, [accessToken, userRole, _hasHydrated, router, clearAuth]);

  // =======================================================================
  // API Calls
  // =======================================================================
  const fetchAnalytics = async () => {
    try {
      const response = await api.get("/admin/analytics/dashboard");
      setData(response.data.data);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setError("Backend Security Block: Access Denied. The server rejected your Admin privileges.");
      } else {
        setError("Failed to connect to the Analytics Engine. Please check server logs.");
      }
    }
  };

  const fetchUsersList = async () => {
    try {
      const response = await api.get("/admin/users");
      setUsersList(response.data);
    } catch (err) {
      console.error("Failed to fetch users list:", err);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    setActionLoading(true);
    try {
      await api.delete(`/admin/users/${userToDelete.id}`);
      
      // Update UI optimistically by filtering out the deleted user
      setUsersList((prev) => prev.filter(user => user.id !== userToDelete.id));
      
      // Refresh KPI analytics to reflect the deleted user's data
      await fetchAnalytics();
      
      setDeleteModalOpen(false);
      setUserToDelete(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to delete user. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  // =======================================================================
  // UI Helpers
  // =======================================================================
  const handleLogout = () => {
    clearAuth();
    window.location.href = "/login";
  };

  const openDeleteModal = (user: UserDetail) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  };

  // Filter users based on search query
  const filteredUsers = usersList.filter(user => 
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
    user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // =======================================================================
  // Render Loading / Error States
  // =======================================================================
  if (!_hasHydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Security Exception</h1>
        <p className="text-muted-foreground max-w-md">{error}</p>
        <button onClick={handleLogout} className="mt-8 px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm">
          Sign Out & Re-Authenticate
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Formatting extracted data for the Recharts components
  const userDemographics = [
    { name: "Students", value: data.users.students, color: "oklch(0.6 0.15 250)" },
    { name: "Teachers", value: data.users.teachers, color: "oklch(0.6 0.15 300)" },
  ];

  const engagementData = [
    { name: "Attempted", value: data.engagement.tasks_attempted },
    { name: "Completed", value: data.engagement.tasks_completed }
  ];

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Enterprise Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-xl px-4 md:px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-destructive/10 p-2 rounded-lg border border-destructive/20">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">SuperAdmin Console</h1>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Enterprise Analytics & User Management</p>
          </div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 bg-secondary border border-border text-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-all">
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </header>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="container mx-auto px-4 py-10 max-w-7xl">
        
        {/* ======================================================================= */}
        {/* KPI SECTION */}
        {/* ======================================================================= */}
        <div className="mb-10">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Platform Overview</h2>
          <p className="text-muted-foreground mt-2">Real-time metrics and system health monitoring.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl"><Users className="h-6 w-6" /></div>
              <h3 className="font-semibold text-muted-foreground">Total Users</h3>
            </div>
            <p className="text-4xl font-black text-foreground">{data.users.total}</p>
          </div>

          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl"><BookOpen className="h-6 w-6" /></div>
              <h3 className="font-semibold text-muted-foreground">Curriculums</h3>
            </div>
            <p className="text-4xl font-black text-foreground">{data.curriculums.total_generated}</p>
            <p className="text-xs text-muted-foreground mt-2">{data.curriculums.currently_active} actively tracking</p>
          </div>

          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-green-500/10 text-green-500 rounded-xl"><TrendingUp className="h-6 w-6" /></div>
              <h3 className="font-semibold text-muted-foreground">Global Pass Rate</h3>
            </div>
            <p className="text-4xl font-black text-foreground">{data.engagement.overall_pass_rate_percentage}%</p>
          </div>

          <div className="bg-card border border-border p-6 rounded-2xl shadow-sm hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-orange-500/10 text-orange-500 rounded-xl"><Cpu className="h-6 w-6" /></div>
              <h3 className="font-semibold text-muted-foreground">Total Compute</h3>
            </div>
            <p className="text-4xl font-black text-foreground">{data.platform_compute.total_study_hours_allocated}<span className="text-lg font-normal text-muted-foreground ml-1">hrs</span></p>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
          {/* User Demographics Pie Chart */}
          <div className="bg-card border border-border p-8 rounded-2xl shadow-sm flex flex-col items-center">
            <h3 className="text-sm font-bold text-muted-foreground mb-6 uppercase tracking-wider w-full flex items-center gap-2">
              <PieIcon className="h-4 w-4" /> User Demographics
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={userDemographics}
                    innerRadius={80}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {userDemographics.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }} itemStyle={{ color: 'var(--foreground)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-6 mt-4">
              {userDemographics.map(demo => (
                <div key={demo.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: demo.color }}></div>
                  <span className="text-sm text-muted-foreground">{demo.name} ({demo.value})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Engagement Funnel Bar Chart */}
          <div className="bg-card border border-border p-8 rounded-2xl shadow-sm flex flex-col items-center">
            <h3 className="text-sm font-bold text-muted-foreground mb-6 uppercase tracking-wider w-full flex items-center gap-2">
              <Activity className="h-4 w-4" /> Task Engagement Funnel
            </h3>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={engagementData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)' }} />
                  <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }} />
                  <Bar dataKey="value" fill="oklch(0.6 0.15 250)" radius={[4, 4, 0, 0]} barSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* USER MANAGEMENT DATA TABLE SECTION */}
        {/* ======================================================================= */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Directory Management
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">View, search, and manage all registered platform users.</p>
          </div>
          
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input 
              type="text" 
              placeholder="Search by email or role..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-card border border-border rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-secondary/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">User ID</th>
                  <th className="px-6 py-4 font-semibold">Email Account</th>
                  <th className="px-6 py-4 font-semibold">System Role</th>
                  <th className="px-6 py-4 font-semibold">Registered On</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {user.id.split('-')[0]}...{user.id.split('-')[4]}
                      </td>
                      <td className="px-6 py-4 font-medium text-foreground">
                        {user.email}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${
                          user.role.toUpperCase() === "SUPERADMIN" 
                            ? "bg-destructive/10 text-destructive border-destructive/20" 
                            : user.role.toUpperCase() === "TEACHER"
                            ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button 
                          onClick={() => openDeleteModal(user)}
                          disabled={user.role.toUpperCase() === "SUPERADMIN"}
                          className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                          title={user.role.toUpperCase() === "SUPERADMIN" ? "Cannot delete SuperAdmin" : "Delete User"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No users found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </motion.div>

      {/* ======================================================================= */}
      {/* SECURE DELETION CONFIRMATION MODAL */}
      {/* ======================================================================= */}
      <AnimatePresence>
        {deleteModalOpen && userToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Confirm User Deletion</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Are you absolutely sure you want to delete <span className="font-semibold text-foreground">{userToDelete.email}</span>? 
                  This action is irreversible and will cascade-delete all their roadmaps, progress records, and private notes.
                </p>
                <div className="flex items-center justify-end gap-3 mt-6">
                  <button 
                    onClick={() => setDeleteModalOpen(false)}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-foreground hover:bg-secondary transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleDeleteUser}
                    disabled={actionLoading}
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors flex items-center gap-2"
                  >
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Confirm Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}