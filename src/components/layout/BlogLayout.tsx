import React from "react";
import MainContainer from "@/components/layout/MainContainer";
import { cn } from "@/lib/cn";

interface BlogLayoutProps {
  children?: React.ReactNode;
  className?: string;
  leftNavbar?: React.ReactNode;
  rightNavbar?: React.ReactNode;
}

const BlogLayout: React.FC<BlogLayoutProps> = ({
  children,
  className,
  leftNavbar,
  rightNavbar,
}) => {
  return (
    <div className="flex flex-col inset-0">
      <div className="flex flex-row flex-1 p-0 m-0 justify-center">
        <MainContainer className={cn("main-container", className)}>
          {children}
        </MainContainer>
      </div>
    </div>
  );
};

export default BlogLayout;
