import { getPublicEnv } from "@/lib/env";

export const PRODUCT_IMAGE_BUCKET = "product-images";

export function resolvePublicStorageUrl(path: string | null | undefined, bucket = PRODUCT_IMAGE_BUCKET) {
  if (!path) {
    return null;
  }

  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/")) {
    return path;
  }

  const { supabaseUrl } = getPublicEnv();
  const normalizedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${normalizedPath}`;
}

export function isManagedStoragePath(path: string | null | undefined, bucket = PRODUCT_IMAGE_BUCKET) {
  if (!path) {
    return false;
  }

  if (path.startsWith("/") || path.startsWith("http://") || path.startsWith("https://")) {
    return false;
  }

  return bucket.length > 0;
}
