import React from "react";
import { cn } from "@/lib/cn";

interface MainContainerProps {
  children?: React.ReactNode;
  className?: string;
}

const MainContainer: React.FC<MainContainerProps> = ({
  children,
  className,
}) => {
  return <main className={cn("main-container", className)}>{children}</main>;
};

export default MainContainer;
