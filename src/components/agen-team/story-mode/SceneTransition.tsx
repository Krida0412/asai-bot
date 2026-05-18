"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface SceneTransitionProps {
  message: string;
}

export function SceneTransition({ message }: SceneTransitionProps) {
  return (
    <div className="flex min-h-[420px] flex-1 items-center justify-center px-6 py-12">
      <motion.div
        key={message}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -8 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="max-w-xl text-center"
      >
        <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border/70 bg-background/80 text-primary shadow-sm backdrop-blur">
          <Sparkles className="size-5" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Narasi
        </p>
        <h2 className="mt-3 text-balance text-xl font-semibold leading-relaxed text-foreground sm:text-2xl">
          {message}
        </h2>
        <div className="mx-auto mt-6 h-1 w-24 overflow-hidden rounded-full bg-muted">
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            className="h-full w-1/2 rounded-full bg-primary/70"
          />
        </div>
      </motion.div>
    </div>
  );
}
