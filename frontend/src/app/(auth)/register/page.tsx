"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios, { AxiosError } from "axios";
import { Loader2, Mail, Lock, GraduationCap, Briefcase, Fingerprint, ShieldCheck, ArrowRight } from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { useAppStore } from "../../../lib/store";

// Strict validation schema ensuring robust frontend data integrity
const registerSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(8, { message: "Password must be at least 8 characters long." }),
  confirmPassword: z.string(),
  role: z.enum(["Student", "Teacher"], { message: "Please select an account type." }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter(); 
  const setAuth = useAppStore((state) => state.setAuth);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Flow State Management
  const [step, setStep] = useState<1 | 2>(1);
  const [serverError, setServerError] = useState<string | null>(null);
  
  // Ephemeral state to hold auth details before final redirection
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: "Student",
    },
  });

  const selectedRole = watch("role");
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api/v1";

  const onSubmit = async (data: RegisterFormValues) => {
    setServerError(null);
    try {
      const payload = {
        email: data.email,
        password: data.password,
        role: data.role,
      };
      await axios.post(`${baseUrl}/auth/register`, payload);

      const formData = new FormData();
      formData.append("username", data.email);
      formData.append("password", data.password);
      
      const loginResp = await axios.post(`${baseUrl}/auth/login`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      const token = loginResp.data.access_token;
      const role = loginResp.data.role;

      if (token && role) {
        setAuth(token, role);
        setSessionToken(token);
        setSessionRole(role);
        setStep(2);
      } else {
        throw new Error("Failed to establish secure session.");
      }
    } catch (error) {
      const axiosError = error as AxiosError<{ detail?: string }>;
      if (axiosError.response?.status === 400) {
        setServerError(axiosError.response.data.detail || "This email is already registered.");
      } else {
        setServerError("System error. Our servers might be unreachable right now.");
      }
    }
  };

  const handleBiometricSetup = async () => {
    if (!sessionToken) return;
    setIsBiometricLoading(true);
    setServerError(null);

    try {
      const optResp = await axios.post(`${baseUrl}/auth/webauthn/register/options`, {}, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });
      const options = optResp.data;

      let attResp;
      try {
        attResp = await startRegistration(options);
      } catch (err) {
        throw new Error("Hardware enrollment cancelled or failed.");
      }

      await axios.post(`${baseUrl}/auth/webauthn/register/verify`, attResp, {
        headers: { Authorization: `Bearer ${sessionToken}` }
      });

      proceedToDashboard(sessionRole);
    } catch (error: any) {
      setServerError(error.message || "Failed to register Passkey. You can set this up later.");
      setIsBiometricLoading(false);
    }
  };

  const proceedToDashboard = (roleType: string | null) => {
    let targetPath = "/dashboard";
    if (roleType === "Teacher") targetPath = "/teacher/dashboard";
    if (roleType === "SuperAdmin") targetPath = "/admin/dashboard";
    window.location.assign(targetPath);
  };

  if (!mounted) return null;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#050505] px-4 py-12 relative overflow-hidden selection:bg-emerald-500/30">
      
      {/* =========================================
          ADVANCED BACKGROUND ANIMATIONS
          ========================================= */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* Subtle Tech Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f1a_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f1a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_20%,transparent_100%)]" />
        
        {/* Floating Aurora Orbs (Signup tailored colors) */}
        <motion.div
          animate={{ x: [0, -60, 60, 0], y: [0, 80, -40, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[10%] right-[10%] h-[500px] w-[500px] rounded-full bg-emerald-600/15 blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, 70, -50, 0], y: [0, -90, 30, 0], scale: [1, 1.3, 1] }}
          transition={{ duration: 19, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="absolute bottom-[-10%] left-[10%] h-[600px] w-[600px] rounded-full bg-blue-600/15 blur-[150px]"
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: Account Creation Form */}
          {step === 1 && (
            <motion.div 
              key="step-1"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] backdrop-blur-2xl relative"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

              <div className="relative mb-8 text-center">
                <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-md">Create Account</h1>
                <p className="mt-2 text-sm text-gray-400 font-medium">
                  Join the platform to experience adaptive AI learning.
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 relative">
                
                {/* Role Selection */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="space-y-3">
                  <label className="text-sm font-medium text-gray-300">I am a...</label>
                  <div className="grid grid-cols-2 gap-4">
                    <label 
                      className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border p-4 transition-all duration-300 ${
                        selectedRole === "Student" 
                        ? "border-emerald-500 bg-emerald-500/10 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)]" 
                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10"
                      }`}
                    >
                      <input type="radio" value="Student" {...register("role")} className="sr-only" />
                      <GraduationCap className={`mb-2 h-6 w-6 transition-colors ${selectedRole === "Student" ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "text-gray-500"}`} />
                      <span className="text-sm font-bold">Student</span>
                    </label>

                    <label 
                      className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border p-4 transition-all duration-300 ${
                        selectedRole === "Teacher" 
                        ? "border-blue-500 bg-blue-500/10 text-white shadow-[0_0_20px_rgba(59,130,246,0.2)]" 
                        : "border-white/10 bg-white/5 text-gray-400 hover:bg-white/10"
                      }`}
                    >
                      <input type="radio" value="Teacher" {...register("role")} className="sr-only" />
                      <Briefcase className={`mb-2 h-6 w-6 transition-colors ${selectedRole === "Teacher" ? "text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]" : "text-gray-500"}`} />
                      <span className="text-sm font-bold">Teacher</span>
                    </label>
                  </div>
                  {errors.role && <p className="text-xs text-red-400">{errors.role.message as string}</p>}
                </motion.div>

                {/* Email Field */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="space-y-2">
                  <label className="text-sm font-semibold text-gray-300 ml-1">Email Address</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-500 group-focus-within:text-emerald-400 transition-colors">
                      <Mail className="h-5 w-5" />
                    </div>
                    <input
                      {...register("email")}
                      type="email"
                      placeholder="user@university.edu"
                      className={`block w-full rounded-xl border bg-black/40 p-3.5 pl-12 text-sm text-white placeholder-gray-600 outline-none transition-all focus:bg-black/60 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 ${
                        errors.email ? "border-red-500" : "border-white/10 hover:border-white/20"
                      }`}
                    />
                  </div>
                  {errors.email && <p className="text-xs font-medium text-red-400 mt-1 ml-1">{errors.email.message}</p>}
                </motion.div>

                {/* Password Field */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="space-y-2">
                  <label className="text-sm font-semibold text-gray-300 ml-1">Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-500 group-focus-within:text-emerald-400 transition-colors">
                      <Lock className="h-5 w-5" />
                    </div>
                    <input
                      {...register("password")}
                      type="password"
                      placeholder="••••••••"
                      className={`block w-full rounded-xl border bg-black/40 p-3.5 pl-12 text-sm text-white placeholder-gray-600 outline-none transition-all focus:bg-black/60 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 ${
                        errors.password ? "border-red-500" : "border-white/10 hover:border-white/20"
                      }`}
                    />
                  </div>
                  {errors.password && <p className="text-xs font-medium text-red-400 mt-1 ml-1">{errors.password.message}</p>}
                </motion.div>

                {/* Confirm Password Field */}
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="space-y-2">
                  <label className="text-sm font-semibold text-gray-300 ml-1">Confirm Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-gray-500 group-focus-within:text-emerald-400 transition-colors">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <input
                      {...register("confirmPassword")}
                      type="password"
                      placeholder="••••••••"
                      className={`block w-full rounded-xl border bg-black/40 p-3.5 pl-12 text-sm text-white placeholder-gray-600 outline-none transition-all focus:bg-black/60 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 ${
                        errors.confirmPassword ? "border-red-500" : "border-white/10 hover:border-white/20"
                      }`}
                    />
                  </div>
                  {errors.confirmPassword && <p className="text-xs font-medium text-red-400 mt-1 ml-1">{errors.confirmPassword.message}</p>}
                </motion.div>

                {/* Error Display */}
                <AnimatePresence>
                  {serverError && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                      <div className="rounded-xl bg-red-500/10 p-3 border border-red-500/20 mt-2">
                        <p className="text-sm font-medium text-red-400 text-center">{serverError}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group relative w-full flex justify-center items-center rounded-xl bg-gradient-to-r from-emerald-500 to-blue-600 py-3.5 px-4 text-sm font-bold text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] hover:from-emerald-500/90 hover:to-blue-600/90 focus:outline-none focus:ring-4 focus:ring-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Creating Account...</>
                    ) : (
                      <>Create Account <ArrowRight className="ml-2 h-4 w-4 opacity-70 group-hover:translate-x-1 transition-transform" /></>
                    )}
                  </button>
                </motion.div>
              </form>
              
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-6 text-center text-sm text-gray-400 relative z-10">
                Already have an account?{" "}
                <a href="/login" className="font-semibold text-white hover:text-emerald-400 transition-all hover:underline">
                  Sign In here
                </a>
              </motion.p>
            </motion.div>
          )}

          {/* STEP 2: Biometric Onboarding Prompt */}
          {step === 2 && (
            <motion.div 
              key="step-2"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] backdrop-blur-2xl text-center flex flex-col items-center relative"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

              <motion.div 
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}
                className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/30 shadow-[0_0_50px_rgba(16,185,129,0.3)]"
              >
                <div className="absolute inset-0 rounded-full border border-emerald-400/50 animate-ping opacity-20" />
                <Fingerprint className="h-12 w-12 text-green-400 drop-shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
              </motion.div>
              
              <h2 className="text-2xl font-black text-white mb-3 drop-shadow-md relative">Secure Your Account</h2>
              <p className="text-sm text-gray-400 leading-relaxed mb-8 px-2 relative">
                Enable FaceID, TouchID, or a Passkey now. It allows you to log in instantly without remembering your password.
              </p>

              <AnimatePresence>
                {serverError && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="w-full mb-6 overflow-hidden">
                    <div className="rounded-xl bg-red-500/10 p-3 border border-red-500/20">
                      <p className="text-sm font-medium text-red-400 text-center">{serverError}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="w-full space-y-4 relative">
                <button
                  onClick={handleBiometricSetup}
                  disabled={isBiometricLoading}
                  className="group relative w-full flex justify-center items-center rounded-xl bg-white text-black py-3.5 px-4 text-sm font-bold shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:bg-gray-200 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] focus:outline-none focus:ring-4 focus:ring-white/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                >
                  {isBiometricLoading ? (
                    <><Loader2 className="mr-2 h-5 w-5 animate-spin text-black" /> Waiting for device...</>
                  ) : (
                    "Enable FaceID / Passkey"
                  )}
                </button>

                <button
                  onClick={() => proceedToDashboard(sessionRole)}
                  disabled={isBiometricLoading}
                  className="w-full flex justify-center items-center rounded-xl bg-transparent py-3.5 px-4 text-sm font-semibold text-gray-500 hover:text-white hover:bg-white/5 transition-all"
                >
                  Skip for now
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}