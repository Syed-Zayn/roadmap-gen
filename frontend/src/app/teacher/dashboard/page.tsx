"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Loader2, 
  Users, 
  Map, 
  TrendingUp, 
  AlertTriangle, 
  Download, 
  LogOut,
  ShieldAlert,
  MessageSquare,
  X,
  Send,
  Bot,
  User as UserIcon,
  ChevronRight
} from "lucide-react";
import { AxiosError } from "axios";
import api from "../../../lib/api";
import { useAppStore } from "../../../lib/store";

// =======================================================================
// TypeScript Interfaces matched exactly to the FastAPI Backend Schemas
// =======================================================================
interface StudentProgressOverview {
  student_id: string;
  email: string;
  target_domain: string | null;
  completion_percentage: number;
  is_at_risk: boolean;
}

interface TeacherDashboardResponse {
  total_students: number;
  active_roadmaps: number;
  class_average_completion: number;
  at_risk_students: StudentProgressOverview[];
  all_students: StudentProgressOverview[];
}

interface ChatMessage {
  role: "user" | "agent";
  text: string;
}

export default function TeacherDashboardPage() {
  const router = useRouter();
  
  // Enterprise Guard integrated with Hydration flag
  const { accessToken, clearAuth, _hasHydrated } = useAppStore();

  const [dashboardData, setDashboardData] = useState<TeacherDashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // =======================================================================
  // AI Chat Agent State
  // =======================================================================
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "agent", text: "Hello, Instructor! I am your AI assistant. I can help you analyze student progress or answer system queries. How can I assist you today?" }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [conversationId] = useState(() => crypto.randomUUID());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Strict Enterprise Guard: Waits for Hydration before attempting redirect
  useEffect(() => {
    // Prevent premature redirects if Zustand is still reading from LocalStorage
    if (!_hasHydrated) return;

    if (!accessToken) {
      router.push("/login");
      return;
    }
    fetchAnalytics();
  }, [accessToken, _hasHydrated, router]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isChatOpen]);

  const fetchAnalytics = async () => {
    try {
      const response = await api.get("/teacher/dashboard");
      setDashboardData(response.data);
      setError(null);
    } catch (err) {
      const axiosError = err as AxiosError;
      if (axiosError.response?.status === 403) {
        setError("Unauthorized Access: Only instructors can view this dashboard.");
      } else {
        setError("Failed to fetch class analytics. Please check the backend connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const response = await api.get("/teacher/export-csv", {
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "class_analytics_report.csv");
      document.body.appendChild(link);
      link.click();
      
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export CSV report.");
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = () => {
    clearAuth();
    window.location.href = "/login";
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    setChatMessages(prev => [...prev, { role: "user", text: userText }]);
    setChatInput("");
    setIsChatLoading(true);

    try {
      // Dynamic integration with the LangChain AI Chat Endpoint
      const response = await api.post("/chat/message", {
        message: userText,
        conversation_id: conversationId
      });
      
      setChatMessages(prev => [...prev, { role: "agent", text: response.data.reply }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: "agent", text: "System Error: Unable to reach the AI engine at the moment. Please try again later." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Navigate to specific student profile for Human-in-the-Loop review
  const handleStudentClick = (studentId: string) => {
    router.push(`/teacher/student/${studentId}`);
  };

  // =======================================================================
  // Loading & Error States
  // =======================================================================
  
  // Block rendering until hydrated and data is fetched
  if (!_hasHydrated || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-gray-400 text-sm font-medium animate-pulse">Initializing instructor portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-md text-center p-8 rounded-2xl border border-red-500/20 bg-red-500/10 backdrop-blur-md">
          <ShieldAlert className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button 
            onClick={handleLogout}
            className="bg-black text-white px-6 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-all active:scale-95"
          >
            Return to Login
          </button>
        </motion.div>
      </div>
    );
  }

  if (!dashboardData) return null;

  // Staggered animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  };

  // =======================================================================
  // Main Dashboard Render
  // =======================================================================
  return (
    <div className="min-h-screen bg-background pb-16 relative">
      
      {/* Top Navigation / Header */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-md px-8 py-5 flex flex-col md:flex-row gap-4 md:items-center justify-between sticky top-0 z-40">
        <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
          <h1 className="text-2xl font-bold text-white tracking-tight">Instructor Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">Monitor class progress and identify at-risk students.</p>
        </motion.div>
        
        <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="flex items-center gap-4">
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            className="flex items-center gap-2 bg-primary/10 border border-primary/30 text-primary px-5 py-2.5 rounded-lg font-medium hover:bg-primary/20 transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(100,50,255,0.1)] active:scale-95"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export CSV
          </button>
          
          <button
            title="Logout"
            onClick={handleLogout}
            className="flex items-center gap-2 bg-red-500/10 text-red-400 px-5 py-2.5 rounded-lg font-medium hover:bg-red-500/20 transition-all active:scale-95"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </motion.div>
      </header>

      <motion.div 
        variants={containerVariants} 
        initial="hidden" 
        animate="show" 
        className="container mx-auto px-4 md:px-8 mt-10 max-w-7xl"
      >
        
        {/* Metric Cards Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <motion.div variants={itemVariants} className="bg-white/5 border border-white/10 p-6 rounded-2xl shadow-xl flex items-center gap-5 backdrop-blur-sm hover:bg-white/10 transition-colors">
            <div className="p-4 bg-blue-500/10 rounded-xl border border-blue-500/20"><Users className="h-6 w-6 text-blue-400" /></div>
            <div>
              <p className="text-sm text-gray-400 font-medium">Total Registered Students</p>
              <h3 className="text-3xl font-black text-white mt-1">{dashboardData.total_students}</h3>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="bg-white/5 border border-white/10 p-6 rounded-2xl shadow-xl flex items-center gap-5 backdrop-blur-sm hover:bg-white/10 transition-colors">
            <div className="p-4 bg-primary/10 rounded-xl border border-primary/20"><Map className="h-6 w-6 text-primary" /></div>
            <div>
              <p className="text-sm text-gray-400 font-medium">Active Curriculums</p>
              <h3 className="text-3xl font-black text-white mt-1">{dashboardData.active_roadmaps}</h3>
            </div>
          </motion.div>

          <motion.div variants={itemVariants} className="bg-white/5 border border-white/10 p-6 rounded-2xl shadow-xl flex items-center gap-5 backdrop-blur-sm hover:bg-white/10 transition-colors">
            <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20"><TrendingUp className="h-6 w-6 text-green-400" /></div>
            <div>
              <p className="text-sm text-gray-400 font-medium">Class Average Progress</p>
              <h3 className="text-3xl font-black text-white mt-1">{dashboardData.class_average_completion}%</h3>
            </div>
          </motion.div>
        </div>

        {/* At-Risk Alerts Section */}
        <AnimatePresence>
          {dashboardData.at_risk_students.length > 0 && (
            <motion.div 
              variants={itemVariants}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mb-10 rounded-2xl border border-red-500/30 bg-red-500/5 p-6 shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 mb-6">
                <AlertTriangle className="h-6 w-6 text-red-500 animate-pulse" />
                <h2 className="text-xl font-bold text-white">Attention Required (At-Risk Students)</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboardData.at_risk_students.map((student) => (
                  <motion.div 
                    onClick={() => handleStudentClick(student.student_id)}
                    whileHover={{ scale: 1.02 }} 
                    key={student.student_id} 
                    className="bg-black/60 border border-red-500/20 p-4 rounded-xl flex flex-col gap-2 cursor-pointer group"
                  >
                    <span className="text-sm font-medium text-white truncate group-hover:text-primary transition-colors" title={student.email}>{student.email}</span>
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Domain: {student.target_domain || "N/A"}</span>
                      <span className="text-red-400 font-bold">{student.completion_percentage}% Done</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Comprehensive Class Data Table */}
        <motion.div variants={itemVariants} className="bg-white/5 border border-white/10 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
          <div className="px-6 py-5 border-b border-white/10 bg-black/20 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white">Detailed Class Roster</h2>
            <span className="text-xs text-gray-400">Click on a student to view detailed report</span>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-400">
              <thead className="text-xs text-gray-500 uppercase bg-black/40 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 font-medium">Student Email</th>
                  <th className="px-6 py-4 font-medium">Target Learning Domain</th>
                  <th className="px-6 py-4 font-medium">Completion Progress</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.all_students.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      No students have registered yet.
                    </td>
                  </tr>
                ) : (
                  dashboardData.all_students.map((student, i) => (
                    <motion.tr 
                      onClick={() => handleStudentClick(student.student_id)}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                      key={student.student_id} 
                      className="border-b border-white/5 hover:bg-white/10 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4 font-medium text-white group-hover:text-primary transition-colors">{student.email}</td>
                      <td className="px-6 py-4">
                        <span className="bg-white/10 text-gray-300 px-2.5 py-1 rounded-md text-xs border border-white/5">
                          {student.target_domain || "Not Started"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-full bg-black/60 rounded-full h-2 max-w-[120px] overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }} animate={{ width: `${student.completion_percentage}%` }} transition={{ duration: 1, ease: "easeOut" }}
                              className={`h-2 rounded-full ${student.is_at_risk ? "bg-red-500" : "bg-primary"}`} 
                            />
                          </div>
                          <span className="text-xs font-bold text-white">{student.completion_percentage}%</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {student.is_at_risk ? (
                          <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded w-max border border-red-500/20">
                            <AlertTriangle className="h-3 w-3" /> At Risk
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded w-max border border-green-500/20">
                            On Track
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-gray-500 group-hover:text-primary transition-colors flex items-center justify-end w-full">
                          <span className="text-xs mr-2 opacity-0 group-hover:opacity-100 transition-opacity">View Profile</span>
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>

      {/* =======================================================================
          AI Chat Agent Widget (Floating Sidebar)
          ======================================================================= */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-24 right-6 w-80 md:w-96 bg-black/80 backdrop-blur-xl border border-white/20 rounded-2xl shadow-[0_0_40px_rgba(100,50,255,0.2)] flex flex-col overflow-hidden z-50"
            style={{ height: '500px', maxHeight: '80vh' }}
          >
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-primary/80 to-blue-600/80 p-4 flex justify-between items-center border-b border-white/10">
              <div className="flex items-center gap-2 text-white font-bold">
                <Bot className="h-5 w-5" />
                <span>AI Assistant</span>
              </div>
              <button title="go" onClick={() => setIsChatOpen(false)} className="text-white/80 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === "user" ? "bg-white/10" : "bg-primary/20 text-primary border border-primary/30"}`}>
                    {msg.role === "user" ? <UserIcon className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={`p-3 rounded-2xl max-w-[75%] text-sm ${msg.role === "user" ? "bg-white/10 text-white rounded-tr-none" : "bg-black/40 border border-white/5 text-gray-200 rounded-tl-none"}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex gap-3 flex-row">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="p-3 rounded-2xl bg-black/40 border border-white/5 text-gray-200 rounded-tl-none flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" /> Thinking...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Area */}
            <div className="p-3 border-t border-white/10 bg-black/40">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 relative">
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask me anything..."
                  className="w-full bg-white/5 border border-white/10 rounded-full py-2.5 pl-4 pr-12 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                  disabled={isChatLoading}
                />
                <button
                title="go1" 
                  type="submit" 
                  disabled={isChatLoading || !chatInput.trim()}
                  className="absolute right-1.5 p-1.5 bg-primary rounded-full text-white hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button (FAB) to toggle Chat */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsChatOpen(!isChatOpen)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-to-r from-primary to-blue-600 shadow-[0_0_30px_rgba(100,50,255,0.4)] flex items-center justify-center text-white z-50 hover:shadow-[0_0_40px_rgba(100,50,255,0.6)] transition-all border border-white/20"
      >
        {isChatOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </motion.button>

    </div>
  );
}