"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";

/**
 * These used to apply magnetic / 3D-tilt motion to anything they wrapped. That
 * "everything reacts to the cursor" feel reads as a template demo, so they are
 * now quiet pass-throughs — the API is kept so call sites don't change, but no
 * gimmick motion is applied. HoverScale stays as a small, ordinary button press.
 */

interface WrapProps {
  children: ReactNode;
  className?: string;
  // Accepted for API compatibility, intentionally unused.
  strength?: number;
  tiltAmount?: number;
  asChild?: boolean;
}

export function MagneticButton({ children, className = "" }: WrapProps) {
  return <div className={`inline-block ${className}`.trim()}>{children}</div>;
}

export function HoverTilt({ children, className = "" }: WrapProps) {
  return <div className={className}>{children}</div>;
}

// A small, ordinary hover/press — the kind of micro-interaction real apps use.
interface HoverScaleProps {
  children: ReactNode;
  className?: string;
  scale?: number;
}

export function HoverScale({ children, className = "", scale = 1.02 }: HoverScaleProps) {
  return (
    <motion.div
      className={className}
      whileHover={{ scale }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      {children}
    </motion.div>
  );
}
