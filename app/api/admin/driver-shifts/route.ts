// Driver shifts. GET supports ?driver_id= and an overlap window ?from=&to= (ISO date-times).
import { driverShiftRoutes } from '@/lib/resources/drivers'

export const GET = driverShiftRoutes.list
export const POST = driverShiftRoutes.create
