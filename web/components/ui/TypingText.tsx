"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TypingTextProps {
  words: string[];
  className?: string;
  typeMs?: number;
  deleteMs?: number;
  holdMs?: number;
}

/**
 * Cycles a list of words with a type/delete effect.
 *
 * The longest word is rendered invisibly underneath to reserve its width, so
 * the line never reflows mid-animation — otherwise the headline jitters and CLS
 * takes a hit.
 */
export function TypingText({
  words,
  className,
  typeMs = 62,
  deleteMs = 32,
  holdMs = 1900,
}: TypingTextProps) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState(words[0] ?? "");
  const [deleting, setDeleting] = useState(false);

  const longest = words.reduce((a, b) => (b.length > a.length ? b : a), "");

  useEffect(() => {
    if (reduced || words.length < 2) return;
    const current = words[index % words.length] ?? "";

    if (!deleting && text === current) {
      const hold = window.setTimeout(() => setDeleting(true), holdMs);
      return () => window.clearTimeout(hold);
    }
    if (deleting && text === "") {
      setDeleting(false);
      setIndex((i) => (i + 1) % words.length);
      return;
    }

    const step = window.setTimeout(
      () => setText(deleting ? current.slice(0, text.length - 1) : current.slice(0, text.length + 1)),
      deleting ? deleteMs : typeMs,
    );
    return () => window.clearTimeout(step);
  }, [text, deleting, index, words, reduced, typeMs, deleteMs, holdMs]);

  return (
    <span className={cn("relative inline-grid", className)}>
      {/* Width reservation — invisible, but takes up the grid cell. */}
      <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre">
        {longest}
      </span>
      <span className="col-start-1 row-start-1 whitespace-pre text-left">
        <span className="text-gradient">{reduced ? words[0] : text}</span>
        {!reduced && (
          <span
            aria-hidden
            className="animate-caret ms-0.5 inline-block h-[0.85em] w-[3px] translate-y-[0.08em] rounded-full bg-accent-400 align-middle"
          />
        )}
      </span>
    </span>
  );
}
