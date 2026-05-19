"use client";

import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform, Variants } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  Terminal,
  TrendingUp,
  ShieldCheck,
  Sparkles
} from "lucide-react";

// =======================================================================
// Enterprise UI Component: Physics-Based Magnetic Button
// =======================================================================
const MagneticButton = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouse = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e;
    const { height, width, left, top } = ref.current!.getBoundingClientRect();
    const middleX = clientX - (left + width / 2);
    const middleY = clientY - (top + height / 2);
    setPosition({ x: middleX * 0.15, y: middleY * 0.15 });
  };

  const reset = () => setPosition({ x: 0, y: 0 });

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.1 }}
      className={`relative inline-block ${className}`}
    >
      {children}
    </motion.div>
  );
};

// =======================================================================
// Enterprise UI Component: 3D Tilt Card with Hover Glow
// =======================================================================
const TiltCard = ({ children, className }: { children: React.ReactNode, className?: string }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["15deg", "-15deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-15deg", "15deg"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateY, rotateX, transformStyle: "preserve-3d" }}
      className={`relative rounded-3xl bg-black/40 backdrop-blur-xl border border-white/10 p-8 shadow-2xl transition-all duration-300 hover:bg-white/5 hover:border-white/20 hover:shadow-[0_0_40px_rgba(168,85,247,0.3)] ${className}`}
    >
      <div style={{ transform: "translateZ(50px)" }} className="relative z-10 pointer-events-none">
        {children}
      </div>
    </motion.div>
  );
};

// =======================================================================
// Main Landing Page (Dark Theme + Crazy Animations)
// =======================================================================
export default function Home() {
  const [mounted, setMounted] = useState(false);

  // Hydration sync to prevent SSR animation bugs
  useEffect(() => {
    setMounted(true);
  }, []);

  // Strictly Typed Variants to avoid Next.js Build Errors
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.2 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 40, scale: 0.8 },
    show: { 
      opacity: 1, 
      y: 0, 
      scale: 1, 
      transition: { type: "spring", stiffness: 120, damping: 20 } 
    },
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col min-h-screen bg-[#050505] overflow-hidden relative selection:bg-purple-500/30">
      
      {/* =========================================
          BACKGROUND ANIMATIONS (Floating Orbs)
          ========================================= */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <motion.div
          animate={{ x: [0, 50, -50, 0], y: [0, -100, 50, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 blur-[120px] rounded-full"
        />
        <motion.div
          animate={{ x: [0, -100, 50, 0], y: [0, 100, -50, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600/20 blur-[150px] rounded-full"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[40%] left-[40%] w-[400px] h-[400px] bg-emerald-600/10 blur-[100px] rounded-full"
        />
      </div>

      {/* =========================================
          HERO SECTION (High Impact Entry)
          ========================================= */}
      <section className="relative flex flex-col items-center justify-center min-h-[90vh] px-4 text-center z-10">
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-5xl mx-auto relative z-10"
        >
          {/* Animated Glowing Badge */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5, type: "spring" }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-purple-300 text-sm font-bold mb-10 shadow-[0_0_30px_rgba(168,85,247,0.3)] backdrop-blur-md"
          >
            <Sparkles className="h-4 w-4 animate-pulse text-purple-400" /> Next-Gen Adaptive Learning
          </motion.div>
          
          {/* Main Glowing Title */}
          <h1 className="text-6xl md:text-8xl font-black text-white tracking-tight leading-[1.1] mb-6 drop-shadow-[0_0_25px_rgba(255,255,255,0.2)]">
            <motion.span 
              initial={{ opacity: 0, x: -30 }} 
              animate={{ opacity: 1, x: 0 }} 
              transition={{ delay: 0.4, duration: 0.8 }}
              className="block"
            >
              Personalized
            </motion.span>
            <motion.span 
              initial={{ opacity: 0, x: 30 }} 
              animate={{ opacity: 1, x: 0 }} 
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-blue-400 to-emerald-400 animate-shimmer bg-[length:200%_auto] drop-shadow-[0_0_20px_rgba(168,85,247,0.5)] block pb-2"
            >
              Curriculum Engine
            </motion.span>
          </h1>
          
          {/* High Contrast Subtitle */}
          <motion.p 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.8, duration: 1 }}
            className="text-lg md:text-2xl text-gray-300 max-w-3xl mx-auto mb-14 leading-relaxed font-medium drop-shadow-md"
          >
            Break free from the &quot;one-size-fits-all&quot; approach. Our AI-driven platform analyzes your skills, adapts to your schedule, and generates a week-by-week learning roadmap tailored exclusively for you.
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-6"
          >
            {/* Call To Action 1 */}
            <Link href="/register" passHref>
              <MagneticButton>
                <button className="group w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-black px-10 py-4 rounded-full font-bold text-lg hover:bg-gray-200 transition-all shadow-[0_0_40px_rgba(255,255,255,0.4)] hover:shadow-[0_0_60px_rgba(255,255,255,0.6)] active:scale-95">
                  Start Learning Now 
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </button>
              </MagneticButton>
            </Link>
            
            {/* Call To Action 2 */}
            <Link href="/login" passHref>
              <MagneticButton>
                <button className="group w-full sm:w-auto flex items-center justify-center gap-2 bg-black/50 text-white border border-white/20 px-10 py-4 rounded-full font-bold text-lg hover:bg-white/10 hover:border-white/40 backdrop-blur-md transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                  Sign In to Dashboard
                </button>
              </MagneticButton>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* =========================================
          CORE FEATURES SECTION (Animated Grid)
          ========================================= */}
      <section className="py-32 px-4 z-10 relative">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="text-center mb-20"
          >
            <h2 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight drop-shadow-lg">
              Enterprise-Grade Engine
            </h2>
            <p className="text-gray-300 text-lg md:text-xl max-w-2xl mx-auto font-medium">
              Built with cutting-edge technologies to provide a secure, scalable, and highly intelligent educational experience.
            </p>
          </motion.div>

          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 perspective-[1000px]"
          >
            {/* Feature 1 */}
            <motion.div variants={itemVariants} className="h-full">
              <TiltCard className="h-full">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="h-16 w-16 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-6 border border-purple-500/40 shadow-[0_0_30px_rgba(168,85,247,0.4)]">
                  <BrainCircuit className="h-8 w-8 text-purple-300 drop-shadow-[0_0_10px_rgba(168,85,247,1)]" />
                </motion.div>
                <h3 className="text-2xl font-bold text-white mb-4 drop-shadow-md">AI Roadmaps</h3>
                <p className="text-gray-400 text-base leading-relaxed">
                  Large Language Models dynamically generate weekly study plans and curate multimedia resources strictly based on your pace.
                </p>
              </TiltCard>
            </motion.div>

            {/* Feature 2 */}
            <motion.div variants={itemVariants} className="h-full">
              <TiltCard className="h-full">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} className="h-16 w-16 bg-blue-500/20 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/40 shadow-[0_0_30px_rgba(59,130,246,0.4)]">
                  <Terminal className="h-8 w-8 text-blue-300 drop-shadow-[0_0_10px_rgba(59,130,246,1)]" />
                </motion.div>
                <h3 className="text-2xl font-bold text-white mb-4 drop-shadow-md">Sandboxed Code</h3>
                <p className="text-gray-400 text-base leading-relaxed">
                  Write code in your browser. We execute it securely within isolated Docker containers for real-time auto-grading and output.
                </p>
              </TiltCard>
            </motion.div>

            {/* Feature 3 */}
            <motion.div variants={itemVariants} className="h-full">
              <TiltCard className="h-full">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="h-16 w-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6 border border-emerald-500/40 shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                  <ShieldCheck className="h-8 w-8 text-emerald-300 drop-shadow-[0_0_10px_rgba(16,185,129,1)]" />
                </motion.div>
                <h3 className="text-2xl font-bold text-white mb-4 drop-shadow-md">Adaptive Remediation</h3>
                <p className="text-gray-400 text-base leading-relaxed">
                  Fail a task? The system instantly triggers a remediation loop, inserting targeted micro-lessons to strengthen weak points.
                </p>
              </TiltCard>
            </motion.div>

            {/* Feature 4 */}
            <motion.div variants={itemVariants} className="h-full">
              <TiltCard className="h-full">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.5 }} className="h-16 w-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6 border border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.4)]">
                  <TrendingUp className="h-8 w-8 text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,1)]" />
                </motion.div>
                <h3 className="text-2xl font-bold text-white mb-4 drop-shadow-md">Instructor Analytics</h3>
                <p className="text-gray-400 text-base leading-relaxed">
                  A dedicated dashboard for teachers to monitor class performance and instantly identify at-risk students falling behind.
                </p>
              </TiltCard>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* =========================================
          FOOTER
          ========================================= */}
      <footer className="mt-auto border-t border-white/10 bg-black/40 py-8 z-10 backdrop-blur-xl relative">
        <div className="absolute inset-0 bg-gradient-to-t from-purple-900/10 to-transparent pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between relative z-10">
          <p className="text-gray-400 text-sm font-medium">
            © {new Date().getFullYear()} Personalized Curriculum Generator. All rights reserved.
          </p>
          <div className="flex gap-6 mt-4 md:mt-0 text-sm font-semibold text-gray-400">
            <span className="hover:text-white transition-colors cursor-pointer">Built with Next.js 15</span>
            <span className="hover:text-white transition-colors cursor-pointer">Powered by FastAPI & LangGraph</span>
          </div>
        </div>
      </footer>
    </div>
  );
}