"use client";

import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, Loader2, Info } from "lucide-react";

interface GlassmorphismModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isDestructive?: boolean;
}

export default function GlassmorphismModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isLoading = false,
  isDestructive = false
}: GlassmorphismModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
          onClick={!isLoading ? onCancel : undefined} // Prevent closing while processing API
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-card/90 backdrop-blur-xl border border-border shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDestructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  {isDestructive ? <AlertTriangle className="h-5 w-5" /> : <Info className="h-5 w-5" />}
                </div>
                <h3 className="text-lg font-bold text-foreground">{title}</h3>
              </div>
              <button 
                onClick={onCancel}
                disabled={isLoading}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-muted-foreground leading-relaxed">
                {message}
              </p>
            </div>

            {/* Footer / Actions */}
            <div className="px-6 py-4 border-t border-border/50 bg-muted/10 flex justify-end gap-3">
              <button
                onClick={onCancel}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl text-sm font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className={`flex items-center justify-center min-w-[100px] px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
                  isDestructive 
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_0_15px_rgba(239,68,68,0.3)]' 
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_15px_rgba(100,50,255,0.3)]'
                }`}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}