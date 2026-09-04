"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const FAKE_MEDIA = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  alt: `賽事照片 ${i + 1}`,
  kind: i % 5 === 0 ? "video" : "image",
}));

/**
 * Client component so the "uploading" state (Phase E's real requirement)
 * can actually be demonstrated by clicking a button, not just described.
 * The progress bar is driven by a fake timer — Phase E wires the same
 * shape to src/lib/direct-upload.ts's real onProgress callback.
 */
export function MediaLibraryDemo() {
  const [uploading, setUploading] = useState(false);
  const [percent, setPercent] = useState(0);

  function simulateUpload() {
    setUploading(true);
    setPercent(0);
    const id = setInterval(() => {
      setPercent((p) => {
        if (p >= 100) {
          clearInterval(id);
          setTimeout(() => setUploading(false), 600);
          return 100;
        }
        return p + 14;
      });
    }, 220);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-heading">2.4 <span className="text-sm text-foreground/50">/ 10 GB</span></div>
        </div>
        <Button
          data-testid="demo-upload-button"
          onClick={simulateUpload}
          disabled={uploading}
          className="justify-center"
        >
          {uploading ? "上傳中…" : "上傳媒體"}
        </Button>
      </div>

      {uploading && (
        <div
          data-testid="demo-upload-progress"
          className="border border-border p-4"
        >
          <div className="flex items-center justify-between text-sm">
            <span>荒野越野賽.mp4</span>
            <span>{Math.min(percent, 100)}%</span>
          </div>
          <div className="mt-2 h-1.5 bg-secondary">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 fhd:grid-cols-4">
        {FAKE_MEDIA.map((item) => (
          <div key={item.id} className="group relative border border-border">
            <div className="flex aspect-video items-center justify-center bg-secondary text-xs text-foreground/40">
              {item.kind === "video" ? "▶ 影片" : "圖片"}
            </div>
            <div className="flex items-center justify-between p-2 text-xs">
              <span className="truncate">{item.alt}</span>
              <button className="text-foreground/40 hover:text-destructive" aria-label="刪除">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
