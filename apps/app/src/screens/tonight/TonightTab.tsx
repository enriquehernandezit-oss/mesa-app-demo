import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Body, Chip, ChipRail, SerifItalic, Title } from '../../components/ui'
import { Avatar } from '../../components/ui/Avatar'
import { Characteristics, ScoreBadge } from '../../components/ui/patterns'
import {
  TONIGHT_TABLES,
  type TonightTable,
  seatsLeft,
  tonightDateLabel,
} from '../../fixtures/tonight'
import '../tabs/tabs.css'
import '../tabs/feed.css'
import './tonight.css'

// Tonight / Sobremesa (mock I1) — friends opening seats at places they've ranked.
// Fixture-backed and demo-only: the host's score is why the table exists, and
// every Join is inert-by-design (Mesa has no live table supply yet).
type Filter = 'all' | 'near' | 'seats' | 'late'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'near', label: 'Cerca de mí' },
  { value: 'seats', label: 'Con cupo' },
  { value: 'late', label: '8p+' },
]

export function TonightTab() {
  const [filter, setFilter] = useState<Filter>('all')
  const dateLabel = tonightDateLabel(new Date())
  const tables = TONIGHT_TABLES.filter((t) => {
    if (filter === 'seats') return seatsLeft(t) > 0
    if (filter === 'late') return t.hour >= 20
    return true // all / near me (no geo in the demo)
  })

  return (
    <div>
      <div className="tonight-head">
        <Title>Esta noche</Title>
        <span className="tonight-date">{dateLabel}</span>
      </div>

      <ChipRail style={{ margin: 'var(--space-3) 0 var(--space-4)' }}>
        {FILTERS.map((f) => (
          <Chip
            key={f.value}
            size="sm"
            state={filter === f.value ? 'selected' : 'default'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Chip>
        ))}
      </ChipRail>

      <div className="tonight-list">
        {tables.length === 0 ? (
          <div className="tab-empty">
            <SerifItalic style={{ fontSize: '1.15rem' }}>Ninguna mesa coincide.</SerifItalic>
            <Body>Prueba otro filtro — se abren más a medida que avanza la noche.</Body>
          </div>
        ) : (
          tables.map((t) => <TableCard key={t.id} table={t} />)
        )}
      </div>
    </div>
  )
}

function TableCard({ table: t }: { table: TonightTable }) {
  const left = seatsLeft(t)
  const hostFirst = t.host.name.split(' ')[0] ?? t.host.name
  const inFirst = t.whoIn[0]?.name.split(' ')[0]
  return (
    <div className="tonight-card">
      <Link to="/tonight/$tableId" params={{ tableId: t.id }} className="ph tonight-card__photo">
        <div
          className="tonight-card__img"
          style={{ backgroundImage: `url(/restaurants/${t.restaurant.photo}.jpg)` }}
        />
        <span className="tonight-card__seats">
          {left > 0 ? `${left} cupo${left > 1 ? 's' : ''}` : 'Lleno'}
        </span>
      </Link>
      <div className="tonight-card__body">
        <div className="tonight-card__head">
          <Link to="/tonight/$tableId" params={{ tableId: t.id }} className="tonight-card__name">
            {t.restaurant.name}
          </Link>
          <ScoreBadge
            size="sm"
            score={t.hostScore}
            attribution={{ kind: 'user', label: hostFirst }}
          />
        </div>
        <Characteristics
          cuisine={t.restaurant.cuisine}
          neighborhood={t.restaurant.neighborhood}
          hours={t.time}
        />
        <div className="tonight-card__footer">
          <div className="tonight-card__who">
            <div className="chars__social-avatars">
              <Avatar name={t.host.name} src={t.host.image} size={20} />
              {t.whoIn[0] && <Avatar name={t.whoIn[0].name} src={t.whoIn[0].image} size={20} />}
            </div>
            <span className="tonight-card__wholabel">
              {hostFirst} organiza{inFirst ? ` · ${inFirst} está` : ''}
            </span>
          </div>
          <button
            type="button"
            className="tonight-join"
            data-stale
            aria-disabled
            disabled={left === 0}
          >
            {left === 0 ? 'Lleno' : 'Unirme'}
          </button>
        </div>
      </div>
    </div>
  )
}
