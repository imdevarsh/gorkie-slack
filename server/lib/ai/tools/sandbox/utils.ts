export function toBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}
