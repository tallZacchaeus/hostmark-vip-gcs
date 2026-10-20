// Demo guests for the development seed (P2): the Figma delegations, created by the same code as an
// approved registration (lib/services/intake/records.ts), plus three submissions waiting in the
// review queue — a likely duplicate, a pasted message with gaps and a registration with a flagged
// note. Seeded as system activity that cannot be undone, like the rest of the seed.
import { type Kysely, sql } from 'kysely'
import type { DB } from '@/lib/db/types'
import { draftFromMessageWithRules, extractWithRules } from '@/lib/domain/intake/extract-rules'
import { EMPTY_EXTRACTION, type Extraction } from '@/lib/domain/intake/extraction'
import { normalizeIntake } from '@/lib/domain/intake/normalize'
import { type IntakeFields, intakeFieldsSchema } from '@/lib/domain/intake/schema'
import { addDays } from '@/lib/domain/time'
import { assessIntake, createDelegationRecords, extractionColumns, jsonb, loadEvent } from '@/lib/services/intake/records'

interface DemoDelegation {
  readonly category: string
  readonly dayOffset: number
  readonly fields: Partial<IntakeFields>
}

const DEFAULT_CONTACT = { contact_name: 'Delegation office' }

const DELEGATIONS: readonly DemoDelegation[] = [
  {
    category: 'Clergy / Executive',
    dayOffset: 0,
    fields: {
      title: 'Bishop',
      full_name: 'Augustine Okafor',
      organisation: 'Diocese of Lagos West',
      contact_name: 'Grace Adeyemi',
      contact_email: 'office@lagoswest.example',
      contact_phone: '+2348030000101',
      arrival_mode: 'flying',
      airline: 'Emirates',
      flight_number: 'EK783',
      arrival_time: '13:40',
      dietary: 'Vegetarian',
      party: [
        { name: 'Mrs. Chioma Okafor', role: 'family', dietary: '', accessibility: '' },
        { name: 'Rev. Tobi Adewale', role: 'assistant', dietary: 'No pork', accessibility: '' },
        { name: 'Mr. Segun Afolabi', role: 'security', dietary: '', accessibility: '' },
      ],
    },
  },
  {
    category: 'Clergy / Executive',
    dayOffset: 0,
    fields: {
      title: 'Archbishop',
      full_name: 'Tendai Moyo',
      contact_email: 'secretariat@harare.example',
      arrival_mode: 'flying',
      airline: 'Ethiopian Airlines',
      flight_number: 'ET512',
      arrival_time: '11:05',
      party: [
        { name: 'Rev. Farai Moyo', role: 'assistant', dietary: '', accessibility: '' },
        { name: '', role: 'security', dietary: '', accessibility: '' },
      ],
    },
  },
  {
    category: 'Dignitary',
    dayOffset: 0,
    fields: { title: 'Prof.', full_name: 'Funmilayo Alade', contact_email: 'f.alade@university.example', arrival_mode: 'flying', airline: 'British Airways', flight_number: 'BA75', arrival_time: '10:40' },
  },
  {
    category: 'Dignitary',
    dayOffset: 0,
    fields: {
      title: 'Hon.',
      full_name: 'Ibrahim Bello',
      contact_phone: '+2348035550142',
      arrival_mode: 'own_transport',
      arrival_time: '15:00',
      party: [
        { name: 'Aisha Bello', role: 'family', dietary: '', accessibility: '' },
        { name: '', role: 'assistant', dietary: '', accessibility: '' },
        { name: '', role: 'security', dietary: '', accessibility: '' },
        { name: '', role: 'security', dietary: '', accessibility: '' },
      ],
    },
  },
  {
    category: 'Dignitary',
    dayOffset: 0,
    fields: {
      title: 'Dr',
      full_name: 'Ngozi Eze',
      contact_email: 'n.eze@clinic.example',
      arrival_mode: 'pickup',
      pickup_address: 'Victoria Island, Lagos',
      arrival_time: '16:30',
      accessibility: 'Uses a walking stick; ground floor preferred',
      party: [{ name: 'Chidi Eze', role: 'family', dietary: '', accessibility: '' }],
    },
  },
  {
    category: 'Head of State / Minister',
    dayOffset: 1,
    fields: { title: 'H.E.', full_name: 'Amina Yusuf', organisation: 'Ministry of Culture', contact_email: 'protocol@culture.example', arrival_mode: 'flying', airline: 'Air Peace', flight_number: 'P47121', arrival_time: '09:20', party: [{ name: '', role: 'security', dietary: '', accessibility: '' }] },
  },
]

const QUEUED_FORMS: readonly { readonly fields: Partial<IntakeFields>; readonly dayOffset: number }[] = [
  // Likely duplicate of Hon. Ibrahim Bello: similar name, same day, a different contact.
  { dayOffset: 0, fields: { title: 'Hon.', full_name: 'Ibrahim Belo', contact_email: 'bello.office@example.com', arrival_mode: 'own_transport', arrival_time: '14:30', dietary: 'Halal', party: Array.from({ length: 5 }, () => ({ name: '', role: 'other' as const, dietary: '', accessibility: '' })) } },
  // A clean form, but its note needs a person: an allergy and someone who may join later.
  { dayOffset: 1, fields: { title: 'Pastor', full_name: 'Daniel Kwarteng', contact_email: 'd.kwarteng@church.example', arrival_mode: 'flying', airline: 'Africa World Airlines', flight_number: 'AW312', arrival_time: '12:50', others: 'He is allergic to peanuts. His wife may join him on Friday.' } },
]

const PASTED_MESSAGE =
  'Good morning. Bishop Okafor arrives Wed on EK783 with his wife, his chaplain and one security man. Vegetarian meals please. Rev Chidi may also join later but not sure yet. Pls arrange pickup.'

function completeForm(fields: Partial<IntakeFields>, arrivalDate: string, departureDate: string): IntakeFields {
  return intakeFieldsSchema.parse({ ...DEFAULT_CONTACT, departure_date: departureDate, arrival_date: arrivalDate, ...fields })
}

function readNote(fields: IntakeFields): Extraction {
  if (!fields.others) return EMPTY_EXTRACTION
  const preview = normalizeIntake(fields, 'UTC')
  return { items: extractWithRules(fields.others, { flight_number: preview.flight_number, party_size: preview.party.length }), method: 'rules', model: 'rules' }
}

export interface GuestSeedResult {
  readonly delegations: number
  readonly queued: number
}

export async function seedGuests(db: Kysely<DB>, startsOn: string, endsOn: string): Promise<GuestSeedResult> {
  return db.transaction().execute(async (tx) => {
    await sql`select private.set_audit_context(p_actor_type => 'system', p_action => 'seed', p_undoable => false)`.execute(tx)
    const event = await loadEvent(tx)
    if (!event) throw new Error('Seed the venue first')
    const categories = new Map((await tx.selectFrom('vip_categories').select(['id', 'name']).execute()).map((row) => [row.name, row.id]))

    for (const demo of DELEGATIONS) {
      const fields = completeForm(demo.fields, addDays(startsOn, demo.dayOffset), endsOn)
      const intake = normalizeIntake(fields, event.timezone)
      await createDelegationRecords(tx, intake, EMPTY_EXTRACTION, { event, submission_id: null, vip_category_id: categories.get(demo.category) ?? null })
    }

    const draft = draftFromMessageWithRules(PASTED_MESSAGE, Number(startsOn.slice(0, 4)))
    const queued = [
      ...QUEUED_FORMS.map((item) => {
        const fields = completeForm(item.fields, addDays(startsOn, item.dayOffset), endsOn)
        return { source: 'form' as const, payload: fields, fields, extraction: readNote(fields) }
      }),
      { source: 'pasted_message' as const, payload: { text: PASTED_MESSAGE }, fields: intakeFieldsSchema.parse(draft.fields), extraction: { items: draft.items, method: 'rules' as const, model: 'rules' } },
    ]
    for (const [index, item] of queued.entries()) {
      const assessment = await assessIntake(tx, item.fields, item.extraction, event)
      await tx
        .insertInto('intake_submissions')
        .values({
          reference_code: `VIP-DEM${index + 1}`,
          source: item.source,
          payload: jsonb(item.payload),
          normalized: jsonb(item.fields),
          ...extractionColumns(item.extraction),
          issues: jsonb(assessment.issues),
          duplicate_kind: assessment.duplicate.kind,
          matched_delegation_id: assessment.duplicate.delegation_id,
          is_high_confidence: assessment.high_confidence,
          status: 'needs_review',
        })
        .execute()
    }
    return { delegations: DELEGATIONS.length, queued: queued.length }
  })
}
