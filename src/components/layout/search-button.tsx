"use client";

import { Search } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { useIsApplePlatform } from "@/components/layout/use-media-query";
import { Button } from "@/components/ui/button";

function announceComingSoon() {
  toast.info("Quick search is coming soon", {
    id: "search-coming-soon",
    description:
      "You'll be able to jump to any group, faculty, room or request from here.",
  });
}

/** ⌘K / Ctrl+K entry point. The command palette lands in a later build; for now it says so. */
export function SearchButton() {
  const isApple = useIsApplePlatform();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        announceComingSoon();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      onClick={announceComingSoon}
      aria-keyshortcuts="Meta+K Control+K"
      className="text-muted-foreground size-10 px-0 md:w-56 md:justify-start md:gap-2 md:px-3 lg:w-64"
    >
      <Search aria-hidden="true" />
      <span className="sr-only md:not-sr-only md:flex-1 md:text-left md:font-normal">
        Search…
      </span>
      <kbd
        aria-hidden="true"
        className="bg-muted text-muted-foreground pointer-events-none hidden h-5 items-center rounded border px-1.5 font-sans text-[11px] font-medium md:inline-flex"
      >
        {isApple ? "⌘K" : "Ctrl K"}
      </kbd>
    </Button>
  );
}
