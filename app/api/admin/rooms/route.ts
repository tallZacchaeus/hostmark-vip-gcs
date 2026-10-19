// Rooms. GET supports ?floor=, ?wing= and ?room_type_id= filters plus ?page=&limit=.
import { roomRoutes } from '@/lib/resources/venue'

export const GET = roomRoutes.list
export const POST = roomRoutes.create
