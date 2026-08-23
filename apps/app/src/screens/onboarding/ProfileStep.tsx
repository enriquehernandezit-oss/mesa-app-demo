import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Body, Button, Eyebrow, Title } from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import type { Neighborhood } from '../../lib/types'

// Step 1: identity. Name, @handle, home neighborhood, and the EULA/terms accept
// that a UGC app needs at signup (App Store 1.2). Saving this is the last thing
// that completes the profile server-side — but the onboarding gate also needs a
// ranking, so finishing here advances to the rank step rather than the app.
export function ProfileStep({ onNext }: { onNext: () => void }) {
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [neighborhoodSlug, setNeighborhood] = useState('')
  const [accepted, setAccepted] = useState(false)

  const { data } = useQuery({
    queryKey: ['neighborhoods'],
    queryFn: () => api.get<{ neighborhoods: Neighborhood[] }>('/onboarding/neighborhoods'),
    staleTime: Number.POSITIVE_INFINITY, // reference data
  })

  // Instagram username — optional. Stored without the "@" (it's a display
  // prefix). We let the user type "@" for familiarity, then strip it. When left
  // blank it's simply omitted; the handle stays null.
  const igUser = handle.trim().replace(/@/g, '').toLowerCase()
  const handleProvided = igUser.length > 0
  const handleValid = !handleProvided || /^[a-z0-9_.]{2,30}$/.test(igUser)

  const save = useMutation({
    mutationFn: () =>
      api.patch('/me/profile', {
        name: name.trim(),
        ...(handleProvided ? { handle: igUser } : {}),
        neighborhoodSlug,
        acceptEula: true,
      }),
    onSuccess: onNext,
  })

  const canSubmit = name.trim().length > 0 && handleValid && neighborhoodSlug !== '' && accepted

  const errorText =
    save.error instanceof ApiError && save.error.code === 'handle_taken'
      ? 'Ese usuario ya está en uso — prueba con otro.'
      : save.isError
        ? 'No se pudo guardar — revisa tus datos e intenta de nuevo.'
        : null

  return (
    <div className="stack stack--loose" style={{ marginTop: 'var(--space-6)' }}>
      <div className="stack stack--tight">
        <Title>¿Quién eres en la mesa?</Title>
        <Body>Así te encuentran y reconocen tus amigos en Mesa.</Body>
      </div>

      <div className="stack stack--tight">
        <Eyebrow>Nombre</Eyebrow>
        <input
          className="field"
          placeholder="Tu nombre"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="stack stack--tight">
        <Eyebrow>Instagram · opcional</Eyebrow>
        <input
          className="field"
          placeholder="@tuusuario"
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_.@]/g, ''))}
        />
        {handle.length > 0 && !handleValid && (
          <div className="error-text">2–30 caracteres: letras, números, _ o .</div>
        )}
      </div>

      <div className="stack stack--tight">
        <Eyebrow>Sector</Eyebrow>
        <select
          className="field"
          value={neighborhoodSlug}
          onChange={(e) => setNeighborhood(e.target.value)}
        >
          <option value="" disabled>
            ¿Dónde sales?
          </option>
          {data?.neighborhoods.map((n) => (
            <option key={n.slug} value={n.slug}>
              {n.name}
            </option>
          ))}
        </select>
      </div>

      <label
        style={{
          display: 'flex',
          gap: 'var(--space-3)',
          alignItems: 'flex-start',
          minHeight: 44,
          color: 'var(--text-muted)',
          fontSize: 'var(--text-eyebrow)',
          lineHeight: 1.5,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          style={{
            flex: 'none',
            width: 22,
            height: 22,
            marginTop: 1,
            accentColor: 'var(--accent)',
            cursor: 'pointer',
          }}
        />
        <span>
          Acepto los Términos y el EULA de Mesa, y entiendo que el contenido inapropiado y los
          usuarios abusivos pueden ser reportados, bloqueados y eliminados.
        </span>
      </label>

      {errorText && <div className="error-text">{errorText}</div>}

      <Button disabled={!canSubmit || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? 'Guardando…' : 'Continuar'}
      </Button>
    </div>
  )
}
