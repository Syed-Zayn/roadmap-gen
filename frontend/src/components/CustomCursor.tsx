"use client";

import { useEffect, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function CustomCursor() {
  const [isHovering, setIsHovering] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Performance bypass: Tracking mouse direct on GPU to prevent lag
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);

  // Butter-smooth spring physics for the trailing ring
  const springConfig = { damping: 25, stiffness: 400, mass: 0.1 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  useEffect(() => {
    // Gracefully disable on touch devices
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    const updateMousePosition = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
      if (!isVisible) setIsVisible(true);
    };

    const handleMouseInteraction = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      const isInteractive = 
        target.tagName.toLowerCase() === "button" ||
        target.tagName.toLowerCase() === "a" ||
        target.tagName.toLowerCase() === "input" ||
        target.tagName.toLowerCase() === "select" ||
        target.closest("button") !== null ||
        target.closest("a") !== null;

      setIsHovering(isInteractive);
    };

    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    window.addEventListener("mousemove", updateMousePosition, { passive: true });
    window.addEventListener("mouseover", handleMouseInteraction, { passive: true });
    window.addEventListener("mousedown", handleMouseDown, { passive: true });
    window.addEventListener("mouseup", handleMouseUp, { passive: true });

    // Hide the default operating system cursor
    document.body.style.cursor = "none";

    return () => {
      window.removeEventListener("mousemove", updateMousePosition);
      window.removeEventListener("mouseover", handleMouseInteraction);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "auto";
    };
  }, [cursorX, cursorY, isVisible]);

  // Prevent rendering until the mouse actually moves on the screen
  if (!isVisible) return null;

  return (
    <>
      {/* 
        =========================================================
        THE SOLID DOT (Center Point)
        A tiny, sharp dot that tracks the mouse instantly. 
        It disappears when hovering over a button to keep things clean.
        =========================================================
      */}
      <motion.div
        className="pointer-events-none fixed top-0 left-0 z-[10000] hidden md:block rounded-full bg-primary"
        style={{
          x: cursorX,
          y: cursorY,
          translateX: "-50%",
          translateY: "-50%",
        }}
        animate={{
          width: isHovering ? 0 : 6,
          height: isHovering ? 0 : 6,
          opacity: isHovering ? 0 : 1,
        }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      />
      
      {/* 
        =========================================================
        THE HOLLOW RING (Trailing Effect)
        Strictly transparent background so text underneath is 100% visible.
        Expands into a crisp, bold outline when hovering.
        =========================================================
      */}
      <motion.div
        className="pointer-events-none fixed top-0 left-0 z-[9999] hidden md:flex items-center justify-center rounded-full"
        style={{
          x: cursorXSpring,
          y: cursorYSpring,
          translateX: "-50%",
          translateY: "-50%",
        }}
        animate={{
          width: isHovering ? 56 : 32,
          height: isHovering ? 56 : 32,
          scale: isClicking ? 0.85 : 1, // Satisfying click squeeze
          backgroundColor: "transparent", // Absolute transparency guarantees text visibility
          border: isHovering ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--primary) / 0.5)",
        }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      />
    </>
  );
}