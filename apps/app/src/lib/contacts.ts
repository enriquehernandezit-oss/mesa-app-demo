import { Contacts } from '@capacitor-community/contacts'
import { Capacitor } from '@capacitor/core'

// Native contact import via the Capacitor Contacts plugin. App Store 5.1: the
// permission is requested just-in-time — only when the user taps "Find friends
// from contacts", never at launch — and the purpose string lives in Info.plist
// (NSContactsUsageDescription). We read phone numbers only, hand them to the API
// to match against Mesa users, and never store the raw list.

export type ContactsResult =
  | { status: 'unsupported' } // web / no native contacts
  | { status: 'denied' }
  | { status: 'ok'; phoneNumbers: string[] }

// True on a real device build; false in the browser dev server.
export function contactsAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Contacts')
}

export async function importContactPhones(): Promise<ContactsResult> {
  if (!contactsAvailable()) return { status: 'unsupported' }

  const perm = await Contacts.requestPermissions()
  if (perm.contacts !== 'granted') return { status: 'denied' }

  const { contacts } = await Contacts.getContacts({ projection: { phones: true } })
  const numbers = new Set<string>()
  for (const contact of contacts) {
    for (const phone of contact.phones ?? []) {
      if (phone.number) numbers.add(phone.number)
    }
  }
  return { status: 'ok', phoneNumbers: [...numbers] }
}
