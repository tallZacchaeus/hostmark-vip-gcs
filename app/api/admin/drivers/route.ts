// Drivers. GET supports ?active=true|false. A signed-in driver sees only their own record.
import { driverRoutes } from '@/lib/resources/drivers'

export const GET = driverRoutes.list
export const POST = driverRoutes.create
