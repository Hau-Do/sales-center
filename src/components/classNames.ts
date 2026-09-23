/** Join class names, dropping falsy entries. Kept out of the .tsx files so
 *  react-refresh only ever sees component exports. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
