import { DesignBanner } from "@/components/design/DesignBanner";
import { MediaLibraryDemo } from "./MediaLibraryDemo";

export default function DesignMediaPage() {
  return (
    <div>
      <DesignBanner title="媒體庫（點擊「上傳媒體」看上傳中狀態）" />
      <div className="mt-6 space-y-6">
        <h1 className="font-heading text-2xl font-semibold">媒體庫</h1>
        <MediaLibraryDemo />
      </div>
    </div>
  );
}
