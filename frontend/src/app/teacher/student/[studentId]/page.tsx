"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Editor from "@monaco-editor/react";
import { 
  Loader2, 
  ArrowLeft, 
  User as UserIcon, 
  BookOpen, 
  Target, 
  ShieldAlert,
  CheckCircle,
  XCircle,
  RefreshCw,
  BarChart2,
  PieChart as PieChartIcon,
  Code2,
  X
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell } from "recharts";
import { AxiosError } from "axios";
import api from "../../../../lib/api";
import { useAppStore } from "../../../../lib/store";
import GlassmorphismModal from "../../../../components/ui/GlassmorphismModal";

// =======================================================================
// TypeScript Interfaces
// =======================================================================
interface TaskDetails {
  id: string;
  title: string;
  task_type: string;
  status: string;
  achieved_score: number | null;
  minimum_passing_score: number | null;
  remediation_attempts: number;
  last_submission?: string;
}

interface StudentDetailedProfile {
  student_id: string;
  email: string;
  target_domain: string;
  overall_progress: number;
  total_tasks: number;
  completed_tasks: number;
  tasks: TaskDetails[];
}

export default function StudentProfilePage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.studentId as string;

  const { accessToken, _hasHydrated } = useAppStore();

  const [studentData, setStudentData] = useState<StudentDetailedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Enterprise State Management for HITL Actions
  const [overridingTask, setOverridingTask] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    taskId: string | null;
    actionType: "COMPLETED" | "NEEDS_REMEDIATION" | null;
  }>({ isOpen: false, taskId: null, actionType: null });
  
  const [selectedSubmission, setSelectedSubmission] = useState<{title: string, content: string, type: string} | null>(null);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!accessToken) {
      router.push("/login");
      return;
    }
    if (studentId) {
      fetchStudentDetails();
    }
  }, [_hasHydrated, accessToken, studentId, router]);

  const fetchStudentDetails = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/teacher/student/${studentId}`);
      setStudentData(response.data);
      setError(null);
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ detail?: string }>;
      setError(axiosError.response?.data?.detail || "Failed to load student profile.");
    } finally {
      setLoading(false);
    }
  };

  // Triggers the confirmation modal instead of standard window.confirm
  const initiateManualOverride = (taskId: string, forceStatus: "COMPLETED" | "NEEDS_REMEDIATION") => {
    setConfirmModal({
      isOpen: true,
      taskId,
      actionType: forceStatus
    });
  };

  // Executes the API call after confirmation
  const confirmAndExecuteOverride = async () => {
    const { taskId, actionType } = confirmModal;
    if (!taskId || !actionType) return;

    setOverridingTask(taskId);
    
    // Temporarily keep modal open to show loading state inside it, then close
    try {
      await api.post(`/teacher/override/${taskId}`, {
        status: actionType,
        instructor_notes: `Manually overridden to ${actionType} by instructor.`
      });
      await fetchStudentDetails();
      setConfirmModal({ isOpen: false, taskId: null, actionType: null });
    } catch (err) {
      alert("Failed to apply manual override. Please check your connection.");
    } finally {
      setOverridingTask(null);
    }
  };

  const formatSubmissionContent = (content: string, type: string) => {
    if (!content) return "# No submission data recorded for this task.";
    
    if (type.toUpperCase() === "QUIZ") {
      try {
        const parsed = JSON.parse(content);
        return JSON.stringify(parsed, null, 2);
      } catch (e) {
        return content;
      }
    }
    return content;
  };

  if (!_hasHydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm font-medium animate-pulse">Loading comprehensive student data...</p>
        </div>
      </div>
    );
  }

  if (error || !studentData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-bold text-foreground mb-2">Profile Unavailable</h2>
        <p className="text-muted-foreground mb-6">{error}</p>
        <button 
          onClick={() => router.push("/teacher/dashboard")}
          className="bg-secondary text-secondary-foreground border border-border px-6 py-2.5 rounded-lg hover:bg-secondary/80 transition-all flex items-center gap-2 font-medium"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>
      </div>
    );
  }

  const barChartData = studentData.tasks
    .filter(t => t.task_type !== "RESOURCE")
    .map((t, index) => ({
      name: `T${index + 1}`,
      title: t.title,
      Score: t.achieved_score || 0,
      PassingCriteria: t.minimum_passing_score || 70,
    }));

  const statusCounts = { Completed: 0, Remediation: 0, InProgress: 0, Locked: 0 };
  studentData.tasks.forEach(t => {
    if (t.status === "Completed") statusCounts.Completed += 1;
    else if (t.status === "Needs Remediation") statusCounts.Remediation += 1;
    else if (t.status === "In Progress" || t.status === "Pending") statusCounts.InProgress += 1;
    else statusCounts.Locked += 1;
  });

  const pieChartData = [
    { name: 'Completed', value: statusCounts.Completed, color: 'oklch(0.6 0.15 250)' },
    { name: 'Remediation', value: statusCounts.Remediation, color: 'oklch(0.6 0.2 25)' },
    { name: 'Active', value: statusCounts.InProgress, color: 'oklch(0.55 0.15 260)' },
    { name: 'Locked', value: statusCounts.Locked, color: 'oklch(0.4 0.05 250)' },
  ].filter(item => item.value > 0);

  return (
    <div className="min-h-screen bg-background pb-16 relative">
      
      {/* 1. HITL Warning Guardrail Modal */}
      <GlassmorphismModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.actionType === "COMPLETED" ? "Confirm Force Pass" : "Confirm Force Fail"}
        message={`Are you sure you want to manually override the AI's grading decision to ${confirmModal.actionType === "COMPLETED" ? "PASS" : "FAIL"} this task? This action will immediately update the student's progress.`}
        confirmText={confirmModal.actionType === "COMPLETED" ? "Force Pass" : "Force Fail"}
        isDestructive={confirmModal.actionType === "NEEDS_REMEDIATION"}
        isLoading={overridingTask === confirmModal.taskId}
        onConfirm={confirmAndExecuteOverride}
        onCancel={() => setConfirmModal({ isOpen: false, taskId: null, actionType: null })}
      />

      {/* 2. Monaco Editor Code Viewer Modal */}
      <AnimatePresence>
        {selectedSubmission && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelectedSubmission(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col h-[75vh]"
            >
              <div className="p-4 border-b border-border bg-muted/50 flex justify-between items-center">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-bold text-foreground">Student Submission Engine</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 tracking-wider uppercase">
                    Task: <span className="font-bold text-foreground">{selectedSubmission.title}</span>
                  </p>
                </div>
                <button title="Close Viewer" onClick={() => setSelectedSubmission(null)} className="bg-muted hover:bg-border rounded-md p-2 transition-colors text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              {/* Enterprise Monaco Editor explicitly in Read-Only mode */}
              <div className="flex-1 w-full bg-[#1e1e1e] relative">
                <Editor
                  height="100%"
                  language={selectedSubmission.type.toUpperCase() === "QUIZ" ? "json" : "python"}
                  theme="vs-dark"
                  value={formatSubmissionContent(selectedSubmission.content, selectedSubmission.type)}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: "var(--font-geist-mono)",
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    wordWrap: "on",
                    padding: { top: 16, bottom: 16 }
                  }}
                  loading={<div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-primary h-8 w-8" /></div>}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Page Content */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md px-4 md:px-8 py-4 flex items-center gap-4 sticky top-0 z-40">
        <button
          title="Back to Dashboard" 
          onClick={() => router.push("/teacher/dashboard")}
          className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="h-6 w-px bg-border"></div>
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-primary" /> {studentData.email}
          </h1>
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Detailed Analytics Profile</p>
        </div>
      </header>

      <div className="container mx-auto px-4 md:px-8 mt-10 max-w-7xl space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 rounded-2xl border border-border bg-card p-8 shadow-sm flex flex-col justify-center">
            <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center">
              <Target className="mr-3 h-5 w-5 text-primary" /> Learning Trajectory: {studentData.target_domain}
            </h2>
            <div className="mb-3 flex justify-between items-end">
              <span className="text-4xl font-bold text-foreground">{studentData.overall_progress}%</span>
              <span className="text-sm text-muted-foreground">{studentData.completed_tasks} / {studentData.total_tasks} Tasks</span>
            </div>
            <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }} animate={{ width: `${studentData.overall_progress}%` }} 
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-primary"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm flex flex-col justify-center gap-4">
            <div className="p-4 bg-muted/50 border border-border rounded-xl flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                studentData.overall_progress >= 50 ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
              }`}>
                {studentData.overall_progress >= 50 ? "On Track" : "Needs Acceleration"}
              </span>
            </div>
            <button onClick={fetchStudentDetails} className="flex justify-center items-center gap-2 bg-secondary text-secondary-foreground border border-border p-3 rounded-xl hover:bg-secondary/80 transition-colors text-sm font-medium">
              <RefreshCw className="h-4 w-4" /> Refresh Data
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-6 flex items-center">
              <BarChart2 className="mr-3 h-5 w-5 text-primary" /> Assessment Scores
            </h2>
            {barChartData.length > 0 ? (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} tickMargin={10} axisLine={false} tickLine={false} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} domain={[0, 100]} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      cursor={{ fill: 'var(--muted)' }}
                      contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px', color: 'var(--foreground)' }}
                      itemStyle={{ fontWeight: 'bold' }}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.title || label}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} iconType="circle" />
                    <Bar dataKey="Score" fill="oklch(0.55 0.15 260)" radius={[4, 4, 0, 0]} name="Achieved %" barSize={30} />
                    <Bar dataKey="PassingCriteria" fill="oklch(0.8 0 0)" radius={[4, 4, 0, 0]} name="Benchmark %" barSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-xl bg-muted/50">
                <p className="text-muted-foreground text-sm">No score data available yet.</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-8 shadow-sm flex flex-col">
            <h2 className="text-lg font-semibold text-foreground mb-2 flex items-center">
              <PieChartIcon className="mr-3 h-5 w-5 text-primary" /> Task Distribution
            </h2>
            <div className="flex-1 h-64 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px', color: 'var(--foreground)' }}
                    itemStyle={{ color: 'var(--foreground)', fontWeight: 'bold' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold text-foreground">{studentData.total_tasks}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Tasks</span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-border bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" /> Task Breakdown & Submissions
            </h2>
            <span className="text-xs bg-destructive/10 text-destructive px-3 py-1.5 rounded-full border border-destructive/20 flex items-center gap-1.5 font-bold tracking-wide w-max">
              <ShieldAlert className="h-3.5 w-3.5" /> HITL OVERRIDE ENABLED
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-foreground">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Task Detail</th>
                  <th className="px-6 py-4 font-medium">Type</th>
                  <th className="px-6 py-4 font-medium text-center">Score</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Instructor Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {studentData.tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-bold text-foreground mb-1">{task.title}</p>
                      <p className="text-xs text-muted-foreground">Attempts: {task.remediation_attempts}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-muted text-foreground px-2 py-1 rounded text-[10px] uppercase tracking-wider font-bold border border-border">
                        {task.task_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`font-bold ${task.achieved_score && task.achieved_score >= (task.minimum_passing_score || 0) ? 'text-green-600' : task.achieved_score ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {task.achieved_score !== null ? `${task.achieved_score}%` : "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1.5 text-xs font-bold w-max px-2.5 py-1 rounded-md border ${
                        task.status === "Completed" ? "bg-green-500/10 text-green-600 border-green-500/20" :
                        task.status === "Needs Remediation" ? "bg-destructive/10 text-destructive border-destructive/20" :
                        task.status === "In Progress" ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                        "bg-muted text-muted-foreground border-border"
                      }`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-3 opacity-80 group-hover:opacity-100 transition-opacity">
                        
                        {(task.task_type === "CODING" || task.task_type === "QUIZ") && task.status !== "Locked" && (
                          <button
                            onClick={() => setSelectedSubmission({
                              title: task.title,
                              type: task.task_type,
                              content: task.last_submission || ""
                            })}
                            className="text-xs text-primary hover:text-primary/80 underline-offset-4 hover:underline transition-all font-medium flex items-center gap-1"
                          >
                            <Code2 className="h-3.5 w-3.5" /> View Work
                          </button>
                        )}

                        {task.status !== "Locked" && (
                          <div className="flex items-center gap-1.5 border-l border-border pl-3">
                            {task.status !== "Completed" && (
                              <button
                                onClick={() => initiateManualOverride(task.id, "COMPLETED")}
                                className="flex items-center gap-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-600 px-3 py-1.5 rounded-lg border border-green-500/20 transition-colors font-medium"
                                title="Force Pass"
                              >
                                <CheckCircle className="h-3.5 w-3.5" /> Pass
                              </button>
                            )}
                            
                            {task.status !== "Needs Remediation" && (
                              <button
                                onClick={() => initiateManualOverride(task.id, "NEEDS_REMEDIATION")}
                                className="flex items-center gap-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive px-3 py-1.5 rounded-lg border border-destructive/20 transition-colors font-medium"
                                title="Force Fail"
                              >
                                <XCircle className="h-3.5 w-3.5" /> Fail
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}