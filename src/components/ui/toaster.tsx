"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-center"
      offset={{ bottom: 88 }}
      mobileOffset={{ bottom: 88 }}
      toastOptions={{
        classNames: {
          toast: "!rounded-2xl !border !border-line !bg-surface !text-ink !shadow-pop !font-sans",
          description: "!text-ink-2",
          actionButton: "!bg-primary !text-primary-ink !rounded-lg",
        },
      }}
    />
  );
}
