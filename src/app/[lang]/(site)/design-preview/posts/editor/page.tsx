import { DesignBanner } from "@/components/design/DesignBanner";
import { PostEditorDemo } from "./PostEditorDemo";

export default function DesignPostEditorPage() {
  return (
    <div>
      <DesignBanner title="文章編輯器（可互動：選取文字、輸入「/」、模擬貼上圖片）" />
      <div className="mt-6">
        <PostEditorDemo />
      </div>
    </div>
  );
}
