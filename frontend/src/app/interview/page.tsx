"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, Loader2, Bot, PhoneOff } from "lucide-react";
import { useAppStore } from "../../lib/store";

export default function MockInterviewPage() {
  const router = useRouter();
  const { accessToken, _hasHydrated } = useAppStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  // Enterprise WebRTC & Audio Context Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!accessToken) router.push("/login");

    setupCamera();

    return () => endInterview(); // Cleanup gracefully on unmount
  }, [_hasHydrated, accessToken, router]);

  // =======================================================================
  // 1. Video Stream Initialization
  // =======================================================================
  const setupCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      // FIX 1: Assigning stream to the DOM element explicitly
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Failed to access camera/mic:", err);
      alert("Please allow camera and microphone access to start the interview.");
    }
  };

  // =======================================================================
  // 2. Audio Playback Engine (OpenAI PCM16 to Browser)
  // =======================================================================
  const playAudioDelta = (base64Audio: string) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    
    // Decode base64 to binary
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert 16-bit PCM to Float32 for the Web Audio API
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }
    
    const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContextRef.current.destination);
    
    // Maintain a steady playback queue
    const currentTime = audioContextRef.current.currentTime;
    if (nextPlayTimeRef.current < currentTime) {
      nextPlayTimeRef.current = currentTime;
    }
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuffer.duration;
  };

  // =======================================================================
  // 3. Duplex Socket Connection & Pipeline
  // =======================================================================
  const startInterview = () => {
    if (!stream) return;
    setIsConnecting(true);

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8002/api/v1";
    const ws = new WebSocket(`${wsUrl}/interview/stream?token=${accessToken}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnecting(false);
      setIsInterviewActive(true);

      // FIX 2a: Trigger AI to start the interview!
      ws.send(JSON.stringify({
        type: "response.create",
        response: {
          modalities: ["audio", "text"],
          instructions: "Start the mock interview by introducing yourself warmly and asking the very first question."
        }
      }));

      // FIX 2b: Pipe Student Microphone Audio to the AI
      try {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = async (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            const buffer = await e.data.arrayBuffer();
            
            // Safe Base64 encoding for large buffers
            let binary = '';
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            const base64Audio = btoa(binary);
            
            ws.send(JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64Audio
            }));
          }
        };
        mediaRecorder.start(250); // Send audio chunks every 250ms
      } catch (error) {
        console.error("Microphone piping failed:", error);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Track AI Voice State
        if (data.type === "agent_speaking") setAiSpeaking(true);
        else if (data.type === "agent_idle") setAiSpeaking(false);
        // Play AI Voice Delta
        else if (data.type === "response.audio.delta" && data.delta) {
          playAudioDelta(data.delta);
        }
      } catch (e) {
        console.error("Error processing AI response", e);
      }
    };

    ws.onerror = () => endInterview();
    ws.onclose = () => endInterview();
  };

  const endInterview = () => {
    setIsInterviewActive(false);
    setIsConnecting(false);
    setAiSpeaking(false);
    
    if (wsRef.current) wsRef.current.close();
    if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
    
    // Suspend audio context safely
    if (audioContextRef.current) {
      audioContextRef.current.suspend();
      nextPlayTimeRef.current = 0;
    }
  };

  const toggleCamera = () => {
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = !cameraEnabled;
      });
      setCameraEnabled(!cameraEnabled);
    }
  };

  if (!_hasHydrated) return null;

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-6 z-10">
        <h1 className="text-white text-xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" /> AI Mock Interviewer
        </h1>
        {isInterviewActive && (
          <div className="flex items-center gap-2 bg-white/10 px-4 py-1.5 rounded-full text-sm font-medium text-white border border-white/20">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${aiSpeaking ? "bg-green-400" : "bg-red-400"}`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${aiSpeaking ? "bg-green-500" : "bg-red-500"}`}></span>
            </span>
            {aiSpeaking ? "AI is evaluating..." : "AI is listening..."}
          </div>
        )}
      </div>

      {/* Main Video Arena */}
      <div className="relative w-full max-w-5xl aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center">
        
        {/* FIX 1: ALWAYS RENDER VIDEO TAG but conditionally hide it */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted // User shouldn't hear themselves
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${(!stream || !cameraEnabled) ? "opacity-0" : "opacity-100"}`}
        />
        
        {!stream && (
          <Loader2 className="relative z-10 h-10 w-10 animate-spin text-muted-foreground" />
        )}

        {/* AI Avatar Overlay */}
        <AnimatePresence>
          {isInterviewActive && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute top-6 right-6 bg-black/50 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex flex-col items-center gap-2 z-20"
            >
              <div className={`h-16 w-16 rounded-full flex items-center justify-center transition-colors duration-300 ${aiSpeaking ? "bg-primary/20 text-primary border border-primary shadow-[0_0_20px_rgba(100,50,255,0.4)]" : "bg-zinc-800 text-zinc-400"}`}>
                <Bot className="h-8 w-8" />
              </div>
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">AI Agent</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center gap-4 bg-zinc-900/80 p-4 rounded-2xl border border-white/10 backdrop-blur-md z-10 shadow-xl">
        <button onClick={toggleCamera} className="h-14 w-14 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-white transition-colors border border-white/5">
          {cameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5 text-red-400" />}
        </button>
        
        {!isInterviewActive ? (
          <button
            onClick={startInterview}
            disabled={isConnecting || !stream}
            className="px-10 py-4 bg-primary text-white rounded-full font-bold hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50 shadow-[0_0_20px_rgba(100,50,255,0.3)] active:scale-95"
          >
            {isConnecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
            {isConnecting ? "Connecting to Engine..." : "Start Interview"}
          </button>
        ) : (
          <button
            onClick={endInterview}
            className="px-10 py-4 bg-red-500 text-white rounded-full font-bold hover:bg-red-600 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.4)] active:scale-95"
          >
            <PhoneOff className="h-5 w-5" />
            End Session
          </button>
        )}
      </div>
    </div>
  );
}