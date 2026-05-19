"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { CheckCircle2, Lock, PlayCircle, Loader2 } from "lucide-react";
import { useAppStore } from "../../../lib/store";

interface SkillNode {
  id: string;
  title: string;
  state: "Locked" | "Unlocked" | "In_Progress" | "Completed";
  x: number;
  y: number;
}

interface SkillEdge {
  id: string;
  source: string;
  target: string;
  active: boolean;
}

interface SkillTreeData {
  nodes: SkillNode[];
  edges: SkillEdge[];
  overall_progress: number;
}

export default function SkillTree() {
  const [treeData, setTreeData] = useState<SkillTreeData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { accessToken } = useAppStore();

  useEffect(() => {
    const fetchSkillTree = async () => {
      if (!accessToken) {
        setError("Authentication token missing.");
        setLoading(false);
        return;
      }

      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1";
        const response = await axios.get(`${baseUrl}/progress/skill-tree`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        
        setTreeData(response.data);
      } catch (err) {
        console.error("Skill Tree Fetch Error:", err);
        setError("Unable to load the learning roadmap.");
      } finally {
        setLoading(false);
      }
    };

    fetchSkillTree();
  }, [accessToken]);

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !treeData || treeData.nodes.length === 0) {
    return (
      <div className="flex flex-col h-96 w-full items-center justify-center rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl gap-4">
        <p className="font-semibold text-gray-400">{error || "No roadmap data available yet. Generate your curriculum first!"}</p>
      </div>
    );
  }

  // Calculate dynamic width for horizontal scrolling
  const max_x = Math.max(...treeData.nodes.map(n => n.x)) + 150;
  const containerWidth = Math.max(max_x, 800);

  return (
    <div className="relative h-[400px] w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0f] p-6 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
      
      {/* ENTERPRISE FIX: Horizontal scroll container for massive dynamically generated roadmaps */}
      <div className="relative h-full w-full overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        <div style={{ width: `${containerWidth}px`, height: "100%", position: "relative" }}>
          
          {/* SVG Layer for Connections (Edges) */}
          <svg className="absolute inset-0 h-full w-full overflow-visible pointer-events-none">
            {treeData.edges.map((edge) => {
              const sourceNode = treeData.nodes.find((n) => n.id === edge.source);
              const targetNode = treeData.nodes.find((n) => n.id === edge.target);

              if (!sourceNode || !targetNode) return null;

              return (
                <g key={edge.id}>
                  {/* Base inactive/locked path */}
                  <path
                    d={`M ${sourceNode.x} ${sourceNode.y} C ${sourceNode.x + 80} ${sourceNode.y}, ${targetNode.x - 80} ${targetNode.y}, ${targetNode.x} ${targetNode.y}`}
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  {/* Active Neon Flowing Path */}
                  {edge.active && (
                    <motion.path
                      d={`M ${sourceNode.x} ${sourceNode.y} C ${sourceNode.x + 80} ${sourceNode.y}, ${targetNode.x - 80} ${targetNode.y}, ${targetNode.x} ${targetNode.y}`}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="4"
                      strokeLinecap="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 1.5, ease: "easeInOut", delay: 0.5 }}
                      style={{ filter: "drop-shadow(0 0 10px hsl(var(--primary)))" }}
                    />
                  )}
                  {/* Animated Glowing Energy Dot traveling along the active path */}
                  {edge.active && (
                    <motion.circle
                      r="4"
                      fill="#fff"
                      style={{ filter: "drop-shadow(0 0 8px #fff)" }}
                      animate={{
                        offsetDistance: ["0%", "100%"],
                        opacity: [0, 1, 0]
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "linear"
                      }}
                      style={{
                        offsetPath: `path("M ${sourceNode.x} ${sourceNode.y} C ${sourceNode.x + 80} ${sourceNode.y}, ${targetNode.x - 80} ${targetNode.y}, ${targetNode.x} ${targetNode.y}")`
                      } as any}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* HTML/Motion Layer for Nodes (Topics) */}
          {treeData.nodes.map((node, index) => {
            const isCompleted = node.state === "Completed";
            const isInProgress = node.state === "In_Progress";
            const isLocked = node.state === "Locked";

            return (
              <motion.div
                key={node.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }}
                className="absolute flex flex-col items-center justify-center group"
                style={{ left: node.x, top: node.y, transform: "translate(-50%, -50%)" }}
              >
                {/* Dynamic Node Halo (Glow) */}
                <div 
                  className={`relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-300 z-10 ${
                    isCompleted ? "bg-emerald-500/20 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)] cursor-pointer hover:scale-110" :
                    isInProgress ? "bg-primary/20 border-primary shadow-[0_0_25px_hsl(var(--primary))] animate-pulse cursor-pointer" :
                    "bg-black/50 border-white/10 opacity-60 cursor-not-allowed"
                  }`}
                >
                  {isCompleted && <CheckCircle2 className="h-6 w-6 text-emerald-400 drop-shadow-md" />}
                  {isInProgress && <PlayCircle className="h-6 w-6 text-primary drop-shadow-md ml-1" />}
                  {isLocked && <Lock className="h-5 w-5 text-gray-500" />}
                </div>

                {/* Node Title floating below */}
                <motion.div 
                  className="absolute top-16 whitespace-nowrap rounded-lg bg-black/80 px-3 py-1.5 text-xs font-bold border border-white/10 backdrop-blur-md transition-opacity z-20 shadow-xl"
                >
                  <span className={isCompleted ? "text-emerald-400" : isInProgress ? "text-primary" : "text-gray-400"}>
                    {node.title.length > 25 ? node.title.substring(0, 22) + "..." : node.title}
                  </span>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>
      
      {/* UI Overlay for Overall Progress Context */}
      <div className="absolute top-6 right-6 flex items-center gap-3 rounded-full bg-black/60 px-4 py-2 border border-white/10 backdrop-blur-md z-30 pointer-events-none">
        <span className="text-sm font-bold text-gray-300">Course Progress</span>
        <div className="h-2 w-24 overflow-hidden rounded-full bg-white/10">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${treeData.overall_progress}%` }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-primary to-blue-500 shadow-[0_0_10px_hsl(var(--primary))]"
          />
        </div>
        <span className="text-sm font-black text-white">{treeData.overall_progress}%</span>
      </div>
    </div>
  );
}