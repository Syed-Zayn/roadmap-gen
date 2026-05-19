"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Loader2, Mail, Lock, BrainCircuit, ArrowRight, Fingerprint } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useAppStore } from "../../../lib/store";

// Strict frontend validation schema matching the FastAPI backend rules
const loginSchema = z.object({
  username: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }).optional().or(z.literal("")),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAppStore((state) => state.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const emailValue = watch("username");

  const handleAuthSuccess = (token: string, role: string) => {
    setAuth(token, role);
    let targetPath = "/dashboard";
    if (role === "Teacher") targetPath = "/teacher/dashboard";
    if (role === "SuperAdmin") targetPath = "/admin/dashboard";
    window.location.assign(targetPath);
  };

  const onSubmit = async (data: LoginFormValues) => {
    if (!data.password) {
      setServerError("Password is required for standard login.");
      return;
    }
    setServerError(null);
    try {
      const formData = new FormData();
      formData.append("username", data.username);
      formData.append("password", data.password);

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1"}/auth/login`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      const { access_token, role } = response.data;
      if (access_token && role) {
        handleAuthSuccess(access_token, role);
      }
    } catch (error: unknown) {
      handleAuthError(error);
    }
  };

  const handleBiometricLogin = async () => {
    if (!emailValue || !emailValue.includes("@")) {
      setServerError("Please enter a valid email address first to use FaceID/Passkey.");
      return;
    }
    
    setIsBiometricLoading(true);
    setServerError(null);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1";

    try {
      const optionsResp = await axios.post(`${baseUrl}/auth/webauthn/login/options?email=${encodeURIComponent(emailValue)}`);
      const options = optionsResp.data;

      let asseResp;
      try {
        asseResp = await startAuthentication(options);
      } catch (err: any) {
        throw new Error("Biometric scan cancelled or failed hardware check.");
      }

      const verifyResp = await axios.post(`${baseUrl}/auth/webauthn/login/verify?email=${encodeURIComponent(emailValue)}`, asseResp);
      
      const { access_token, role } = verifyResp.data;
      if (access_token && role) {
        handleAuthSuccess(access_token, role);
      }
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        setServerError("No biometrics registered for this email.");
      } else if (error instanceof Error) {
        setServerError(error.message);
      } else {
        handleAuthError(error);
      }
    } finally {
      setIsBiometricLoading(false);
    }
  };

  const handleAuthError = (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        setServerError("Invalid credentials. Please try again.");
      } else if (error.response?.status === 404) {
        setServerError("User not found.");
      } else if (error.response?.status === 429) {
        setServerError("Too many login attempts. Please wait a minute.");
      } else {
        setServerError("System error. Our servers might be unreachable right now.");
      }
    } else {
      setServerError("An unexpected error occurred.");
    }
  };

  if (!mounted) return null;

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#050505] px-4 selection:bg-primary/30">
      
      {/* =========================================
          ADVANCED BACKGROUND ANIMATIONS
          ========================================= */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Subtle Tech Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f1a_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f1a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_20%,transparent_100%)]" />
        
        {/* Floating Aurora Orbs */}
        <motion.div
          animate={{ x: [0, 60, -60, 0], y: [0, -80, 40, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-10%] left-[10%] h-[500px] w-[500px] rounded-full bg-primary/20 blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, -70, 50, 0], y: [0, 90, -30, 0], scale: [1, 1.3, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          className="absolute bottom-[-10%] right-[10%] h-[600px] w-[600px] rounded-full bg-blue-600/15 blur-[150px]"
        />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] backdrop-blur-2xl relative">
          
          {/* Inner ambient glow for the form container */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

          <div className="relative mb-10 text-center flex flex-col items-center">
            <motion.div 
              initial={{ rotate: -180, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.2 }}
              className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-blue-500/20 border border-white/10 shadow-[0_0_30px_rgba(100,50,255,0.3)]"
            >
              <BrainCircuit className="h-8 w-8 text-primary drop-shadow-[0_0_10px_rgba(100,50,255,0.8)]" />
            </motion.div>
            <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-md">Welcome Back</h1>
            <p className="mt-2 text-sm text-gray-400 font-medium">
              Sign in to resume your adaptive learning journey.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 relative">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="space-y-2">
              <label className="text-sm font-semibold text-gray-300 ml-1">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-500 group-focus-within:text-primary transition-colors">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  {...register("username")}
                  type="email"
                  placeholder="student@university.edu"
                  className={`block w-full rounded-xl border bg-black/40 p-3.5 pl-12 text-sm text-white placeholder-gray-600 outline-none transition-all focus:bg-black/60 focus:border-primary focus:ring-4 focus:ring-primary/10 ${
                    errors.username ? "border-red-500" : "border-white/10 hover:border-white/20"
                  }`}
                />
              </div>
              {errors.username && <p className="text-xs font-medium text-red-400 mt-1 ml-1">{errors.username.message}</p>}
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-sm font-semibold text-gray-300">Password</label>
                <a href="#" className="text-xs font-medium text-primary hover:text-primary/80 transition-all hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-500 group-focus-within:text-primary transition-colors">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  {...register("password")}
                  type="password"
                  placeholder="••••••••"
                  className={`block w-full rounded-xl border bg-black/40 p-3.5 pl-12 text-sm text-white placeholder-gray-600 outline-none transition-all focus:bg-black/60 focus:border-primary focus:ring-4 focus:ring-primary/10 ${
                    errors.password ? "border-red-500" : "border-white/10 hover:border-white/20"
                  }`}
                />
              </div>
              {errors.password && <p className="text-xs font-medium text-red-400 mt-1 ml-1">{errors.password.message}</p>}
            </motion.div>

            <AnimatePresence>
              {serverError && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: "auto" }} 
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl bg-red-500/10 p-4 border border-red-500/20 mt-4">
                    <p className="text-sm font-medium text-red-400 text-center">{serverError}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <button
                type="submit"
                disabled={isSubmitting || isBiometricLoading}
                className="group relative w-full flex justify-center items-center rounded-xl bg-gradient-to-r from-primary to-blue-600 py-3.5 px-4 text-sm font-bold text-white shadow-[0_0_20px_rgba(100,50,255,0.3)] hover:shadow-[0_0_30px_rgba(100,50,255,0.5)] hover:from-primary/90 hover:to-blue-600/90 focus:outline-none focus:ring-4 focus:ring-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Authenticating...</>
                ) : (
                  <>Sign In <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" /></>
                )}
              </button>
            </motion.div>
          </form>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#0f0f13] px-3 text-gray-500 rounded-full border border-white/5">OR</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={isSubmitting || isBiometricLoading}
              className="w-full flex justify-center items-center rounded-xl bg-white/5 border border-white/10 py-3.5 px-4 text-sm font-bold text-white hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {isBiometricLoading ? (
                <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Waiting for device...</>
              ) : (
                <><Fingerprint className="mr-2 h-5 w-5 text-primary drop-shadow-[0_0_8px_rgba(100,50,255,0.8)]" /> Sign in with FaceID / Passkey</>
              )}
            </button>
            
            <div className="mt-8 text-center text-sm text-gray-400">
              Don&apos;t have an account?{" "}
              <a href="/register" className="font-semibold text-white hover:text-primary transition-all hover:underline">
                Create one now
              </a>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}