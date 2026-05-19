"use client";

import { usePathname } from "next/navigation";
import CustomCursor from "./CustomCursor";
import ScrollProgressBar from "./ScrollProgressBar";
import AIChatAgent from "./AIChatAgent";

export default function GlobalUIProvider({ children }: { children: React.ReactNode }) {
  usePathname();

  return (
    <>
      <ScrollProgressBar />
      <CustomCursor />
      <AIChatAgent />
      {children}
    </>
  );
}