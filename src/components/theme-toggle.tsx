"use client";

import { Moon, Sun, SunMoon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Theme = "system" | "light" | "dark";

function apply(theme: Theme) {
  const el = document.documentElement;
  if (theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    /* lagring er valgfritt */
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {
      /* ignorer */
    }
  }, []);

  const options: Array<{ value: Theme; label: string; icon: React.ReactNode }> = [
    { value: "system", label: "Automatisk", icon: <SunMoon className="size-4" /> },
    { value: "light", label: "Lys", icon: <Sun className="size-4" /> },
    { value: "dark", label: "Mørk", icon: <Moon className="size-4" /> },
  ];

  return (
    <div role="radiogroup" aria-label="Fargetema" className={cn("inline-flex rounded-ctl bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          onClick={() => {
            setTheme(o.value);
            apply(o.value);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-[13px] font-medium text-ink-2 transition-all",
            theme === o.value && "bg-surface text-ink shadow-sm",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
