import { Body, Eyebrow, Title, Wordmark } from '../../components/ui'
import '../../styles/screens.css'
import '../tabs/rankings.css'

// In-app legal pages. Apple requires the Privacy Policy and Terms to be reachable
// inside the app (App Store 5.1), so these exist and are linked from the auth
// screen and Profile. They render regardless of auth state (handled in App
// before the session gate) so a signed-out user can still read them.
//
// The copy below is a STARTER draft — the founder/counsel finalizes it before
// submission (and can point these at hosted URLs instead). An Apple-standard
// EULA is acceptable for the EULA (App Store 1.2).

type Doc = 'terms' | 'eula' | 'privacy'

const DOCS: Record<Doc, { title: string; body: string[] }> = {
  privacy: {
    title: 'Privacy Policy',
    body: [
      'Mesa is a social restaurant & nightlife discovery app for Santo Domingo. This policy explains what we collect and why.',
      'Account info: when you sign in with Instagram, Apple, or phone, we store the identifier that provider gives us plus the profile you set (name, handle, neighborhood).',
      'Contacts: if you choose to find friends from your contacts, we match phone numbers against Mesa users on our server and never store your contact list. This is opt-in and requested only at that moment.',
      'Content you create: your rankings and vibe notes are visible to people who follow you. You can edit or delete them anytime.',
      'Usage: basic app activity to keep the service working. We do not track you across other apps or sell your data.',
      'Deletion: you can delete your account from Profile → settings at any time; this erases your data.',
      'DRAFT — finalize with counsel before submission.',
    ],
  },
  terms: {
    title: 'Terms of Service',
    body: [
      'By using Mesa you agree to these terms.',
      'Be a good guest: no harassment, spam, or objectionable content. Vibe notes are user content and are subject to moderation — content can be reported, removed, and accounts can be blocked or ejected.',
      'Reserve requests are a handoff: Mesa opens WhatsApp or a call to the restaurant with your request. Mesa does not make or guarantee reservations.',
      'Mesa is provided as-is while we build. Features may change.',
      'DRAFT — finalize with counsel before submission.',
    ],
  },
  eula: {
    title: 'End User License Agreement',
    body: [
      'Mesa grants you a personal, non-transferable license to use the app.',
      'There is zero tolerance for objectionable content or abusive behavior. You agree not to post such content. We may remove content and terminate accounts that violate this agreement.',
      'Apple’s standard EULA also applies where required.',
      'DRAFT — an Apple-standard EULA is acceptable here (App Store 1.2).',
    ],
  },
}

export function LegalPage({ doc }: { doc: Doc }) {
  const { title, body } = DOCS[doc]
  return (
    <div className="screen" style={{ overflowY: 'auto' }}>
      <a href="/" className="link-action" style={{ marginBottom: 'var(--space-4)' }}>
        ← Back to Mesa
      </a>
      <Wordmark size={32} style={{ marginBottom: 'var(--space-4)' }} />
      <Eyebrow>Legal</Eyebrow>
      <Title style={{ marginBottom: 'var(--space-5)' }}>{title}</Title>
      <div className="stack stack--loose">
        {body.map((p) => (
          <Body key={p.slice(0, 24)}>{p}</Body>
        ))}
      </div>
    </div>
  )
}
