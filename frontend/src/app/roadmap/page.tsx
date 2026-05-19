"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, PlayCircle, Code, HelpCircle, CheckCircle, Lock, AlertTriangle, ArrowRight, ArrowLeft, LayoutDashboard } from "lucide-react";
import { AxiosError } from "axios";
import api from "../../lib/api";
import { useAppStore } from "../../lib/store";

// Interfaces aligned strictly with backend Pydantic models
interface TaskResource {
  type: string;
  url: string;
}

interface AITaskDetail {
  title: string;
  description: string;
  task_type: string;
  estimated_hours: number;
  resources?: TaskResource[];
}

interface AIMilestone {
  week_number: number;
  milestone_title: string;
  tasks: AITaskDetail[];
}

interface DBTask {
  id: string;
  title: string;
  status: string;
  task_type: string;
}

interface CompleteRoadmap {
  id: string;
  content: {
    milestones: AIMilestone[];
  };
  tasks: DBTask[];
}

export default function RoadmapTimelinePage() {
  const router = useRouter();
  
  // Global Auth State (Enterprise Guard integrated with Hydration flag)
  const { accessToken, _hasHydrated } = useAppStore();

  const [roadmap, setRoadmap] = useState<CompleteRoadmap | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Local state for tracking inline resource completion loading
  const [completingTask, setCompletingTask] = useState<string | null>(null);

  // Strict Enterprise Guard: Waits for Hydration before attempting redirect
  useEffect(() => {
    // Prevent premature redirects if Zustand is still reading from LocalStorage
    if (!_hasHydrated) return;

    if (!accessToken) {
      window.location.href = "/login"; // Hard navigation safety
      return;
    }
    fetchRoadmap();
  }, [accessToken, _hasHydrated]);

  const fetchRoadmap = async () => {
    try {
      const response = await api.get("/roadmap/get-my-roadmap");
      setRoadmap(response.data);
    } catch (err: unknown) {
      window.location.href = "/dashboard"; // Hard navigation safety
    } finally {
      setLoading(false);
    }
  };

  // Block rendering until hydrated and data is checked
  if (!_hasHydrated || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-gray-400 text-sm font-medium animate-pulse">Loading curriculum...</p>
        </div>
      </div>
    );
  }

  if (!roadmap) return null;

  const getTaskStatus = (taskTitle: string): DBTask | undefined => {
    return roadmap.tasks.find(t => t.title === taskTitle);
  };

  // UI Helpers: Enterprise styling matching State Machine status
  const getStatusColor = (status: string) => {
    switch(status) {
      case "Completed": return "bg-green-500/10 border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)] text-white";
      case "In Progress": return "bg-blue-500/10 border-blue-500/40 shadow-[0_0_15px_rgba(59,130,246,0.15)] text-white";
      case "Pending": return "bg-primary/10 border-primary/40 shadow-[0_0_20px_rgba(100,50,255,0.2)] text-white";
      case "Needs Remediation": return "bg-red-500/10 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)] text-white";
      default: return "bg-black/40 border-white/5 opacity-60 grayscale cursor-not-allowed"; // Locked State
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case "Completed": 
        return <span className="flex items-center gap-1.5 text-xs font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded"><CheckCircle className="h-3.5 w-3.5" /> COMPLETED</span>;
      case "In Progress": 
        return <span className="flex items-center gap-1.5 text-xs font-bold text-blue-400 bg-blue-400/10 px-2 py-1 rounded"><PlayCircle className="h-3.5 w-3.5" /> IN PROGRESS</span>;
      case "Pending": 
        return <span className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/20 px-2 py-1 rounded">PENDING</span>;
      case "Needs Remediation": 
        return <span className="flex items-center gap-1.5 text-xs font-bold text-red-400 bg-red-400/10 px-2 py-1 rounded"><AlertTriangle className="h-3.5 w-3.5" /> REMEDIATION REQUIRED</span>;
      default: 
        return <span className="flex items-center gap-1.5 text-xs font-bold text-gray-500 bg-white/5 px-2 py-1 rounded"><Lock className="h-3.5 w-3.5" /> LOCKED</span>;
    }
  };

  const getTypeIcon = (type: string) => {
    // Normalize types from backend just in case (e.g. "Coding", "CODING", "quiz")
    const normalizedType = type.toUpperCase();
    if (normalizedType === "CODING") return <Code className="h-5 w-5 text-blue-400" />;
    if (normalizedType === "QUIZ") return <HelpCircle className="h-5 w-5 text-purple-400" />;
    return <PlayCircle className="h-5 w-5 text-green-400" />; // RESOURCE
  };

  // 🚨 ENTERPRISE FIX: Smart Routing based on both Task Type AND Status
  const handleTaskAction = async (dbTask: DBTask) => {
    const taskType = dbTask.task_type.toUpperCase();
    const taskStatus = dbTask.status;

    // 1. If the task needs remediation, NEVER send them to the raw editor/quiz.
    // Send them to the AI Tutor Remediation Engine instead.
    if (taskStatus === "Needs Remediation") {
      router.push(`/remediation/${dbTask.id}`);
      return;
    }

    // 2. Normal Path Routing
    if (taskType === "CODING") {
      router.push(`/editor?taskId=${dbTask.id}`);
    } 
    else if (taskType === "QUIZ") {
      router.push(`/quiz/${dbTask.id}`);
    } 
    else {
      // 3. Handle 'RESOURCE' task inline. Send a direct request to complete it.
      try {
        setCompletingTask(dbTask.id);
        await api.post(`/sandbox/submit/${dbTask.id}`, { code: "RESOURCE_COMPLETED_ACK" });
        await fetchRoadmap();
      } catch (err) {
        alert("Failed to mark resource as complete. Please check your connection.");
      } finally {
        setCompletingTask(null);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky Header with Back Navigation */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur-xl px-4 md:px-8 py-4 flex items-center justify-between">
        
        {/* 🚨 ENTERPRISE FIX: Hard navigation to kill stuck cache (Issue 3) */}
        <button 
          onClick={() => window.location.href = "/dashboard"}
          className="group flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <div className="p-2 bg-white/5 group-hover:bg-white/10 rounded-lg border border-white/10 transition-all">
            <ArrowLeft className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold hidden sm:inline">Back to Dashboard</span>
        </button>
        
        <div className="flex items-center gap-2 text-primary bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
          <LayoutDashboard className="h-4 w-4" />
          <span className="text-xs font-bold tracking-wide uppercase">Active Curriculum</span>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="mb-12 text-center md:text-left">
          <h1 className="text-4xl font-extrabold text-white">Your Learning Path</h1>
          <p className="text-gray-400 mt-2">Follow the timeline sequentially. Complete tasks to automatically unlock the next modules.</p>
        </div>

        <div className="relative border-l border-white/10 ml-4 md:ml-6 space-y-12 pb-12">
          {roadmap.content.milestones.map((milestone, mIndex) => (
            <motion.div 
              key={mIndex}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: mIndex * 0.1 }}
              className="relative pl-8 md:pl-10"
            >
              {/* Timeline Dot */}
              <div className="absolute -left-3 top-0 h-6 w-6 rounded-full bg-background border-4 border-primary flex items-center justify-center">
                <div className="h-2 w-2 bg-primary rounded-full"></div>
              </div>

              <h2 className="text-2xl font-bold text-white mb-6">
                Week {milestone.week_number}: {milestone.milestone_title}
              </h2>

              <div className="space-y-4">
                {milestone.tasks.map((aiTask, tIndex) => {
                  const dbTask = getTaskStatus(aiTask.title);
                  const status = dbTask?.status || "Locked";
                  const isLocked = status === "Locked";
                  const isActionable = status === "Pending" || status === "In Progress" || status === "Needs Remediation";
                  
                  // Helper to know if this specific task is currently loading its completion state
                  const isCurrentTaskLoading = dbTask ? completingTask === dbTask.id : false;

                  return (
                    <motion.div 
                      key={tIndex}
                      whileHover={!isLocked ? { scale: 1.01 } : {}}
                      className={`relative rounded-xl border p-6 backdrop-blur-sm transition-all ${getStatusColor(status)}`}
                    >
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="p-2 bg-black/40 rounded-lg">
                            {getTypeIcon(aiTask.task_type)}
                          </div>
                          <h3 className="text-lg font-bold tracking-tight text-white leading-tight">
                            {aiTask.title}
                          </h3>
                        </div>
                        
                        {/* Dynamic Status Badge */}
                        <div className="flex-shrink-0 mt-1 sm:mt-0">
                          {getStatusBadge(status)}
                        </div>
                      </div>
                      
                      <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                        {aiTask.description}
                      </p>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        {/* External Resources Curated by AI (RAG Links) */}
                        <div className="flex flex-wrap gap-2">
                          {!isLocked && aiTask.resources && aiTask.resources.length > 0 && (
                            aiTask.resources.map((res, rIdx) => (
                              <a 
                                key={rIdx} 
                                href={res.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-gray-300 bg-white/5 border border-white/10 px-3 py-1.5 rounded hover:bg-white/10 hover:text-white transition-colors"
                              >
                                External {res.type === "video" ? "Video" : "Doc"}
                              </a>
                            ))
                          )}
                        </div>

                        {/* STRICT Action Button for Unlocked Tasks */}
                        {isActionable && dbTask && (
                          <button
                            onClick={() => handleTaskAction(dbTask)}
                            disabled={isCurrentTaskLoading}
                            className="group flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg font-bold hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/30 active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px] justify-center"
                          >
                            {isCurrentTaskLoading ? (
                              <><Loader2 className="h-4 w-4 animate-spin" /> Updating...</>
                            ) : (
                              <>
                                {dbTask.task_type.toUpperCase() === "RESOURCE" 
                                  ? "Mark as Read" 
                                  : status === "Needs Remediation" 
                                    ? "Start Remediation" 
                                    : "Start Module"
                                }
                                {!isCurrentTaskLoading && <ArrowRight className="h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" />}
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}