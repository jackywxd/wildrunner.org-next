import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
}

export default function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="flex flex-col items-start gap-4 md:flex-row md:justify-between md:gap-8">
      <div className="flex-1 space-y-4">
        {/* `leading-tight`, not the `leading-3` this had: a 12px line box
            under 36px type is invisible on one line and draws the second line
            over the first the moment a title wraps — which every long race
            name does on a phone. One step smaller there, too, so the title
            does not take the whole first screen. */}
        <h1 className="inline-block text-3xl font-extrabold leading-tight tracking-tight text-foreground md:text-4xl lg:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="text-xl text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}
