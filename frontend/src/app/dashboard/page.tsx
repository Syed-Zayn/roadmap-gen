"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Loader2, 
  PlusCircle, 
  BookOpen, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  LogOut, 
  GraduationCap,
  Download,
  Target,
  Sparkles,
  PieChart as PieChartIcon,
  Activity,
  BarChart2,
  FileText,
  Flame,
  Trophy,
  Medal,
  Zap,
  Bot,       // FEATURE 8: Mock Interview Icon
  PenTool    // FEATURE 7: Whiteboard Icon
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
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { AxiosError } from "axios";
import api from "../../lib/api";
import { useAppStore } from "../../lib/store";

import VoiceAgent from "../../components/VoiceAgent";
import SkillTree from "./components/SkillTree";

// =======================================================================
// TypeScript Interfaces
// =======================================================================
interface Task {
  id: string;
  status: string;
  task_type: string;
}

interface TaskResource {
  type: string;
  url: string;
}

interface AIMilestone {
  week_number: number;
  milestone_title: string;
  tasks: {
    title: string;
    description: string;
    task_type: string;
    estimated_hours: number;
    resources?: TaskResource[];
  }[];
}

interface RoadmapData {
  id: string;
  content: {
    target_domain: string;
    milestones: AIMilestone[];
  };
  tasks: Task[];
  is_active: boolean;
}

interface UserStats {
  current_streak: number;
  max_streak: number;
  points: number;
}

interface LeaderboardEntry {
  id: string;
  email: string;
  points: number;
  current_streak: number;
}

// =======================================================================
// Skeleton Loader
// =======================================================================
const DashboardSkeleton = () => (
  <motion.div 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="container mx-auto px-4 py-8 max-w-7xl"
  >
    <div className="mb-10 space-y-3">
      <div className="h-10 w-64 bg-muted rounded-lg animate-pulse" />
      <div className="h-4 w-96 bg-muted/50 rounded-md animate-pulse" />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 rounded-3xl border border-border bg-card p-8 h-72 animate-pulse flex flex-col justify-between" />
      <div className="rounded-3xl border border-border bg-card p-8 h-72 animate-pulse flex flex-col gap-6 justify-center" />
    </div>
  </motion.div>
);

// =======================================================================
// Main Component
// =======================================================================
export default function DashboardPage() {
  const router = useRouter();
  const { accessToken, userRole, clearAuth, _hasHydrated } = useAppStore();

  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [domain, setDomain] = useState("");
  const [hours, setHours] = useState<number>(10);
  const [skill, setSkill] = useState("Beginner");
  const [streamMessage, setStreamMessage] = useState("Initializing AI Engine...");

  useEffect(() => {
    if (!_hasHydrated) return;

    if (!accessToken) {
      router.push("/login");
      return;
    }
    
    Promise.allSettled([
      fetchCurrentRoadmap(),
      fetchGamificationStats()
    ]).finally(() => {
      setLoading(false);
    });
  }, [accessToken, _hasHydrated, router]);

  // =======================================================================
  // Data Fetchers
  // =======================================================================
  const fetchCurrentRoadmap = async () => {
    try {
      const response = await api.get("/roadmap/get-my-roadmap");
      setRoadmap(response.data);
    } catch (err: unknown) {
      const axiosError = err as AxiosError;
      if (axiosError.response?.status !== 404) {
        setError("Failed to load dashboard data. Please check your connection.");
      }
    }
  };

  const fetchGamificationStats = async () => {
    try {
      const [profileRes, leaderboardRes] = await Promise.all([
        api.get("/users/me").catch(() => null),
        api.get("/users/leaderboard").catch(() => null)
      ]);
      
      if (profileRes?.data) setUserStats(profileRes.data);
      if (leaderboardRes?.data) setLeaderboard(leaderboardRes.data);
    } catch (err) {
      console.warn("Gamification engine currently offline or sync failed.");
    }
  };

  // =======================================================================
  // Action Handlers
  // =======================================================================
  const handleGenerateRoadmap = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    setError(null);
    setStreamMessage("Connecting to Curriculum Engine...");

    const payload = { target_domain: domain, weekly_hours: hours, skill_level: skill };

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002/api/v1";
      const token = useAppStore.getState().accessToken;

      const response = await fetch(`${baseUrl}/roadmap/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Failed to connect to the AI engine.");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");

      if (!reader) throw new Error("Browser does not support streaming.");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.substring(6);
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.status === "processing") {
                setStreamMessage(data.message);
              } else if (data.status === "complete") {
                await fetchCurrentRoadmap();
                setGenerating(false);
                return;
              } else if (data.status === "error") {
                setError(data.message);
                setGenerating(false);
                return;
              }
            } catch (parseError) {
              console.error("Error parsing SSE chunk:", parseError);
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "AI Engine connection dropped. Please try again.");
      setGenerating(false);
    }
  };

  const handleDownloadPDF = async () => {
    setDownloadingPDF(true);
    try {
      const response = await api.get("/export/pdf", { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'My_Curriculum.pdf');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to generate PDF. Please try again later.");
    } finally {
      setDownloadingPDF(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/login";
  };

  if (!_hasHydrated || loading) return <div className="min-h-screen bg-background"><DashboardSkeleton /></div>;

  // =======================================================================
  // Data Transformations & Chart Colors
  // =======================================================================
  const totalTasks = roadmap?.tasks.length || 0;
  const completedTasks = roadmap?.tasks.filter(t => t.status === "Completed" || t.status === "COMPLETED").length || 0;
  const inProgressTasks = roadmap?.tasks.filter(t => t.status === "In Progress" || t.status === "Pending" || t.status === "PENDING").length || 0;
  const remediationTasks = roadmap?.tasks.filter(t => t.status === "Needs Remediation" || t.status === "NEEDS_REMEDIATION").length || 0;
  const progressPercentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  // ENTERPRISE FIX: Replaced oklch with strict HEX codes for SVG compatibility in Recharts
  const statusColors = {
    Completed: "#3b82f6", // Tailwind blue-500
    InProgress: "#f59e0b", // Tailwind amber-500
    Remediation: "#ef4444" // Tailwind red-500
  };

  const pieData = [
    { name: "Completed", value: completedTasks, color: statusColors.Completed },
    { name: "In Progress", value: inProgressTasks, color: statusColors.InProgress },
    { name: "Remediation", value: remediationTasks, color: statusColors.Remediation }
  ].filter(d => d.value > 0);

  const areaData = roadmap?.content.milestones.map((m) => ({
    name: `Wk ${m.week_number}`,
    hours: m.tasks.reduce((acc, t) => acc + (t.estimated_hours || 0), 0)
  })) || [];

  const resourceCount = roadmap?.tasks.filter(t => t.task_type.toUpperCase() === "RESOURCE").length || 0;
  const quizCount = roadmap?.tasks.filter(t => t.task_type.toUpperCase() === "QUIZ").length || 0;
  const codingCount = roadmap?.tasks.filter(t => t.task_type.toUpperCase() === "CODING").length || 0;

  const barData = [
    { name: "Resource", count: resourceCount },
    { name: "Quiz", count: quizCount },
    { name: "Coding", count: codingCount }
  ];

  // Common Tooltip styles to fix the "Black on Black" bug
  const tooltipContentStyle = { 
    backgroundColor: '#18181b', // zinc-900
    borderColor: 'rgba(255,255,255,0.1)', 
    borderRadius: '12px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
  };
  const tooltipItemStyle = { color: '#f4f4f5', fontWeight: 500 }; // zinc-100
  const tooltipLabelStyle = { color: '#a1a1aa', marginBottom: '4px' }; // zinc-400

  return (
    <div className="min-h-screen bg-background pb-12 relative overflow-hidden">
      
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

      {/* Enterprise Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-background/60 backdrop-blur-xl px-4 md:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-xl border border-primary/20 shadow-[0_0_15px_rgba(100,50,255,0.2)]">
            <GraduationCap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">Student Portal</h1>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Curriculum Manager</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 px-4 py-1.5 bg-black/40 border border-white/10 rounded-full shadow-inner">
            <div className="flex items-center gap-1.5 text-orange-400 font-bold text-sm">
              <Flame className="h-4 w-4 animate-pulse" />
              {userStats?.current_streak || 0}
            </div>
            <div className="h-4 w-[1px] bg-white/10" />
            <div className="flex items-center gap-1.5 text-yellow-400 font-bold text-sm">
              <Zap className="h-4 w-4" />
              {userStats?.points || 0} XP
            </div>
          </div>

          <button
            onClick={() => router.push("/notes")}
            className="flex items-center gap-2 bg-primary/10 border border-primary/20 text-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/20 hover:shadow-[0_0_20px_rgba(100,50,255,0.3)] transition-all active:scale-95"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Knowledge Base</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive px-4 py-2 rounded-xl text-sm font-medium hover:bg-destructive/20 transition-all active:scale-95"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="container mx-auto px-4 py-10 max-w-7xl relative z-10"
      >
        <div className="mb-10 text-center sm:text-left flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground">Your Dashboard</h2>
            <p className="text-muted-foreground mt-2 text-lg">Track your progress and dominate the leaderboards.</p>
          </div>
          {/* Mobile Gamification Badges */}
          <div className="md:hidden flex items-center justify-center gap-4 px-4 py-2 bg-black/40 border border-white/10 rounded-full shadow-inner w-max mx-auto sm:mx-0">
            <div className="flex items-center gap-1.5 text-orange-400 font-bold text-sm">
              <Flame className="h-4 w-4 animate-pulse" /> {userStats?.current_streak || 0}
            </div>
            <div className="flex items-center gap-1.5 text-yellow-400 font-bold text-sm">
              <Zap className="h-4 w-4" /> {userStats?.points || 0} XP
            </div>
          </div>
        </div>

        {/* =======================================================================
            KILLER FEATURES QUICK ACCESS BAR
            ======================================================================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <button 
            onClick={() => router.push("/interview")}
            className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-900/40 to-blue-800/20 border border-blue-500/30 p-6 flex items-center gap-4 hover:border-blue-400/50 transition-all active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="h-12 w-12 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30 shrink-0">
              <Bot className="h-6 w-6 text-blue-400" />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-bold text-white mb-1">AI Mock Interviewer</h3>
              <p className="text-sm text-blue-200/70">Practice your verbal skills with our stateful Voice AI agent.</p>
            </div>
          </button>

          {(userRole?.toUpperCase() === "TEACHER" || userRole?.toUpperCase() === "SUPERADMIN") && (
            <button 
              onClick={() => router.push("/teacher/whiteboard")}
              className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-900/40 to-purple-800/20 border border-purple-500/30 p-6 flex items-center gap-4 hover:border-purple-400/50 transition-all active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="h-12 w-12 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30 shrink-0">
                <PenTool className="h-6 w-6 text-purple-400" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-bold text-white mb-1">Smart Whiteboard</h3>
                <p className="text-sm text-purple-200/70">Draw wireframes and let AI generate instant React UI code.</p>
              </div>
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {roadmap ? (
            <motion.div 
              key="active-roadmap"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Main Progress Card */}
                <motion.div 
                  whileHover={{ scale: 1.01 }}
                  className="lg:col-span-2 relative rounded-3xl border border-white/10 bg-card p-8 shadow-2xl overflow-hidden group flex flex-col justify-between"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                  
                  <div className="relative z-10">
                    <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center">
                      <BookOpen className="mr-3 h-6 w-6 text-primary" /> Current Curriculum Progress
                    </h2>
                    
                    <div className="mb-4 flex justify-between items-end">
                      <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                        {progressPercentage}%
                      </span>
                      <span className="text-sm font-medium text-muted-foreground bg-white/5 px-3 py-1 rounded-full border border-white/5">
                        {completedTasks} of {totalTasks} Tasks Completed
                      </span>
                    </div>
                    
                    <div className="h-4 w-full bg-black/50 rounded-full overflow-hidden border border-white/5 shadow-inner">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercentage}%` }}
                        transition={{ duration: 1.5, ease: "circOut" }}
                        className="h-full bg-gradient-to-r from-primary to-blue-500 shadow-[0_0_15px_rgba(100,50,255,0.5)]"
                      />
                    </div>
                  </div>

                  <div className="mt-10 flex flex-col sm:flex-row gap-4 relative z-10">
                    <button 
                      onClick={() => router.push("/roadmap")}
                      className="bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-bold hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(100,50,255,0.4)] transition-all active:scale-95 flex-1 sm:flex-none text-center"
                    >
                      Resume Learning
                    </button>
                    <button 
                      onClick={handleDownloadPDF}
                      disabled={downloadingPDF}
                      className="bg-secondary/50 text-secondary-foreground border border-white/10 px-8 py-3.5 rounded-xl font-bold hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center gap-2 flex-1 sm:flex-none disabled:opacity-50"
                    >
                      {downloadingPDF ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                      Export PDF
                    </button>
                  </div>
                </motion.div>

                {/* Leaderboard Card */}
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="rounded-3xl border border-white/10 bg-gradient-to-b from-card to-black/40 p-8 shadow-2xl flex flex-col gap-6 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-32 bg-orange-500/10 blur-[100px] pointer-events-none" />
                  
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2 relative z-10">
                    <Trophy className="h-5 w-5 text-yellow-400" /> Global Leaderboard
                  </h3>

                  <div className="flex-1 space-y-4 relative z-10">
                    {leaderboard.length > 0 ? (
                      leaderboard.slice(0, 3).map((entry, idx) => (
                        <div key={entry.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <span className={`font-black ${idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : 'text-orange-300'}`}>
                              #{idx + 1}
                            </span>
                            <span className="text-sm font-medium text-foreground truncate w-24">{entry.email.split('@')[0]}</span>
                          </div>
                          <span className="text-xs font-bold text-primary">{entry.points} XP</span>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-3 opacity-60">
                        <Medal className="h-10 w-10 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Compete in coding tasks to rank up and earn XP!</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>

              {/* =======================================================================
                  FEATURE 1: INTERACTIVE 3D SKILL TREE
                  ======================================================================= */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full"
              >
                <SkillTree />
              </motion.div>

              {/* Data Visualization Charts Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 🚨 FIX: Recharts Pie Chart with strict HEX colors and visible Tooltip */}
                <div className="rounded-3xl border border-white/5 bg-card/40 backdrop-blur-sm p-6 shadow-xl hover:bg-card/60 transition-colors flex flex-col items-center">
                  <h3 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-wider w-full flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4 text-primary" /> Task Distribution
                  </h3>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} innerRadius={55} outerRadius={75} paddingAngle={5} dataKey="value">
                          {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                        </Pie>
                        <RechartsTooltip 
                          cursor={false} 
                          contentStyle={tooltipContentStyle} 
                          itemStyle={tooltipItemStyle}
                          labelStyle={tooltipLabelStyle}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 🚨 FIX: Recharts Area Chart Tooltip */}
                <div className="rounded-3xl border border-white/5 bg-card/40 backdrop-blur-sm p-6 shadow-xl hover:bg-card/60 transition-colors flex flex-col items-center">
                  <h3 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-wider w-full flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" /> Weekly Effort (Hours)
                  </h3>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={areaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                            {/* Replaced oklch with Hex for strict SVG compatibility */}
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                        <RechartsTooltip 
                          contentStyle={tooltipContentStyle} 
                          itemStyle={tooltipItemStyle}
                          labelStyle={tooltipLabelStyle}
                        />
                        <Area type="monotone" dataKey="hours" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorHours)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 🚨 FIX: Recharts Bar Chart Tooltip & Color */}
                <div className="rounded-3xl border border-white/5 bg-card/40 backdrop-blur-sm p-6 shadow-xl hover:bg-card/60 transition-colors flex flex-col items-center">
                  <h3 className="text-xs font-bold text-muted-foreground mb-4 uppercase tracking-wider w-full flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-primary" /> Modality Breakdown
                  </h3>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                        <RechartsTooltip 
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                          contentStyle={tooltipContentStyle} 
                          itemStyle={tooltipItemStyle}
                          labelStyle={tooltipLabelStyle}
                        />
                        {/* Switched to hex color for strict SVG compatibility */}
                        <Bar dataKey="count" fill="#a855f7" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

            </motion.div>
          ) : (
            // =======================================================================
            // Roadmap Generation UI
            // =======================================================================
            <motion.div 
              key="generate-form"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto"
            >
              <div className="mb-6 p-6 bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-6 shadow-lg backdrop-blur-sm">
                <div>
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Unsure of your starting level?
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Take our quick AI-powered placement test and let the system automatically detect your expertise to design the perfect curriculum.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/pre-assessment")}
                  className="whitespace-nowrap bg-primary/20 text-primary hover:bg-primary border border-primary/30 hover:text-white px-6 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-sm"
                >
                  Take Placement Test
                </button>
              </div>

              <div className="rounded-3xl border border-white/10 bg-card/60 backdrop-blur-xl p-8 shadow-2xl">
                <div className="text-center mb-8">
                  <div className="mx-auto w-16 h-16 bg-white/5 flex items-center justify-center rounded-2xl mb-4 border border-white/10 shadow-inner">
                    <PlusCircle className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-2xl font-extrabold text-foreground">Design Your Path Manually</h2>
                  <p className="text-muted-foreground mt-2">Know what you want? Build a custom roadmap based on your constraints.</p>
                </div>

                <form onSubmit={handleGenerateRoadmap} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">What do you want to learn?</label>
                    <input 
                      required
                      type="text" 
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      placeholder="e.g. Advanced Python Microservices, React Native..." 
                      className="w-full rounded-2xl border border-white/10 bg-black/50 p-4 text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Weekly Hours</label>
                      <input
                        required
                        type="number" min="1" max="168"
                        value={hours}
                        onChange={(e) => setHours(Number(e.target.value))}
                        className="w-full rounded-2xl border border-white/10 bg-black/50 p-4 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Current Skill Level</label>
                      <select
                        value={skill}
                        onChange={(e) => setSkill(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-black/50 p-4 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all appearance-none shadow-inner"
                      >
                        <option value="Beginner">Beginner</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Advanced">Advanced</option>
                      </select>
                    </div>
                  </div>

                  {error && (
                    <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-destructive text-sm text-center bg-destructive/10 p-4 rounded-xl border border-destructive/20 font-medium">
                      {error}
                    </motion.p>
                  )}

                  <button 
                    type="submit" 
                    disabled={generating}
                    className="w-full flex justify-center items-center h-14 bg-gradient-to-r from-primary to-blue-600 text-white rounded-2xl font-bold shadow-[0_0_20px_rgba(100,50,255,0.4)] hover:shadow-[0_0_40px_rgba(100,50,255,0.6)] transition-all disabled:opacity-50 active:scale-[0.98] overflow-hidden"
                  >
                    <AnimatePresence mode="wait">
                      {generating ? (
                        <motion.div key="loading" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center">
                          <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                          <span className="text-left font-medium">{streamMessage}</span>
                        </motion.div>
                      ) : (
                        <motion.span key="generate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          Generate AI Roadmap
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <VoiceAgent />
    </div>
  );
}