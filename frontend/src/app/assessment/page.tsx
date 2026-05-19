"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AxiosError } from "axios";
import { Loader2, BrainCircuit, ArrowRight, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import api from "../../lib/api"; // Using the global Axios interceptor we created
import { useAppStore } from "../../lib/store";

// =======================================================================
// TypeScript Interfaces mapped exactly to the FastAPI Backend Schemas
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

interface AssessmentResult {
  score_percentage: number;
  skill_level: string;
  feedback: string;
}

export default function AssessmentPage() {
  const router = useRouter();
  const { accessToken } = useAppStore();

  // Navigation and State Management
  const [step, setStep] = useState<"input" | "generating" | "quiz" | "submitting" | "result">("input");
  const [targetDomain, setTargetDomain] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Quiz Data
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // Maps question_id -> selected_option_id
  
  // Final Result Data
  const [result, setResult] = useState<AssessmentResult | null>(null);

  // Enterprise Guard: Ensure user is authenticated
  useEffect(() => {
    if (!accessToken) {
      router.push("/login");
    }
  }, [accessToken, router]);

  // =======================================================================
  // Action Handlers (Connecting to Backend API)
  // =======================================================================
  
  const handleGenerateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDomain.trim()) return;

    setStep("generating");
    setError(null);

    try {
      const response = await api.post("/assessment/generate", {
        target_domain: targetDomain
      });
      
      setQuestions(response.data.questions);
      setCurrentQuestionIndex(0);
      setAnswers({});
      setStep("quiz");
    } catch (err) {
      const axiosError = err as AxiosError<{ detail?: string }>;
      setError(axiosError.response?.data?.detail || "Failed to generate assessment. The AI Engine might be busy.");
      setStep("input");
    }
  };

  const handleOptionSelect = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    } else {
      submitAssessment();
    }
  };

  const submitAssessment = async () => {
    setStep("submitting");
    setError(null);

    try {
      // Map the answers dictionary to the expected backend array structure
      const formattedAnswers = Object.entries(answers).map(([qId, optId]) => ({
        question_id: qId,
        selected_option_id: optId,
      }));

      const payload = {
        target_domain: targetDomain,
        questions: questions,
        answers: formattedAnswers,
      };

      const response = await api.post("/assessment/submit", payload);
      setResult(response.data);
      setStep("result");
    } catch (err) {
      const axiosError = err as AxiosError<{ detail?: string }>;
      setError(axiosError.response?.data?.detail || "Failed to submit assessment results.");
      setStep("quiz"); // Let them try submitting again
    }
  };

  const handleProceedToDashboard = () => {
    // Navigate to dashboard. The user now knows their skill level 
    // and can enter it into the Roadmap Generator form.
    router.push("/dashboard");
  };

  // =======================================================================
  // Dynamic UI Renderers
  // =======================================================================

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 relative">
      <AnimatePresence mode="wait">
        
        {/* STEP 1: Domain Input */}
        {step === "input" && (
          <motion.div
            key="input-step"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-black/40 p-10 shadow-2xl backdrop-blur-xl"
          >
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-primary/20 flex items-center justify-center rounded-full mb-4">
                <BrainCircuit className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Skill Assessment</h1>
              <p className="text-gray-400 mt-2 text-sm leading-relaxed">
                Before the AI architects your curriculum, we need to evaluate your current baseline. What are you planning to learn?
              </p>
            </div>

            <form onSubmit={handleGenerateAssessment} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Target Learning Domain</label>
                <input
                  required
                  type="text"
                  value={targetDomain}
                  onChange={(e) => setTargetDomain(e.target.value)}
                  placeholder="e.g., Python Backend, React Native, Machine Learning..."
                  className="w-full rounded-lg border border-white/10 bg-black/60 p-4 text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-sm">
                  <AlertCircle className="h-4 w-4" /> {error}
                </div>
              )}

              <button
                type="submit"
                className="w-full flex justify-center items-center bg-primary text-primary-foreground py-3.5 rounded-lg font-bold hover:bg-primary/90 transition-all shadow-lg"
              >
                Generate Live Quiz <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </form>
          </motion.div>
        )}

        {/* STEP 2 & 4: Loading States (Generating/Submitting) */}
        {(step === "generating" || step === "submitting") && (
          <motion.div
            key="loading-step"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center text-center"
          >
            <Loader2 className="h-16 w-16 text-primary animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-white">
              {step === "generating" ? "AI is Architecting Your Quiz..." : "Evaluating Responses..."}
            </h2>
            <p className="text-gray-400 mt-2 max-w-sm">
              {step === "generating" 
                ? "Connecting to Azure OpenAI to formulate dynamic questions tailored to your domain." 
                : "Analyzing your answers to pinpoint your exact skill level."}
            </p>
          </motion.div>
        )}

        {/* STEP 3: Active Quiz View */}
        {step === "quiz" && questions.length > 0 && (
          <motion.div
            key="quiz-step"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-2xl"
          >
            {/* Progress Header */}
            <div className="mb-8 flex items-center justify-between text-sm font-medium text-gray-400">
              <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
              <span className="bg-white/10 px-3 py-1 rounded-full text-white">
                {targetDomain}
              </span>
            </div>

            {/* Question Card */}
            <div className="rounded-2xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-8 leading-snug">
                {questions[currentQuestionIndex].question_text}
              </h2>

              <div className="space-y-4">
                {questions[currentQuestionIndex].options.map((option) => {
                  const isSelected = answers[questions[currentQuestionIndex].id] === option.id;
                  
                  return (
                    <button
                      key={option.id}
                      onClick={() => handleOptionSelect(questions[currentQuestionIndex].id, option.id)}
                      className={`w-full text-left p-5 rounded-xl border transition-all duration-200 flex items-center justify-between ${
                        isSelected 
                          ? "border-primary bg-primary/10 text-white shadow-[0_0_15px_rgba(100,50,255,0.2)]" 
                          : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <span className="text-base leading-relaxed">{option.text}</span>
                      {isSelected && <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 ml-4" />}
                    </button>
                  );
                })}
              </div>

              {error && <p className="text-red-400 text-sm mt-6 text-center">{error}</p>}

              <div className="mt-10 flex justify-end">
                <button
                  onClick={handleNextQuestion}
                  disabled={!answers[questions[currentQuestionIndex].id]}
                  className="flex items-center bg-white text-black px-8 py-3 rounded-lg font-bold hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {currentQuestionIndex === questions.length - 1 ? "Submit Evaluation" : "Next Question"} 
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* STEP 5: Final Result View */}
        {step === "result" && result && (
          <motion.div
            key="result-step"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 p-10 shadow-2xl backdrop-blur-xl text-center"
          >
            <div className="mx-auto w-20 h-20 bg-green-500/20 flex items-center justify-center rounded-full mb-6 border border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
              <Sparkles className="h-10 w-10 text-green-400" />
            </div>
            
            <h1 className="text-3xl font-extrabold text-white mb-2">Evaluation Complete</h1>
            <p className="text-gray-400 text-sm mb-8">Here is the baseline metric derived from your responses.</p>
            
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-8">
              <div className="text-5xl font-black text-white mb-2">{result.score_percentage}%</div>
              <div className="text-sm font-semibold tracking-widest text-primary uppercase mb-4">
                Level: {result.skill_level}
              </div>
              <p className="text-sm text-gray-300 leading-relaxed italic border-t border-white/10 pt-4">
                &quot;{result.feedback}&quot;
              </p>
            </div>

            <button
              onClick={handleProceedToDashboard}
              className="w-full flex justify-center items-center bg-primary text-primary-foreground py-4 rounded-lg font-bold hover:bg-primary/90 transition-all shadow-lg"
            >
              Proceed to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}