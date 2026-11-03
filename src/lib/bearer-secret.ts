/** Constant-time compare for the scheduled workflows' bearer token (DIGEST_SECRET). */
function sameToken(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

/** Whether an `Authorization: Bearer …` header carries `secret`. */
export function bearerMatches(header: string | null, secret: string): boolean {
  return sameToken((header ?? "").replace(/^Bearer\s+/iu, ""), secret);
}
