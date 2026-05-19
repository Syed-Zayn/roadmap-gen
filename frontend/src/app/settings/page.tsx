"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import axios from "axios";
import { 
  ShieldCheck, 
  Fingerprint, 
  Loader2, 
  User as UserIcon, 
  Mail, 
  ArrowLeft,
  Key
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { useAppStore } from "../../lib/store";
import api from "../../lib/api"; // Using our configured axios instance

// Note: To make this page robust without extra backend user-fetching endpoints just for display,
// we will securely parse the JWT to display the user's role and rely on the active session.
// In a full production app, you might fetch /users/me here.
function parseJwt(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (e) {
    return null;
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const { accessToken, role, _hasHydrated } = useAppStore();

  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!accessToken) {
      router.push("/login");
    }
  }, [accessToken, _hasHydrated, router]);

  if (!_hasHydrated || !accessToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const tokenData = parseJwt(accessToken);
  const userId = tokenData?.sub || "Unknown User";

  const handleBiometricSetup = async () => {
    setIsBiometricLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // 1. Fetch WebAuthn registration options securely via our pre-configured Axios instance
      const optResp = await api.post("/auth/webauthn/register/options");
      const options = optResp.data;

      // 2. Prompt native browser UI (FaceID, TouchID, Windows Hello)
      let attResp;
      try {
        attResp = await startRegistration(options);
      } catch (err) {
        throw new Error("Hardware enrollment cancelled or failed.");
      }

      // 3. Verify the hardware assertion against the backend
      await api.post("/auth/webauthn/register/verify", attResp);

      setSuccessMessage("FaceID / Passkey registered successfully! You can now use it to log in.");
    } catch (error: any) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        setErrorMessage("Session expired. Please log in again.");
      } else {
        setErrorMessage(error.message || "Failed to register Passkey. Please try again.");
      }
    } finally {
      setIsBiometricLoading(false);
    }
  };

  const navigateBack = () => {
    if (role === "SuperAdmin") router.push("/admin/dashboard");
    else if (role === "Teacher") router.push("/teacher/dashboard");
    else router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background pb-12">
      {/* Enterprise Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-xl px-4 md:px-8 py-4 flex items-center gap-4">
        <button 
          onClick={navigateBack}
          className="p-2 hover:bg-muted rounded-full transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground leading-tight">Account Settings</h1>
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Security & Preferences</p>
        </div>
      </header>

      <motion.div 
        initial={{ opacity: 0, y: 10 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="container mx-auto px-4 py-10 max-w-3xl"
      >
        
        {/* Profile Card */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-6 flex items-center gap-6">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
            <UserIcon className="h-10 w-10 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-1">Your Profile</h2>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Key className="h-4 w-4" /> ID: {userId.substring(0, 8)}...</span>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground font-medium border border-border">
                {role}
              </span>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-border">
            <ShieldCheck className="h-6 w-6 text-foreground" />
            <h3 className="text-xl font-bold text-foreground">Security Settings</h3>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-4 rounded-xl border border-border bg-muted/30">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-green-500 mt-1">
                <Fingerprint className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-foreground">Passwordless Authentication</h4>
                <p className="text-sm text-muted-foreground mt-1 max-w-md leading-relaxed">
                  Register your device to log in instantly using FaceID, TouchID, or Windows Hello. 
                  No need to type passwords anymore.
                </p>
              </div>
            </div>
            
            <div className="w-full md:w-auto flex-shrink-0">
              <button
                onClick={handleBiometricSetup}
                disabled={isBiometricLoading}
                className="w-full md:w-auto flex justify-center items-center rounded-lg bg-foreground text-background py-2.5 px-6 text-sm font-semibold hover:bg-foreground/90 focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:opacity-50 transition-all active:scale-95"
              >
                {isBiometricLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Registering...</>
                ) : (
                  "Add New Device"
                )}
              </button>
            </div>
          </div>

          {/* Feedback Messages */}
          <AnimatePresence>
            {successMessage && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: "auto" }} 
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 rounded-lg bg-green-500/10 p-4 border border-green-500/20"
              >
                <p className="text-sm font-medium text-green-500 text-center">{successMessage}</p>
              </motion.div>
            )}
            
            {errorMessage && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: "auto" }} 
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 rounded-lg bg-destructive/10 p-4 border border-destructive/20"
              >
                <p className="text-sm font-medium text-destructive text-center">{errorMessage}</p>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </motion.div>
    </div>
  );
}