"use client";

import { motion } from "framer-motion";

interface NarratorCardProps {
  message: string;
  delay?: number;
}

export function NarratorCard({ message, delay = 0 }: NarratorCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut", delay }}
      className="relative z-10 flex justify-center"
    >
      <div className="max-w-md rounded-full bg-background/70 px-4 py-2.5 text-center shadow-[0_12px_30px_-22px_rgba(15,23,42,0.45)] backdrop-blur-md">
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/85">
          Narasi
        </div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {message}
        </div>
      </div>
    </motion.div>
  );
}
