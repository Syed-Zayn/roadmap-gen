"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/**
 * Enterprise Premium Scroll Progress Bar.
 * Tracks the user's vertical scroll position and maps it to a horizontal progress bar at the top of the viewport.
 * Encapsulated in a separate client component to ensure main layout rendering is unaffected by scroll events.
 */
export default function ScrollProgressBar() {
  // Extract the raw scroll progress (0 to 1) from Framer Motion
  const { scrollYProgress } = useScroll();

  // Apply smooth physics-based spring animation to the raw scroll value.
  // This prevents jittering when the user scrolls rapidly or uses a stepped scroll wheel.
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <motion.div
      // Fixed at the absolute top of the viewport with maximum z-index
      className="fixed top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary to-blue-500 origin-left z-[10000]"
      style={{ scaleX }}
    />
  );
}