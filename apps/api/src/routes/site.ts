import { Hono } from 'hono'

import type { AppEnv } from '../context'
import { esc, layout, publicOrigin } from '../lib/publicPage'
import { SUPPORT_EMAIL } from '../lib/support'

// The public face of Mesa on its own domain: a home page (what Google's sign-in consent screen, App
// Store Connect and a curious person all link to) and a support page. Server-rendered, ZERO javascript,
// in the same frozen black + burgundy + cream shell as the share pages (lib/publicPage.ts). Mounted before
// the session middleware: no account is needed to read them.
//
// There is no App Store link yet (the listing does not exist), so the home page says so honestly rather
// than pointing at nothing.
const origin = () => publicOrigin()

export const siteRoutes = new Hono<AppEnv>()
  .get('/', (c) => {
    c.header('Cache-Control', 'public, max-age=300')
    return c.html(
      layout({
        title: 'Mesa — where your friends actually eat',
        description:
          'Rankea los lugares a los que vas y mira dónde rankean los suyos tus amigos. Santo Domingo.',
        image: null,
        canonical: `${origin()}/`,
        body: `
      <h1>Donde tus amigos<br />realmente comen</h1>
      <p class="copy">Mesa es una app de restaurantes y vida nocturna en Santo Domingo. Rankeas los sitios a los que vas, y ves dónde los rankean tus amigos. Sin estrellas: solo lo que de verdad piensa la gente que conoces.</p>
      <p class="copy">Ahora mismo estamos en beta cerrada. Pronto en el App Store.</p>`,
        footer: `
    <p class="fine"><a href="/support">Soporte</a> · <a href="/legal/privacy">Privacidad</a> · <a href="/legal/terms">Términos</a></p>`,
      }),
    )
  })

  .get('/support', (c) => {
    c.header('Cache-Control', 'public, max-age=300')
    const mail = esc(SUPPORT_EMAIL)
    return c.html(
      layout({
        title: 'Soporte — Mesa',
        description: 'Cómo contactar a Mesa, reportar contenido o borrar tu cuenta.',
        image: null,
        canonical: `${origin()}/support`,
        body: `
      <h1>Soporte</h1>
      <p class="copy">Escríbenos a <a href="mailto:${mail}">${mail}</a>. Mesa es un equipo pequeño: te contesta la misma gente que la construye, normalmente en un día.</p>
      <h2>Reportar contenido</h2>
      <p class="copy">Dentro de la app, toca «Reportar» en la nota, el plato, el comentario, el plan o el lugar. También puedes bloquear a cualquier miembro desde su perfil. Reviso los reportes y actúo dentro de 24 horas.</p>
      <h2>Borrar tu cuenta</h2>
      <p class="copy">Perfil → Ajustes → Tu cuenta → Eliminar cuenta. Borra tu cuenta, tus rankings, notas y fotos, y no se puede deshacer. Si entras con Apple, también quitamos Mesa de tu Apple ID.</p>
      <h2>Tus datos</h2>
      <p class="copy">Para pedir una copia de tus datos o hacer cualquier consulta de privacidad, escríbenos al mismo correo. Lee la <a href="/legal/privacy">política de privacidad</a>.</p>`,
        footer: `
    <p class="fine"><a href="/">Inicio</a> · <a href="/legal/privacy">Privacidad</a> · <a href="/legal/terms">Términos</a></p>`,
      }),
    )
  })
