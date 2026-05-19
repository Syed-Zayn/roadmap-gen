"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tldraw, Editor, exportToBlob } from "tldraw";
import "tldraw/tldraw.css";
import { motion, AnimatePresence } from "framer-motion";
import { Code, Loader2, Play, ShieldAlert, X } from "lucide-react";
import api from "../../../lib/api";
import { useAppStore } from "../../../lib/store";

export default function SmartWhiteboardPage() {
  const router = useRouter();
  const { accessToken, userRole, _hasHydrated } = useAppStore();
  
  const [editor, setEditor] = useState<Editor | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Enforce Role-Based Access Control (Teachers & SuperAdmins Only)
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!accessToken) {
      router.push("/login");
      return;
    }
    const role = String(userRole || "").toUpperCase();
    if (role !== "TEACHER" && role !== "SUPERADMIN") {
      router.push("/dashboard");
    }
  }, [_hasHydrated, accessToken, userRole, router]);

  const handleGenerateCode = async () => {
    if (!editor) return;

    try {
      setIsGenerating(true);
      setError(null);

      // Get all shapes on the canvas to export
      const shapeIds = Array.from(editor.getCurrentPageShapeIds().values());
      if (shapeIds.length === 0) {
        throw new Error("Canvas is empty. Please draw a wireframe first.");
      }

      // Export canvas to a blob
      const blob = await exportToBlob({
        editor,
        ids: shapeIds,
        format: "png",
        opts: { background: true, padding: 16 }
      });

      // Convert Blob to Base64 for the API payload
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Send the image to the FastAPI Vision endpoint
      const response = await api.post("/vision/generate", {
        image: base64Image,
        context: "Generate a responsive React/Tailwind component based on this wireframe drawing."
      });

      setGeneratedCode(response.data.code);
    } catch (err: any) {
      console.error("Vision API Error:", err);
      setError(err.response?.data?.detail || err.message || "Failed to generate code from wireframe.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (!_hasHydrated) return null;

  return (
    <div className="relative w-full h-screen flex flex-col bg-background overflow-hidden">
      {/* Top Action Bar */}
      <header className="absolute top-0 w-full z-50 p-4 flex justify-between items-center pointer-events-none">
        <div className="bg-card/90 backdrop-blur-md border border-border px-4 py-2 rounded-xl pointer-events-auto shadow-sm">
          <h1 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Code className="h-4 w-4 text-primary" />
            Smart Whiteboard
          </h1>
        </div>

        <button
          onClick={handleGenerateCode}
          disabled={isGenerating}
          className="pointer-events-auto flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-lg disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {isGenerating ? "Analyzing Visuals..." : "Generate UI Code"}
        </button>
      </header>

      {/* Tldraw Canvas */}
      <div className="flex-1 w-full h-full">
        <Tldraw onMount={setEditor} autoFocus />
      </div>

      {/* Generated Code Sidebar Overlay */}
      <AnimatePresence>
        {generatedCode && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute right-0 top-0 h-full w-[450px] bg-card border-l border-border shadow-2xl flex flex-col z-50"
          >
            <div className="p-4 border-b border-border flex justify-between items-center bg-secondary/30">
              <h2 className="font-bold flex items-center gap-2">
                <Code className="h-4 w-4 text-primary" /> Generated Output
              </h2>
              <button onClick={() => setGeneratedCode(null)} className="p-1 hover:bg-white/10 rounded-md">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              <pre className="text-xs font-mono text-muted-foreground bg-black/50 p-4 rounded-xl overflow-x-auto border border-white/5">
                {generatedCode}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-destructive text-destructive-foreground px-6 py-3 rounded-xl flex items-center gap-3 shadow-xl z-50"
          >
            <ShieldAlert className="h-5 w-5" />
            <span className="text-sm font-medium">{error}</span>
            <button onClick={() => setError(null)}><X className="h-4 w-4 opacity-70 hover:opacity-100" /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}