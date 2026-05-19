"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Editor from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";
import axios, { AxiosError } from "axios";
import { Play, Loader2, ArrowLeft, CheckCircle, AlertTriangle, Terminal, BookOpen, Code2, Sparkles, BrainCircuit, ChevronDown } from "lucide-react";
import api from "../../lib/api";
import { useAppStore } from "../../lib/store";

// =======================================================================
// Interfaces for the Enhanced Editor & AI Feedback System
// =======================================================================
interface TaskContext {
  title: string;
  description: string;
}

interface EvaluationResult {
  status: "success" | "error";
  message: string;
  progress_id?: string;
  actual_output?: string;
  ai_score?: number;
  ai_feedback?: string;
}

// 🚨 NEW: Language options and boilerplate code
const LANGUAGE_OPTIONS = [
  { id: "python", name: "Python 3", defaultCode: "# Write your Python solution here...\n\ndef main():\n    print('Hello, World!')\n\nif __name__ == '__main__':\n    main()" },
  { id: "javascript", name: "Node.js (JS)", defaultCode: "// Write your JavaScript solution here...\n\nfunction main() {\n    console.log('Hello, World!');\n}\n\nmain();" },
  { id: "java", name: "Java 17", defaultCode: "// Write your Java solution here...\n// Make sure your main class is named 'Main'\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, World!\");\n    }\n}" },
  { id: "cpp", name: "C++", defaultCode: "// Write your C++ solution here...\n\n#include <iostream>\n\nint main() {\n    std::cout << \"Hello, World!\" << std::endl;\n    return 0;\n}" }
];

export default function CodeEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId");
  
  const { accessToken, _hasHydrated } = useAppStore();

  const [taskContext, setTaskContext] = useState<TaskContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  
  // 🚨 NEW: State for Multi-Language Support
  const [selectedLanguage, setSelectedLanguage] = useState(LANGUAGE_OPTIONS[0]);
  const [code, setCode] = useState<string>(LANGUAGE_OPTIONS[0].defaultCode);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<EvaluationResult | null>(null);

  useEffect(() => {
    if (!_hasHydrated) return;

    if (!accessToken) {
      router.push("/login");
      return;
    }
    if (!taskId) {
      router.push("/roadmap");
      return;
    }

    fetchTaskContext();
  }, [_hasHydrated, accessToken, taskId, router]);

  const fetchTaskContext = async () => {
    try {
      const response = await api.get("/roadmap/get-my-roadmap");
      const roadmap = response.data;
      
      const dbTask = roadmap.tasks.find((t: { id: string; title: string }) => t.id === taskId);
      if (!dbTask) {
        router.push("/roadmap");
        return;
      }

      let foundDescription = "Write your implementation based on the current module requirements.";
      for (const milestone of roadmap.content.milestones) {
        for (const aiTask of milestone.tasks) {
          if (aiTask.title === dbTask.title) {
            foundDescription = aiTask.description;
            break;
          }
        }
      }

      setTaskContext({
        title: dbTask.title,
        description: foundDescription
      });

    } catch (error) {
      console.error("Failed to load task context.", error);
    } finally {
      setIsLoadingContext(false);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
    }
  };

  // Handle changing the language from the dropdown
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = LANGUAGE_OPTIONS.find(l => l.id === e.target.value) || LANGUAGE_OPTIONS[0];
    
    // Warn user before replacing their code with boilerplate
    if (code !== selectedLanguage.defaultCode) {
      if (!window.confirm("Changing the language will reset your code. Do you want to continue?")) {
        return;
      }
    }
    
    setSelectedLanguage(lang);
    setCode(lang.defaultCode);
  };

  const submitCode = async () => {
    if (!code.trim() || !taskId) return;

    setIsSubmitting(true);
    setSubmissionResult(null);

    try {
      // 🚨 NEW: Sending language parameter to backend
      const payload = {
        task_id: taskId,
        source_code: code,
        language: selectedLanguage.name // Telling AI which language rules to apply
      };

      const response = await api.post("/sandbox/submit-code", payload);

      setSubmissionResult({
        status: "success",
        message: "Code execution completed successfully.",
        progress_id: response.data.progress_id,
        actual_output: response.data.actual_output,
        ai_score: response.data.ai_score,
        ai_feedback: response.data.ai_feedback,
      });

    } catch (error: unknown) {
      const axiosError = error as AxiosError<{ detail?: string, actual_output?: string, ai_feedback?: string }>;
      
      setSubmissionResult({
        status: "error",
        message: axiosError.response?.data?.detail || "System error. Could not reach the execution sandbox.",
        actual_output: axiosError.response?.data?.actual_output,
        ai_feedback: axiosError.response?.data?.ai_feedback,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!_hasHydrated) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-gray-400 text-sm font-medium animate-pulse">Initializing secure workspace...</p>
        </div>
      </div>
    );
  }

  if (!taskId) return null;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      
      {/* Top Navigation Bar */}
      <header className="border-b border-white/10 bg-black/40 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10 flex-shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/roadmap")}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-md transition-colors text-gray-300 flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="h-6 w-px bg-white/10 hidden sm:block"></div>
          <h1 className="text-lg font-semibold text-white items-center gap-2 hidden sm:flex">
            <Code2 className="h-5 w-5 text-primary" /> Integrated Coding Environment
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {/* 🚨 NEW: Premium Language Selector Dropdown */}
          <div className="relative">
            <select
              title="Select Programming Language"
              value={selectedLanguage.id}
              onChange={handleLanguageChange}
              className="appearance-none bg-black/40 border border-white/10 text-white text-sm font-medium py-2.5 pl-4 pr-10 rounded-lg outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.id} value={lang.id} className="bg-[#111] text-white">
                  {lang.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          </div>

          {/* Execute Button */}
          <button
            onClick={submitCode}
            disabled={isSubmitting || isLoadingContext}
            className="flex items-center gap-2 bg-gradient-to-r from-primary to-blue-600 text-white px-6 py-2.5 rounded-lg font-bold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(100,50,255,0.3)] active:scale-95"
          >
            {isSubmitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Evaluating...</>
            ) : (
              <><Play className="h-4 w-4" fill="currentColor" /> Run Code</>
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace Layout - Enterprise Split Pane */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* LEFT PANE: Task Context & Execution Console */}
        <div className="w-full lg:w-1/3 flex flex-col border-r border-white/10 bg-black/20 z-0 h-1/2 lg:h-full">
          
          {/* Top Half of Left Pane: Task Description */}
          <div className="flex-1 p-6 overflow-y-auto border-b border-white/10 bg-white/5 scrollbar-thin scrollbar-thumb-white/10">
            {isLoadingContext ? (
              <div className="animate-pulse space-y-4">
                <div className="h-6 w-3/4 bg-white/10 rounded"></div>
                <div className="h-24 w-full bg-white/5 rounded mt-4"></div>
              </div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold mb-4 tracking-wider uppercase">
                  <Terminal className="h-3 w-3" /> Coding Assessment
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-white mb-4 leading-tight">
                  {taskContext?.title || "Coding Challenge"}
                </h2>
                <p className="text-gray-300 text-sm leading-relaxed mb-6">
                  {taskContext?.description}
                </p>
                
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl shadow-inner">
                  <h3 className="text-sm font-bold text-primary mb-3 flex items-center gap-2">
                    <BookOpen className="h-4 w-4" /> Assessment Instructions
                  </h3>
                  <ul className="text-sm text-gray-400 list-disc list-inside space-y-2">
                    <li>Write your solution in the editor on the right using <strong className="text-white">{selectedLanguage.name}</strong>.</li>
                    <li>Ensure your code fulfills the task requirements.</li>
                    <li>Output must be correct to pass the Sandbox evaluation.</li>
                  </ul>
                </div>
              </motion.div>
            )}
          </div>
          
          {/* Bottom Half of Left Pane: Enhanced Execution Console */}
          <div className="flex-1 p-6 flex flex-col bg-black/60 overflow-hidden">
            <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2 tracking-wide uppercase">
              <Terminal className="h-4 w-4 text-gray-400" /> Output & AI Evaluation
            </h2>
            
            <div className="flex-1 bg-black/80 border border-white/5 rounded-xl p-4 overflow-y-auto font-mono text-sm scrollbar-thin scrollbar-thumb-white/10 shadow-inner">
              <AnimatePresence mode="wait">
                {!submissionResult ? (
                  <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-gray-600 italic">
                    Ready for execution... Click &quot;Run Code&quot; to compile and evaluate.
                  </motion.p>
                ) : (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-4"
                  >
                    {/* Master Status Banner */}
                    <div className={`p-4 rounded-xl border ${
                      submissionResult.status === "success" 
                        ? "bg-green-500/10 border-green-500/20 text-green-300" 
                        : "bg-red-500/10 border-red-500/20 text-red-300"
                    }`}>
                      <div className="flex items-start gap-3">
                        {submissionResult.status === "success" ? (
                          <CheckCircle className="h-5 w-5 mt-0.5 text-green-400 flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 mt-0.5 text-red-400 flex-shrink-0" />
                        )}
                        <div>
                          <strong className="block mb-1 text-white text-base">
                            {submissionResult.status === "success" ? "Code Executed Successfully" : "Execution Failed"}
                          </strong>
                          <p className="opacity-90 leading-relaxed text-sm">{submissionResult.message}</p>
                        </div>
                      </div>
                    </div>

                    {/* Raw Terminal Output Block */}
                    {submissionResult.actual_output && (
                      <div className="p-3 bg-black border border-white/10 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 font-bold">Standard Output</p>
                        <pre className={`text-xs whitespace-pre-wrap font-mono ${submissionResult.status === "error" ? "text-red-400" : "text-gray-300"}`}>
                          {submissionResult.actual_output}
                        </pre>
                      </div>
                    )}

                    {/* AI Feedback & Grade Block */}
                    {submissionResult.ai_feedback && (
                      <div className="p-4 bg-primary/10 border border-primary/20 rounded-xl shadow-inner relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 opacity-10">
                          <Sparkles className="h-24 w-24 text-primary" />
                        </div>
                        <div className="relative z-10">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-xs text-primary font-bold uppercase tracking-widest flex items-center gap-1">
                              <BrainCircuit className="h-3 w-3" /> AI Evaluator Analysis
                            </p>
                            {submissionResult.ai_score !== undefined && (
                              <span className="text-xs font-black bg-primary text-white px-2 py-1 rounded-md">
                                Score: {submissionResult.ai_score}%
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-200 leading-relaxed italic">
                            &quot;{submissionResult.ai_feedback}&quot;
                          </p>
                        </div>
                      </div>
                    )}

                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>

        {/* RIGHT PANE: Code Editor */}
        <div className="w-full lg:w-2/3 h-1/2 lg:h-full relative bg-[#1e1e1e]">
          <Editor
            height="100%"
            language={selectedLanguage.id} // 🚨 Dynamically map language syntax highlighter
            theme="vs-dark"
            value={code}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 15,
              fontFamily: "var(--font-geist-mono)",
              padding: { top: 24, bottom: 24 },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              formatOnPaste: true,
              wordWrap: "on",
              lineHeight: 1.6
            }}
          />
        </div>

      </div>
    </div>
  );
}