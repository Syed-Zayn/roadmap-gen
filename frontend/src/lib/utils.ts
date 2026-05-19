import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merges Tailwind CSS classes intelligently.
 * Resolves conflicts if multiple overlapping classes are passed.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}