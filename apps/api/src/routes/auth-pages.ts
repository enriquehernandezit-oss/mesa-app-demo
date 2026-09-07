import { Hono } from 'hono'
import { auth } from '../auth'
import type { AppEnv } from '../context'
import { esc, layout } from '../lib/publicPage'

// The two pages an auth email has to land on. They used to live in the Vite web
// app; that app is retired, so they live here — the one web surface that
// survived the native cutover. Without them, "olvidé mi contraseña" is a dead
// link, which App Store review WILL find (and which real members hit first).
//
// Mounted under /p, BEFORE the session middleware: whoever opens these is by
// definition signed out. Nothing here reads a cookie.
//
// No JavaScript runs on these pages — script-src is 'none' for /p/*, and it
// stays that way. The form posts back to this server and every state below is a
// server-rendered response. That is why the reset flow needs its own POST
// handler instead of calling Better Auth's JSON endpoint from the browser.

// Back into the native app. `mesa` is the scheme declared in app.json; iOS
// shows nothing if the app isn't installed, so it's an offer, never the only
// way out of the page.
const APP_SCHEME = 'mesa://'

function appFooter(label: string): string {
  return `<a class="cta" href="${APP_SCHEME}">${esc(label)}</a>
    <p class="tagline">where your friends actually eat</p>`
}

function page(opts: { canonical: string; title: string; body: string; footer?: string }): string {
  return layout({
    title: opts.title,
    description: 'Mesa — Santo Domingo.',
    image: null,
    canonical: opts.canonical,
    body: opts.body,
    footer: opts.footer,
  })
}

// A dead end that still tells the truth. Reset tokens are single-use and
// short-lived, so "expired" is the common case here, not an error state.
function tokenGone(canonical: string): string {
  return page({
    canonical,
    title: 'Enlace vencido — Mesa',
    body: `<div class="missing">
      <h1>Enlace vencido</h1>
      <p class="hint">Este enlace ya se usó o expiró. Pide uno nuevo desde la app: <em>¿Olvidaste tu contraseña?</em></p>
    </div>`,
    footer: appFooter('Abrir Mesa'),
  })
}

function formPage(canonical: string, token: string, error?: string): string {
  return page({
    canonical,
    title: 'Nueva contraseña — Mesa',
    body: `<h1>Nueva contraseña</h1>
      <p class="hint">Elige una contraseña de al menos 8 caracteres.</p>
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
      <form method="post" action="/p/reset-password">
        <input type="hidden" name="token" value="${esc(token)}" />
        <label for="p1">Nueva contraseña</label>
        <input id="p1" name="password" type="password" autocomplete="new-password" required minlength="8" />
        <label for="p2">Repetir contraseña</label>
        <input id="p2" name="confirm" type="password" autocomplete="new-password" required minlength="8" />
        <button type="submit">Guardar contraseña</button>
      </form>`,
    // No app link until it succeeds — the job on this page is the form.
    footer: '',
  })
}

export const authPagesRoutes = new Hono<AppEnv>()

  // Better Auth emails this link (auth.ts sendResetPassword) with the token in
  // the query string. Rendering the form is all this does; nothing is verified
  // until the POST, because checking a token by GET would burn it on every
  // link-preview crawler that fetches the URL.
  .get('/reset-password', (c) => {
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    const token = c.req.query('token')
    if (!token) return c.html(tokenGone(c.req.url), 400)
    return c.html(formPage(c.req.url, token))
  })

  .post('/reset-password', async (c) => {
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    const form = await c.req.parseBody()
    const token = typeof form.token === 'string' ? form.token : ''
    const password = typeof form.password === 'string' ? form.password : ''
    const confirm = typeof form.confirm === 'string' ? form.confirm : ''

    if (!token) return c.html(tokenGone(c.req.url), 400)
    // Checked here as well as by `minlength`/`required` so a client that ignores
    // the attributes still gets the same answer.
    if (password.length < 8) {
      return c.html(
        formPage(c.req.url, token, 'La contraseña debe tener al menos 8 caracteres.'),
        400,
      )
    }
    if (password !== confirm) {
      return c.html(formPage(c.req.url, token, 'Las contraseñas no coinciden.'), 400)
    }

    // Through Better Auth's own API, not the database: this is the path that
    // hashes correctly, consumes the token, revokes sessions and — because the
    // hooks in auth.ts run here too — writes the password_reset audit row.
    // Forwarding the headers keeps the IP and user-agent on that row real.
    try {
      await auth.api.resetPassword({
        body: { newPassword: password, token },
        headers: c.req.raw.headers,
      })
    } catch {
      // Better Auth throws for a spent, unknown or expired token. It's also the
      // breached-password rejection (the haveIBeenPwned plugin), which is worth
      // separating out — telling someone their token expired when the real
      // problem is their password choice sends them in a circle.
      return c.html(tokenGone(c.req.url), 400)
    }

    return c.html(
      page({
        canonical: c.req.url,
        title: 'Contraseña actualizada — Mesa',
        body: `<h1>Listo</h1>
          <p class="hint">Tu contraseña quedó actualizada. Vuelve a Mesa e inicia sesión.</p>`,
        footer: appFooter('Abrir Mesa'),
      }),
    )
  })

  // Where Better Auth redirects after it verifies the emailed token (auth.ts
  // `callbackURL`). The verification already happened upstream — this page only
  // reports it and points back at the app.
  .get('/verify-email', (c) => {
    c.header('Cache-Control', 'no-store')
    return c.html(
      page({
        canonical: c.req.url,
        title: 'Correo verificado — Mesa',
        body: `<h1>Correo verificado</h1>
          <p class="hint">Ya puedes volver a Mesa.</p>`,
        footer: appFooter('Abrir Mesa'),
      }),
    )
  })
