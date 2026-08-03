import type { DocumentLogoImage } from "@/lib/platform-settings/types";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/supabase/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const DOCUMENT_LOGO_IMAGE_NAME = "ImLogo";

export async function loadDocumentLogoImage(
  logoPath: string | null | undefined,
  supabase: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): Promise<DocumentLogoImage | null> {
  if (!logoPath?.trim()) {
    return null;
  }

  const { data, error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).download(logoPath);
  if (error || !data) {
    return null;
  }

  const input = Buffer.from(await data.arrayBuffer());
  const sharp = (await import("sharp")).default;
  const metadata = await sharp(input, { animated: true }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (width < 1 || height < 1) {
    return null;
  }

  const jpegBytes = new Uint8Array(
    await sharp(input, { animated: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer(),
  );

  return {
    name: DOCUMENT_LOGO_IMAGE_NAME,
    width,
    height,
    jpegBytes,
  };
}

export function buildLogoImageDrawCommand(
  imageName: string,
  imageWidth: number,
  imageHeight: number,
  box: { centerX: number; centerY: number; maxSize: number },
) {
  const scale = Math.min(box.maxSize / imageWidth, box.maxSize / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const x = box.centerX - drawWidth / 2;
  const y = box.centerY - drawHeight / 2;

  return [
    "q",
    `${formatPdfNumber(drawWidth)} 0 0 ${formatPdfNumber(drawHeight)} ${formatPdfNumber(x)} ${formatPdfNumber(y)} cm`,
    `/${imageName} Do`,
    "Q",
  ].join("\n");
}

function formatPdfNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
