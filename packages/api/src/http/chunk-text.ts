/**
 * Split text into fixed-size chunks for the stream-echo demo.
 * @param text - Full string to stream
 * @param size - Max characters per chunk (default 3)
 * @returns Non-empty array of chunk strings (at least `[""]` when text is empty)
 */
export function chunkText(text: string, size = 3): string[] {
  if (!text) return [""];
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}
