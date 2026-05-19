"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Loader2, 
  HelpCircle, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  BrainCircuit, 
  AlertTriangle,
  ArrowLeft
} from "lucide-react";
import { AxiosError } from "axios";
import api from "../../../lib/api";
import { useAppStore } from "../../../lib/store";

// =======================================================================
// TypeScript Interfaces strictly mapped to FastAPI Backend Pydantic Schemas
// =======================================================================
interface QuizOption {
  id: string;
  text: string;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  options: QuizOption[];
  correct_option_id: string;
}

interface QuizData {
  questions: QuizQuestion[];
}

interface QuizSubmitResponse {
  score_percentage: number;
  passed: boolean;
  status: string;
  feedback: string;
}

export default function DynamicQuizPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.taskId as string;
  
  // Global Auth State
  const { accessToken } = useAppStore();

  // Component States
  const [quizData, setQuizData] = useState<QuizData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizSubmitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Enterprise Guard: Auth check and data initialization
  useEffect(() => {
    if (!accessToken) {
      router.push("/login");
      return;
    }
    if (taskId) {
      generateAndFetchQuiz();
    }
  }, [accessToken, taskId, router]);

  const generateAndFetchQuiz = async () => {
    try {
      // POST request to trigger LangChain AI question generation specifically for this task
      const response = await api.post(`/quiz/generate/${taskId}`);
      setQuizData(response.data);
      setError(null);
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ detail?: string }>;
      setError(axiosError.response?.data?.detail || "Failed to generate AI assessment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: optionId,
    }));
  };

  const handleSubmitQuiz = async () => {
    if (!quizData) return;
    
    setSubmitting(true);
    setError(null);

    // Map answers into the exact array format expected by the backend
    const formattedAnswers = Object.entries(answers).map(([qId, oId]) => ({
      question_id: qId,
      selected_option_id: oId,
    }));

    try {
      const payload = {
        questions: quizData.questions,
        answers: formattedAnswers,
      };

      // Submit to the evaluation engine (Updates State Machine & DB)
      const response = await api.post(`/quiz/submit/${taskId}`, payload);
      setResult(response.data);
      
      // Auto-scroll to top to show results
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ detail?: string }>;
      setError(axiosError.response?.data?.detail || "Error evaluating submission. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // =======================================================================
  // Loading State (AI Generating Assessment)
  // =======================================================================
  if (loading) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-background px-4">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }} 
          transition={{ repeat: Infinity, duration: 2 }}
          className="mb-6 p-4 bg-primary/20 rounded-full border border-primary/30 shadow-[0_0_30px_rgba(100,50,255,0.3)]"
        >
          <BrainCircuit className="h-12 w-12 text-primary" />
        </motion.div>
        <h2 className="text-xl font-bold text-white mb-2">Architecting Assessment...</h2>
        <p className="text-sm text-gray-400">The AI is generating context-aware questions for this module.</p>
      </div>
    );
  }

  // =======================================================================
  // Error State
  // =======================================================================
  if (error && !quizData) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md w-full bg-red-500/10 border border-red-500/20 p-8 rounded-2xl text-center backdrop-blur-sm">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-3">Generation Failed</h2>
          <p className="text-sm text-gray-400 mb-6">{error}</p>
          <button 
            onClick={() => router.push("/roadmap")}
            className="flex items-center justify-center w-full gap-2 bg-white/5 border border-white/10 text-white px-5 py-3 rounded-lg font-medium hover:bg-white/10 transition-all active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" /> Return to Roadmap
          </button>
        </div>
      </div>
    );
  }

  if (!quizData) return null;

  // Check if all questions have been answered to enable the submit button
  const isFullyAnswered = Object.keys(answers).length === quizData.questions.length;

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="container mx-auto max-w-3xl">
        
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-4 tracking-wider uppercase">
            <HelpCircle className="h-4 w-4" /> Assessment Module
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Module Knowledge Check</h1>
          <p className="text-gray-400 mt-3 text-sm md:text-base">Answer all questions to complete this module and unlock your next milestone.</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* =======================================================================
              Evaluation Result View
              ======================================================================= */}
          {result ? (
            <motion.div 
              key="results"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-black/40 border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl backdrop-blur-xl text-center"
            >
              <div className={`mx-auto w-24 h-24 flex items-center justify-center rounded-full mb-6 border-4 ${result.passed ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-red-500/20 border-red-500/40 text-red-400'}`}>
                {result.passed ? <CheckCircle2 className="h-12 w-12" /> : <XCircle className="h-12 w-12" />}
              </div>
              
              <h2 className="text-3xl font-black text-white mb-2">
                {result.passed ? "Module Passed!" : "Needs Remediation"}
              </h2>
              
              <div className="my-8 py-6 border-y border-white/10">
                <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-2">Final Score</p>
                <div className={`text-6xl font-black ${result.passed ? 'text-green-400' : 'text-red-400'}`}>
                  {Math.round(result.score_percentage)}%
                </div>
              </div>

              <p className="text-gray-300 mb-10 leading-relaxed max-w-lg mx-auto">
                {result.feedback}
              </p>

              <button
                onClick={() => router.push("/roadmap")}
                className={`w-full flex justify-center items-center py-4 rounded-xl font-bold transition-all active:scale-[0.98] shadow-lg ${
                  result.passed 
                    ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-green-500/30" 
                    : "bg-gradient-to-r from-red-500 to-rose-600 text-white hover:shadow-red-500/30"
                }`}
              >
                {result.passed ? "Continue to Next Module" : "Start Remediation Lessons"}
                <ArrowRight className="ml-2 h-5 w-5" />
              </button>
            </motion.div>
          ) : (
            /* =======================================================================
                Interactive Quiz View
                ======================================================================= */
            <motion.div key="quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              
              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium text-center">
                  {error}
                </div>
              )}

              <div className="space-y-8">
                {quizData.questions.map((question, qIdx) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: qIdx * 0.1 }}
                    key={question.id} 
                    className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 backdrop-blur-sm"
                  >
                    <h3 className="text-lg md:text-xl font-semibold text-white mb-6 leading-relaxed">
                      <span className="text-primary mr-2">{qIdx + 1}.</span> 
                      {question.question_text}
                    </h3>
                    
                    <div className="space-y-3">
                      {question.options.map((option) => {
                        const isSelected = answers[question.id] === option.id;
                        return (
                          <div 
                            key={option.id}
                            onClick={() => handleOptionSelect(question.id, option.id)}
                            className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                              isSelected 
                                ? "bg-primary/20 border-primary shadow-[0_0_15px_rgba(100,50,255,0.2)] text-white" 
                                : "bg-black/40 border-white/5 text-gray-300 hover:bg-white/10 hover:border-white/20"
                            }`}
                          >
                            <div className={`flex-shrink-0 h-6 w-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                              isSelected ? "border-primary bg-primary" : "border-gray-500"
                            }`}>
                              {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                            </div>
                            <span className="text-sm md:text-base font-medium">{option.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Submit Section */}
              <div className="mt-10 bg-black/60 border border-white/10 rounded-2xl p-6 backdrop-blur-md sticky bottom-6 z-10 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
                <div>
                  <p className="text-sm font-medium text-gray-300">
                    <strong className="text-white">{Object.keys(answers).length}</strong> of {quizData.questions.length} answered
                  </p>
                  {!isFullyAnswered && (
                    <p className="text-xs text-red-400 mt-1">Please answer all questions to submit.</p>
                  )}
                </div>
                
                <button
                  onClick={handleSubmitQuiz}
                  disabled={!isFullyAnswered || submitting}
                  className="w-full md:w-auto flex justify-center items-center px-8 py-3.5 rounded-xl bg-gradient-to-r from-primary to-blue-600 text-white font-bold shadow-lg hover:shadow-primary/30 hover:from-primary/90 hover:to-blue-600/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                  {submitting ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Evaluating...</>
                  ) : (
                    <>Submit Assessment <CheckCircle2 className="ml-2 h-5 w-5" /></>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}