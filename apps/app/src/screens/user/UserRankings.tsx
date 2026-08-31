import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Body, Button, Caption, Chip, EmptyState, SectionHeader } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { Characteristics } from '../../components/ui/patterns'
import { toast } from '../../components/ui/toast-store'
import { ApiError, api } from '../../lib/api'
import { comingSoon } from '../../lib/comingSoon'
import { displayScore } from '../../lib/display'
import type { Ranking, UserRankingsResponse } from '../../lib/types'
import { useBack } from '../../lib/useBack'
import '../tabs/tabs.css'
import '../tabs/rankings.css'
import '../onboarding/friends.css'
import './moderation.css'

// Another person's ranked passport (mock E2) — and the surface where UGC
// moderation is exercised (App Store 1.2): report a vibe note or the user, block
// them. Blocking severs the graph and hides their content; the API 404s a blocked
// user, so this view empties out.
const REASONS = ['Spam', 'Acoso', 'Inapropiado', 'Otro'] as const

export function UserRankings() {
  const { userId } = useParams({ from: '/u/$userId' })
  const navigate = useNavigate()
  const goBack = useBack(() => navigate({ to: '/discover' }))
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [confirmingBlock, setConfirmingBlock] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const menuWrapRef = useRef<HTMLDivElement>(null)

  // Dismiss the ⋯ menu on an outside tap or Escape (it had no way to close).
  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (e: PointerEvent) => {
      if (!menuWrapRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const q = useQuery({
    queryKey: ['user-rankings', userId],
    queryFn: () => api.get<UserRankingsResponse>(`/rankings/user/${userId}`),
    retry: false,
  })

  const block = useMutation({
    mutationFn: () => api.post('/moderation/blocks', { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      navigate({ to: '/discover' })
    },
    onError: () => {
      toast({ variant: 'error', message: 'No se pudo bloquear. Intenta de nuevo.' })
    },
  })
  const follow = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.post('/social/follow', { userId }) : api.del(`/social/follow/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-rankings', userId] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  if (q.isPending) {
    return (
      <div className="tab-shell">
        <div className="tab-body">
          <Body>Cargando…</Body>
        </div>
      </div>
    )
  }
  if (q.isError) {
    const gone = q.error instanceof ApiError && q.error.status === 404
    return (
      <div className="tab-shell">
        <div className="tab-body">
          <ScreenHeader onBack={goBack} backLabel="Atrás" />
          <EmptyState>
            {gone ? 'Este perfil no está disponible.' : 'No se pudo cargar este perfil.'}
          </EmptyState>
        </div>
      </div>
    )
  }

  const { user, rankings, isFollowing, matchPercent } = q.data
  const firstName = (user.name || user.handle || '').split(' ')[0] || 'esta persona'
  const barrio = user.neighborhood?.name
  const shown = expanded ? rankings : rankings.slice(0, 4)

  return (
    <div className="tab-shell">
      <div className="tab-body">
        <ScreenHeader
          onBack={goBack}
          backLabel={user.name || user.handle || 'Atrás'}
          right={
            <div className="user-menu-wrap" ref={menuWrapRef}>
              <button
                type="button"
                className="user-menu-btn"
                aria-label="Más opciones"
                onClick={() => setMenuOpen((v) => !v)}
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="user-menu">
                  <button type="button" onClick={() => setReporting(true)}>
                    Reportar
                  </button>
                  <button
                    type="button"
                    className="user-menu__danger"
                    onClick={() => {
                      setConfirmingBlock(true)
                      setMenuOpen(false)
                    }}
                  >
                    Bloquear
                  </button>
                </div>
              )}
            </div>
          }
        />

        <div className="user-identity">
          <Avatar name={user.name || user.handle || 'm'} src={user.image} size={88} />
          {user.handle && <div className="user-identity__handle">@{user.handle}</div>}
          <div className="user-identity__meta">
            {[`${rankings.length} rankeados`, barrio].filter(Boolean).join(' · ')}
          </div>
          {matchPercent != null && (
            <span className="match-chip">+{matchPercent}% de gustos en común</span>
          )}
          <div className="user-actions">
            <Button
              variant="primary"
              style={{ width: 'auto', minHeight: 44, padding: '0 var(--space-6)' }}
              onClick={() => follow.mutate(!isFollowing)}
              disabled={follow.isPending}
            >
              {isFollowing ? 'Siguiendo' : 'Seguir'}
            </Button>
            <button
              type="button"
              className="user-message"
              data-stale
              aria-disabled
              onClick={() => comingSoon('Los mensajes llegan pronto a Mesa.')}
            >
              Mensaje
            </button>
          </div>
        </div>

        {reporting && (
          <ReportUser
            userId={userId}
            onDone={() => {
              setReporting(false)
              setMenuOpen(false)
            }}
          />
        )}

        {/* Blocking severs the social graph and hides both sides' content — a
            real consequence for a one-tap menu item, so it confirms first
            (matching account-deletion's confirm and ranking-removal's undo). */}
        {confirmingBlock && (
          <div className="report-panel">
            <Caption>
              ¿Bloquear a {firstName}? No verás su contenido y esta persona no verá el tuyo. Puedes
              desbloquear luego en Ajustes.
            </Caption>
            <div className="report-reasons">
              <Chip
                state="default"
                onClick={() => {
                  setConfirmingBlock(false)
                  block.mutate()
                }}
              >
                Bloquear
              </Chip>
            </div>
            <button type="button" className="link-action" onClick={() => setConfirmingBlock(false)}>
              Cancelar
            </button>
          </div>
        )}

        {rankings.length === 0 ? (
          <EmptyState>Todavía no hay rankings.</EmptyState>
        ) : (
          <>
            <SectionHeader action={<span>Todos {rankings.length}</span>}>
              Los favoritos de {firstName}
            </SectionHeader>
            {shown.map((r) => (
              <TheirRow key={r.id} ranking={r} />
            ))}
            {rankings.length > 4 && (
              <button type="button" className="resto-seeall" onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Mostrar menos' : `Ver los ${rankings.length} ›`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TheirRow({ ranking }: { ranking: Ranking }) {
  return (
    <div className="ranking-row">
      <div className="ranking-numeral">{ranking.position}</div>
      <div className="ranking-main">
        <div className="ranking-name">{ranking.restaurant.name}</div>
        <Characteristics
          priceTier={ranking.restaurant.priceTier}
          cuisine={ranking.restaurant.cuisine}
          neighborhood={ranking.neighborhood}
        />
        {ranking.note && <div className="ranking-note">“{ranking.note}”</div>}
        {ranking.note && ranking.noteId && (
          <ReportControl targetType="vibe_note" targetId={ranking.noteId} />
        )}
      </div>
      <div className="ranking-score">{displayScore(ranking.score)}</div>
    </div>
  )
}

// Report the whole user (from the ⋯ menu) — targetType 'user'.
function ReportUser({ userId, onDone }: { userId: string; onDone: () => void }) {
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType: 'user', targetId: userId, reason }),
    onSuccess: onDone,
    // Without this a failed report closed nothing and said nothing, so the
    // reporter couldn't tell it hadn't sent.
    onError: () =>
      toast({ variant: 'error', message: 'No se pudo enviar el reporte. Intenta de nuevo.' }),
  })
  return (
    <div className="report-panel">
      <Caption>¿Por qué reportas a esta persona?</Caption>
      <div className="report-reasons">
        {REASONS.map((reason) => (
          <Chip
            key={reason}
            onClick={() => !report.isPending && report.mutate(reason)}
            state="default"
          >
            {reason}
          </Chip>
        ))}
      </div>
      <button type="button" className="link-action" onClick={onDone}>
        Cancelar
      </button>
    </div>
  )
}

function ReportControl({
  targetType,
  targetId,
}: { targetType: 'vibe_note' | 'user'; targetId: string }) {
  const [open, setOpen] = useState(false)
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType, targetId, reason }),
    onError: () =>
      toast({ variant: 'error', message: 'No se pudo enviar el reporte. Intenta de nuevo.' }),
  })
  if (report.isSuccess) {
    return <div className="report-done">Reportado. Gracias — lo revisaremos.</div>
  }
  return (
    <div className="ranking-actions">
      {!open ? (
        <button
          type="button"
          className="link-action link-action--danger"
          onClick={() => setOpen(true)}
        >
          Reportar
        </button>
      ) : (
        <div className="report-panel">
          <Caption>¿Por qué reportas esta nota?</Caption>
          <div className="report-reasons">
            {REASONS.map((reason) => (
              <Chip
                key={reason}
                onClick={() => !report.isPending && report.mutate(reason)}
                state="default"
              >
                {reason}
              </Chip>
            ))}
          </div>
          <button type="button" className="link-action" onClick={() => setOpen(false)}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
