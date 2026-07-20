import React from "react";
import { ProgressBarProvider } from "@/components/transition/react-transition-progress";
import { AppProvider } from "@/context/app-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <ProgressBarProvider>{children}</ProgressBarProvider>
    </AppProvider>
  );
}
