"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import { useAppStore } from "../lib/store";

export default function VoiceAgent() {
  const { accessToken } = useAppStore();
  
  const [isConnecting, setIsConnecting] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // Audio queue for playing continuous AI responses
  const nextPlayTimeRef = useRef<number>(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopVoiceSession();
  }, []);

  if (!accessToken) return null;

  // =======================================================================
  // Audio Encoding/Decoding Utilities for PCM16 <-> Base64
  // =======================================================================
  const floatTo16BitPCM = (input: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(input.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // =======================================================================
  // Core WebSocket & Audio Management
  // =======================================================================
  const startVoiceSession = async () => {
    try {
      setIsConnecting(true);

      // 1. Initialize Web Audio API
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContext({ sampleRate: 24000 }); // OpenAI requires 24kHz
      audioContextRef.current = audioCtx;
      nextPlayTimeRef.current = audioCtx.currentTime;

      // 2. Request Microphone Access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      // Deprecated but highly stable across all browsers without complex WebWorkers
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // 3. Connect WebSocket to FastAPI Proxy
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8007/api/v1";
      const ws = new WebSocket(`${wsUrl}/voice/stream?token=${accessToken}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsActive(true);
        
        // Start streaming mic audio to server
        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16Buffer = floatTo16BitPCM(inputData);
            const base64Audio = arrayBufferToBase64(pcm16Buffer);
            
            // Append audio command required by OpenAI Realtime API
            ws.send(JSON.stringify({
              type: "input_audio_buffer.append",
              audio: base64Audio
            }));
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Handle AI Audio Output
        if (data.type === "response.audio.delta" && data.delta) {
          setIsAISpeaking(true);
          const pcmBuffer = base64ToArrayBuffer(data.delta);
          const int16Array = new Int16Array(pcmBuffer);
          const float32Array = new Float32Array(int16Array.length);
          
          for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 0x7fff;
          }

          const audioBuffer = audioCtx.createBuffer(1, float32Array.length, 24000);
          audioBuffer.getChannelData(0).set(float32Array);

          const sourceNode = audioCtx.createBufferSource();
          sourceNode.buffer = audioBuffer;
          sourceNode.connect(audioCtx.destination);
          
          // Schedule playback to prevent audio clipping
          const playTime = Math.max(audioCtx.currentTime, nextPlayTimeRef.current);
          sourceNode.start(playTime);
          nextPlayTimeRef.current = playTime + audioBuffer.duration;
          
          sourceNode.onended = () => {
            if (audioCtx.currentTime >= nextPlayTimeRef.current - 0.1) {
              setIsAISpeaking(false);
            }
          };
        }
      };

      ws.onerror = (error) => {
        console.error("Voice WebSocket Error:", error);
        stopVoiceSession();
      };

      ws.onclose = () => {
        stopVoiceSession();
      };

    } catch (error) {
      console.error("Failed to start voice session:", error);
      setIsConnecting(false);
      alert("Failed to access microphone or connect to AI. Please check permissions.");
    }
  };

  const stopVoiceSession = () => {
    setIsActive(false);
    setIsConnecting(false);
    setIsAISpeaking(false);

    if (processorRef.current && audioContextRef.current) {
      processorRef.current.disconnect();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    processorRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    wsRef.current = null;
  };

  return (
    <div className="fixed bottom-28 right-8 z-[9999] flex flex-col items-center gap-2">
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.8 }}
            className={`px-4 py-2 rounded-full backdrop-blur-md border shadow-lg text-xs font-bold flex items-center gap-2 ${
              isAISpeaking 
                ? "bg-green-500/20 border-green-500/50 text-green-400" 
                : "bg-black/60 border-white/20 text-white"
            }`}
          >
            {isAISpeaking ? (
              <>
                <Volume2 className="h-3.5 w-3.5 animate-pulse" />
                AI Speaking...
              </>
            ) : (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                Listening...
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={isActive ? stopVoiceSession : startVoiceSession}
        disabled={isConnecting}
        className={`h-14 w-14 rounded-full shadow-[0_0_30px_rgba(0,0,0,0.5)] flex items-center justify-center text-white transition-all border group ${
          isActive 
            ? "bg-red-500/90 border-red-400 hover:bg-red-500 hover:shadow-[0_0_40px_rgba(239,68,68,0.6)]" 
            : "bg-zinc-900 border-zinc-700 hover:bg-zinc-800 hover:border-zinc-500"
        }`}
      >
        {isConnecting ? (
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        ) : isActive ? (
          <MicOff className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6 group-hover:text-primary transition-colors" />
        )}
      </motion.button>
    </div>
  );
}