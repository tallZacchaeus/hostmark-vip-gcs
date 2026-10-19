// Creates the first Super Admin (there is no public sign-up):
//   pnpm admin:create --email you@example.com --name "Your Name"
// Prints a temporary password once; it must be changed at first sign-in.
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { getAuth } from '@/lib/auth/auth'
import { closeDatabase } from '@/lib/db/client'
import { generateTemporaryPassword } from '@/lib/domain/temporary-password'
import { requiredText } from '@/lib/validation/common'

const argsSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Pass a valid --email')),
  name: requiredText(200),
})

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } })
  const { email, name } = argsSchema.parse(values)
  const password = generateTemporaryPassword()
  try {
    await getAuth().api.createUser({ body: { email, password, name, role: 'super_admin' } })
    process.stdout.write(
      `Super Admin ${email} created.\nTemporary password (shown once): ${password}\nSign in and change it straight away.\n`,
    )
  } finally {
    await closeDatabase()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Could not create the Super Admin: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
