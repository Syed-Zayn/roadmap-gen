"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Editor, { useMonaco } from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import { Users, Code2, Loader2, Save } from "lucide-react";
import { useAppStore } from "../../../../lib/store";

export default function CollaborativeEditorPage() {
  const { sessionId } = useParams();
  const router = useRouter();
  const { accessToken, _hasHydrated } = useAppStore();
  const monaco = useMonaco();

  const editorRef = useRef<any>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  const [connectedUsers, setConnectedUsers] = useState(1);
  const [isSynced, setIsSynced] = useState(false);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!accessToken) router.push("/login");
  }, [_hasHydrated, accessToken, router]);

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;

    // Initialize Yjs Document for Conflict-Free Replicated Data Types (CRDT)
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const ytext = ydoc.getText("monaco");

    // Establish WebSocket connection to backend collaboration server
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8002";
    const provider = new WebsocketProvider(
      `${wsUrl}/api/v1/collab`,
      sessionId as string,
      ydoc
    );
    providerRef.current = provider;

    provider.on("status", (event: { status: string }) => {
      if (event.status === "connected") setIsSynced(true);
      else setIsSynced(false);
    });

    provider.awareness.on("change", () => {
      // Calculate how many users are in the same session
      setConnectedUsers(Array.from(provider.awareness.getStates().keys()).length);
    });

    // Bind Yjs Text to Monaco Editor
    if (monaco) {
      new MonacoBinding(
        ytext,
        editorRef.current.getModel(),
        new Set([editorRef.current]),
        provider.awareness
      );
    }
  };

  // Cleanup connections on unmount to prevent memory/socket leaks
  useEffect(() => {
    return () => {
      if (providerRef.current) providerRef.current.disconnect();
      if (ydocRef.current) ydocRef.current.destroy();
    };
  }, []);

  if (!_hasHydrated) return <div className="h-screen w-full flex items-center justify-center bg-[#1e1e1e]"><Loader2 className="animate-spin text-primary h-8 w-8" /></div>;

  return (
    <div className="flex flex-col h-screen w-full bg-[#1e1e1e]">
      {/* Collaboration Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-3 text-white">
          <Code2 className="h-5 w-5 text-primary" />
          <h1 className="font-semibold text-sm">Session: <span className="text-muted-foreground font-mono">{sessionId}</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-300 bg-[#3c3c3c] px-3 py-1.5 rounded-md">
            <Users className="h-4 w-4 text-blue-400" />
            {connectedUsers} Online
          </div>
          
          <div className="flex items-center gap-2 text-xs">
            {isSynced ? (
              <span className="flex items-center gap-1.5 text-green-400"><div className="h-2 w-2 rounded-full bg-green-500" /> Synced</span>
            ) : (
              <span className="flex items-center gap-1.5 text-orange-400"><Loader2 className="h-3 w-3 animate-spin" /> Connecting...</span>
            )}
          </div>
          
          <button className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-xs font-semibold px-4 py-1.5 rounded-md transition-colors">
            <Save className="h-3.5 w-3.5" /> Save Snippet
          </button>
        </div>
      </header>

      {/* Monaco Editor Instance */}
      <div className="flex-1 w-full relative">
        <Editor
          height="100%"
          defaultLanguage="python"
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: "on",
            padding: { top: 16 },
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
          }}
          onMount={handleEditorDidMount}
        />
      </div>
    </div>
  );
}