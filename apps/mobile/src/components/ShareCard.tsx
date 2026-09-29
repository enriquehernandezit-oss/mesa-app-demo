import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useCallback, useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { displayScore, scoreWordKey } from '@/lib/display'
import { useT } from '@/lib/i18n'
import type { ShareCardReq } from '@/lib/shareCardStore'
import { DATA_FIGURES } from '@/theme/vars'

// The 1080×1920 story card (IG Stories size) that leaves the app — the artifact
// of the viral loop. Rendered off-screen and captured to a PNG by ShareCardHost.
// Replaces the web canvas in apps/app/src/lib/shareCard.ts.
//
// FROZEN as Mesa's black + burgundy + cream — this is one of the non-token color
// sites docs/DESIGN.md names ("Where color is allowed to live"): the card is viewed
// inside someone else's feed, so it stays the same regardless of the sharer's active
// theme. Raw hex here is intentional; do NOT wire it to tokens. The public share pages
// (apps/api/src/lib/publicPage.ts) wear the same palette.
const W = 1080
const H = 1920
const BG = '#0b0809'
const CREAM = '#f4ede2'
const MUTED = 'rgba(244, 237, 226, 0.6)'
const LINE = 'rgba(244, 237, 226, 0.12)'
const BURGUNDY = '#7a1a29'
const COVER_FALLBACK = '#171213'
const VEIL = 'rgba(11, 8, 9, 0.5)'
const CLEAR = 'rgba(11, 8, 9, 0)'
const SIDE = 88

// The card uses the same two faces as the app: Instrument Serif (upright — it has
// no italic or bold, so quotes and totals are set in the one weight) and the system
// font for the small caps labels.
const SERIF = 'InstrumentSerif_400Regular'
const SANS_SB = { fontFamily: 'System', fontWeight: '600' } as const

export function ShareCard({ req, onReady }: { req: ShareCardReq; onReady: () => void }) {
  const cover = req.coverUrl
  const coverH = req.kind === 'spot' ? 1200 : 780
  // The cover's onLoad fires once the image is DECODED, not once it's actually
  // committed to the native view the capture reads from — a capture taken in
  // the same tick can miss it. Two rAFs (one for this frame's commit, one for
  // the next paint) is the cheapest way to wait past that without a fixed
  // delay; used on every onReady path, including the no-cover one below, so
  // capture timing is identical whether or not there's an image to wait for.
  const settleThenReady = useCallback(
    () => requestAnimationFrame(() => requestAnimationFrame(onReady)),
    [onReady],
  )
  // No cover → nothing to wait for; signal ready on mount so the host captures.
  useEffect(() => {
    if (!cover) settleThenReady()
  }, [cover, settleThenReady])

  return (
    <View style={{ width: W, height: H, backgroundColor: BG }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: coverH }}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onLoad={settleThenReady}
            onError={settleThenReady}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: COVER_FALLBACK }]} />
        )}
        {/* A veil under the wordmark, then the photo sinks into the black the text sits on. */}
        <LinearGradient
          colors={[VEIL, CLEAR, 'rgba(11, 8, 9, 0.55)', 'rgba(11, 8, 9, 0.93)', BG]}
          locations={[0, 0.16, 0.48, 0.7, 0.86]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* The logo, top center — the lowercase wordmark, never the app-icon M. */}
      <Text
        style={{
          position: 'absolute',
          top: 70,
          width: W,
          textAlign: 'center',
          fontFamily: SERIF,
          fontSize: 110,
          color: CREAM,
        }}
      >
        mesa
      </Text>

      {req.kind === 'spot' ? <SpotBody req={req} /> : <ListBody req={req} coverH={coverH} />}

      {/* Footer. */}
      <Text
        style={{
          position: 'absolute',
          bottom: 80,
          width: W,
          textAlign: 'center',
          fontFamily: SERIF,
          fontSize: 56,
          color: MUTED,
        }}
      >
        donde tus amigos comen de verdad
      </Text>
    </View>
  )
}

function SpotBody({ req }: { req: Extract<ShareCardReq, { kind: 'spot' }> }) {
  const t = useT()
  return (
    <View style={{ position: 'absolute', top: 820, left: SIDE, right: SIDE }}>
      {req.position ? (
        <Text
          style={{
            fontFamily: SERIF,
            fontSize: 200,
            lineHeight: 200,
            color: CREAM,
            ...DATA_FIGURES,
          }}
        >
          #{req.position}
        </Text>
      ) : null}
      <Text
        style={{ fontFamily: SERIF, fontSize: 124, lineHeight: 128, color: CREAM, marginTop: 12 }}
        numberOfLines={2}
      >
        {req.name}
      </Text>
      <Text
        style={{ ...SANS_SB, fontSize: 36, color: MUTED, letterSpacing: 5, marginTop: 22 }}
        numberOfLines={1}
      >
        {req.meta.toUpperCase()}
      </Text>
      {req.score != null ? (
        // The score is a NUMBER + a WORD: the figure in the serif, the word as a burgundy chip.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 28, marginTop: 40 }}>
          <Text
            style={{
              fontFamily: SERIF,
              fontSize: 160,
              lineHeight: 160,
              color: CREAM,
              ...DATA_FIGURES,
            }}
          >
            {displayScore(req.score)}
          </Text>
          <View
            style={{
              backgroundColor: BURGUNDY,
              borderRadius: 36,
              paddingHorizontal: 30,
              paddingVertical: 12,
            }}
          >
            <Text style={{ ...SANS_SB, fontSize: 46, color: CREAM }}>
              {t(scoreWordKey(req.score))}
            </Text>
          </View>
        </View>
      ) : null}
      {req.note ? (
        <Text
          style={{ fontFamily: SERIF, fontSize: 64, lineHeight: 76, color: CREAM, marginTop: 44 }}
          numberOfLines={3}
        >
          “{req.note}”
        </Text>
      ) : null}
    </View>
  )
}

// Exactly 5 row "slots" fit the vertical budget between the header text and
// the footer (proven by the original design, which hard-capped at 5) — this
// never grows that budget, it only decides what fills the last slot. Five
// items or fewer: every row is real, unchanged from before. More than five:
// the first 4 are real and the 5th becomes a "+N más" summary, so a
// long list still fits without shrinking type or guessing at new row math.
const MAX_REAL_ROWS = 5
const MAX_REAL_ROWS_WHEN_TRUNCATED = 4

type ListRow = { key: string; position: number | null; name: string; score?: number | null }

function ListBody({
  req,
  coverH,
}: {
  req: Extract<ShareCardReq, { kind: 'list' }>
  coverH: number
}) {
  const truncated = req.items.length > MAX_REAL_ROWS
  const shown = truncated
    ? req.items.slice(0, MAX_REAL_ROWS_WHEN_TRUNCATED)
    : req.items.slice(0, MAX_REAL_ROWS)
  const rows: ListRow[] = shown.map((item) => ({
    key: `${item.position}-${item.name}`,
    position: item.position,
    name: item.name,
    score: item.score,
  }))
  if (truncated) {
    rows.push({
      key: 'more',
      position: null,
      name: `+ ${req.items.length - MAX_REAL_ROWS_WHEN_TRUNCATED} más`,
    })
  }

  return (
    <View style={{ position: 'absolute', top: coverH + 40, left: SIDE, right: SIDE }}>
      <Text
        style={{ ...SANS_SB, fontSize: 34, color: MUTED, letterSpacing: 5, marginBottom: 24 }}
        numberOfLines={1}
      >
        {[req.eyebrow, req.subtitle].filter(Boolean).join(' · ').toUpperCase()}
      </Text>
      {rows.map((row, i) => (
        <View
          key={row.key}
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 24,
            paddingVertical: 24,
            borderBottomWidth: i < rows.length - 1 ? 2 : 0,
            borderBottomColor: LINE,
          }}
        >
          {row.position != null && (
            <Text
              style={{ fontFamily: SERIF, fontSize: 80, color: MUTED, width: 84, ...DATA_FIGURES }}
            >
              {row.position}
            </Text>
          )}
          <Text
            style={{
              fontFamily: SERIF,
              fontSize: row.position != null ? 78 : 56,
              color: row.position != null ? CREAM : MUTED,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {row.name}
          </Text>
          {row.score != null && (
            <Text style={{ fontFamily: SERIF, fontSize: 72, color: CREAM, ...DATA_FIGURES }}>
              {displayScore(row.score)}
            </Text>
          )}
        </View>
      ))}
    </View>
  )
}
