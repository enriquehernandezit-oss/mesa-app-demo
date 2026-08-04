import type { ReactNode } from 'react'
import { Body, Eyebrow, SerifItalic, Title } from '../../components/ui'
import './tabs.css'

// M2 ships the shell and navigation. These three tabs get real content in later
// milestones (Discover + restaurant profiles in M4, the full Rankings screen in
// M3, nightlife Tonight in Phase 2). Until then they're honest, in-brand empty
// states rather than fake data.
function TabPage({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <div className="tab-header">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Title>{title}</Title>
      </div>
      {children}
    </div>
  )
}

export function DiscoverTab() {
  return (
    <TabPage eyebrow="Discover" title="Where your friends eat">
      <div className="tab-empty">
        <SerifItalic style={{ fontSize: '1.25rem' }}>The feed is warming up.</SerifItalic>
        <Body>Your friends' rankings and vibe notes will land here.</Body>
      </div>
    </TabPage>
  )
}

export function RankingsTab() {
  return (
    <TabPage eyebrow="Your list" title="Rankings">
      <div className="tab-empty">
        <SerifItalic style={{ fontSize: '1.25rem' }}>You've started your list.</SerifItalic>
        <Body>The full ranked passport — rank numerals, scores, want-to-try — opens next.</Body>
      </div>
    </TabPage>
  )
}

export function TonightTab() {
  return (
    <TabPage eyebrow="Tonight" title="After 9">
      <div className="tab-empty">
        <SerifItalic style={{ fontSize: '1.25rem' }}>Not open yet.</SerifItalic>
        <Body>Live nightlife energy arrives in a later chapter.</Body>
      </div>
    </TabPage>
  )
}
