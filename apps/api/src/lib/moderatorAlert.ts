import { db, schema } from '@mesa/db'
import { and, eq, ne, sql } from 'drizzle-orm'

const { reports, user } = schema

// The terms promise action on a report within 24 hours, and until now nothing told a moderator one had
// arrived: the queue only helps someone who thinks to open it. A new report emails the moderators.
//
// Throttled by burst, not by count: if another report is already open from the last half hour, the
// moderators were told about the queue then, so this one adds no second email. One person filing
// five reports in a minute, or a pile-on against one post, is one email, not five.
export const ALERT_QUIET_MS = 30 * 60_000

export type SendMail = (to: string, subject: string, body: string) => Promise<void>

const TYPE_LABEL: Record<string, string> = {
  vibe_note: 'una nota',
  dish: 'un plato',
  comment: 'un comentario',
  user: 'un miembro',
  plan: 'la nota de un plan',
  place: 'un lugar',
}

export async function alertModerators(
  report: { id: string; targetType: string; reason: string },
  send: SendMail,
  quietMs = ALERT_QUIET_MS,
): Promise<number> {
  // "Recent" is measured on the database's own clock (`localtimestamp`, the same wall time `created_at`
  // defaults to), not a JS Date: a Date parameter reaches a `timestamp` column as UTC, and where the
  // database's zone is not UTC the two disagree.
  const recent = await db.query.reports.findFirst({
    where: and(
      eq(reports.status, 'open'),
      sql`${reports.createdAt} > localtimestamp - make_interval(secs => ${quietMs / 1000})`,
      ne(reports.id, report.id),
    ),
    columns: { id: true },
  })
  if (recent) return 0

  const moderators = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.isModerator, true))
  const to = moderators
    .map((m) => m.email)
    .filter((e): e is string => typeof e === 'string' && !e.endsWith('@phone.mesa.local'))
  if (to.length === 0) return 0

  const what = TYPE_LABEL[report.targetType] ?? 'contenido'
  const subject = 'Mesa: hay un reporte nuevo'
  const body = [
    `Alguien reportó ${what} en Mesa.`,
    '',
    `Motivo: ${report.reason.slice(0, 200)}`,
    '',
    'Ábrelo en la app: Perfil → Moderación. Los términos prometen actuar en 24 horas.',
    '',
    '(Si llegan más reportes en la próxima media hora, no recibirás otro correo: están en la misma cola.)',
  ].join('\n')
  await Promise.all(to.map((email) => send(email, subject, body)))
  return to.length
}
