// Self-hosted fonts (no external CDN — works offline and inside the Capacitor
// webview, and keeps Meta/Google off the request path per our privacy posture).
// Cormorant Garamond is the display serif; we pull the weights the design uses
// plus the italic for editorial moments ("¿Qué tipo de foodie eres?").
import '@fontsource/cormorant-garamond/400.css'
import '@fontsource/cormorant-garamond/500.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/400-italic.css'
// Plus Jakarta Sans as a variable font — one file covers every UI weight.
import '@fontsource-variable/plus-jakarta-sans'
