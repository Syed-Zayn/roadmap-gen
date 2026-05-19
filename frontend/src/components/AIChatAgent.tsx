"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { MessageCircle, X, Send, Bot, User as UserIcon, Loader2, GripHorizontal, Zap } from "lucide-react";
import api from "../lib/api";
import { useAppStore } from "../lib/store";

// =======================================================================
// TypeScript Interfaces
// =======================================================================
interface ChatMessage {
  role: "user" | "agent";
  text: string;
  sources?: string[];
  usedModel?: string; // New field to track which LLM answered
}

export default function AIChatAgent() {
  // Global Auth State & User Settings
  const { accessToken, preferredLLM, setPreferredLLM } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { 
      role: "agent", 
      text: "Hello! I am your AI Curriculum Assistant. How can I help you with your studies or dashboard today?",
      usedModel: "System Agent" 
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Enterprise Architecture: Generate a stable session ID for context memory
  const [conversationId] = useState(() => crypto.randomUUID());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragConstraintsRef = useRef(null);
  
  // Officially initializing Framer Motion Drag Controls
  const dragControls = useDragControls();

  // Auto-scroll logic for new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen, isLoading]);

  // Agar user logged in nahi hai, to global chat widget render nahi hoga
  if (!accessToken) return null;

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    setMessages((prev) => [...prev, { role: "user", text: userText }]);
    setInput("");
    setIsLoading(true);

    try {
      // Real API Call with Multi-LLM Routing
      const response = await api.post("/chat/message", {
        message: userText,
        conversation_id: conversationId,
        selected_model: preferredLLM, // Injecting user's preferred LLM
      });

      setMessages((prev) => [
        ...prev, 
        { 
          role: "agent", 
          text: response.data.reply,
          sources: response.data.sources_used || [],
          usedModel: response.data.used_model || "AI Engine"
        }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev, 
        { 
          role: "agent", 
          text: "System Error: The AI engine is currently unreachable. Please try again later.",
          usedModel: "Error Fallback"
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Reference box for dragging constraints. 
        Ensures the chat window cannot be dragged completely off-screen.
      */}
      <div ref={dragConstraintsRef} className="fixed inset-4 pointer-events-none z-[9990]" />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            // Framer Motion Drag Configuration
            drag
            dragControls={dragControls}
            dragConstraints={dragConstraintsRef}
            dragElastic={0.1}
            dragMomentum={false}
            // Drag Listener strictly bounded to the controls to prevent text selection/input issues
            dragListener={false} 
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-24 right-6 w-[350px] md:w-[400px] h-[550px] max-h-[80vh] flex flex-col bg-black/80 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-[0_10px_50px_rgba(100,50,255,0.3)] overflow-hidden z-[9999]"
          >
            {/* Header / Drag Handle */}
            <div 
              className="bg-gradient-to-r from-primary to-blue-600 p-4 flex items-center justify-between cursor-move border-b border-white/10 group"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="flex items-center gap-3 text-white font-bold pointer-events-none">
                <div className="bg-white/20 p-1.5 rounded-lg border border-white/20 shadow-inner">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm">AI Assistant</h3>
                  <p className="text-[10px] text-white/70 font-medium">Online • Draggable</p>
                </div>
              </div>
              
              {/* Right Side: LLM Selector & Controls */}
              <div className="flex items-center gap-2">
                {/* Dropdown with pointer propagation stopped so it doesn't trigger drag */}
                <div onPointerDown={(e) => e.stopPropagation()} className="pointer-events-auto">
                  <select
                    value={preferredLLM}
                    onChange={(e) => setPreferredLLM(e.target.value)}
                    className="bg-black/30 border border-white/20 rounded-md text-[10px] font-medium text-white px-2 py-1 outline-none focus:border-white focus:ring-1 focus:ring-white/50 cursor-pointer hover:bg-black/50 transition-colors"
                  >
                    <option value="gemini-1.5-flash">Gemini Flash</option>
                    <option value="claude-3-5-sonnet-latest">Claude 3.5</option>
                    <option value="gpt-4o-mini">GPT-4o Mini</option>
                  </select>
                </div>

                <button 
                  title="close"
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent drag start when clicking close
                    setIsOpen(false);
                  }} 
                  className="p-1.5 rounded-full hover:bg-white/20 text-white transition-colors cursor-pointer pointer-events-auto"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Chat History Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-thin scrollbar-thumb-white/10">
              {messages.map((msg, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={idx} 
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center shadow-lg ${msg.role === "user" ? "bg-white/10 border border-white/5" : "bg-primary/20 text-primary border border-primary/30"}`}>
                    {msg.role === "user" ? <UserIcon className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className="flex flex-col gap-1 max-w-[75%]">
                    <div className={`p-3.5 text-sm shadow-md leading-relaxed ${msg.role === "user" ? "bg-white/10 text-white rounded-2xl rounded-tr-sm border border-white/5" : "bg-black/60 border border-white/10 text-gray-200 rounded-2xl rounded-tl-sm"}`}>
                      {msg.text}
                      
                      {/* LLM Powered By Badge */}
                      {msg.role === "agent" && msg.usedModel && (
                        <div className="flex items-center gap-1.5 mt-2 border-t border-white/10 pt-2 select-none">
                          <Zap className="h-3 w-3 text-yellow-400" />
                          <span className="text-[9px] text-white/50 uppercase tracking-widest font-bold">
                            Powered by {msg.usedModel}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Render extracted RAG sources if the AI provides them */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {msg.sources.map((src, sIdx) => (
                          <a 
                            key={sIdx} 
                            href={src} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] bg-white/5 border border-white/10 px-2 py-1 rounded text-primary hover:bg-white/10 hover:underline transition-all"
                          >
                            Source {sIdx + 1}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              
              {/* Typing Indicator */}
              {isLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3 flex-row">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/20 text-primary border border-primary/30 flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="p-3.5 rounded-2xl bg-black/60 border border-white/10 text-gray-300 rounded-tl-sm flex items-center gap-3">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" /> 
                    <span className="text-xs font-medium">Processing via {preferredLLM.includes('gemini') ? 'Gemini' : preferredLLM.includes('claude') ? 'Claude' : 'GPT-4o'}...</span>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} className="h-1" />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-white/10 bg-black/60">
              <form onSubmit={handleSendMessage} className="flex items-center gap-2 relative">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me anything..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all shadow-inner"
                  disabled={isLoading}
                />
                <button
                title="s" 
                  type="submit" 
                  disabled={isLoading || !input.trim()}
                  className="absolute right-1.5 p-2 bg-gradient-to-r from-primary to-blue-600 rounded-lg text-white hover:opacity-90 disabled:opacity-50 transition-all active:scale-95"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Floating Action Button (FAB) */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-8 right-8 h-16 w-16 rounded-full bg-gradient-to-r from-primary to-blue-600 shadow-[0_0_40px_rgba(100,50,255,0.5)] flex items-center justify-center text-white z-[9999] hover:shadow-[0_0_50px_rgba(100,50,255,0.7)] transition-all border border-white/20 group"
          >
            <MessageCircle className="h-7 w-7 group-hover:hidden absolute" />
            <Bot className="h-7 w-7 hidden group-hover:block absolute" />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}