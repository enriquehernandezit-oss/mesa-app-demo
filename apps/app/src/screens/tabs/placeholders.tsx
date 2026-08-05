import { Body, Eyebrow, SerifItalic, Title } from '../../components/ui'
import './tabs.css'

// Tonight is the one tab still to come — live nightlife crowd-voting is Phase 2.
// Discover (M4), Rankings (M3), and Profile are all real now.
export function TonightTab() {
  return (
    <div>
      <div className="tab-header">
        <Eyebrow>Tonight</Eyebrow>
        <Title>After 9</Title>
      </div>
      <div className="tab-empty">
        <SerifItalic style={{ fontSize: '1.25rem' }}>Not open yet.</SerifItalic>
        <Body>Live nightlife energy arrives in a later chapter.</Body>
      </div>
    </div>
  )
}
