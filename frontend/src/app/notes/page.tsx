"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Loader2, Save, FileText, CheckCircle, ArrowLeft, Plus, Clock } from "lucide-react";
import api from "../../lib/api"; // Adjust the path based on your directory structure
import { useAppStore } from "../../lib/store";

// Define the Note Interface strictly mapping to the backend response
interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

const ReactQuill = dynamic(() => import("react-quill-new"), { 
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] w-full items-center justify-center bg-card">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
});
import "react-quill-new/dist/quill.snow.css";

export default function NotesPage() {
  const router = useRouter();
  const { accessToken, _hasHydrated } = useAppStore();

  // Core Editor State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sidebar List State
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  // Security guard: Ensure only authenticated users can access the notes workspace
  useEffect(() => {
    if (_hasHydrated && !accessToken) {
      router.push("/login");
    }
  }, [_hasHydrated, accessToken, router]);

  // Function to fetch all user notes from PostgreSQL
  const fetchUserNotes = useCallback(async () => {
    if (!accessToken) return;
    try {
      setIsLoadingNotes(true);
      const response = await api.get("/notes/", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setNotes(response.data);
    } catch (err: any) {
      console.error("Failed to load notes", err);
    } finally {
      setIsLoadingNotes(false);
    }
  }, [accessToken]);

  // Fetch notes strictly on component mount
  useEffect(() => {
    if (_hasHydrated && accessToken) {
      fetchUserNotes();
    }
  }, [_hasHydrated, accessToken, fetchUserNotes]);

  const handleCreateNew = () => {
    setActiveNoteId(null);
    setTitle("");
    setContent("");
    setError(null);
    setSaveSuccess(false);
  };

  const handleSelectNote = (note: Note) => {
    setActiveNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setError(null);
    setSaveSuccess(false);
  };

  const handleSaveNote = async () => {
    if (!title.trim() || !content.trim() || content === "<p><br></p>") {
      setError("Please provide both a title and some content for your note.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      await api.post(
        "/notes/embed", 
        { title: title.trim(), content: content.trim() },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      
      setSaveSuccess(true);
      
      // Refresh the notes list to include the newly created one
      await fetchUserNotes();
      
      // Auto-reset for the next note
      setTimeout(() => {
        setSaveSuccess(false);
        handleCreateNew(); // Clear editor for next interaction
      }, 2000);
      
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to encrypt and store the note.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!_hasHydrated) return null;

  // Derive editor mode: if activeNoteId exists, it's read-only.
  const isViewMode = activeNoteId !== null;

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-xl px-4 md:px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 bg-muted hover:bg-muted/80 rounded-md transition-colors text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="h-6 w-px bg-border"></div>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg border border-primary/20">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-tight">Private Knowledge Base</h1>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">AI-Powered RAG System</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace with Sidebar Architecture */}
      <div className="container mx-auto px-4 py-8 max-w-7xl flex flex-col lg:flex-row gap-6">
        
        {/* Left Sidebar: Notes Directory */}
        <div className="w-full lg:w-1/3 flex flex-col gap-4">
          <button
            onClick={handleCreateNew}
            className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/20 px-4 py-3 rounded-xl font-bold transition-all active:scale-95"
          >
            <Plus className="h-5 w-5" />
            Create New Note
          </button>

          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex-grow min-h-[400px] flex flex-col">
            <div className="p-4 border-b border-border bg-muted/20">
              <h3 className="font-bold text-foreground">Your Document Library</h3>
            </div>
            
            <div className="overflow-y-auto flex-grow p-2 space-y-1 custom-scrollbar">
              {isLoadingNotes ? (
                <div className="flex justify-center items-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center p-6 text-muted-foreground text-sm">
                  No notes found. Create your first document to start training your personal AI.
                </div>
              ) : (
                notes.map((note) => (
                  <button
                    key={note.id}
                    onClick={() => handleSelectNote(note)}
                    className={`w-full text-left p-4 rounded-xl transition-all border ${
                      activeNoteId === note.id 
                        ? "bg-primary/10 border-primary text-primary" 
                        : "bg-transparent border-transparent hover:bg-muted text-foreground"
                    }`}
                  >
                    <h4 className="font-semibold truncate">{note.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(note.created_at).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric'
                      })}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Section: Editor Workspace */}
        <motion.div 
          key={activeNoteId || "new"} // Force animation on switch
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-full lg:w-2/3"
        >
          <div className="mb-6 flex justify-between items-end">
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">
                {isViewMode ? "Review Document" : "Draft New Document"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isViewMode 
                  ? "This document is vectorized and active in your personal RAG index."
                  : "Content saved here will be instantly embedded for AI retrieval."}
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col">
            {/* Note Title Input */}
            <div className="p-5 border-b border-border bg-muted/20">
              <input
                type="text"
                placeholder="Note Title (e.g., 'Core Concepts of Next.js')"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent text-xl font-bold text-foreground placeholder-muted-foreground outline-none disabled:opacity-70"
                disabled={isSaving || isViewMode}
              />
            </div>

            {/* Rich Text Editor Container */}
            <div className="bg-background text-foreground min-h-[450px] editor-container relative">
              <ReactQuill 
                theme="snow" 
                value={content} 
                onChange={setContent} 
                placeholder="Write down technical concepts, logic, or snippets..."
                className="h-full"
                readOnly={isSaving || isViewMode}
              />
            </div>

            {/* Footer Controls & Status Messages */}
            {!isViewMode && (
              <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between">
                <div>
                  {error && <p className="text-sm text-destructive font-medium">{error}</p>}
                  {saveSuccess && (
                    <p className="text-sm text-green-500 font-medium flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" /> Vectorized and stored!
                    </p>
                  )}
                </div>

                <button
                  onClick={handleSaveNote}
                  disabled={isSaving || !title.trim() || !content.trim() || content === "<p><br></p>"}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-bold transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                >
                  {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  {isSaving ? "Embedding..." : "Save & Embed Note"}
                </button>
              </div>
            )}
          </div>
          
          {/* Scoped styles to ensure Quill Editor matches the Enterprise Theme */}
          <style jsx global>{`
            .editor-container .ql-toolbar {
              border: none;
              border-bottom: 1px solid var(--border);
              background-color: var(--card);
            }
            .editor-container .ql-container {
              border: none;
              font-size: 16px;
              min-height: 450px;
            }
            .editor-container .ql-editor {
              min-height: 450px;
            }
            .editor-container .ql-editor.ql-blank::before {
              color: var(--muted-foreground);
              font-style: normal;
            }
            .custom-scrollbar::-webkit-scrollbar {
              width: 6px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background-color: var(--border);
              border-radius: 10px;
            }
          `}</style>
        </motion.div>
      </div>
    </div>
  );
}