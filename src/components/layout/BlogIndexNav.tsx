import React from "react";
import { Link } from "@/components/transition/react-transition-progress/next";
import { MotionDiv } from "@/components/transition/MotionDiv";
import { cn } from "@/lib/cn";

const BlogIndexNav: React.FC<{ path: string; className?: string }> = ({
  path,
  className,
}) => {
  return (
    <nav className={cn("flex flex-row gap-4", className)}>
      <div role="tablist" className="tabs tabs-bordered tabs-lg">
        <MotionDiv
          role="tab"
          className={cn("tab", path === "/posts" ? "tab-active text-h2" : "")}
          keyName={"blog-index-nav-posts"}
        >
          <Link href={`/posts`}>文章</Link>
        </MotionDiv>
        <MotionDiv
          role="tab"
          className={cn(
            "tab",
            path === "/categories" ? "tab-active text-h2" : ""
          )}
          keyName={"blog-index-nav-categories"}
        >
          <Link href={`/categories`}>分类</Link>
        </MotionDiv>
        <MotionDiv
          role="tab"
          className={cn("tab", path === "/columns" ? "tab-active text-h2" : "")}
          keyName={"blog-index-nav-columns"}
        >
          <Link href={`/columns`}>专栏</Link>
        </MotionDiv>
      </div>
    </nav>
  );
};

export default BlogIndexNav;
