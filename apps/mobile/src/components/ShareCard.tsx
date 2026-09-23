import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useCallback, useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { ShareCardReq } from '@/lib/shareCardStore'
import { DATA_FIGURES } from '@/theme/vars'

// The 1080×1920 story card (IG Stories size) that leaves the app — the artifact
// of the viral loop. Rendered off-screen and captured to a PNG by ShareCardHost.
// Replaces the web canvas in apps/app/src/lib/shareCard.ts.
//
// FROZEN as the Candlelit (oxblood) brand — this is one of the four non-token
// color sites docs/DESIGN.md names ("Where color is allowed to live"): the card
// is viewed inside someone else's feed, so it stays the same regardless of the
// sharer's active theme. Raw hex here is intentional; do NOT wire it to tokens.
const W = 1080
const H = 1920
const INK = '#210104'
const CREAM = '#ebe4d6'
const CREAM_DIM = '#dcccbb'
const BRASS = '#c09050'
const BRASS_2 = '#e2c179'
const COVER_FALLBACK = '#2c1516'

const SERIF_M = 'CormorantGaramond_500Medium'
const SERIF_SB = 'CormorantGaramond_600SemiBold'
const SERIF_IT = 'CormorantGaramond_400Regular_Italic'
const SANS_SB = 'PlusJakartaSans_600SemiBold'

export function ShareCard({ req, onReady }: { req: ShareCardReq; onReady: () => void }) {
  const cover = req.coverUrl
  const coverH = req.kind === 'spot' ? 1150 : 780
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
    <View style={{ width: W, height: H, backgroundColor: INK }}>
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
        <LinearGradient
          colors={['rgba(33,1,4,0.35)', 'rgba(33,1,4,0.15)', INK]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Wordmark, top center. */}
      <Text
        style={{
          position: 'absolute',
          top: 70,
          width: W,
          textAlign: 'center',
          fontFamily: SERIF_M,
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
          fontFamily: SERIF_IT,
          fontSize: 40,
          color: CREAM_DIM,
        }}
      >
        donde tus amigos comen de verdad
      </Text>
    </View>
  )
}

function SpotBody({ req }: { req: Extract<ShareCardReq, { kind: 'spot' }> }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 1180,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingHorizontal: 80,
      }}
    >
      {req.position ? (
        <Text style={{ fontFamily: SERIF_SB, fontSize: 150, color: BRASS, ...DATA_FIGURES }}>
          #{req.position}
        </Text>
      ) : null}
      <Text
        style={{ fontFamily: SERIF_M, fontSize: 96, color: CREAM, textAlign: 'center' }}
        numberOfLines={1}
      >
        {req.name}
      </Text>
      <Text
        style={{ fontFamily: SANS_SB, fontSize: 30, color: BRASS, letterSpacing: 3, marginTop: 12 }}
      >
        {req.meta.toUpperCase()}
      </Text>
      {req.score != null ? (
        <Text
          style={{
            fontFamily: SERIF_M,
            fontSize: 84,
            color: BRASS_2,
            marginTop: 24,
            ...DATA_FIGURES,
          }}
        >
          {(req.score / 10).toFixed(1)}
        </Text>
      ) : null}
      {req.note ? (
        <Text
          style={{
            fontFamily: SERIF_IT,
            fontSize: 44,
            color: CREAM_DIM,
            textAlign: 'center',
            marginTop: 28,
          }}
          numberOfLines={2}
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
    <View
      style={{ position: 'absolute', top: coverH + 60, left: 0, right: 0, paddingHorizontal: 90 }}
    >
      <Text
        style={{
          fontFamily: SANS_SB,
          fontSize: 34,
          color: BRASS,
          letterSpacing: 8,
          textAlign: 'center',
        }}
      >
        {req.eyebrow.toUpperCase()}
      </Text>
      <Text
        style={{
          fontFamily: SANS_SB,
          fontSize: 26,
          color: CREAM_DIM,
          letterSpacing: 2,
          textAlign: 'center',
          marginTop: 10,
          marginBottom: 40,
        }}
      >
        {req.subtitle.toUpperCase()}
      </Text>
      {rows.map((row, i) => (
        <View
          key={row.key}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 22,
            borderBottomWidth: i < rows.length - 1 ? 2 : 0,
            borderBottomColor: 'rgba(235,228,214,0.12)',
          }}
        >
          {row.position != null && (
            <Text
              style={{
                fontFamily: SERIF_SB,
                fontSize: 76,
                color: BRASS,
                width: 110,
                ...DATA_FIGURES,
              }}
            >
              {row.position}
            </Text>
          )}
          <Text
            style={{
              fontFamily: row.position != null ? SERIF_M : SERIF_IT,
              fontSize: row.position != null ? 60 : 48,
              color: row.position != null ? CREAM : CREAM_DIM,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {row.name}
          </Text>
          {row.score != null && (
            <Text style={{ fontFamily: SERIF_M, fontSize: 56, color: BRASS_2, ...DATA_FIGURES }}>
              {(row.score / 10).toFixed(1)}
            </Text>
          )}
        </View>
      ))}
    </View>
  )
}
