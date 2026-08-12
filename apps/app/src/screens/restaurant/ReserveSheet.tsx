import { useState } from 'react'
import { Button, Caption, Chip, Eyebrow } from '../../components/ui'
import { useProfile } from '../../hooks/useProfile'
import { reserveMessage, telUrl, whatsappUrl } from '../../lib/reserve'
import './reserve.css'

// "Request a table" — the reserve HANDOFF. Collects party / day / time, then
// opens WhatsApp (or a call) to the restaurant with the request prefilled. The
// user still sends it in WhatsApp; Mesa never books anything.
const PARTIES = [2, 3, 4, 5, 6, 8]
const WHENS = ['hoy', 'mañana', 'este finde']

function toLabel(time: string): string {
  // "20:30" -> "8:30 PM"
  const [hs, ms] = time.split(':')
  const h = Number(hs)
  const m = Number(ms)
  if (Number.isNaN(h) || Number.isNaN(m)) return time
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export function ReserveSheet({
  restaurantName,
  phone,
  onClose,
}: {
  restaurantName: string
  phone: string
  onClose: () => void
}) {
  const { data } = useProfile(true)
  const [party, setParty] = useState(2)
  const [when, setWhen] = useState('hoy')
  const [time, setTime] = useState('20:30')

  const message = reserveMessage(restaurantName, {
    fromName: data?.profile.name ?? '',
    party,
    day: when,
    time: toLabel(time),
  })

  // Open in a new context so the app (webview) isn't navigated away from.
  const open = (url: string) => window.open(url, '_blank')

  return (
    <div className="reserve">
      <div className="reserve__head">
        <Eyebrow>Request a table</Eyebrow>
        <button type="button" className="link-action" onClick={onClose}>
          Close
        </button>
      </div>

      <Caption>Party</Caption>
      <div className="reserve__chips">
        {PARTIES.map((n) => (
          <Chip
            key={n}
            size="sm"
            state={party === n ? 'selected' : 'default'}
            onClick={() => setParty(n)}
          >
            {n === 8 ? '6+' : n}
          </Chip>
        ))}
      </div>

      <Caption>When</Caption>
      <div className="reserve__chips">
        {WHENS.map((w) => (
          <Chip
            key={w}
            size="sm"
            state={when === w ? 'selected' : 'default'}
            onClick={() => setWhen(w)}
          >
            {w}
          </Chip>
        ))}
        <input
          className="reserve-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="Time"
        />
      </div>

      <div className="reserve__actions">
        <Button onClick={() => open(whatsappUrl(phone, message))}>Open WhatsApp</Button>
        <Button variant="secondary" onClick={() => open(telUrl(phone))}>
          Call
        </Button>
      </div>
      <Caption style={{ textAlign: 'center' }}>
        Mesa opens the chat with your request filled in — you send it.
      </Caption>
    </div>
  )
}
