// VIP categories, ordered by rank (1 = highest). Coordinators edit; the programs team reads.
import { vipCategoryRoutes } from '@/lib/resources/vip-categories'

export const GET = vipCategoryRoutes.list
export const POST = vipCategoryRoutes.create
