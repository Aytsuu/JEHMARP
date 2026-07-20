export const pdfPageWidth = 595;
export const pdfPageHeight = 842;

export function buildPdfDocument(contentStreams: string[]): Uint8Array {
  const fontObjectId = 3;
  const pageObjectIds = contentStreams.map((_, index) => 4 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${contentStreams.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...contentStreams.flatMap((content, index) => {
      const pageObjectId = pageObjectIds[index];
      const contentObjectId = pageObjectId + 1;
      const contentLength = new TextEncoder().encode(content).length;

      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfPageWidth} ${pdfPageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
        `<< /Length ${contentLength} >>\nstream\n${content}\nendstream`,
      ];
    }),
  ];

  return encodePdfObjects(objects);
}

function encodePdfObjects(objects: string[]) {
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(byteLength(chunks.join("")));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  offsets.slice(1).forEach((offset) => {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  });
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new TextEncoder().encode(chunks.join(""));
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}
