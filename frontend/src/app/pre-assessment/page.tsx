"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Loader2, 
  BrainCircuit, 
  Target, 
  Clock, 
  ArrowRight, 
  CheckCircle,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import { AxiosError } from "axios";
import api from "../../lib/api";
import { useAppStore } from "../../lib/store";

// =======================================================================
// TypeScript Interfaces for the API Interactions
// =======================================================================
interface AssessmentQuestion {
  id: string;
  question_text: string;
  options: string[];
}

interface AssessmentGenerateResponse {
  questions: AssessmentQuestion[];
}

interface AssessmentEvaluateResponse {
  score_percentage: number;
  skill_level: "Beginner" | "Intermediate" | "Advanced";
}

// Flow Stages
type AssessmentStep = "setup" | "generating_test" | "taking_test" | "evaluating" | "generating_roadmap";

export default function PreAssessmentPage() {
  const router = useRouter();
  const { accessToken, _hasHydrated } = useAppStore();

  // State Management for the Flow
  const [step, setStep] = useState<AssessmentStep>("setup");
  const [error, setError] = useState<string | null>(null);

  // Form Data
  const [domain, setDomain] = useState("");
  const [hours, setHours] = useState<number>(10);

  // Test Data
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [detectedLevel, setDetectedLevel] = useState<string | null>(null);

  // Enterprise Guard: Block rendering until hydrated and authenticated
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!accessToken) {
      router.push("/login");
    }
  }, [_hasHydrated, accessToken, router]);

  // =======================================================================
  // Action Handlers
  // =======================================================================

  // Step 1: Request the backend to generate a tailored test
  const handleStartAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain.trim()) return;

    setStep("generating_test");
    setError(null);

    try {
      // Call the new assessment endpoint (will be created in backend Phase)
      const response = await api.post<AssessmentGenerateResponse>("/assessment/generate", {
        target_domain: domain,
      });
      
      setQuestions(response.data.questions);
      setStep("taking_test");
    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ detail?: string }>;
      setError(axiosError.response?.data?.detail || "Failed to generate assessment. Please check your connection.");
      setStep("setup");
    }
  };

  // Step 2: Handle MCQ selection
  const handleOptionSelect = (questionId: string, selectedOption: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: selectedOption,
    }));
  };

  // Step 3: Submit answers for evaluation, then auto-trigger Roadmap generation
  const handleSubmitAssessment = async () => {
    // Validate that all questions are answered
    if (Object.keys(answers).length < questions.length) {
      setError("Please answer all questions before submitting.");
      return;
    }

    setStep("evaluating");
    setError(null);

    try {
      // 1. Evaluate the test
      const evalResponse = await api.post<AssessmentEvaluateResponse>("/assessment/evaluate", {
        target_domain: domain,
        answers: answers,
      });

      const { skill_level } = evalResponse.data;
      setDetectedLevel(skill_level);
      
      // Move to final loading state
      setStep("generating_roadmap");

      // 2. Automatically trigger roadmap generation with the AI-detected skill level
      await api.post("/roadmap/generate", {
        target_domain: domain,
        weekly_hours: hours,
        skill_level: skill_level
      });

      // 3. Redirect to the newly minted roadmap
      router.push("/roadmap");

    } catch (err: unknown) {
      const axiosError = err as AxiosError<{ detail?: string }>;
      setError(axiosError.response?.data?.detail || "Failed to process assessment results.");
      setStep("taking_test"); // Allow them to try submitting again
    }
  };

  // =======================================================================
  // Render Loading / Unhydrated State
  // =======================================================================
  if (!_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  // =======================================================================
  // Main UI Render
  // =======================================================================
  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-3xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="mx-auto w-20 h-20 bg-primary/20 flex items-center justify-center rounded-3xl mb-6 border border-primary/30 shadow-[0_0_40px_rgba(100,50,255,0.3)]">
            <BrainCircuit className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
            AI Placement Test
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            Let our AI evaluate your current knowledge to build a hyper-personalized curriculum perfectly suited to your skill level.
          </p>
        </div>

        {/* Global Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="mb-8 bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-3"
            >
              <ShieldAlert className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Multi-Step Flow */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl shadow-2xl">
          <AnimatePresence mode="wait">
            
            {/* STEP 1: Setup Domain & Constraints */}
            {step === "setup" && (
              <motion.form 
                key="setup"
                initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                onSubmit={handleStartAssessment} 
                className="space-y-6"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" /> What do you want to learn?
                  </label>
                  <input 
                    required
                    type="text" 
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="e.g., Python Backend Development, React Native..." 
                    className="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-white placeholder-gray-600 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" /> Weekly Commitment (Hours)
                  </label>
                  <input
                  title="Enter a number between 1 and 168"
                    required
                    type="number" 
                    min="1"
                    max="168"
                    value={hours}
                    onChange={(e) => setHours(Number(e.target.value))}
                    className="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-white outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                <div className="pt-4 border-t border-white/10">
                  <button 
                    type="submit" 
                    className="w-full flex justify-center items-center bg-gradient-to-r from-primary to-blue-600 text-white py-4 rounded-xl font-bold shadow-lg hover:shadow-primary/30 hover:from-primary/90 hover:to-blue-600/90 transition-all active:scale-[0.98]"
                  >
                    Generate Initial Test <ArrowRight className="ml-2 h-5 w-5" />
                  </button>
                </div>
              </motion.form>
            )}

            {/* STEP 2: Loading State for Question Generation */}
            {step === "generating_test" && (
              <motion.div 
                key="generating_test"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="py-20 flex flex-col items-center justify-center text-center"
              >
                <div className="relative">
                  <Loader2 className="h-16 w-16 animate-spin text-primary opacity-50" />
                  <Sparkles className="h-6 w-6 text-blue-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-white mt-6 mb-2">Analyzing Subject Matter</h3>
                <p className="text-gray-400 max-w-sm mx-auto">
                  Our AI is currently formulating a customized placement test to accurately gauge your expertise in {domain}.
                </p>
              </motion.div>
            )}

            {/* STEP 3: Taking the Test */}
            {step === "taking_test" && (
              <motion.div 
                key="taking_test"
                initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="space-y-10"
              >
                <div className="flex justify-between items-end border-b border-white/10 pb-4">
                  <h2 className="text-2xl font-bold text-white">Skill Assessment</h2>
                  <span className="text-sm font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
                    {Object.keys(answers).length} / {questions.length} Answered
                  </span>
                </div>

                <div className="space-y-8">
                  {questions.map((q, index) => (
                    <div key={q.id} className="bg-black/40 border border-white/5 p-6 rounded-2xl">
                      <h3 className="text-lg font-medium text-white mb-5 leading-relaxed">
                        <span className="text-primary mr-2">{index + 1}.</span> 
                        {q.question_text}
                      </h3>
                      <div className="space-y-3">
                        {q.options.map((opt, optIdx) => {
                          const isSelected = answers[q.id] === opt;
                          return (
                            <div 
                              key={optIdx}
                              onClick={() => handleOptionSelect(q.id, opt)}
                              className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center gap-4 ${
                                isSelected 
                                  ? "bg-primary/20 border-primary shadow-[0_0_15px_rgba(100,50,255,0.15)]" 
                                  : "bg-white/5 border-white/10 hover:bg-white/10"
                              }`}
                            >
                              <div className={`h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0 ${isSelected ? "border-primary" : "border-gray-500"}`}>
                                {isSelected && <div className="h-2.5 w-2.5 bg-primary rounded-full" />}
                              </div>
                              <span className={`text-sm ${isSelected ? "text-white" : "text-gray-300"}`}>{opt}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-6 border-t border-white/10 flex justify-end">
                  <button 
                    onClick={handleSubmitAssessment}
                    className="bg-primary text-primary-foreground px-8 py-3.5 rounded-xl font-bold hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(100,50,255,0.3)] active:scale-95 flex items-center gap-2"
                  >
                    <CheckCircle className="h-5 w-5" /> Submit & Architect Path
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 4 & 5: Evaluating and Auto-Generating Roadmap */}
            {(step === "evaluating" || step === "generating_roadmap") && (
              <motion.div 
                key="processing"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="py-20 flex flex-col items-center justify-center text-center"
              >
                <div className="relative mb-6">
                  <Loader2 className="h-16 w-16 animate-spin text-primary" />
                  <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-ping" />
                </div>

                {step === "evaluating" ? (
                  <>
                    <h3 className="text-xl font-bold text-white mb-2">Grading Assessment</h3>
                    <p className="text-gray-400">Calculating your optimal starting point...</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-xl font-bold text-white mb-2">Architecting Curriculum</h3>
                    <p className="text-gray-400 max-w-sm mx-auto">
                      Detected skill level: <strong className="text-primary uppercase tracking-wide">{detectedLevel}</strong>.<br/> 
                      Building your hyper-personalized <strong>{domain}</strong> roadmap based on {hours} hours/week...
                    </p>
                  </>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}