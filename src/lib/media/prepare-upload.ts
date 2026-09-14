import { extractDngPreview, looksLikeDng } from "@/lib/media/dng-preview";
import { downscaleImage } from "@/lib/media/downscale";

/**
 * Turn what a member picked into what will actually be stored — or refuse it.
 *
 * ONE SEAM FOR BOTH UPLOADERS. `uploadImageFile` (the editor, the avatar, the
 * cover picker) and `UploadPanel` (the library's batch uploader) are separate
 * implementations that happened to share one step: both called
 * `downscaleImage` first, for the same stated reason — everything downstream,
 * the duplicate fingerprint and the quota the member is billed, has to
 * describe the stored bytes rather than the picked ones. Anything else that
 * changes the bytes belongs at that same point, so this replaces it rather
 * than being added beside it.
 *
 * WHY REFUSING IS PART OF THE JOB AND NOT A SEPARATE GUARD. `Media.ts`
 * accepts `image/*`, which is every image format that exists, while the site
 * can display about six of them. A `.cr2` or a `.tif` therefore uploaded
 * perfectly happily today: it passed the mimeType check, `downscaleImage`
 * left it alone because it could not decode it, `processMediaImage` skipped
 * it, and the member ended up with a file that consumed their quota forever
 * and rendered as a broken image on every page it appeared on. Nothing in the
 * upload reported a problem, because from the upload's point of view there
 * was not one.
 *
 * The fix is here rather than at the server because this is the last moment
 * the file is still only on the member's own machine: refusing costs them
 * nothing, while refusing after the bytes have crossed the network costs them
 * the upload and still leaves the object in R2 to clean up.
 */

/** Formats a browser renders on its own. */
const DISPLAYABLE = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

/**
 * Formats that become displayable, and where that happens.
 *
 * HEIC/HEIF are converted after upload, by `processMediaImage.ts`, through
 * the Cloudflare Images binding. ProRAW is not in this set because it is not
 * converted at all: its embedded preview is lifted out below, before anything
 * is uploaded, and what reaches the rest of the pipeline is an ordinary JPEG.
 */
const CONVERTIBLE = new Set(["image/heic", "image/heif"]);

/**
 * Whether a refusal is warranted, given what the browser says this is.
 *
 * AN UNKNOWN TYPE IS ALLOWED THROUGH, deliberately. Browsers report an empty
 * string for files they do not recognise, and which files those are differs
 * between them and between versions — iOS Safari has reported HEIC as `""`.
 * Refusing on "I do not know" would therefore reject real photographs on
 * whichever browser happens to be least informative, to prevent a case this
 * function cannot actually identify. Only a type that positively names an
 * image format the site cannot show is refused.
 */
export function isUnsupportedImage(type: string): boolean {
  if (!type.startsWith("image/")) return false;
  return !DISPLAYABLE.has(type) && !CONVERTIBLE.has(type);
}

/**
 * The file to upload, after any conversion this can do in the browser.
 *
 * Throws — rather than returning the original — when the file cannot become
 * something the site can display. Both callers already surface a thrown
 * message to the member (`UploadPanel` puts it on the row, `uploadImageFile`
 * lets it reach the caller's catch), so the reason arrives where the member
 * is looking.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  let source = file;

  if (looksLikeDng(file)) {
    const preview = await extractDngPreview(file);
    if (!preview) {
      throw new Error(
        "這個 RAW 檔裡沒有可用的預覽圖，網站無法顯示它。請用「照片」App 匯出 JPEG 後再上傳。",
      );
    }
    source = preview;
  }

  if (isUnsupportedImage(source.type)) {
    throw new Error(
      `網站無法顯示 ${source.type} 這種格式的圖片。請改用 JPEG、PNG、HEIC 或 ProRAW。`,
    );
  }

  return downscaleImage(source);
}
