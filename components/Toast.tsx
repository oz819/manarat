"use client";

import { useI18n } from "@/components/LocaleProvider";
import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  return { toast, showToast };
}

export default function Toast({ text }: { text: string }) {
  const { tx } = useI18n();
  if (!text) return null;
  return <div className="toast" role="status">{tx(text)}</div>;
}
