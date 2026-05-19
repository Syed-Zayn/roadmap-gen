import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Importing the client-side provider to handle all premium animations
// without violating Next.js Server Component rules for the root layout.
import GlobalUIProvider from "../components/GlobalUIProvider";

// 1. Loading premium fonts optimized for web performance
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 2. Global SEO and Metadata configuration (Strictly Server-Side)
export const metadata: Metadata = {
  title: "Personalized Curriculum Generator | AI SaaS",
  description: "Enterprise-grade adaptive learning platform powered by LangGraph and FastAPI.",
};

// 3. The Root Layout
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground selection:bg-primary/30`}
      >
        {/* =======================================================================
            ENTERPRISE UI: Background Grid with Radial Mask (Aceternity Style)
            Provides a beautiful, subtle architectural grid for the entire application.
            ======================================================================= */}
        <div className="fixed inset-0 z-[-1] w-full h-full bg-black">
          {/* Subtle Grid Pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:34px_34px]" />
          
          {/* Radial mask to fade out the grid at the edges, keeping focus on the center */}
          <div className="absolute inset-0 bg-black [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,transparent_20%,black_100%)]" />
        </div>
        
        {/* Global UI Provider wraps the application in a Client Component.
          It seamlessly injects the Custom Cursor, Scroll Progress Bar, 
          and AnimatePresence page transitions across all routes.
        */}
        <GlobalUIProvider>
          <main className="relative flex flex-col min-h-screen">
            {children}
          </main>
        </GlobalUIProvider>
      </body>
    </html>
  );
}