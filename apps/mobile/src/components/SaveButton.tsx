import { BookmarkFilledIcon, BookmarkIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { type SaveTarget, useSave } from '@/hooks/useSave'
import { tapLight } from '@/lib/haptics'
import { useT } from '@/lib/i18n'
import { useRouter } from 'expo-router'
import { Pressable } from 'react-native'

// The one save/unsave control (M19) — next to CheersButton in the feed (a
// dish post saves the dish, a ranking post saves the restaurant), and on the
// restaurant page and dish detail. Tap toggles + (on save only) offers a
// 3-second "Agregar a lista" toast; long-press jumps straight to the list
// picker (app/guardar.tsx) without waiting for the tap's own save to matter —
// guardar.tsx itself guarantees the master save either way (see its own
// header), so long-pressing an unsaved item still saves it.
export function SaveButton({
  target,
  initial,
  name,
  size = 20,
  // 'icon': plain bookmark glyph (feed, dish detail). 'pill': the
  // restaurant page's bordered circle — same on/off treatment as its old
  // hand-rolled CheckIcon toggle, now going through the shared save state
  // and list-picker instead of a page-local mutation.
  variant = 'icon',
  className,
}: {
  target: SaveTarget
  initial: boolean
  // The saved item's own name, for the toast ("Guardaste «Casaluca»").
  name: string
  size?: number
  variant?: 'icon' | 'pill'
  className?: string
}) {
  const t = useT()
  const router = useRouter()
  const { saved, toggle, pending } = useSave(target, initial)

  function openListPicker() {
    router.push(`/guardar?kind=${target.kind}&id=${target.id}&name=${encodeURIComponent(name)}`)
  }

  function onTap() {
    const wasSaved = saved
    toggle()
    tapLight()
    if (!wasSaved) {
      toast({
        message: t('save.saved_toast', { name }),
        duration: 3000,
        action: { label: t('save.add_to_list'), onClick: openListPicker },
      })
    }
  }

  const label = saved ? t('save.remove') : t('save.save')
  if (variant === 'pill') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={label}
        disabled={pending}
        onPress={onTap}
        onLongPress={openListPicker}
        className={`h-10 w-10 items-center justify-center rounded-pill border ${saved ? 'border-accent bg-accent-fill' : 'border-line'} active:opacity-80 ${className ?? ''}`}
      >
        {saved ? (
          <BookmarkFilledIcon size={17} color="on-accent" />
        ) : (
          <BookmarkIcon size={17} color="text-muted" />
        )}
      </Pressable>
    )
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={label}
      disabled={pending}
      onPress={onTap}
      onLongPress={openListPicker}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      className={`min-w-[44px] items-center justify-center active:opacity-70 ${className ?? ''}`}
    >
      {saved ? <BookmarkFilledIcon size={size} /> : <BookmarkIcon size={size} color="text-muted" />}
    </Pressable>
  )
}
