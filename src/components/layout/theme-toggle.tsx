"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

/**
 * Icon button that flips light/dark. Icons switch via CSS on the <html> theme
 * class (not the nearest `.dark`), so it also works inside forced-dark panels
 * and never mismatches on hydration.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className={className}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
    >
      <Sun className="[html.dark_&]:hidden" aria-hidden="true" />
      <Moon className="hidden [html.dark_&]:block" aria-hidden="true" />
    </Button>
  );
}
