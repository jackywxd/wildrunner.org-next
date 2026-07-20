"use client";

import { motion } from "framer-motion";
import React from "react";

export const MotionDiv: React.FC<{
  role?: string;
  keyName: string;
  className?: string;
  children?: React.ReactNode;
}> = ({
  role,
  keyName, // DO NOT USE "KEY" AS A PROPERTY NAME
  className,
  children,
}) => {
  return (
    <motion.div key={keyName} layoutId={keyName}>
      <div role={role} className={className}>
        {children}
      </div>
    </motion.div>
  );
};
