// Line icons from the Hostmark design (20×20 grid, 1.75 stroke). Decorative by default:
// buttons that show only an icon must carry their own aria-label.
import type { ReactNode } from 'react'

export type IconName =
  | 'accessibility' | 'activity' | 'alert' | 'arrow' | 'bed' | 'bell' | 'brush' | 'calendar' | 'calendarClock'
  | 'clipboard' | 'coffee' | 'car' | 'check' | 'chevron' | 'clock' | 'close' | 'copy' | 'dashboard' | 'door'
  | 'edit' | 'eye' | 'eyeOff' | 'file' | 'flask' | 'inbox' | 'info' | 'link' | 'loader' | 'logIn' | 'logOut'
  | 'menu' | 'message' | 'mic' | 'minus' | 'navigation' | 'packageX' | 'phone' | 'pin' | 'plane' | 'play'
  | 'pointer' | 'plus' | 'repeat' | 'rooms' | 'search' | 'searchX' | 'settings' | 'shield' | 'sparkle' | 'spray'
  | 'split' | 'swap' | 'trash' | 'upload' | 'user' | 'userPlus' | 'users' | 'wifiOff' | 'wrench' | 'x'

const ICON_PATHS: Readonly<Record<IconName, ReactNode>> = {
  accessibility: <><circle cx="10" cy="3.5" r="1.5" /><path d="M4 7h12M10 6v5m0 0-4 6m4-6 4 6M7 9l3 2 3-2" /></>,
  activity: <path d="M2 10h3l2-5 4 10 2-5h5" />,
  alert: <><path d="M10 3 2.5 17h15L10 3Z" /><path d="M10 8v4M10 15h.01" /></>,
  arrow: <><path d="m8 5 5 5-5 5" /><path d="M3 10h10" /></>,
  bed: <path d="M3 17V5M17 17v-6H3M6 11V7h5a3 3 0 0 1 3 3v1M3 15h14" />,
  bell: <><path d="M15 8a5 5 0 0 0-10 0c0 6-2 6-2 6h14s-2 0-2-6" /><path d="M8 17h4" /></>,
  brush: <><path d="m13 3 4 4-7 7-4-4z" /><path d="M7 12c-3 0-4 2-4 5 3 0 5-1 5-4" /></>,
  calendar: <><rect x="3" y="4" width="14" height="13" rx="2" /><path d="M6 2v4m8-4v4M3 8h14" /></>,
  calendarClock: <><rect x="2" y="4" width="13" height="12" rx="2" /><path d="M5 2v4m7-4v4M2 8h13" /><circle cx="14" cy="14" r="4" /><path d="M14 12v2l1.5 1" /></>,
  clipboard: <><rect x="4" y="4" width="12" height="14" rx="2" /><path d="M7 4V2h6v2M8 9h6M8 13h4" /></>,
  coffee: <><path d="M3 7h11v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z" /><path d="M14 9h2a2 2 0 0 1 0 4h-2M6 3v2m4-2v2" /></>,
  car: <><path d="m4 14-1-3 2-5h10l2 5-1 3" /><path d="M3 11h14v5H3zM6 16v2m8-2v2M6 13h.01m8 0h.01" /></>,
  check: <path d="m4 10 4 4 8-8" />,
  chevron: <path d="m7 8 3 3 3-3" />,
  clock: <><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>,
  close: <path d="m5 5 10 10M15 5 5 15" />,
  copy: <><rect x="7" y="6" width="10" height="11" rx="2" /><path d="M13 6V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  dashboard: <><rect x="2" y="2" width="6" height="6" rx="1" /><rect x="12" y="2" width="6" height="6" rx="1" /><rect x="2" y="12" width="6" height="6" rx="1" /><rect x="12" y="12" width="6" height="6" rx="1" /></>,
  door: <><path d="M4 18V3h11v15M4 18h13" /><path d="M8 6h4v12H8zM10 12h.01" /></>,
  edit: <><path d="m13 3 4 4L7 17H3v-4z" /><path d="m11 5 4 4" /></>,
  eye: <><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" /><circle cx="10" cy="10" r="2" /></>,
  eyeOff: <path d="m3 3 14 14M8.5 5.2A8 8 0 0 1 10 5c5 0 8 5 8 5a13 13 0 0 1-2.2 2.7M6 6.3C3.4 7.7 2 10 2 10s3 5 8 5a8 8 0 0 0 2-.3" />,
  file: <><path d="M5 2h7l4 4v12H5z" /><path d="M12 2v5h5M8 11h5M8 14h5" /></>,
  flask: <><path d="M7 2h6M8 2v6l-5 8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2l-5-8V2" /><path d="M6 13h8" /></>,
  inbox: <><path d="M3 4h14v12H3z" /><path d="M3 11h4l2 2h2l2-2h4" /></>,
  info: <><circle cx="10" cy="10" r="8" /><path d="M10 9v5M10 6h.01" /></>,
  link: <><path d="M8 12 6 14a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0" /><path d="m12 8 2-2a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0M7 10h6" /></>,
  loader: <path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.3 4.3l2.1 2.1M13.6 13.6l2.1 2.1M15.7 4.3l-2.1 2.1M6.4 13.6l-2.1 2.1" />,
  logIn: <><path d="M11 3h5v14h-5" /><path d="M3 10h10m-3-3 3 3-3 3" /></>,
  logOut: <><path d="M9 3H4v14h5" /><path d="M17 10H7m3-3-3 3 3 3" /></>,
  menu: <path d="M3 5h14M3 10h14M3 15h14" />,
  message: <path d="M3 3h14v11H8l-5 4z" />,
  mic: <><rect x="7" y="2" width="6" height="11" rx="3" /><path d="M4 9a6 6 0 0 0 12 0M10 15v3M7 18h6" /></>,
  minus: <><circle cx="10" cy="10" r="7" /><path d="M6 10h8" /></>,
  navigation: <path d="m4 9 12-5-5 12-2-5z" />,
  packageX: <><path d="m3 6 7-4 7 4v8l-7 4-7-4z" /><path d="m3 6 7 4 7-4M10 10v8M13 11l4 4m0-4-4 4" /></>,
  phone: <path d="M5 3 8 7 6 9c1 2 3 4 5 5l2-2 4 3-1 3c-7 0-14-7-14-14z" />,
  pin: <><path d="M16 8c0 5-6 10-6 10S4 13 4 8a6 6 0 1 1 12 0Z" /><circle cx="10" cy="8" r="2" /></>,
  plane: <><path d="M17 16 3 11V8l14-4v3l-5 3 5 3z" /><path d="M8 9 6 4h3l3 5M8 11l-2 5h3l3-5" /></>,
  play: <path d="m7 4 9 6-9 6z" />,
  pointer: <path d="M6 2v10l3-3 3 7 2-1-3-7h5z" />,
  plus: <path d="M10 3v14M3 10h14" />,
  repeat: <><path d="m14 3 3 3-3 3" /><path d="M3 9V8a2 2 0 0 1 2-2h12M6 17l-3-3 3-3" /><path d="M17 11v1a2 2 0 0 1-2 2H3" /></>,
  rooms: <path d="M4 18V3h12v15M2 18h16M7 7h2m2 0h2M7 11h2m2 0h2" />,
  search: <><circle cx="9" cy="9" r="6" /><path d="m14 14 4 4" /></>,
  searchX: <><circle cx="8" cy="8" r="5" /><path d="m12 12 5 5M6 6l4 4m0-4-4 4" /></>,
  settings: <><circle cx="10" cy="10" r="3" /><path d="M10 2v2m0 12v2M2 10h2m12 0h2M4.3 4.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4" /></>,
  shield: <><path d="M10 2 17 5v5c0 4-3 7-7 8-4-1-7-4-7-8V5z" /><path d="m7 10 2 2 4-4" /></>,
  sparkle: <><path d="m10 2 1.3 4.7L16 8l-4.7 1.3L10 14l-1.3-4.7L4 8l4.7-1.3z" /><path d="m16 14 .5 1.5L18 16l-1.5.5L16 18l-.5-1.5L14 16l1.5-.5z" /></>,
  spray: <path d="M7 6h6l2 3v9H5V9zM8 6V3h5M13 3l3 1M17 5h1" />,
  split: <><path d="M5 3v4a3 3 0 0 0 3 3h4a3 3 0 0 1 3 3v4" /><path d="m12 14 3 3 3-3M15 3v3" /></>,
  swap: <path d="M3 6h13m-3-3 3 3-3 3M17 14H4m3 3-3-3 3-3" />,
  trash: <><path d="M3 5h14M8 5V3h4v2M5 5l1 13h8l1-13" /><path d="M8 9v6m4-6v6" /></>,
  upload: <><path d="M10 13V3m-4 4 4-4 4 4" /><path d="M3 13v4h14v-4" /></>,
  user: <><circle cx="10" cy="6" r="3" /><path d="M4 18c0-4 2-6 6-6s6 2 6 6" /></>,
  userPlus: <><circle cx="8" cy="6" r="3" /><path d="M2 18c0-4 2-6 6-6 2 0 3.5.5 4.5 1.5M15 9v6m-3-3h6" /></>,
  users: <><circle cx="8" cy="7" r="3" /><path d="M2 18c0-4 2-6 6-6s6 2 6 6M14 5c2 0 3 1 3 3s-1 3-3 3m2 2c2 .5 3 2 3 5" /></>,
  wifiOff: <path d="m3 3 14 14M4 8a10 10 0 0 1 10-2M6 12a6 6 0 0 1 5-2m-2 5a2 2 0 0 1 2 0M16 9a10 10 0 0 1 1 1" />,
  wrench: <path d="M12 4a4 4 0 0 0-5 5L3 13a2 2 0 0 0 3 3l4-4a4 4 0 0 0 5-5l-3 3-2-2z" />,
  x: <path d="m5 5 10 10M15 5 5 15" />,
}

interface IconProps {
  readonly name: IconName
  readonly size?: number
}

export function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
