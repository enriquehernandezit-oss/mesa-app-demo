// Reserve is a HANDOFF, not a booking engine (BUILD_PLAN M5). "Request a table"
// opens WhatsApp (or a call) to the restaurant with the details prefilled — the
// user still hits send in WhatsApp. DR restaurants have no reservation supply
// behind Mesa yet; that infrastructure is Phase 3.

export interface ReserveDetails {
  fromName: string
  party: number
  day: string // human label, e.g. "hoy" or a date
  time: string // e.g. "8:30 PM"
}

// Spanish message — the audience is Santo Domingo.
export function reserveMessage(restaurantName: string, d: ReserveDetails): string {
  const who = d.fromName ? `Soy ${d.fromName}. ` : ''
  return `Hola ${restaurantName}! ${who}Quisiera reservar una mesa para ${d.party} ${
    d.party === 1 ? 'persona' : 'personas'
  } el ${d.day} a las ${d.time}. ¿Tienen disponibilidad? (vía Mesa)`
}

export function whatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
