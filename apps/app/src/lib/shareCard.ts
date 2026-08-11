// The viral loop: render a branded 1080×1920 story card (IG Stories size) on a
// canvas — film-photo background, serif numerals, the wordmark — and hand it to
// the native share sheet. Falls back to a download in browsers without file
// share. This is the artifact that leaves the app.

const W = 1080
const H = 1920

// FROZEN as Candlelit (oxblood) brand — one of the four non-CSS color sites in
// docs/DESIGN.md ("Where color is allowed to live"). This card leaves the app
// and is viewed inside someone else's feed, so it stays the same regardless of
// the sharer's theme. Canvas cannot resolve var(); do NOT wire it to the tokens.
const INK = '#210104'
const CREAM = '#ebe4d6'
const CREAM_DIM = '#dcccbb'
const BRASS = '#c09050'
const BRASS_2 = '#e2c179'

export interface ShareListItem {
  position: number
  name: string
  score: number
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

async function ensureFonts(): Promise<void> {
  // The card leans on the serif; make sure it's loaded before drawing.
  await Promise.all([
    document.fonts.load('600 90px "Cormorant Garamond"'),
    document.fonts.load('500 64px "Cormorant Garamond"'),
    document.fonts.load('italic 400 44px "Cormorant Garamond"'),
    document.fonts.load('600 34px "Plus Jakarta Sans Variable"'),
  ]).catch(() => {})
}

function drawCoverWithScrim(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  coverH: number,
) {
  if (img) {
    // cover-fit crop into W × coverH
    const scale = Math.max(W / img.width, coverH / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, (W - dw) / 2, (coverH - dh) / 2, dw, dh)
  } else {
    ctx.fillStyle = '#2c1516'
    ctx.fillRect(0, 0, W, coverH)
  }
  const scrim = ctx.createLinearGradient(0, 0, 0, coverH)
  scrim.addColorStop(0, 'rgba(33,1,4,0.35)')
  scrim.addColorStop(0.55, 'rgba(33,1,4,0.15)')
  scrim.addColorStop(1, INK)
  ctx.fillStyle = scrim
  ctx.fillRect(0, 0, W, coverH)
}

function drawChrome(ctx: CanvasRenderingContext2D) {
  // wordmark, top center
  ctx.fillStyle = CREAM
  ctx.font = '500 110px "Cormorant Garamond", Georgia, serif'
  ctx.textAlign = 'center'
  ctx.fillText('mesa', W / 2, 190)
  // footer
  ctx.font = 'italic 400 40px "Cormorant Garamond", Georgia, serif'
  ctx.fillStyle = CREAM_DIM
  ctx.fillText('where your friends actually eat', W / 2, H - 90)
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let t = text
  while (t.length > 2 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1)
  return `${t}…`
}

/** "My Top N · Neighborhood" — the ranked-list story card. */
export async function renderListCard(opts: {
  eyebrow: string // e.g. "ENRIQUE'S TOP 5"
  subtitle: string // e.g. "PIANTINI · SANTO DOMINGO"
  items: ShareListItem[]
  coverUrl?: string | null
}): Promise<Blob> {
  await ensureFonts()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unsupported')

  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)
  const cover = opts.coverUrl ? await loadImage(opts.coverUrl) : null
  drawCoverWithScrim(ctx, cover, 780)
  drawChrome(ctx)

  // eyebrow + subtitle
  ctx.textAlign = 'center'
  ctx.fillStyle = BRASS
  ctx.font = '600 34px "Plus Jakarta Sans Variable", sans-serif'
  ctx.fillText(opts.eyebrow.toUpperCase().split('').join(' '), W / 2, 880)
  ctx.fillStyle = CREAM_DIM
  ctx.font = '600 26px "Plus Jakarta Sans Variable", sans-serif'
  ctx.fillText(opts.subtitle.toUpperCase(), W / 2, 930)

  // the list
  const top = 1040
  const rowH = 148
  const items = opts.items.slice(0, 5)
  items.forEach((item, i) => {
    const y = top + i * rowH
    ctx.textAlign = 'left'
    ctx.fillStyle = BRASS
    ctx.font = '600 90px "Cormorant Garamond", Georgia, serif'
    ctx.fillText(String(item.position), 90, y)
    ctx.fillStyle = CREAM
    ctx.font = '500 64px "Cormorant Garamond", Georgia, serif'
    ctx.fillText(truncate(ctx, item.name, 690), 210, y)
    ctx.textAlign = 'right'
    ctx.fillStyle = BRASS_2
    ctx.font = '500 60px "Cormorant Garamond", Georgia, serif'
    ctx.fillText((item.score / 10).toFixed(1), W - 90, y)
    // hairline
    if (i < items.length - 1) {
      ctx.fillStyle = 'rgba(235,228,214,0.12)'
      ctx.fillRect(90, y + 40, W - 180, 2)
    }
  })

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('render failed'))), 'image/jpeg', 0.92)
  })
}

/** A single-spot story card: "#1 · Name · 96" over its photo. */
export async function renderSpotCard(opts: {
  name: string
  meta: string // "SPANISH · PIANTINI"
  position?: number | null
  score?: number | null
  note?: string | null
  coverUrl?: string | null
}): Promise<Blob> {
  await ensureFonts()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unsupported')

  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)
  const cover = opts.coverUrl ? await loadImage(opts.coverUrl) : null
  drawCoverWithScrim(ctx, cover, 1150)
  drawChrome(ctx)

  ctx.textAlign = 'center'
  if (opts.position) {
    ctx.fillStyle = BRASS
    ctx.font = '600 150px "Cormorant Garamond", Georgia, serif'
    ctx.fillText(`#${opts.position}`, W / 2, 1310)
  }
  ctx.fillStyle = CREAM
  ctx.font = '500 96px "Cormorant Garamond", Georgia, serif'
  ctx.fillText(truncate(ctx, opts.name, 920), W / 2, opts.position ? 1440 : 1340)
  ctx.fillStyle = BRASS
  ctx.font = '600 30px "Plus Jakarta Sans Variable", sans-serif'
  ctx.fillText(opts.meta.toUpperCase(), W / 2, opts.position ? 1505 : 1410)
  if (opts.score != null) {
    ctx.fillStyle = BRASS_2
    ctx.font = '500 84px "Cormorant Garamond", Georgia, serif'
    ctx.fillText((opts.score / 10).toFixed(1), W / 2, opts.position ? 1630 : 1540)
  }
  if (opts.note) {
    ctx.fillStyle = CREAM_DIM
    ctx.font = 'italic 400 44px "Cormorant Garamond", Georgia, serif'
    ctx.fillText(truncate(ctx, `“${opts.note}”`, 920), W / 2, 1720)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('render failed'))), 'image/jpeg', 0.92)
  })
}

/** Hand the card to the native share sheet; download when file-share is absent. */
export async function shareCard(blob: Blob, filename: string, text: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/jpeg' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
