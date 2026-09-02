import * as Contacts from 'expo-contacts'

// Native contact import. App Store 5.1: the permission is requested
// just-in-time — only when the member taps "Buscar amigos en tus contactos",
// never at launch — and the purpose string lives in app.json's expo-contacts
// plugin config. We read phone numbers only, hand them to the API to match
// against Mesa users, and never store the raw list. Ported from
// apps/app/src/lib/contacts.ts (@capacitor-community/contacts).
export type ContactsResult =
  | { status: 'unsupported' }
  | { status: 'denied' }
  | { status: 'ok'; phoneNumbers: string[] }

// On native this is always available (the module is linked into the build); the
// check stays so callers keep one shape across platforms.
export function contactsAvailable(): boolean {
  return true
}

export async function importContactPhones(): Promise<ContactsResult> {
  const perm = await Contacts.requestPermissionsAsync().catch(() => null)
  if (!perm?.granted) return { status: 'denied' }

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  })
  const numbers = new Set<string>()
  for (const contact of data) {
    for (const phone of contact.phoneNumbers ?? []) {
      if (phone.number) numbers.add(phone.number)
    }
  }
  return { status: 'ok', phoneNumbers: [...numbers] }
}
