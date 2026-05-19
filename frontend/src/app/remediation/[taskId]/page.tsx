"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Loader2, 
  ArrowLeft, 
  BrainCircuit, 
  AlertTriangle, 
  BookOpen, 
  RotateCcw, 
  CheckCircle2,
  Lightbulb
} from "lucide-react";
import { AxiosError } from "axios";
import api from "../../../lib/api";
import { useAppStore } from "../../../lib/store";

// =======================================================================
// TypeScript Interfaces for the Remediation AI Response
// =======================================================================
interface RemediationGuide {
  task_title: string;
  task_type: string;
  previous_score: number;
  weakness_analysis: string;
  study_guide: string;
}

export default function RemediationPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.taskId as string;

  // Enterprise Auth Guard & Hydration Context
  const { accessToken, _hasHydrated } = useAppStore();

  const [guideData, setGuideData] = useState<RemediationGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!accessToken) {
      window.location.href = "/login";
      return;
    }
    if (taskId) {
      generateAndFetchGuide();
    }
  }, [_hasHydrated, accessToken, taskId]);

  // Dynamically requests the backend AI Agent to analyze previous mistakes and generate a study guide
  const generateAndFetchGuide = async () => {
    try {
      setLoading(true);
      // We will create this endpoint in the backend shortly to trigger the Remediation Agent
      const response = await api.post(`/remediation/generate-guide/${taskId}`);
      setGuideData(response.data);
      setError(null);
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ detail?: string }>;
      setError(axiosError.response?.data?.detail || "AI Agent failed to generate your study guide. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Route back to the appropriate assessment engine
  const handleRetakeAssessment = () => {
    if (!guideData) return;
    
    const taskType = guideData.task_type.toUpperCase();
    if (taskType === "CODING") {
      router.push(`/editor?taskId=${taskId}`);
    } else if (taskType === "QUIZ") {
      router.push(`/quiz/${taskId}`);
    } else {
      router.push("/roadmap");
    }
  };

  // Premium Loading State while the AI analyzes the student's mistakes
  if (!_hasHydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center max-w-md text-center"
        >
          <div className="h-20 w-20 bg-primary/20 rounded-full flex items-center justify-center mb-6 relative overflow-hidden">
            <BrainCircuit className="h-10 w-10 text-primary relative z-10 animate-pulse" />
            <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">AI is analyzing your previous attempt...</h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Please wait while your AI Tutor reviews your mistakes and generates a personalized crash course to help you pass.
          </p>
        </motion.div>
      </div>
    );
  }

  // Error Boundary
  if (error || !guideData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Analysis Failed</h2>
        <p className="text-gray-400 mb-6 text-center max-w-md">{error}</p>
        <button 
          onClick={() => router.push("/roadmap")}
          className="bg-white/10 text-white px-6 py-2.5 rounded-lg hover:bg-white/20 transition-all flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Roadmap
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur-xl px-4 md:px-8 py-4 flex items-center justify-between">
        <button 
          onClick={() => router.push("/roadmap")}
          className="group flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <div className="p-2 bg-white/5 group-hover:bg-white/10 rounded-lg border border-white/10 transition-all">
            <ArrowLeft className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold hidden sm:inline">Back to Roadmap</span>
        </button>
        
        <div className="flex items-center gap-2 text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full border border-red-400/20">
          <BrainCircuit className="h-4 w-4" />
          <span className="text-xs font-bold tracking-wide uppercase">AI Remediation Center</span>
        </div>
      </header>

      <main className="container mx-auto px-4 mt-10 max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          
          {/* Header / Score Overview */}
          <div className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-background p-8 shadow-xl relative overflow-hidden">
            <div className="absolute -right-10 -top-10 opacity-5">
              <AlertTriangle className="h-64 w-64 text-red-500" />
            </div>
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="bg-red-500/20 text-red-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest border border-red-500/30">
                  Needs Review
                </span>
                <span className="text-gray-400 text-sm font-medium">{guideData.task_type} Assessment</span>
              </div>
              
              <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2 leading-tight">
                {guideData.task_title}
              </h1>
              
              <div className="mt-6 flex items-center gap-4 bg-black/40 w-max px-5 py-3 rounded-xl border border-white/5">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Previous Score</p>
                  <p className="text-2xl font-black text-red-400">{guideData.previous_score}%</p>
                </div>
                <div className="h-10 w-px bg-white/10 mx-2"></div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Target Score</p>
                  <p className="text-2xl font-black text-green-400">70%</p>
                </div>
              </div>
            </div>
          </div>

          {/* AI Weakness Analysis */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-white/10 pb-4">
              <Lightbulb className="h-6 w-6 text-yellow-400" /> Where You Went Wrong
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                {guideData.weakness_analysis}
              </p>
            </div>
          </div>

          {/* AI Custom Crash Course */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-8 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2 border-b border-primary/20 pb-4">
              <BookOpen className="h-6 w-6 text-primary" /> Personalized Study Guide
            </h2>
            <div className="prose prose-invert max-w-none">
              <div className="text-gray-300 leading-relaxed whitespace-pre-wrap bg-black/40 p-6 rounded-xl border border-white/5 font-medium">
                {guideData.study_guide}
              </div>
            </div>
            
            <div className="mt-6 bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-blue-200">
                Take your time to review the concepts above. Once you feel confident, you can retake the assessment. The questions or scenarios might be slightly different to test your true understanding.
              </p>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex justify-end pt-4">
            <button
              onClick={handleRetakeAssessment}
              className="group flex items-center justify-center gap-3 bg-gradient-to-r from-primary to-blue-600 text-white px-8 py-4 rounded-xl font-bold shadow-[0_0_30px_rgba(100,50,255,0.3)] hover:shadow-[0_0_40px_rgba(100,50,255,0.5)] hover:scale-[1.02] transition-all active:scale-95 w-full sm:w-auto text-lg"
            >
              <RotateCcw className="h-5 w-5" />
              Retake Assessment
              <ArrowLeft className="h-5 w-5 rotate-180 opacity-70 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

        </motion.div>
      </main>
    </div>
  );
}