// Self-hosted fonts (no external CDN — works offline and inside the Capacitor
// webview, and keeps Meta/Google off the request path per our privacy posture).
// Cormorant Garamond is the display serif; we pull the weights the design uses
// plus the italic for editorial moments ("¿Qué tipo de foodie eres?").
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
// 700 is the family's heaviest real face — the wordmark asks for it (see
// components/ui/ui.css .mesa-wordmark). Without this the browser fakes bold
// off the 600 face (font-synthesis), which smears the serif's fine strokes.
import '@fontsource/cormorant-garamond/700.css'
import '@fontsource/cormorant-garamond/400-italic.css'
// Plus Jakarta Sans as a variable font — one file covers every UI weight.
import '@fontsource-variable/plus-jakarta-sans'
// JetBrains Mono (Phase 6) — carries all metadata, eyebrows, and pill labels.
// Weights 400 + 500 only, matching the design.
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
