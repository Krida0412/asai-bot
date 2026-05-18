"use client";

import { motion, AnimatePresence } from "framer-motion";

interface TypingIndicatorProps {
  isVisible?: boolean;
  label?: string;
}

const smoothEase = [0.22, 1, 0.36, 1] as const;

export function TypingIndicator({
  isVisible = false,
  label = "Tim sedang bekerja...",
}: TypingIndicatorProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ duration: 0.35, ease: smoothEase }}
          className="flex items-center justify-center py-3"
        >
          <div className="flex items-center gap-2.5 rounded-full border border-border/40 bg-background/80 px-4 py-2 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.3)] backdrop-blur-xl">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="size-1.5 rounded-full bg-primary/60"
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.4, 1, 0.4],
                  }}
                  transition={{
                    duration: 1.2,
                    repeat: Number.POSITIVE_INFINITY,
                    delay: i * 0.2,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">{label}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
