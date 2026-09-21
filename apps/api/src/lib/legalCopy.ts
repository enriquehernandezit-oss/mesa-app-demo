// The canonical text of Mesa's three legal documents — privacy policy, terms,
// EULA. App Store Connect wants a hosted Privacy Policy URL and a Terms URL,
// and App Store 5.1 wants the same documents reachable inside the app, so this
// text has to exist in two places at once.
//
// KEEP IN SYNC WITH apps/mobile/src/app/legal/[doc].tsx, which holds the same
// prose for the in-app screens. It is duplicated on purpose: Metro cannot
// resolve workspace packages under Bun's isolated linker (CLAUDE.md says so of
// lib/types.ts for the same reason), so the app cannot import this module.
// Change one, change the other in the same commit — a privacy policy that says
// two different things in two places is worse than one that says neither.
//
// This copy is the founder's own writing, checked line by line against what the
// code actually does. It still wants a lawyer's read before the public App
// Store release.

export type LegalDocId = 'privacy' | 'terms' | 'eula'

export interface LegalSection {
  heading: string
  paragraphs: string[]
}

export interface LegalDoc {
  title: string
  // One line, rendered under the title on every surface.
  updated: string
  sections: LegalSection[]
}

const UPDATED = 'Última actualización: 21 de septiembre de 2026'

// Written in Spanish only, like the rest of the documents: the app's default
// language is Spanish and its members are in Santo Domingo. A half-machine-
// translated legal text would be worse than an untranslated one.
export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  privacy: {
    title: 'Política de Privacidad',
    updated: UPDATED,
    sections: [
      {
        heading: 'Qué cubre esto',
        paragraphs: [
          'Mesa es una app de descubrimiento de restaurantes y vida nocturna en Santo Domingo: rankeas los sitios a los que vas y ves dónde los rankean tus amigos.',
          'Esta política explica qué datos tocamos, por qué, con quién los compartimos y qué control tienes sobre ellos. Está escrita en español porque es el idioma de la app.',
        ],
      },
      {
        heading: 'Tu cuenta',
        paragraphs: [
          'Puedes entrar con correo y contraseña, con tu cuenta de Apple o con Instagram. Guardamos lo mínimo para sostener el método que elijas: tu correo y tu contraseña guardada como hash —nunca en texto plano—, o el identificador que nos devuelve Apple o Instagram. Nunca vemos tu contraseña de Apple ni la de Instagram.',
          'Si usas Iniciar sesión con Apple y escondes tu correo, lo único que recibimos es la dirección de reenvío que Apple genera.',
          'Si el inicio de sesión por teléfono está disponible y lo usas, tu número queda guardado en tu cuenta como forma de entrar.',
        ],
      },
      {
        heading: 'Tu perfil',
        paragraphs: [
          'En el onboarding eliges tu nombre, un @usuario opcional, tu sector y, si quieres, una bio corta y una foto. Eso es lo que ven otros miembros. Puedes cambiarlo o vaciarlo cuando quieras desde Perfil → Ajustes.',
          'También guardamos la fecha en que aceptaste el acuerdo de licencia, porque hay que poder demostrar esa aceptación.',
        ],
      },
      {
        heading: 'Lo que publicas',
        paragraphs: [
          'Tus rankings, tus notas de vibe, tus fotos de platos, tus comentarios y tus listas son tuyos. Dentro de la app los ven las personas que te siguen y quien visite tu perfil.',
          'Cuando compartes un enlace —tu pasaporte, un sitio, un plan, una invitación— la página que se abre es pública en la web: cualquiera con ese enlace la ve sin tener cuenta. El enlace de un plan lleva un identificador imposible de adivinar, así que solo llega a quien tú se lo mandes.',
          'Puedes editar o eliminar cualquier cosa que hayas publicado, en el momento que quieras.',
        ],
      },
      {
        heading: 'Contactos',
        paragraphs: [
          'Buscar amigos en tus contactos es opcional y se te pide en el momento en que lo pides tú, nunca al abrir la app.',
          'Si aceptas, tu teléfono nos manda los números de tu libreta para compararlos contra las cuentas de Mesa. Los comparamos durante esa consulta y los descartamos al responder: no guardamos tu libreta, ni los números, ni los nombres. Los nombres de tus contactos ni siquiera salen del teléfono — el emparejamiento con el nombre lo hace la app en tu dispositivo.',
          'En la pantalla de buscar amigos, cada número se convierte en un hash con clave antes de tocar la base de datos, así que lo que se compara no es el número.',
          'Aparte de eso puedes activar «que tus contactos te encuentren» en Ajustes. Eso guarda un hash de tu propio número, no el número, para que quien te tenga agendado pueda dar contigo. Se apaga desde el mismo sitio y el hash se borra.',
        ],
      },
      {
        heading: 'Fotos y cámara',
        paragraphs: [
          'La cámara y la fototeca se piden solo cuando vas a subir una foto de un plato o tu foto de perfil. No leemos tu carrete: solo llega la imagen que elegiste.',
          'La foto se reduce de tamaño en tu teléfono antes de salir, se guarda junto a esa publicación —en nuestra base de datos o en Cloudinary, el proveedor que usamos para imágenes— y se muestra desde ahí.',
        ],
      },
      {
        heading: 'Ubicación',
        paragraphs: [
          'La ubicación se pide solo cuando la pides tú: el botón «Ubícame» del mapa y el filtro de cercanía al rankear.',
          'Se usa dentro del teléfono para ordenar sitios por distancia y centrar el mapa. No se envía a nuestro servidor, no se guarda en ningún lado y desaparece al cerrar la app.',
          'El mapa lo dibuja MapBox, que recibe la zona que estás viendo para poder servir las piezas del mapa.',
        ],
      },
      {
        heading: 'Notificaciones',
        paragraphs: [
          'Si aceptas notificaciones, guardamos un token por dispositivo para poder enviártelas. Si nunca las aceptas, no hay token que guardar; al cerrar sesión, el token de ese dispositivo se borra.',
          'Te escribimos cuando alguien te sigue, te da cheers, comenta tu ranking, te invita a un plan o responde a uno, y cuando un amigo rankea un sitio que tienes guardado o dice que va a un evento. Nada de promociones.',
          'Puedes apagarlas por categoría en Ajustes → Notificaciones, o del todo desde los ajustes del iPhone.',
        ],
      },
      {
        heading: 'Analítica y errores',
        paragraphs: [
          'Usamos PostHog para medir cómo se usa la app y Sentry para enterarnos de los fallos. Los dos están apagados mientras no estén configurados con su clave: sin clave, la app y el servidor no mandan nada.',
          'Lo que viaja en un evento son identificadores, conteos y nombres de acciones. No van nombres, ni @usuarios, ni correos, ni teléfonos, ni el texto de tus notas o comentarios. Sentry recibe el error y tu identificador de usuario, nada más.',
          'Mesa no lleva ningún SDK de publicidad ni de atribución. No te seguimos por otras apps ni por la web, y no hay anuncios.',
        ],
      },
      {
        heading: 'Con quién compartimos',
        paragraphs: [
          'Railway aloja el servidor y la base de datos. Cloudinary guarda y entrega imágenes. MapBox dibuja los mapas. Expo y Apple entregan las notificaciones. Resend envía los correos de verificación y de recuperación de contraseña. Google Places nos sugiere lugares cuando buscas un sitio que todavía no está en Mesa, lo que significa que el texto de esa búsqueda llega a Google. PostHog y Sentry reciben lo descrito arriba cuando están configurados. Apple e Instagram intervienen solo si eliges entrar con ellos.',
          'Cada uno recibe únicamente lo que necesita para su parte. También entregaríamos datos si una autoridad competente nos lo exigiera legalmente.',
          'No vendemos tus datos, no los alquilamos y no los cambiamos por publicidad.',
        ],
      },
      {
        heading: 'Tus controles',
        paragraphs: [
          'Puedes editar o borrar lo que publicaste; bloquear cuentas y revisar la lista de bloqueados en Ajustes → Privacidad; reportar cualquier contenido desde el contenido mismo; exportar tus rankings a un archivo desde Ajustes → Privacidad; apagar «que tus contactos te encuentren»; y apagar las notificaciones por categoría.',
        ],
      },
      {
        heading: 'Eliminar tu cuenta',
        paragraphs: [
          'Perfil → Ajustes → Tu cuenta → Eliminar cuenta. Te pedimos tu contraseña, o un inicio de sesión reciente si entras con Apple o Instagram, porque esto no se puede deshacer.',
          'Al confirmar borramos la cuenta y todo lo que cuelga de ella: rankings, notas, fotos, comentarios, listas, seguidores, bloqueos, reportes, sesiones y tokens de notificación. Es un borrado real, no una desactivación.',
          'Lo que no podemos recoger: si alguien guardó una captura o abrió un enlace que compartiste, eso ya vive fuera de Mesa. Las copias de respaldo y los registros del servidor pueden conservar restos por poco tiempo antes de rotar.',
        ],
      },
      {
        heading: 'Menores',
        paragraphs: [
          'Mesa es para mayores de 18 años. No está diseñada para menores y no recopilamos sus datos a sabiendas; si nos enteramos de una cuenta de un menor, la eliminamos.',
        ],
      },
      {
        heading: 'Cambios y contacto',
        paragraphs: [
          'Si cambia algo importante, actualizamos la fecha de este documento y publicamos la versión nueva aquí y en la app.',
          'Para cualquier duda o pedido sobre tus datos, escríbenos: Durante la beta escríbenos respondiendo al correo con el que te invitamos, o desde TestFlight → Enviar comentarios. Publicaremos una dirección de soporte aquí cuando Mesa salga de la beta. Mesa es un equipo pequeño y te contesta la misma gente que la construye.',
        ],
      },
    ],
  },

  terms: {
    title: 'Términos de Servicio',
    updated: UPDATED,
    sections: [
      {
        heading: 'El trato',
        paragraphs: [
          'Mesa es una app para descubrir dónde comer y dónde salir en Santo Domingo a través de la gente en la que confías. Al crear una cuenta y usarla, aceptas estos términos. Si no estás de acuerdo con ellos, no uses Mesa.',
        ],
      },
      {
        heading: 'Quién puede usar Mesa',
        paragraphs: [
          'Tienes que tener 18 años o más y una sola cuenta.',
          'Tu nombre y tu @usuario tienen que ser tuyos: nada de hacerte pasar por otra persona ni por un restaurante. Tu cuenta y tu contraseña no se comparten.',
        ],
      },
      {
        heading: 'Lo que publicas sigue siendo tuyo',
        paragraphs: [
          'Tus rankings, notas, fotos, comentarios y listas son tuyos. Nos das permiso para mostrarlos dentro de Mesa a quien corresponda y en las páginas que tú decidas compartir. Nada más: no los vendemos, no los licenciamos a terceros y no los usamos en publicidad.',
          'Respondes por lo que publicas — que sea tuyo o que tengas derecho a publicarlo.',
        ],
      },
      {
        heading: 'Cómo comportarse',
        paragraphs: [
          'Sé buen invitado. Nada de acoso, amenazas, discurso de odio, contenido sexual explícito, violencia, spam, ni datos privados de otra persona.',
          'Nada de raspar la app, automatizar cuentas, ni cobrar por rankear un sitio sin decirlo.',
          'Reportar y bloquear están a un toque, en cada pieza de contenido y en cada perfil.',
        ],
      },
      {
        heading: 'Moderación',
        paragraphs: [
          'Revisamos lo que se reporta y actuamos sobre el contenido reportado dentro de las 24 horas siguientes. Podemos quitar contenido, limitar una cuenta o expulsarla, sin aviso previo cuando el caso es grave.',
          'Si crees que nos equivocamos, escríbenos y lo revisamos.',
        ],
      },
      {
        heading: 'Rankings, no estrellas',
        paragraphs: [
          'Mesa no califica restaurantes con estrellas y nunca lo hará. Un ranking es la opinión de una persona, no un veredicto nuestro sobre un negocio.',
          'Los datos de los sitios —dirección, horarios, menús— y los eventos, que recogemos de los propios locales y de fuentes públicas, pueden estar incompletos o desactualizados. Confirma con el sitio antes de ir.',
          'Mesa no reserva mesas por ti y no es parte de lo que acuerdes con un restaurante o con la gente de tu plan.',
        ],
      },
      {
        heading: 'Disponibilidad',
        paragraphs: [
          'Mesa se ofrece tal como está, mientras la seguimos construyendo. Las funciones cambian, algunas desaparecen y puede haber caídas. No prometemos disponibilidad ininterrumpida ni que nada se pierda nunca, aunque hacemos lo razonable por las dos cosas.',
          'Hasta donde la ley lo permita, no respondemos por daños indirectos derivados del uso de la app, por lo que publique otro miembro, ni por lo que pase en un restaurante o en un plan.',
        ],
      },
      {
        heading: 'Terminar',
        paragraphs: [
          'Puedes irte cuando quieras: Perfil → Ajustes → Tu cuenta → Eliminar cuenta borra tu cuenta y todo lo que cuelga de ella.',
          'Nosotros podemos cerrar una cuenta que incumpla estos términos.',
        ],
      },
      {
        heading: 'Ley aplicable',
        paragraphs: [
          'Estos términos se rigen por las leyes de la República Dominicana y cualquier disputa se ve en los tribunales de Santo Domingo.',
        ],
      },
      {
        heading: 'Cambios y contacto',
        paragraphs: [
          'Si cambia algo importante, actualizamos la fecha de este documento. Seguir usando Mesa después de un cambio es aceptarlo.',
          'Para cualquier duda, escríbenos: Durante la beta escríbenos respondiendo al correo con el que te invitamos, o desde TestFlight → Enviar comentarios. Publicaremos una dirección de soporte aquí cuando Mesa salga de la beta.',
        ],
      },
    ],
  },

  eula: {
    title: 'Acuerdo de Licencia de Usuario Final',
    updated: UPDATED,
    sections: [
      {
        heading: 'Con quién es este acuerdo',
        paragraphs: [
          'Este acuerdo es entre tú y Mesa. Apple no es parte de él y no es responsable de la app ni de su contenido.',
        ],
      },
      {
        heading: 'Tu licencia',
        paragraphs: [
          'Mesa te da una licencia personal, limitada, revocable e intransferible para usar la app en los dispositivos Apple que tengas o controles, conforme a las Reglas de Uso del App Store.',
          'No puedes copiarla, revenderla, alquilarla, modificarla, descompilarla ni intentar obtener su código.',
        ],
      },
      {
        heading: 'Tolerancia cero con el contenido abusivo',
        paragraphs: [
          'Mesa muestra contenido creado por sus miembros. Al usarla aceptas no publicar contenido abusivo, de acoso, de odio, sexual explícito o ilegal, y no acosar a otros miembros.',
          'Puedes reportar contenido y bloquear cuentas desde la propia app. Revisamos los reportes y actuamos sobre el contenido reportado dentro de las 24 horas siguientes: lo quitamos si incumple y expulsamos a la cuenta que lo publicó cuando corresponde.',
        ],
      },
      {
        heading: 'Mantenimiento y soporte',
        paragraphs: [
          'El mantenimiento y el soporte de Mesa los damos nosotros. Apple no tiene ninguna obligación de prestarlos. Durante la beta escríbenos respondiendo al correo con el que te invitamos, o desde TestFlight → Enviar comentarios. Publicaremos una dirección de soporte aquí cuando Mesa salga de la beta.',
        ],
      },
      {
        heading: 'Garantía',
        paragraphs: [
          'La app se entrega tal como está, sin más garantías que las que la ley exija.',
          'Si alguna garantía aplicara y la app no la cumpliera, puedes avisarle a Apple y Apple te devolverá lo que hayas pagado por la app — hoy Mesa es gratis, así que ese monto es cero. Fuera de eso, Apple no tiene ninguna otra obligación respecto a la app.',
        ],
      },
      {
        heading: 'Reclamaciones y propiedad intelectual',
        paragraphs: [
          'Cualquier reclamación sobre la app —que no funcione, responsabilidad por producto, incumplimiento legal, privacidad— la atendemos nosotros, no Apple.',
          'El nombre Mesa, su marca, su diseño y su código son nuestros. Si un tercero alega que la app infringe su propiedad intelectual, la defensa y la resolución corren por nuestra cuenta, no por la de Apple.',
        ],
      },
      {
        heading: 'Uso legal y servicios de terceros',
        paragraphs: [
          'Al usar Mesa declaras que no te encuentras en un país sujeto a embargo del gobierno de Estados Unidos ni figuras en una lista de partes restringidas, y que cumplirás las leyes que te apliquen.',
          'Mesa se apoya en servicios de terceros —mapas, imágenes, notificaciones— cuyas condiciones también aceptas donde correspondan. Esos terceros no responden por Mesa.',
          'Apple y sus filiales son terceros beneficiarios de este acuerdo y pueden hacerlo valer frente a ti.',
        ],
      },
      {
        heading: 'Fin de la licencia',
        paragraphs: [
          'La licencia termina si incumples este acuerdo, y puedes terminarla tú eliminando tu cuenta y borrando la app.',
        ],
      },
    ],
  },
}
