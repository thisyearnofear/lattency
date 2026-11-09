// Client-side photo pipeline for contribution uploads: read the picked
// file, downscale to ≤800px on the long edge, re-encode as JPEG q80, and
// hand back a data URL. The canvas does the work; the caller gets one
// promise. Shared by the café contribution form and the single-photo
// micro-contribution sheet — both land photos as Base64 data URLs, so
// the payload stays well under the API's ~700KB cap.

export const PHOTO_MAX_DIM = 800;
export const PHOTO_JPEG_QUALITY = 0.8;

export function resizePhotoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("couldn't read that file"));
    reader.onload = (ev) => {
      const src = ev.target?.result;
      if (typeof src !== "string") {
        reject(new Error("couldn't read that file"));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(
          1,
          PHOTO_MAX_DIM / Math.max(img.width, img.height),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("photo processing isn't available"));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", PHOTO_JPEG_QUALITY));
      };
      img.onerror = () => reject(new Error("that file isn't an image"));
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
