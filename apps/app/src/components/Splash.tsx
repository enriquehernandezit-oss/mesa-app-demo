import { Wordmark } from './ui'

// Shown while auth/profile state resolves. Just the wordmark on the oxblood
// ground — the same first thing a quiz-taker sees, so there's no seam.
export function Splash() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--ink)',
      }}
    >
      <Wordmark size={56} style={{ opacity: 0.9 }} />
    </div>
  )
}
