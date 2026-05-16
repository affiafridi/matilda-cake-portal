"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Click-to-zoom image wrapper for the order detail page.
 * Renders `children` as the clickable preview; on click, opens a fullscreen
 * lightbox showing `src`. Closes via backdrop click, the × button, or Esc.
 */
export default function ImageThumb({
  src,
  alt,
  className,
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-label={`Preview ${alt}`}
      >
        {children}
      </button>
      {open && (
        <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-[85vh] w-full rounded-xl bg-surface object-contain shadow-2xl"
        />
        {alt && (
          <p className="mt-3 text-center text-sm font-medium text-white drop-shadow">
            {alt}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-surface/95 text-ink shadow-lg transition hover:bg-surface focus:outline-none focus:ring-2 focus:ring-focus/40"
          aria-label="Close preview"
        >
          ×
        </button>
      </div>
    </div>
  );
}
