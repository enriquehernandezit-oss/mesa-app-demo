import type { ShareCardReq } from '@/lib/shareCardStore'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'

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
  // No cover → nothing to wait for; signal ready on mount so the host captures.
  useEffect(() => {
    if (!cover) onReady()
  }, [cover, onReady])

  return (
    <View style={{ width: W, height: H, backgroundColor: INK }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: coverH }}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            onLoad={onReady}
            onError={onReady}
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
        <Text style={{ fontFamily: SERIF_SB, fontSize: 150, color: BRASS }}>#{req.position}</Text>
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
        <Text style={{ fontFamily: SERIF_M, fontSize: 84, color: BRASS_2, marginTop: 24 }}>
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

function ListBody({
  req,
  coverH,
}: {
  req: Extract<ShareCardReq, { kind: 'list' }>
  coverH: number
}) {
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
      {req.items.slice(0, 5).map((item, i) => (
        <View
          key={`${item.position}-${item.name}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 22,
            borderBottomWidth: i < Math.min(req.items.length, 5) - 1 ? 2 : 0,
            borderBottomColor: 'rgba(235,228,214,0.12)',
          }}
        >
          <Text style={{ fontFamily: SERIF_SB, fontSize: 76, color: BRASS, width: 110 }}>
            {item.position}
          </Text>
          <Text
            style={{ fontFamily: SERIF_M, fontSize: 60, color: CREAM, flex: 1 }}
            numberOfLines={1}
          >
            {item.name}
          </Text>
          <Text style={{ fontFamily: SERIF_M, fontSize: 56, color: BRASS_2 }}>
            {(item.score / 10).toFixed(1)}
          </Text>
        </View>
      ))}
    </View>
  )
}
