// Where members write for help, reports and data requests. One place, so the home page, the support
// page, the legal text (lib/legalCopy.ts and the app's own copy) and the "report this page" link on
// shared pages cannot drift apart. The mailbox is an alias that forwards to the founder's inbox
// (Cloudflare Email Routing on mesasocial.app); see docs/DEPLOY.md.
export const SUPPORT_EMAIL = 'soporte@mesasocial.app'

// A mailto link that reports a specific page.
export function reportPageHref(pageUrl: string): string {
  const subject = encodeURIComponent('Reporte de contenido en Mesa')
  const body = encodeURIComponent(`Quiero reportar esta página:\n${pageUrl}\n\nMotivo:\n`)
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`
}
