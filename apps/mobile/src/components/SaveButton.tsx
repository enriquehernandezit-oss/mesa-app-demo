import { useRouter } from 'expo-router'
import { Pressable, Text } from 'react-native'

import { MAX_SCALE } from '@/components/ui'
import { Glass } from '@/components/ui/Glass'
import { BookmarkFilledIcon, BookmarkIcon } from '@/components/ui/icons'
import { toast } from '@/components/ui/toast-store'
import { type SaveTarget, useSave } from '@/hooks/useSave'
import { tapLight } from '@/lib/haptics'
import { useT } from '@/lib/i18n'

// The one save/unsave control (M19) — next to CheersButton in the feed (a
// dish post saves the dish, a ranking post saves the restaurant), and on the
// restaurant page and dish detail. Tap toggles + (on save only) offers a
// 3-second "Agregar a lista" toast; long-press jumps straight to the list
// picker (app/save-to-list.tsx) without waiting for the tap's own save to matter —
// save-to-list.tsx itself guarantees the master save either way (see its own
// header), so long-pressing an unsaved item still saves it.
export function SaveButton({
  target,
  initial,
  name,
  size = 20,
  // 'chip': a filled round button for a card's corner (the feed's ranking posts), as visible as
  // the cheers and comment chips beside it. 'icon': plain bookmark glyph (dish detail). 'pill': the
  // restaurant page's bordered circle — same on/off treatment as its old
  // hand-rolled CheckIcon toggle, now going through the shared save state
  // and list-picker instead of a page-local mutation.
  variant = 'icon',
  text,
  className,
}: {
  target: SaveTarget
  initial: boolean
  // The saved item's own name, for the toast ("Guardaste «Casaluca»").
  name: string
  size?: number
  variant?: 'icon' | 'pill' | 'bar' | 'photo' | 'chip'
  // 'icon' only: a label beside the glyph (the feed card's "Quiero probar").
  text?: string
  className?: string
}) {
  const t = useT()
  const router = useRouter()
  const { saved, toggle } = useSave(target, initial)

  function openListPicker() {
    router.push(
      `/save-to-list?kind=${target.kind}&id=${target.id}&name=${encodeURIComponent(name)}`,
    )
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
  // The place page's rank bar: a cream circle on the dark bar.
  if (variant === 'bar') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={label}
        onPress={onTap}
        onLongPress={openListPicker}
        className={`h-[52px] w-[52px] items-center justify-center rounded-pill bg-on-bar active:opacity-80 ${className ?? ''}`}
      >
        {saved ? (
          <BookmarkFilledIcon size={21} color="bar" />
        ) : (
          <BookmarkIcon size={21} color="bar" />
        )}
      </Pressable>
    )
  }
  // A frosted round control laid on a photograph (a dish's hero).
  if (variant === 'photo') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={label}
        onPress={onTap}
        onLongPress={openListPicker}
        hitSlop={4}
        className={`active:opacity-80 ${className ?? ''}`}
      >
        <Glass
          variant="panel"
          radius={22}
          className="h-[44px] w-[44px] items-center justify-center"
        >
          {saved ? <BookmarkFilledIcon size={20} /> : <BookmarkIcon size={20} color="hglass-fg" />}
        </Glass>
      </Pressable>
    )
  }
  if (variant === 'chip') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={label}
        onPress={onTap}
        onLongPress={openListPicker}
        hitSlop={4}
        className={`h-9 w-9 items-center justify-center rounded-pill bg-bg active:opacity-80 ${className ?? ''}`}
      >
        {saved ? <BookmarkFilledIcon size={18} /> : <BookmarkIcon size={18} color="text-2" />}
      </Pressable>
    )
  }
  if (variant === 'pill') {
    return (
      <Pressable
        hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
        accessibilityRole="button"
        accessibilityState={{ selected: saved }}
        accessibilityLabel={label}
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
      onPress={onTap}
      onLongPress={openListPicker}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      className={`min-w-[44px] flex-row items-center justify-center gap-1.5 active:opacity-70 ${className ?? ''}`}
    >
      {saved ? <BookmarkFilledIcon size={size} /> : <BookmarkIcon size={size} color="text-muted" />}
      {text ? (
        <Text
          maxFontSizeMultiplier={MAX_SCALE}
          className={`font-ui-semibold text-label ${saved ? 'text-accent' : 'text-text-muted'}`}
        >
          {text}
        </Text>
      ) : null}
    </Pressable>
  )
}
