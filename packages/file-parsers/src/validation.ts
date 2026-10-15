/** Reject mislabeled binaries and oversized Office archives before decompression. */
export function validateParserBuffer(buffer: Buffer, extension: string) {
  if (
    extension === "pdf" &&
    buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
  )
    throw new Error("The file is not a valid PDF");
  if (!["docx", "xlsx", "pptx", "odt", "ods", "odp"].includes(extension))
    return;
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50)
    throw new Error("The file is not a valid Office archive");
  let end = -1;
  for (
    let offset = buffer.length - 22;
    offset >= Math.max(0, buffer.length - 65557);
    offset--
  ) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new Error("Office archive directory is missing");
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (entries > 10000 || entries === 0)
    throw new Error("Office archive has too many or no entries");
  let expanded = 0;
  for (let index = 0; index < entries; index++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw new Error("Office archive directory is invalid");
    if (buffer.readUInt16LE(offset + 8) & 1)
      throw new Error(
        "Password-protected Office files must be unlocked before upload",
      );
    const compressed = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    expanded += size;
    if (
      size > 64 * 1024 * 1024 ||
      expanded > 128 * 1024 * 1024 ||
      (size > 1024 * 1024 && size / Math.max(compressed, 1) > 200)
    )
      throw new Error(
        "Office archive expands beyond safe parsing limits; split the file",
      );
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}

export function decodeTextBuffer(buffer: Buffer): string {
  let content: string;
  if (buffer[0] === 0xff && buffer[1] === 0xfe)
    content = new TextDecoder("utf-16le", { fatal: true }).decode(buffer);
  else if (buffer[0] === 0xfe && buffer[1] === 0xff)
    content = new TextDecoder("utf-16be", { fatal: true }).decode(buffer);
  else content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  if (content.includes("\0"))
    throw new Error("This file contains binary data, not readable text");
  return content;
}
