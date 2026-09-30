// Splits a dictionary template like "{name} cheered your ranking of {place}" into its
// literal text and its {tokens}, so a screen can render the tokens as bold names or
// links while the sentence's word order stays in the dictionary — Spanish and English
// order these differently, which prefix/suffix keys glued around a component can't do.
// (lib/i18n.ts's t() fills the {vars} it is given and leaves the rest intact, so what
// reaches here still carries only the tokens the caller wants to render.)
export type TemplatePart = { text: string } | { token: string }

export function splitTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = []
  let last = 0
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const at = match.index ?? 0
    if (at > last) parts.push({ text: template.slice(last, at) })
    parts.push({ token: match[1] ?? '' })
    last = at + match[0].length
  }
  if (last < template.length) parts.push({ text: template.slice(last) })
  return parts
}
