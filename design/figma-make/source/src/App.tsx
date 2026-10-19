import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type IconName =
  | "accessibility" | "activity" | "alert" | "arrow" | "bed" | "bell" | "brush" | "calendar" | "calendarClock" | "clipboard" | "coffee"
  | "car" | "check" | "chevron" | "clock" | "close" | "copy" | "dashboard"
  | "door" | "edit" | "eye" | "eyeOff" | "file" | "flask" | "inbox" | "info" | "link" | "loader" | "logIn" | "logOut" | "menu" | "message" | "mic" | "minus" | "navigation" | "packageX" | "phone" | "pin" | "plane" | "play" | "pointer"
  | "plus" | "repeat" | "rooms" | "search" | "searchX" | "settings" | "shield" | "sparkle" | "spray"
  | "split" | "swap" | "user" | "userPlus" | "users" | "wifiOff" | "wrench" | "x";

const iconPaths: Record<IconName, ReactNode> = {
  accessibility: <><circle cx="10" cy="3.5" r="1.5"/><path d="M4 7h12M10 6v5m0 0-4 6m4-6 4 6M7 9l3 2 3-2"/></>,
  activity: <path d="M2 10h3l2-5 4 10 2-5h5"/>,
  alert: <><path d="M10 3 2.5 17h15L10 3Z"/><path d="M10 8v4M10 15h.01"/></>,
  arrow: <><path d="m8 5 5 5-5 5"/><path d="M3 10h10"/></>,
  bed: <><path d="M3 17V5M17 17v-6H3M6 11V7h5a3 3 0 0 1 3 3v1M3 15h14"/></>,
  bell: <><path d="M15 8a5 5 0 0 0-10 0c0 6-2 6-2 6h14s-2 0-2-6"/><path d="M8 17h4"/></>,
  brush: <><path d="m13 3 4 4-7 7-4-4z"/><path d="M7 12c-3 0-4 2-4 5 3 0 5-1 5-4"/></>,
  calendar: <><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M6 2v4m8-4v4M3 8h14"/></>,
  calendarClock: <><rect x="2" y="4" width="13" height="12" rx="2"/><path d="M5 2v4m7-4v4M2 8h13"/><circle cx="14" cy="14" r="4"/><path d="M14 12v2l1.5 1"/></>,
  clipboard: <><rect x="4" y="4" width="12" height="14" rx="2"/><path d="M7 4V2h6v2M8 9h6M8 13h4"/></>,
  coffee: <><path d="M3 7h11v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M14 9h2a2 2 0 0 1 0 4h-2M6 3v2m4-2v2"/></>,
  car: <><path d="m4 14-1-3 2-5h10l2 5-1 3"/><path d="M3 11h14v5H3zM6 16v2m8-2v2M6 13h.01m8 0h.01"/></>,
  check: <path d="m4 10 4 4 8-8"/>,
  chevron: <path d="m7 8 3 3 3-3"/>,
  clock: <><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></>,
  close: <path d="m5 5 10 10M15 5 5 15"/>,
  copy: <><rect x="7" y="6" width="10" height="11" rx="2"/><path d="M13 6V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  dashboard: <><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="12" y="2" width="6" height="6" rx="1"/><rect x="2" y="12" width="6" height="6" rx="1"/><rect x="12" y="12" width="6" height="6" rx="1"/></>,
  door: <><path d="M4 18V3h11v15M4 18h13"/><path d="M8 6h4v12H8zM10 12h.01"/></>,
  edit: <><path d="m13 3 4 4L7 17H3v-4z"/><path d="m11 5 4 4"/></>,
  eye: <><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2"/></>,
  eyeOff: <><path d="m3 3 14 14M8.5 5.2A8 8 0 0 1 10 5c5 0 8 5 8 5a13 13 0 0 1-2.2 2.7M6 6.3C3.4 7.7 2 10 2 10s3 5 8 5a8 8 0 0 0 2-.3"/></>,
  file: <><path d="M5 2h7l4 4v12H5z"/><path d="M12 2v5h5M8 11h5M8 14h5"/></>,
  flask: <><path d="M7 2h6M8 2v6l-5 8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2l-5-8V2"/><path d="M6 13h8"/></>,
  inbox: <><path d="M3 4h14v12H3z"/><path d="M3 11h4l2 2h2l2-2h4"/></>,
  info: <><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 6h.01"/></>,
  link: <><path d="M8 12 6 14a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0"/><path d="m12 8 2-2a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0M7 10h6"/></>,
  loader: <><path d="M10 2v3M10 15v3M2 10h3M15 10h3M4.3 4.3l2.1 2.1M13.6 13.6l2.1 2.1M15.7 4.3l-2.1 2.1M6.4 13.6l-2.1 2.1"/></>,
  logIn: <><path d="M11 3h5v14h-5"/><path d="M3 10h10m-3-3 3 3-3 3"/></>,
  logOut: <><path d="M9 3H4v14h5"/><path d="M17 10H7m3-3-3 3 3 3"/></>,
  menu: <path d="M3 5h14M3 10h14M3 15h14"/>,
  message: <path d="M3 3h14v11H8l-5 4z"/>,
  mic: <><rect x="7" y="2" width="6" height="11" rx="3"/><path d="M4 9a6 6 0 0 0 12 0M10 15v3M7 18h6"/></>,
  minus: <><circle cx="10" cy="10" r="7"/><path d="M6 10h8"/></>,
  navigation: <path d="m4 9 12-5-5 12-2-5z"/>,
  packageX: <><path d="m3 6 7-4 7 4v8l-7 4-7-4z"/><path d="m3 6 7 4 7-4M10 10v8M13 11l4 4m0-4-4 4"/></>,
  phone: <path d="M5 3 8 7 6 9c1 2 3 4 5 5l2-2 4 3-1 3c-7 0-14-7-14-14z"/>,
  pin: <><path d="M16 8c0 5-6 10-6 10S4 13 4 8a6 6 0 1 1 12 0Z"/><circle cx="10" cy="8" r="2"/></>,
  plane: <><path d="M17 16 3 11V8l14-4v3l-5 3 5 3z"/><path d="M8 9 6 4h3l3 5M8 11l-2 5h3l3-5"/></>,
  play: <path d="m7 4 9 6-9 6z"/>,
  pointer: <><path d="M6 2v10l3-3 3 7 2-1-3-7h5z"/></>,
  plus: <path d="M10 3v14M3 10h14"/>,
  repeat: <><path d="m14 3 3 3-3 3"/><path d="M3 9V8a2 2 0 0 1 2-2h12M6 17l-3-3 3-3"/><path d="M17 11v1a2 2 0 0 1-2 2H3"/></>,
  rooms: <><path d="M4 18V3h12v15M2 18h16M7 7h2m2 0h2M7 11h2m2 0h2"/></>,
  search: <><circle cx="9" cy="9" r="6"/><path d="m14 14 4 4"/></>,
  searchX: <><circle cx="8" cy="8" r="5"/><path d="m12 12 5 5M6 6l4 4m0-4-4 4"/></>,
  settings: <><circle cx="10" cy="10" r="3"/><path d="M10 2v2m0 12v2M2 10h2m12 0h2M4.3 4.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4"/></>,
  shield: <><path d="M10 2 17 5v5c0 4-3 7-7 8-4-1-7-4-7-8V5z"/><path d="m7 10 2 2 4-4"/></>,
  sparkle: <><path d="m10 2 1.3 4.7L16 8l-4.7 1.3L10 14l-1.3-4.7L4 8l4.7-1.3z"/><path d="m16 14 .5 1.5L18 16l-1.5.5L16 18l-.5-1.5L14 16l1.5-.5z"/></>,
  spray: <><path d="M7 6h6l2 3v9H5V9zM8 6V3h5M13 3l3 1M17 5h1"/></>,
  split: <><path d="M5 3v4a3 3 0 0 0 3 3h4a3 3 0 0 1 3 3v4"/><path d="m12 14 3 3 3-3M15 3v3"/></>,
  swap: <><path d="M3 6h13m-3-3 3 3-3 3M17 14H4m3 3-3-3 3-3"/></>,
  user: <><circle cx="10" cy="6" r="3"/><path d="M4 18c0-4 2-6 6-6s6 2 6 6"/></>,
  userPlus: <><circle cx="8" cy="6" r="3"/><path d="M2 18c0-4 2-6 6-6 2 0 3.5.5 4.5 1.5M15 9v6m-3-3h6"/></>,
  users: <><circle cx="8" cy="7" r="3"/><path d="M2 18c0-4 2-6 6-6s6 2 6 6M14 5c2 0 3 1 3 3s-1 3-3 3m2 2c2 .5 3 2 3 5"/></>,
  wifiOff: <><path d="m3 3 14 14M4 8a10 10 0 0 1 10-2M6 12a6 6 0 0 1 5-2m-2 5a2 2 0 0 1 2 0M16 9a10 10 0 0 1 1 1"/></>,
  wrench: <><path d="M12 4a4 4 0 0 0-5 5L3 13a2 2 0 0 0 3 3l4-4a4 4 0 0 0 5-5l-3 3-2-2z"/></>,
  x: <path d="m5 5 10 10M15 5 5 15"/>,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

type Mode = "default" | "loading" | "caught" | "error";
type Tone = "warning" | "error" | "success" | "info";

function Button({ children, kind = "secondary", onClick, icon, className = "", disabled }: { children: ReactNode; kind?: "primary" | "approve" | "secondary" | "ghost"; onClick?: () => void; icon?: IconName; className?: string; disabled?: boolean }) {
  return <button className={`hm-button hm-button--${kind} ${className}`} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon}/>}<span>{children}</span></button>;
}

function StatusChip({ children, tone, icon }: { children: ReactNode; tone: Tone; icon?: IconName }) {
  return <span className={`status-chip status-chip--${tone}`}>{icon && <Icon name={icon} size={14}/>}<span>{children}</span></span>;
}

function SuggestedChip() {
  return <span className="suggested-chip"><Icon name="sparkle" size={13}/>Suggested</span>;
}

function SearchField() {
  const [value, setValue] = useState("");
  return <div className="search-wrap"><label className="search-field-v4"><Icon name="search" size={18}/><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Search guest, flight, room, or task..."/><kbd>⌘ K</kbd></label>{value && <div className="search-popover"><small>Search results</small><button><b>Bishop Augustine Okafor</b><span>Guest · Cat. 1</span></button><button><b>EK783</b><span>Flight · Delayed</span></button><button><b>Room 412</b><span>Ready · Proposed</span></button></div>}</div>;
}

const primaryNav: { label: string; icon: IconName; count?: number }[] = [
  { label: "Dashboard", icon: "dashboard" },
  { label: "Programme", icon: "calendar" },
  { label: "Guests", icon: "users" },
  { label: "Intake", icon: "inbox", count: 2 },
  { label: "Arrivals", icon: "plane" },
  { label: "Transport", icon: "car" },
  { label: "Rooms", icon: "bed" },
  { label: "Sanitation", icon: "spray" },
];
const secondaryNav: { label: string; icon: IconName }[] = [
  { label: "Activity", icon: "activity" },
  { label: "Simulation", icon: "flask" },
  { label: "Settings", icon: "settings" },
];

function SidebarItem({ label, icon, active, count, onClick }: { label: string; icon: IconName; active?: boolean; count?: number; onClick?: () => void }) {
  return <button className={`sidebar-item ${active ? "is-active" : ""}`} onClick={onClick}><Icon name={icon}/><span>{label}</span>{count ? <b>{count}</b> : null}</button>;
}

type Route = "dashboard" | "programme" | "guests" | "profile" | "intake" | "review" | "arrivals" | "transport" | "rooms" | "allocation" | "sanitation" | "activity" | "simulation" | "settings" | "registration" | "confirmation" | "driver" | "frontDesk" | "staffSanitation" | "signIn";

function Sidebar({ open, close, mode, route, navigate, unavailable, intakeCount }: { open: boolean; close: () => void; mode: Mode; route: Route; navigate: (route: Route) => void; unavailable: () => void; intakeCount: number }) {
  const navigationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      navigationRef.current?.querySelector(".sidebar-item.is-active")?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [route]);

  return <>
    <aside className={`sidebar-v4 ${open ? "is-open" : ""}`}>
      <div className="sidebar-brand"><img src="/hostmark-logo-C.svg" alt="Hostmark logo mark"/><div><b><span>Host</span>mark</b><small>Guest coordination</small></div></div>
      <div className="sidebar-navigation" ref={navigationRef}>
        <nav>{primaryNav.map((item) => {
          const itemRoute = item.label === "Dashboard" ? "dashboard" : item.label === "Programme" ? "programme" : item.label === "Guests" ? "guests" : item.label === "Intake" ? "intake" : item.label === "Arrivals" ? "arrivals" : item.label === "Transport" ? "transport" : item.label === "Rooms" ? "rooms" : item.label === "Sanitation" ? "sanitation" : null;
          return <SidebarItem key={item.label} {...item} active={itemRoute === route || (itemRoute === "guests" && route === "profile") || (itemRoute === "intake" && route === "review") || (itemRoute === "rooms" && route === "allocation")} count={item.label === "Intake" ? intakeCount || undefined : item.count} onClick={() => { if (itemRoute) navigate(itemRoute); else unavailable(); close(); }}/>;
        })}</nav>
        <div className="sidebar-divider"/>
        <nav>{secondaryNav.map((item) => {
          const itemRoute = item.label === "Activity" ? "activity" : item.label === "Simulation" ? "simulation" : item.label === "Settings" ? "settings" : null;
          return <SidebarItem key={item.label} {...item} active={itemRoute === route} onClick={() => { if (itemRoute) navigate(itemRoute); else unavailable(); close(); }}/>;
        })}</nav>
      </div>
      <div className="sidebar-footer">
        <section className="event-card-v4">
          <div className="event-thumb"/>
          <div><b>Lagos Leadership Summit 2026</b><p>Harbour Point Hotel & Conference Centre, Lagos</p></div>
          <span><Icon name="calendar" size={16}/>Wed, 28 Oct 2026</span>
          <span><Icon name="clock" size={16}/>11:20</span>
        </section>
        <div className="sidebar-user"><span>AN</span><div><b>Ada Nwosu</b><small>Event Coordinator</small></div><Icon name="chevron" size={16}/></div>
      </div>
    </aside>
    {open && <button className="sidebar-backdrop" aria-label="Close menu" onClick={close}/>}
  </>;
}

function TopBar({ openMenu, openCopilot, openNotifications, notificationDot, signOut }: { openMenu: () => void; openCopilot: () => void; openNotifications: () => void; notificationDot: boolean; signOut: () => void }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  useEffect(() => {
    const close = () => setUserMenuOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return <header className="topbar-v4">
    <button className="menu-button" aria-label="Open menu" onClick={openMenu}><Icon name="menu"/></button>
    <SearchField/>
    <div className="topbar-actions">
      <button className="event-switcher"><Icon name="calendar" size={17}/><span>Lagos Leadership Summit 2026</span><Icon name="chevron" size={14}/></button>
      <span className="topbar-time"><Icon name="clock" size={17}/>11:20 · Wed, 28 Oct 2026</span>
      <Button icon="sparkle" onClick={openCopilot}>Ask Co-Pilot</Button>
      <button className="icon-button-v4" aria-label="Notifications" onClick={openNotifications}><Icon name="bell"/>{notificationDot && <i/>}</button>
      <div className="topbar-user-menu" onClick={(event) => event.stopPropagation()}><button className="avatar-button" onClick={() => setUserMenuOpen((open) => !open)}>AN</button><Icon name="chevron" size={14}/>{userMenuOpen && <div><button onClick={signOut}><Icon name="logOut" size={17}/>Sign out</button></div>}</div>
    </div>
  </header>;
}

function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton ${className}`}/>;
}

function StatTile({ tone, icon, number, label, helper, onClick }: { tone: string; icon: IconName; number: string | number; label: string; helper: string; onClick: () => void }) {
  return <button className={`stat-tile stat-tile--${tone}`} onClick={onClick}><span className="stat-icon"><Icon name={icon}/></span><span className="stat-copy"><b>{number}</b><strong>{label}</strong></span><span className="stat-arrow"><Icon name="arrow" size={16}/></span><small>{helper}</small></button>;
}

function LoadingStat() {
  return <div className="stat-tile stat-tile--loading"><Skeleton className="sk-circle"/><Skeleton className="sk-number"/><Skeleton className="sk-label"/><Skeleton className="sk-helper"/></div>;
}

const approvals = [
  { id: "driver", icon: "repeat" as IconName, title: "Reassign EK783 pickup to Sule Abdullahi", guest: "Bishop Augustine Okafor", category: "Cat. 1", reason: "The flight is 45 minutes late and Emeka Oladipo is busy until 14:40.", changes: "pickup moves to 14:55.", time: "11:18" },
  { id: "rooms", icon: "bed" as IconName, title: "Approve room plan for 18 guests", guest: "Overall satisfaction 92%. 2 rooms have warnings.", reason: "", changes: "Bishop Okafor is proposed for room 412.", time: "11:05", plan: true },
  { id: "release", icon: "x" as IconName, title: "Release pickup for flight AW312", guest: "Pastor Daniel Kwarteng", category: "Cat. 3", reason: "The flight was cancelled.", changes: "the driver and vehicle return to the available pool.", time: "10:48" },
  { id: "assign", icon: "car" as IconName, title: "Assign a driver for Dr. Ngozi Eze", guest: "Pickup 16:30, Victoria Island", category: "Cat. 2", reason: "Kunle Balogun is free from 15:30 to 19:00.", changes: "the pickup stops needing a driver.", time: "10:30" },
];

function ApprovalRow({ item, approved, approve, review }: { item: typeof approvals[number]; approved: boolean; approve: () => void; review: () => void }) {
  return <div className={`approval-row ${approved ? "is-approved" : ""}`}>
    <span className="approval-icon"><Icon name={approved ? "check" : item.icon}/></span>
    <div className="approval-body">
      <div className="approval-heading"><b>{item.title}</b>{!approved && <SuggestedChip/>}</div>
      {approved ? <p className="approved-copy">Approved by Ada Nwosu · <span>11:21</span></p> : <>
        <div className="approval-guest"><strong>{item.guest}</strong>{item.category && <span>{item.category}</span>}</div>
        {item.reason && <p>{item.reason}</p>}
        <small>What else changes: {item.changes}</small>
      </>}
    </div>
    {!approved && <div className="approval-actions"><time>{item.time}</time>{item.plan ? <Button kind="approve" onClick={review}>Review plan</Button> : <div><Button kind="approve" onClick={approve}>Approve</Button><Button kind="ghost" onClick={review}>Review</Button></div>}</div>}
  </div>;
}

function TimelineStep({ icon, time, title, subtitle, tone, chip }: { icon: IconName; time: string; title: string; subtitle: string; tone: Tone | "suggested"; chip: string }) {
  return <div className="timeline-step"><span className={`timeline-icon timeline-icon--${tone}`}><Icon name={icon}/></span><div><time>{time}</time><b>{title}</b><small>{subtitle}</small>{tone === "suggested" ? <span className="suggested-chip"><Icon name="sparkle" size={13}/>{chip}</span> : <StatusChip tone={tone}>{chip}</StatusChip>}</div></div>;
}

function AutoTag() {
  return <span className="auto-tag">AUTO</span>;
}

function ActivityRow({ icon, text, time, automatic, undone, undo }: { icon: IconName; text: string; time: string; automatic?: boolean; undone?: boolean; undo?: () => void }) {
  return <div className={`activity-row-v4 ${undone ? "is-undone" : ""}`}><span className="activity-icon-v4"><Icon name={icon}/></span><div><b>{text}</b>{automatic && <small><AutoTag/>{undone ? <span>Undone</span> : <button onClick={undo}>Undo</button>}</small>}</div><time>{time}</time></div>;
}

function QuickAction({ icon, tone, title, helper, onClick }: { icon: IconName; tone: string; title: string; helper: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span className={`quick-icon quick-icon--${tone}`}><Icon name={icon}/></span><b>{title}</b><small>{helper}</small></button>;
}

function StateSwitch({ mode, setMode }: { mode: Mode; setMode: (mode: Mode) => void }) {
  return <div className="state-switch" aria-label="Preview state"><span>Preview</span>{(["default", "loading", "caught", "error"] as Mode[]).map((item) => <button className={mode === item ? "is-active" : ""} key={item} onClick={() => setMode(item)}>{item === "caught" ? "All caught up" : item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function Dashboard({ mode, setMode, navigate, openIntakeDrawer }: { mode: Mode; setMode: (mode: Mode) => void; navigate: (route: Route) => void; openIntakeDrawer: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [undone, setUndone] = useState<string[]>([]);
  const count = mode === "caught" ? 0 : 4 - approvedIds.length;
  const ordered = useMemo(() => [...approvals].sort((a, b) => Number(approvedIds.includes(a.id)) - Number(approvedIds.includes(b.id))), [approvedIds]);
  const unresolved = ordered.filter((item) => !approvedIds.includes(item.id));
  const approvedItems = ordered.filter((item) => approvedIds.includes(item.id));
  const visible = expanded ? ordered : [...unresolved.slice(0, 2), ...approvedItems];
  const approve = (id: string) => { setApprovedIds((items) => [...items, id]); setToast(id); };
  const undoApproval = () => { if (toast) setApprovedIds((items) => items.filter((id) => id !== toast)); setToast(null); };

  return <main className={`dashboard-page ${mode === "loading" ? "is-loading" : ""}`}>
    <section className="hero-v4"><div className="hero-copy"><h1>Good morning, Ada <span aria-hidden="true">👋</span></h1><p>Here's what's happening with your VIP guests today.</p><span className="live-pill"><i/>Live flight data · updated 11:18</span></div><div className="hero-photo" role="img" aria-label="Lagos skyline at golden hour"><span><Icon name="pin" size={15}/>Lagos, Nigeria</span></div></section>
    {mode === "error" && <div className="error-banner"><Icon name="alert"/><span>We couldn't refresh live flight data. Showing the last update at 11:18.</span><Button onClick={() => setMode("default")}>Retry</Button></div>}
    <section className="stats-row">{mode === "loading" ? Array.from({ length: 5 }, (_, index) => <LoadingStat key={index}/>) : <>
      <StatTile tone="guests" icon="users" number="28" label="VIP guests" helper="26 confirmed · 2 need review" onClick={() => navigate("guests")}/>
      <StatTile tone="arrivals" icon="plane" number="6" label="Arrivals today" helper="2 landed · 1 delayed · 1 cancelled · 2 due" onClick={() => navigate("arrivals")}/>
      <StatTile tone="rooms" icon="bed" number="78" label="Rooms ready" helper="4 waiting for sanitation" onClick={() => navigate("rooms")}/>
      <StatTile tone="pickups" icon="car" number="4" label="Pickups today" helper="1 needs a driver" onClick={() => navigate("transport")}/>
      <StatTile tone="approvals" icon="check" number={count} label="Waiting for approval" helper={count ? "Oldest since 10:30" : "Nothing waiting"} onClick={() => document.querySelector(".approvals-card")?.scrollIntoView({ behavior: "smooth" })}/>
    </>}</section>

    <div className="main-grid-v4">
      <div className="main-left">
        {mode === "loading" ? <section className="loading-card alert-loading"><Skeleton className="sk-wide"/><Skeleton className="sk-title"/><Skeleton className="sk-text"/><Skeleton className="sk-text"/><Skeleton className="sk-button"/></section> : mode === "caught" ? <section className="calm-banner"><span><Icon name="check"/></span><div><b>No flight changes.</b><p>Everything is on schedule.</p></div></section> :
        <section className="flight-alert-card">
          <div className="flight-alert-copy"><div className="alert-top"><span><i><Icon name="alert"/></i>FLIGHT DELAYED</span><StatusChip tone="warning">Needs your approval</StatusChip></div><h2>EK783 delayed by 45 minutes</h2><p className="route-line">Dubai → Lagos <i/> 13:40 → 14:25 (new)</p><p className="detected"><Icon name="sparkle" size={15}/>Detected automatically at 11:18 from flight data</p><div className="impact-list"><p><Icon name="car" size={18}/>Pickup moves from 14:10 to 14:55. A driver change is suggested.</p><p><Icon name="calendar" size={18}/>Welcome briefing at 17:00 is at risk. Bishop Okafor is expected at the hotel at 16:55.</p><p className="is-safe"><Icon name="check" size={18}/>Room 412 is ready. No change needed.</p></div><Button kind="primary" onClick={() => document.querySelector(".approvals-card")?.scrollIntoView({ behavior: "smooth" })}>Review the 3 related changes ↓</Button></div>
          <div className="flight-mini-card"><div className="flight-mini-head"><span><Icon name="plane"/></span><div><small>Flight</small><b>EK783</b></div><StatusChip tone="warning">Delayed</StatusChip></div><p>Dubai (DXB) → Lagos (LOS)</p><div className="flight-times"><div><b>14:25</b><small>New arrival</small></div><Icon name="arrow"/><div><s>13:40</s><small>Original</small></div></div></div>
        </section>}

        <section className="card-v4 approvals-card"><header><h2>Waiting for your approval <span>{count}</span></h2></header>{mode === "loading" ? <div className="approval-skeletons">{[0,1].map((item) => <div key={item}><Skeleton className="sk-circle"/><span><Skeleton className="sk-wide"/><Skeleton className="sk-text"/><Skeleton className="sk-text"/></span></div>)}</div> : mode === "caught" ? <div className="empty-state"><span><Icon name="check"/></span><div><b>You're all caught up.</b><p>Nothing is waiting for your approval.</p></div></div> : <>
          <div className="approval-list">{visible.map((item) => <ApprovalRow key={item.id} item={item} approved={approvedIds.includes(item.id)} approve={() => approve(item.id)} review={() => navigate(item.plan ? "allocation" : "transport")}/>)}</div>
          <button className="show-more" onClick={() => setExpanded((value) => !value)}>{expanded ? "Show fewer" : `Show ${Math.max(0, ordered.length - visible.length)} more`}<Icon name="chevron" size={16}/></button>
        </>}</section>

        <section className="card-v4 timeline-card"><header><h2>Today's timeline</h2><button onClick={() => navigate("programme")}>View programme <Icon name="arrow" size={16}/></button></header><div className="timeline-grid"><TimelineStep icon="plane" time="14:25" title="EK783 arrival" subtitle="Bishop Okafor and 3 guests" tone="warning" chip="Delayed 45 min"/><TimelineStep icon="car" time="14:55" title="Airport pickup" subtitle="Emeka Oladipo" tone="suggested" chip="Driver suggested"/><TimelineStep icon="car" time="16:30" title="Dr. Ngozi Eze pickup" subtitle="Victoria Island" tone="error" chip="Needs a driver"/><TimelineStep icon="calendar" time="17:00" title="Welcome briefing" subtitle="Harbour Point Hotel" tone="warning" chip="At risk"/></div></section>
      </div>

      <aside className="main-right">
        <section className="card-v4 glance-card"><header><h2>At a glance</h2><button onClick={() => navigate("dashboard")}>View all</button></header><button onClick={() => navigate("intake")}><span className="glance-icon glance-icon--orange"><Icon name="inbox"/></span><span>Waiting in Intake</span><b>2</b><Icon name="arrow" size={16}/></button><button onClick={() => navigate("programme")}><span className="glance-icon glance-icon--amber"><Icon name="calendar"/></span><span>Programme at risk</span><b>1</b><Icon name="arrow" size={16}/></button><button onClick={() => navigate("sanitation")}><span className="glance-icon glance-icon--blue"><Icon name="spray"/></span><span>Rooms waiting for sanitation</span><b>4</b><Icon name="arrow" size={16}/></button><button onClick={() => navigate("transport")}><span className="glance-icon glance-icon--teal"><Icon name="car"/></span><span>Pickups needing a driver</span><b>1</b><Icon name="arrow" size={16}/></button></section>
        <section className="card-v4 recent-card"><header><h2>Recent activity</h2><button onClick={() => navigate("activity")}>View all</button></header><ActivityRow icon="plane" text="EK783 arrival changed from 13:40 to 14:25" time="11:18" automatic undone={undone.includes("flight")} undo={() => setUndone((items) => [...items, "flight"])}/><ActivityRow icon="clock" text="Pickup time changed from 14:10 to 14:55" time="11:18" automatic undone={undone.includes("pickup")} undo={() => setUndone((items) => [...items, "pickup"])}/><ActivityRow icon="repeat" text="Linked exact duplicate VIP-7K3Q" time="10:58" automatic undone={undone.includes("duplicate")} undo={() => setUndone((items) => [...items, "duplicate"])}/><ActivityRow icon="message" text="Ada Nwosu received a pasted message for Bishop Okafor; sent to Intake" time="10:52"/></section>
      </aside>
    </div>

    <section className="card-v4 quick-card"><header><h2>Quick actions</h2></header><div className="quick-grid"><QuickAction icon="message" tone="blue" title="Paste a message" helper="Send to Intake" onClick={openIntakeDrawer}/><QuickAction icon="plane" tone="green" title="Check arrivals" helper="Flight status" onClick={() => navigate("arrivals")}/><QuickAction icon="bed" tone="orange" title="Manage rooms" helper="Plan & status" onClick={() => navigate("rooms")}/><QuickAction icon="car" tone="teal" title="Assign transport" helper="Drivers & vehicles" onClick={() => navigate("transport")}/><QuickAction icon="calendar" tone="purple" title="View programme" helper="Schedule & venues" onClick={() => navigate("programme")}/></div></section>
    <footer>Demo data. All names are fictional.</footer>
    {toast && <div className="toast-v4"><Icon name="check"/><span>Pickup reassigned to Sule Abdullahi.</span><button onClick={undoApproval}>Undo</button><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
    <StateSwitch mode={mode} setMode={setMode}/>
  </main>;
}

type GuestsMode = "default" | "loading" | "no-results" | "empty" | "error";
type GuestRecord = {
  name: string;
  party?: string;
  category: string;
  arrival: string;
  flight?: string;
  arrivalStatus?: string;
  arrivalTone?: Tone | "neutral";
  arrivalType?: string;
  transport: string;
  transportTone: Tone | "neutral" | "suggested";
  room?: string;
  roomStatus: "Proposed" | "Ready" | "Checked in" | "No room";
  issues: number;
  reference: string;
  today: boolean;
  arrived: boolean;
};

const guestRows: GuestRecord[] = [
  { name: "Prof. Funmilayo Alade", category: "Cat. 2", arrival: "10:40", flight: "BA075", arrivalStatus: "Landed", arrivalTone: "success", transport: "Done", transportTone: "success", room: "305", roomStatus: "Checked in", issues: 0, reference: "VIP-2A7F", today: true, arrived: true },
  { name: "Archbishop Tendai Moyo", party: "+2", category: "Cat. 1", arrival: "11:05", flight: "ET512", arrivalStatus: "Landed", arrivalTone: "success", transport: "In progress", transportTone: "info", room: "612", roomStatus: "Proposed", issues: 0, reference: "VIP-9M2K", today: true, arrived: true },
  { name: "Pastor Daniel Kwarteng", party: "+2", category: "Cat. 3", arrival: "12:50", flight: "AW312", arrivalStatus: "Cancelled", arrivalTone: "error", transport: "Cancelled", transportTone: "error", roomStatus: "No room", issues: 1, reference: "VIP-4D8W", today: true, arrived: false },
  { name: "Bishop Augustine Okafor", party: "+3", category: "Cat. 1", arrival: "14:25", flight: "EK783", arrivalStatus: "Delayed", arrivalTone: "warning", transport: "Reassignment suggested", transportTone: "suggested", room: "412", roomStatus: "Proposed", issues: 2, reference: "VIP-7K3Q", today: true, arrived: false },
  { name: "Hon. Ibrahim Bello", party: "+4", category: "Cat. 2", arrival: "15:00", arrivalType: "Own transport", transport: "Not needed", transportTone: "neutral", room: "508", roomStatus: "Proposed", issues: 1, reference: "VIP-6B1H", today: true, arrived: false },
  { name: "Dr. Ngozi Eze", party: "+1", category: "Cat. 2", arrival: "16:30", arrivalType: "Pickup requested", transport: "Needs a driver", transportTone: "error", room: "302", roomStatus: "Proposed", issues: 1, reference: "VIP-3N5E", today: true, arrived: false },
  { name: "Rt. Rev. Samuel Adeyemi", party: "+2", category: "Cat. 2", arrival: "Thu 29 Oct, 09:15", flight: "KQ534", arrivalStatus: "Scheduled", arrivalTone: "neutral", transport: "Not started", transportTone: "neutral", roomStatus: "No room", issues: 0, reference: "VIP-8S4A", today: false, arrived: false },
  { name: "Prof. Kwame Asante", party: "+1", category: "Cat. 3", arrival: "Thu 29 Oct, 11:30", flight: "AW310", arrivalStatus: "Scheduled", arrivalTone: "neutral", transport: "Not started", transportTone: "neutral", roomStatus: "No room", issues: 0, reference: "VIP-1K9A", today: false, arrived: false },
  { name: "Dr. Halima Sani", party: "+4", category: "Cat. 2", arrival: "Fri 30 Oct, 14:00", arrivalType: "Own transport", transport: "Not needed", transportTone: "neutral", roomStatus: "No room", issues: 0, reference: "VIP-5H2S", today: false, arrived: false },
];

function GuestStatus({ children, tone, sparkle }: { children: ReactNode; tone: Tone | "neutral" | "suggested"; sparkle?: boolean }) {
  if (tone === "suggested") return <span className="guest-status guest-status--suggested">{sparkle && <Icon name="sparkle" size={13}/>}<span>{children}</span></span>;
  return <span className={`guest-status guest-status--${tone}`}><span>{children}</span></span>;
}

function FilterSelect({ children }: { children: ReactNode }) {
  return <button className="filter-select"><span>{children}</span><Icon name="chevron" size={15}/></button>;
}

function roomTone(status: GuestRecord["roomStatus"]): Tone | "neutral" | "suggested" {
  if (status === "Proposed") return "suggested";
  if (status === "Ready") return "success";
  if (status === "Checked in") return "info";
  return "neutral";
}

function GuestTableRow({ guest, onOpen }: { guest: GuestRecord; onOpen: () => void }) {
  return <button className="guest-table-row" onClick={onOpen}>
    <span className="guest-cell" data-label="Guest"><span><b>{guest.name}</b><span className="category-chip">{guest.category}</span>{guest.party && <small>{guest.party}</small>}</span></span>
    <span className="arrival-cell" data-label="Arrival"><span className="arrival-time-v4">{guest.arrival}</span><span className="arrival-details">{guest.flight && <span className="flight-code">{guest.flight}</span>}{guest.arrivalStatus && guest.arrivalStatus !== "Scheduled" && <GuestStatus tone={guest.arrivalTone || "neutral"}>{guest.arrivalStatus}</GuestStatus>}{guest.arrivalType && <span className="arrival-type">{guest.arrivalType}</span>}</span></span>
    <span className="transport-cell" data-label="Transport"><GuestStatus tone={guest.transportTone} sparkle={guest.transportTone === "suggested"}>{guest.transport}</GuestStatus></span>
    <span className="room-cell-v4" data-label="Room">{guest.room && <b>{guest.room}</b>}<GuestStatus tone={roomTone(guest.roomStatus)}>{guest.roomStatus}</GuestStatus></span>
    <span className="issues-cell" data-label="Issues">{guest.issues ? <GuestStatus tone="warning">{guest.issues} {guest.issues === 1 ? "issue" : "issues"}</GuestStatus> : <span>–</span>}</span>
    <span className="row-chevron"><Icon name="arrow" size={17}/></span>
  </button>;
}

function GuestsStateSwitch({ mode, setMode }: { mode: GuestsMode; setMode: (mode: GuestsMode) => void }) {
  const items: { value: GuestsMode; label: string }[] = [
    { value: "default", label: "Default" },
    { value: "loading", label: "Loading" },
    { value: "no-results", label: "No results" },
    { value: "empty", label: "No guests yet" },
    { value: "error", label: "Error" },
  ];
  return <div className="state-switch guests-state-switch"><span>Preview</span>{items.map((item) => <button key={item.value} className={mode === item.value ? "is-active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}</div>;
}

function AddGuestDrawer({ close }: { close: () => void }) {
  return <div className="drawer-backdrop" onClick={close}><aside className="add-guest-drawer" onClick={(event) => event.stopPropagation()}>
    <header><div><h2>Add guest</h2><p>Create a new VIP guest profile.</p></div><button aria-label="Close drawer" onClick={close}><Icon name="close"/></button></header>
    <form onSubmit={(event) => { event.preventDefault(); close(); }}>
      <label><span>Title</span><select defaultValue=""><option value="" disabled>Select title</option><option>Bishop</option><option>Dr.</option><option>Prof.</option><option>Hon.</option></select></label>
      <label><span>Full name</span><input placeholder="Enter full name" required/></label>
      <label><span>Position or organisation</span><input placeholder="Role, church or organisation"/></label>
      <label><span>VIP category</span><select defaultValue=""><option value="" disabled>Select category</option><option>Cat. 1</option><option>Cat. 2</option><option>Cat. 3</option></select></label>
      <label><span>Arrival mode</span><select defaultValue=""><option value="" disabled>Select arrival mode</option><option>Flight</option><option>Own transport</option><option>Pickup requested</option></select></label>
      <label><span>Flight number</span><input placeholder="e.g. EK783"/></label>
      <label><span>Party size</span><input type="number" min="1" defaultValue="1"/></label>
      <div className="drawer-actions"><Button onClick={close}>Cancel</Button><Button kind="primary">Save guest</Button></div>
    </form>
  </aside></div>;
}

function GuestsPage({ openProfile }: { openProfile: () => void }) {
  const [tab, setTab] = useState<"all" | "today" | "attention" | "arrived">("all");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<GuestsMode>("default");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filtered = guestRows.filter((guest) => {
    if (tab === "today" && !guest.today) return false;
    if (tab === "attention" && !guest.issues) return false;
    if (tab === "arrived" && !guest.arrived) return false;
    const needle = query.trim().toLowerCase();
    if (needle && !`${guest.name} ${guest.flight || ""} ${guest.reference}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const visibleRows = mode === "no-results" ? [] : filtered;
  const clearFilters = () => { setQuery(""); setTab("all"); setMode("default"); };

  return <main className="guests-page">
    <div className="guests-header"><div><h1>Guests</h1><p>9 delegations · 28 guests</p></div><Button kind="primary" icon="plus" onClick={() => setDrawerOpen(true)}>Add guest</Button></div>
    <div className="guest-tabs" role="tablist">{[
      ["all", "All", 9], ["today", "Arriving today", 6], ["attention", "Needs attention", 4], ["arrived", "Arrived", 2],
    ].map(([value, label, count]) => <button role="tab" aria-selected={tab === value} className={tab === value ? "is-active" : ""} key={value} onClick={() => { setTab(value as typeof tab); setMode("default"); }}><span>{label}</span><b>{count}</b></button>)}</div>
    <div className="guest-filters"><label className="guest-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => { setQuery(event.target.value); setMode("default"); }} placeholder="Search by name, flight or reference"/></label><FilterSelect>All categories</FilterSelect><FilterSelect>All arrival status</FilterSelect><FilterSelect>All teams</FilterSelect></div>
    {mode === "error" && <div className="guest-error"><Icon name="alert"/><span>We couldn't load guests.</span><Button onClick={() => setMode("default")}>Retry</Button></div>}
    <section className="guest-table-card">
      <div className="guest-table-head"><button>Guest <Icon name="chevron" size={14}/></button><button className="is-sorted">Arrival <Icon name="chevron" size={14}/></button><span>Transport</span><span>Room</span><span>Issues</span><span/></div>
      {mode === "loading" ? <div className="guest-loading">{Array.from({ length: 6 }, (_, index) => <div key={index}><Skeleton className="guest-sk-name"/><Skeleton className="guest-sk-cell"/><Skeleton className="guest-sk-cell"/><Skeleton className="guest-sk-cell"/><Skeleton className="guest-sk-small"/></div>)}</div> : mode === "empty" ? <div className="guest-empty"><span><Icon name="users"/></span><h2>No guests yet.</h2><p>Add a guest or share the registration link.</p><Button kind="primary" icon="plus" onClick={() => setDrawerOpen(true)}>Add guest</Button></div> : visibleRows.length === 0 ? <div className="guest-empty"><span><Icon name="search"/></span><h2>No guests match your search.</h2><Button onClick={clearFilters}>Clear filters</Button></div> : <div className="guest-table-body">{visibleRows.map((guest) => <GuestTableRow key={guest.reference} guest={guest} onOpen={openProfile}/>)}</div>}
      <footer><span>Showing {mode === "empty" ? 0 : visibleRows.length} of 9</span><div><button disabled aria-label="Previous page"><Icon name="chevron" size={16}/></button><button disabled aria-label="Next page"><Icon name="chevron" size={16}/></button></div></footer>
    </section>
    <GuestsStateSwitch mode={mode} setMode={setMode}/>
    {drawerOpen && <AddGuestDrawer close={() => setDrawerOpen(false)}/>}
  </main>;
}

type ProfileMode = "default" | "loading" | "no-issues" | "error";

function ProfileStateSwitch({ mode, setMode }: { mode: ProfileMode; setMode: (mode: ProfileMode) => void }) {
  const items: { value: ProfileMode; label: string }[] = [
    { value: "default", label: "Default" },
    { value: "loading", label: "Loading" },
    { value: "no-issues", label: "No issues" },
    { value: "error", label: "Error" },
  ];
  return <div className="state-switch profile-state-switch"><span>Preview</span>{items.map((item) => <button key={item.value} className={mode === item.value ? "is-active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}</div>;
}

const partyMembers = [
  { initials: "AO", name: "Bishop Augustine Okafor", role: "Principal", room: "412", proposed: true },
  { initials: "CO", name: "Mrs. Chioma Okafor", role: "Wife", room: "412" },
  { initials: "TA", name: "Rev. Tobi Adewale", role: "Chaplain", room: "413" },
  { initials: "SA", name: "Mr. Segun Afolabi", role: "Security", room: "511", warning: true },
];

function ProfileCard({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`profile-card ${className}`}><h2>{title}</h2>{children}</section>;
}

function ProfilePage({ back, openProgramme }: { back: () => void; openProgramme: () => void }) {
  const [mode, setMode] = useState<ProfileMode>("default");
  const [driverApproved, setDriverApproved] = useState(false);
  const [issueDismissed, setIssueDismissed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("Bishop Augustine Okafor");
  const [category, setCategory] = useState("Cat. 1");
  const [dietary, setDietary] = useState("Vegetarian");
  const [draftName, setDraftName] = useState(name);
  const [draftCategory, setDraftCategory] = useState(category);
  const [draftDietary, setDraftDietary] = useState(dietary);
  const [historyUndone, setHistoryUndone] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const issueCount = mode === "no-issues" ? 0 : issueDismissed ? 1 : 2;
  const comingSoon = () => setToast("Coming in the next screen");
  const saveEdit = () => { setName(draftName); setCategory(draftCategory); setDietary(draftDietary); setEditing(false); };
  const cancelEdit = () => { setDraftName(name); setDraftCategory(category); setDraftDietary(dietary); setEditing(false); };
  const undoHistory = (id: string) => { setHistoryUndone((items) => [...items, id]); setToast("Automatic change undone."); };

  return <main className="profile-page">
    <button className="profile-breadcrumb" onClick={back}>Guests <Icon name="arrow" size={14}/><span>Bishop A. Okafor</span></button>
    <header className="profile-header">
      <div className="profile-title-area">
        {editing ? <div className="profile-edit-fields"><input value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="Guest name"/><select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value)} aria-label="VIP category"><option>Cat. 1</option><option>Cat. 2</option><option>Cat. 3</option></select><input value={draftDietary} onChange={(event) => setDraftDietary(event.target.value)} aria-label="Dietary note"/><Button kind="approve" onClick={saveEdit}>Save</Button><Button kind="ghost" onClick={cancelEdit}>Cancel</Button></div> : <>
          <div className="profile-title-line"><h1>{name}</h1><span className="category-chip profile-category">{category}</span><button className="profile-edit-button" onClick={() => setEditing(true)}><Icon name="edit" size={15}/>Edit</button></div>
          <p>Party of 4 · {dietary}</p>
        </>}
      </div>
      <Button icon="split" onClick={comingSoon}>Split arrival</Button>
    </header>
    <div className="profile-badges"><StatusChip tone="warning">Arrival: Delayed</StatusChip>{driverApproved ? <StatusChip tone="success" icon="check">Transport: Assigned</StatusChip> : <span className="guest-status guest-status--suggested"><Icon name="sparkle" size={13}/>Transport: Reassignment suggested</span>}<span className="guest-status guest-status--suggested">Room: Proposed 412</span>{issueCount > 0 && <StatusChip tone="warning">{issueCount} open {issueCount === 1 ? "issue" : "issues"}</StatusChip>}</div>
    {mode === "error" && <div className="profile-error"><Icon name="alert"/><span>We couldn't load this guest. Try again</span><Button onClick={() => setMode("default")}>Retry</Button></div>}

    {mode === "loading" ? <div className="profile-grid profile-loading"><div>{[1,2,3,4].map((item) => <section className="profile-card" key={item}><Skeleton className="profile-sk-title"/><Skeleton className="profile-sk-wide"/><Skeleton className="profile-sk-wide"/><Skeleton className="profile-sk-short"/></section>)}</div><aside>{[1,2].map((item) => <section className="profile-card" key={item}><Skeleton className="profile-sk-title"/><Skeleton className="profile-sk-wide"/><Skeleton className="profile-sk-wide"/><Skeleton className="profile-sk-short"/></section>)}</aside></div> :
    <div className="profile-grid">
      <div className="profile-main">
        <ProfileCard title="Party" className="party-card">
          <div className="party-list">{partyMembers.map((member) => <div className="party-row" key={member.name}><span className="party-avatar">{member.initials}</span><div><b>{member.name}</b><small>{member.role}</small></div><span className="party-room">Room <b>{member.room}</b>{member.proposed && <span className="guest-status guest-status--suggested">Proposed</span>}{member.warning && <button title="Room 511 is on a different floor from the rest of the party" aria-label="Room 511 is on a different floor from the rest of the party"><Icon name="alert" size={17}/></button>}</span></div>)}</div>
        </ProfileCard>

        <ProfileCard title="Arrival" className="arrival-profile-card">
          <p className="profile-lead"><b>EK783</b> · Dubai to Lagos</p>
          <div className="profile-time"><strong>14:25</strong><s>13:40</s><span>Changed</span><StatusChip tone="warning">Delayed +45 min</StatusChip></div>
          <p>Expected at the hotel <b>16:55</b></p>
          <button className="profile-link">Set arrival time manually</button>
        </ProfileCard>

        <ProfileCard title="Transport" className="transport-profile-card">
          <div className="profile-facts"><p><span>Pickup</span><b>14:55 <small>(was 14:10)</small></b></p><p><span>Location</span><b>Murtala Muhammed Airport, arrivals</b></p><p><span>Passengers</span><b>4 passengers</b></p><p><span>Driver</span><b>{driverApproved ? "Sule Abdullahi" : "Emeka Oladipo"}</b></p></div>
          {driverApproved ? <div className="approved-driver"><Icon name="check"/><b>Driver: Sule Abdullahi</b><StatusChip tone="success">Approved</StatusChip></div> : <div className="suggested-driver"><div><Icon name="sparkle"/><b>Suggested: Reassign to Sule Abdullahi</b></div><span><Button kind="approve" onClick={() => { setDriverApproved(true); setToast("Driver reassigned to Sule Abdullahi. Undo"); }}>Approve</Button><Button onClick={comingSoon}>Review</Button></span></div>}
        </ProfileCard>

        <ProfileCard title="Room" className="room-profile-card">
          <div className="room-profile-summary"><p><b>Room 412</b> · Executive suite · East wing</p><StatusChip tone="success" icon="check">Ready</StatusChip></div>
          <div className="proposed-room"><span className="guest-status guest-status--suggested">Proposed</span><p>Reserved for Bishop Augustine Okafor and Mrs. Chioma Okafor.</p></div>
        </ProfileCard>
      </div>

      <aside className="profile-side">
        <ProfileCard title="Open issues" className="issues-profile-card">
          {mode === "no-issues" ? <div className="profile-empty"><span><Icon name="check"/></span><b>Nothing needs attention.</b></div> : <>
            {!issueDismissed && <div className="issue-item"><b>Rev Chidi may join later: not confirmed</b><small>from pasted message</small><div><Button kind="approve" onClick={comingSoon}>Add as guest</Button><Button kind="ghost" onClick={() => setIssueDismissed(true)}>Dismiss</Button></div></div>}
            <div className="issue-item"><b>Welcome briefing 17:00 is at risk</b><button className="profile-link" onClick={openProgramme}>Open programme</button></div>
          </>}
        </ProfileCard>

        <ProfileCard title="History" className="history-profile-card">
          <div className="history-list">
            {[
              ["arrival", "11:17", "Arrival changed 13:40 to 14:25"],
              ["pickup", "11:17", "Pickup time changed 14:10 to 14:55"],
              ["duplicate", "10:58", "Linked duplicate VIP-7K3Q"],
            ].map(([id, time, text]) => <div className={`history-item ${historyUndone.includes(id) ? "is-undone" : ""}`} key={id}><i/><time>{time}</time><AutoTag/><span>{text}</span><button onClick={() => undoHistory(id)}>{historyUndone.includes(id) ? "Undone" : "Undo"}</button></div>)}
            <div className="history-item"><i/><time>10:52</time><span className="history-chip-spacer"/><span>Pasted message received, sent to Intake</span></div>
          </div>
          <button className="profile-link history-all" onClick={() => setToast("Showing all guest activity.")}>Show all</button>
        </ProfileCard>
      </aside>
    </div>}
    {toast && <div className="toast-v4 profile-toast"><Icon name="check"/><span>{toast}</span>{toast.includes("Undo") && <button onClick={() => { setDriverApproved(false); setToast(null); }}>Undo</button>}<button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
    <ProfileStateSwitch mode={mode} setMode={setMode}/>
  </main>;
}

type IntakeMode = "default" | "drawer" | "loading" | "empty" | "error";
type IntakeTab = "review" | "duplicates" | "missing" | "flagged" | "processed";

const intakeRows = [
  { reference: "VIP-9M2X", received: "10:52", source: "Pasted message", sourceIcon: "message" as IconName, guest: "Bishop Okafor", reasons: ["Names missing", "Uncertain: Rev Chidi"], kind: "missing" as const },
  { reference: "VIP-4D8R", received: "10:31", source: "Registration form", sourceIcon: "file" as IconName, guest: "Hon. Ibrahim Bello", reasons: ["Likely duplicate"], kind: "duplicate" as const },
];

function IntakeStateSwitch({ mode, setMode }: { mode: IntakeMode; setMode: (mode: IntakeMode) => void }) {
  const items: { value: IntakeMode; label: string }[] = [
    { value: "default", label: "Default" },
    { value: "drawer", label: "Paste drawer" },
    { value: "loading", label: "Loading" },
    { value: "empty", label: "Empty" },
    { value: "error", label: "Error" },
  ];
  return <div className="state-switch intake-state-switch"><span>Preview</span>{items.map((item) => <button key={item.value} className={mode === item.value ? "is-active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}</div>;
}

function IntakeEmpty({ flagged, openDrawer }: { flagged?: boolean; openDrawer: () => void }) {
  return <div className="intake-empty"><span className={flagged ? "" : "intake-empty-icon"}><Icon name={flagged ? "shield" : "inbox"}/>{!flagged && <Icon name="check" size={12}/>}</span><h2>{flagged ? "Nothing flagged." : "No submissions to review."}</h2>{!flagged && <Button kind="primary" icon="clipboard" onClick={openDrawer}>Paste a message</Button>}</div>;
}

function PasteMessageDrawer({ close, prefilled, created }: { close: () => void; prefilled: boolean; created: () => void }) {
  const sample = "Good morning. Bishop Okafor arrives Wed on EK783 with his wife, his chaplain and one security man. Vegetarian meals please. Rev Chidi may also join later.";
  const [message, setMessage] = useState(prefilled ? sample : "");
  const [reading, setReading] = useState(false);
  const [showResult, setShowResult] = useState(prefilled);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  const readMessage = () => {
    setReading(true);
    window.setTimeout(() => { setReading(false); setShowResult(true); }, 1000);
  };
  return <div className="intake-drawer-overlay" onClick={close}><aside className="intake-drawer" onClick={(event) => event.stopPropagation()}>
    <header><h2>Paste a message</h2><button aria-label="Close drawer" onClick={close}><Icon name="close"/></button></header>
    <div className="intake-drawer-body">
      <label><span>Message</span><textarea value={message} onChange={(event) => { setMessage(event.target.value); setShowResult(false); }} placeholder="Paste a WhatsApp message or an email here"/></label>
      <Button kind="primary" onClick={readMessage} disabled={!message.trim() || reading}>{reading ? "Reading message…" : "Read message"}</Button>
      {showResult && <section className="read-result">
        <h3>What was read</h3>
        <div className="read-group read-group--suggested"><h4><Icon name="sparkle"/>Suggested</h4><p><b>Title</b><span>Bishop</span></p><p><b>Flight number</b><span>EK783</span></p><p><b>Arrival date</b><span>Wed 28 Oct</span></p><p><b>Dietary</b><span>Vegetarian</span></p></div>
        <div className="read-group read-group--missing"><h4><Icon name="alert"/>Missing</h4><p><b>First name</b><span>Not found</span></p><p><b>Departure date</b><span>Not found</span></p><p><b>Companions</b><span>Names of three companions</span></p></div>
        <div className="read-group read-group--uncertain"><h4><Icon name="alert"/>Uncertain</h4><p><b>Source phrase</b><span>Rev Chidi may also join later</span></p></div>
      </section>}
    </div>
    {showResult && <footer className="intake-drawer-footer"><div><Button kind="primary" onClick={created}>Create draft</Button><Button kind="ghost" onClick={() => { setMessage(""); setShowResult(false); }}>Clear</Button></div><small>Nothing is saved until you approve it in Review.</small></footer>}
  </aside></div>;
}

function IntakePage({ openReview, initialDrawer = false }: { openReview: (duplicate: boolean) => void; initialDrawer?: boolean }) {
  const [tab, setTab] = useState<IntakeTab>("review");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<IntakeMode>(initialDrawer ? "drawer" : "default");
  const [drawerPrefilled, setDrawerPrefilled] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rows = intakeRows.filter((row) => {
    if (tab === "duplicates" && row.kind !== "duplicate") return false;
    if (tab === "missing" && row.kind !== "missing") return false;
    const needle = query.toLowerCase().trim();
    return !needle || `${row.reference} ${row.guest}`.toLowerCase().includes(needle);
  });
  const openDrawer = (prefilled = false) => { setDrawerPrefilled(prefilled); setMode("drawer"); };
  const closeDrawer = () => setMode("default");
  const createDraft = () => { closeDrawer(); setToast("Draft sent to Review"); };
  const changeMode = (next: IntakeMode) => {
    setDrawerPrefilled(next === "drawer");
    setMode(next);
  };

  return <main className="intake-page">
    <header className="intake-header"><div><h1>Intake</h1><p>Registrations and messages that need a person to check them.</p></div><div><Button kind="primary" icon="clipboard" onClick={() => openDrawer(false)}>Paste a message</Button><Button icon="link" onClick={() => setToast("Registration link copied")}>Copy registration link</Button></div></header>
    <div className="intake-tabs" role="tablist">{[
      ["review", "Needs review", 2], ["duplicates", "Likely duplicates", 1], ["missing", "Missing details", 1], ["flagged", "Flagged", 0], ["processed", "Processed automatically", 14],
    ].map(([value, label, count]) => <button role="tab" aria-selected={tab === value} className={tab === value ? "is-active" : ""} key={value} onClick={() => { setTab(value as IntakeTab); setMode("default"); }}><span>{label}</span><b>{count}</b></button>)}</div>
    <div className="intake-filters"><label><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference or name"/></label><FilterSelect>All sources</FilterSelect></div>
    {mode === "error" && <div className="intake-error"><Icon name="alert"/><span>We couldn't load the intake queue. Try again</span><Button onClick={() => setMode("default")}>Retry</Button></div>}
    <section className="intake-table-card">
      <div className="intake-table-head"><span>Reference</span><span>Received</span><span>Source</span><span>Guest</span><span>Reasons</span><span/></div>
      {mode === "loading" ? <div className="intake-loading">{Array.from({ length: 4 }, (_, index) => <div key={index}><Skeleton/><Skeleton/><Skeleton/><Skeleton/><Skeleton/></div>)}</div> : mode === "empty" ? <IntakeEmpty openDrawer={() => openDrawer(false)}/> : mode === "error" ? <div className="intake-error-empty"/> : tab === "flagged" ? <IntakeEmpty flagged openDrawer={() => openDrawer(false)}/> : tab === "processed" ? <div className="processed-empty"><span><Icon name="check"/></span><b>14 submissions were processed automatically today.</b><button>See them in Activity</button></div> : <div className="intake-table-body">{rows.map((row) => <div className="intake-table-row" key={row.reference}><b>{row.reference}</b><time>{row.received}</time><span className="intake-source"><Icon name={row.sourceIcon}/>{row.source}</span><span>{row.guest}</span><span className="intake-reasons">{row.reasons.map((reason) => <GuestStatus key={reason} tone={reason === "Likely duplicate" ? "info" : "warning"}>{reason}</GuestStatus>)}</span><Button onClick={() => openReview(row.kind === "duplicate")}>Review</Button></div>)}</div>}
      {tab !== "flagged" && tab !== "processed" && mode !== "empty" && mode !== "error" && <footer>14 submissions were processed automatically today. <button>See them in Activity</button></footer>}
    </section>
    <IntakeStateSwitch mode={mode} setMode={changeMode}/>
    {mode === "drawer" && <PasteMessageDrawer close={closeDrawer} prefilled={drawerPrefilled} created={createDraft}/>}
    {toast && <div className="toast-v4 intake-toast"><Icon name="check"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type ReviewMode = "default" | "duplicate" | "loading" | "error";

function ReviewStateSwitch({ mode, setMode }: { mode: ReviewMode; setMode: (mode: ReviewMode) => void }) {
  const items: { value: ReviewMode; label: string }[] = [
    { value: "default", label: "Default" },
    { value: "duplicate", label: "Duplicate" },
    { value: "loading", label: "Loading" },
    { value: "error", label: "Error" },
  ];
  return <div className="state-switch review-state-switch"><span>Preview</span>{items.map((item) => <button key={item.value} className={mode === item.value ? "is-active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}</div>;
}

function ReviewField({ label, value = "", missing, highlight, inputId }: { label: string; value?: string; missing?: boolean; highlight?: boolean; inputId?: string }) {
  return <label className={`review-field ${missing ? "is-missing" : ""} ${highlight ? "is-highlighted" : ""}`}><span>{label}{missing && <span className="missing-chip">Missing</span>}</span><input id={inputId} defaultValue={value}/></label>;
}

function StandardReview({ error, highlight, notify }: { error: boolean; highlight: string | null; notify: () => void }) {
  const value = (text: string) => error ? "" : text;
  return <div className="review-panes-v4">
    <section className="review-card original-message-card">
      <header><h2>Original message</h2><span>Read only</span></header>
      <p>Good morning. <button onClick={() => notifySource("name")}>Bishop Okafor</button> arrives Wed on <button onClick={() => notifySource("flight")}>EK783</button> with his wife, his chaplain and one security man. <button onClick={() => notifySource("dietary")}>Vegetarian</button> meals please. <button onClick={() => notifySource("uncertain")}>Rev Chidi may also join later</button> but not sure yet. Pls arrange pickup.</p>
    </section>
    <section className="review-card what-read-card">
      <header><h2>What was read</h2></header>
      {!error && <div className="suggested-area"><h3><Icon name="sparkle"/>Suggested</h3><div><ReviewField label="Title" value="Bishop"/><ReviewField label="Arrival mode" value="Flying"/><ReviewField label="Flight number" value="EK783" highlight={highlight === "flight"} inputId="flight-field"/><ReviewField label="Arrival date" value="Wed 28 Oct"/><ReviewField label="Dietary" value="Vegetarian" highlight={highlight === "dietary"} inputId="dietary-field"/></div></div>}
      {error && <div className="review-error-fields"><ReviewField label="Title"/><ReviewField label="Arrival mode"/><ReviewField label="Flight number"/><ReviewField label="Arrival date"/><ReviewField label="Dietary"/></div>}
      <div className="review-base-fields"><div><ReviewField label="Full name" value={value("Okafor")} highlight={highlight === "name"} inputId="name-field"/>{!error && <small><Icon name="alert"/>First name missing</small>}</div><ReviewField label="Departure date" value="" missing={!error}/></div>
      <section className="companions-section"><h3>Companions</h3>{["Wife", "Chaplain", "Security"].map((role) => <div key={role}><label><span>{role}</span><input placeholder="Enter name"/></label>{!error && <span className="name-missing">Name missing</span>}</div>)}</section>
      {!error && <div className={`uncertain-review ${highlight === "uncertain" ? "is-highlighted" : ""}`}><div><Icon name="alert"/><b>Uncertain: Rev Chidi may also join later</b></div><span><Button onClick={notify}>Add as guest</Button><button onClick={notify}>Leave out</button></span></div>}
    </section>
  </div>;

  function notifySource(field: string) {
    const event = new CustomEvent("highlight-review-field", { detail: field });
    window.dispatchEvent(event);
  }
}

const duplicateRows = [
  ["Name", "Hon. Ibrahim Bello", "Hon. Ibrahim Bello", false],
  ["Arrival mode", "Own transport", "Own transport", false],
  ["Arrival time", "15:00", "14:30", true],
  ["Guests", "5", "6", true],
  ["Diet", "None stated", "Halal", true],
  ["Contact", "+234 803 555 0142", "+234 803 555 0142", false],
] as const;

function DuplicateReview() {
  return <div className="duplicate-grid">
    <section className="review-card comparison-card"><header><h2>Existing</h2></header>{duplicateRows.map(([label, existing, , different]) => <div className={different ? "is-different" : ""} key={label}><span>{label}{different && <span>Different</span>}</span><b>{existing}</b></div>)}</section>
    <section className="review-card comparison-card"><header><h2>New submission</h2></header>{duplicateRows.map(([label, , incoming, different]) => <div className={different ? "is-different" : ""} key={label}><span>{label}{different && <span>Different</span>}</span><b>{incoming}</b>{different && <label><input type="checkbox"/>Use new value</label>}</div>)}</section>
  </div>;
}

function RejectDialog({ close, reject }: { close: () => void; reject: () => void }) {
  return <div className="review-dialog-overlay" onClick={close}><div className="review-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><h2>Reject this submission?</h2><p>It stays in Activity. No guest is created.</p><div><Button onClick={close}>Cancel</Button><button className="reject-button" onClick={reject}>Reject</button></div></div></div>;
}

function ReviewPage({ initialDuplicate, back, openProfile, approved }: { initialDuplicate: boolean; back: () => void; openProfile: () => void; approved: () => void }) {
  const [mode, setMode] = useState<ReviewMode>(initialDuplicate ? "duplicate" : "default");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastProfile, setToastProfile] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [processed, setProcessed] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    const handler = (event: Event) => {
      const field = (event as CustomEvent<string>).detail;
      setHighlight(field);
      timer = window.setTimeout(() => setHighlight(null), 2000);
    };
    window.addEventListener("highlight-review-field", handler);
    return () => { window.removeEventListener("highlight-review-field", handler); if (timer) window.clearTimeout(timer); };
  }, []);
  const duplicate = mode === "duplicate";
  const reference = duplicate ? "VIP-4D8R" : "VIP-9M2X";
  const notify = (message: string, profile = false) => { setToast(message); setToastProfile(profile); };
  const completeReview = (message: string) => {
    if (!processed) {
      approved();
      setProcessed(true);
    }
    notify(message, true);
  };

  return <main className="review-page-v4">
    <button className="review-breadcrumb" onClick={back}>Intake <Icon name="arrow" size={14}/><span>{reference}</span></button>
    <header className="review-header"><h1>Review submission</h1><div>{duplicate ? <><span className="guest-status guest-status--neutral">Registration form</span><GuestStatus tone="warning">Needs review</GuestStatus><GuestStatus tone="info">Likely duplicate</GuestStatus></> : <><span className="guest-status guest-status--neutral">Pasted message</span><GuestStatus tone="warning">Needs review</GuestStatus><GuestStatus tone="warning">4 issues to check</GuestStatus></>}</div></header>
    {mode === "error" && <div className="review-error"><Icon name="alert"/><span>We couldn't read this message. Enter the details by hand.</span></div>}
    {!duplicate && mode !== "loading" && mode !== "error" && <div className="possible-match"><Icon name="info"/><span>Possible match: Bishop A. Okafor delegation, registered by form on 26 Oct.</span><Button onClick={() => notify("Opens the comparison view")}>Compare</Button></div>}
    {mode === "loading" ? <div className="review-loading">{[1,2].map((item) => <section className="review-card" key={item}><Skeleton className="review-sk-title"/><Skeleton className="review-sk-line"/><Skeleton className="review-sk-line"/><Skeleton className="review-sk-block"/></section>)}</div> : duplicate ? <DuplicateReview/> : <StandardReview error={mode === "error"} highlight={highlight} notify={() => notify("Noted. Nothing is saved yet.")}/>}
    <div className={`review-sticky-footer ${mode === "loading" ? "is-loading" : ""}`}>
      {mode === "loading" ? <><Skeleton className="footer-sk-text"/><Skeleton className="footer-sk-actions"/></> : duplicate ? <><span>Nothing is merged automatically.</span><div><Button kind="primary" onClick={() => completeReview("Linked. Open guest profile")}>Link to existing</Button><Button onClick={() => notify("Treat as new selected")}>Treat as new</Button><button className="footer-reject" onClick={() => setRejectOpen(true)}>Reject</button></div></> : <><span>Nothing is saved until you approve.</span><div><Button onClick={() => notify("Opens the guest picker")}>Link to existing</Button><button className="footer-reject" onClick={() => setRejectOpen(true)}>Reject</button><Button kind="primary" onClick={() => completeReview("Delegation created. Open guest profile")}>Approve and create</Button></div></>}
    </div>
    <ReviewStateSwitch mode={mode} setMode={setMode}/>
    {rejectOpen && <RejectDialog close={() => setRejectOpen(false)} reject={() => { setRejectOpen(false); notify("Submission rejected"); }}/>}
    {toast && <div className="toast-v4 review-toast"><Icon name="check"/><span>{toast}</span>{toastProfile && <button onClick={openProfile}>Open guest profile</button>}<button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type ArrivalsMode = "default" | "loading" | "empty" | "error";
type ArrivalWindow = "2h" | "6h" | "today";
type ArrivalStatus = "all" | "landed" | "delayed" | "cancelled" | "due";
type ArrivalTone = "success" | "info" | "error" | "warning" | "neutral";

const arrivalRows = [
  { hour: "10:00", minutes: 640, time: "10:40", guest: "Prof. Funmilayo Alade", category: "Cat. 2", party: "", flight: "BA075", flightLabel: "Landed", flightTone: "success", pickup: "Pickup done", pickupTone: "success", driver: "Kunle Balogun", status: "landed" },
  { hour: "11:00", minutes: 665, time: "11:05", guest: "Archbishop Tendai Moyo", category: "Cat. 1", party: "+2", flight: "ET512", flightLabel: "Landed", flightTone: "success", pickup: "Pickup in progress", pickupTone: "info", driver: "Emeka Oladipo", status: "landed" },
  { hour: "12:00", minutes: 770, time: "12:50", guest: "Pastor Daniel Kwarteng", category: "Cat. 3", party: "+2", flight: "AW312", flightLabel: "Cancelled", flightTone: "error", pickup: "Pickup cancelled", pickupTone: "error", driver: "", suggestion: "Release suggested", status: "cancelled" },
  { hour: "14:00", minutes: 865, time: "14:25", oldTime: "13:40", changed: true, guest: "Bishop Augustine Okafor", category: "Cat. 1", party: "+3", flight: "EK783", flightLabel: "Delayed +45 min", flightTone: "warning", pickup: "Pickup assigned", pickupTone: "neutral", driver: "Emeka Oladipo", suggestion: "Sule Abdullahi", status: "delayed", attention: true },
  { hour: "15:00", minutes: 900, time: "15:00", guest: "Hon. Ibrahim Bello", category: "Cat. 2", party: "+4", transport: "Own transport", pickup: "Pickup not needed", pickupTone: "neutral", driver: "—", status: "due" },
  { hour: "16:00", minutes: 990, time: "16:30", guest: "Dr. Ngozi Eze", category: "Cat. 2", party: "+1", transport: "Pickup requested", location: "Victoria Island", pickup: "Not started", pickupTone: "neutral", driverBadge: "Needs a driver", status: "due" },
] as const;

function ArrivalBadge({ tone, children }: { tone: ArrivalTone; children: ReactNode }) {
  return <span className={`arrival-badge arrival-badge--${tone}`}>{children}</span>;
}

function ArrivalSuggested({ children }: { children: ReactNode }) {
  return <span className="arrival-suggested"><Icon name="sparkle" size={13}/>{children}</span>;
}

function ArrivalRow({ row, open, openTransport }: { row: typeof arrivalRows[number]; open: () => void; openTransport: () => void }) {
  const flightCell = () => <div className="arrival-flight">{"flight" in row ? <><code>{row.flight}</code><ArrivalBadge tone={row.flightTone as ArrivalTone}>{row.flightLabel}</ArrivalBadge></> : <span className="arrival-transport">{row.transport}{"location" in row && <small>{row.location}</small>}</span>}</div>;
  const pickupCell = () => <div className="arrival-pickup" onClick={(event) => { event.stopPropagation(); openTransport(); }}><ArrivalBadge tone={row.pickupTone as ArrivalTone}>{row.pickup}</ArrivalBadge></div>;
  const driverCell = () => <div className="arrival-driver" onClick={(event) => { event.stopPropagation(); openTransport(); }}>{"driverBadge" in row ? <ArrivalBadge tone="error">{row.driverBadge}</ArrivalBadge> : <>{row.driver && <span>{row.driver}</span>}{"suggestion" in row && <ArrivalSuggested>{row.suggestion}</ArrivalSuggested>}</>}</div>;
  return <div className={`arrival-row ${"attention" in row && row.attention ? "is-attention" : ""}`} role="button" tabIndex={0} onClick={open} onKeyDown={(event) => { if (event.key === "Enter") open(); }}>
    <div className="arrival-time"><b>{row.time}</b>{"oldTime" in row && <span><s>{row.oldTime}</s>{"changed" in row && <em>Changed</em>}</span>}</div>
    <div className="arrival-guest"><b>{row.guest}</b><span>{row.category}</span>{"party" in row && row.party && <small>{row.party}</small>}</div>
    {flightCell()}{pickupCell()}{driverCell()}
    <div className="arrival-mobile-details">{flightCell()}{pickupCell()}{driverCell()}</div>
    <span className="arrival-open"><Icon name="arrow" size={18}/><b>Open →</b></span>
  </div>;
}

function ArrivalsStateSwitch({ mode, setMode }: { mode: ArrivalsMode; setMode: (mode: ArrivalsMode) => void }) {
  return <div className="state-switch arrivals-state-switch"><span>Preview</span>{(["default", "loading", "empty", "error"] as ArrivalsMode[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function ArrivalsPage({ openProfile, openTransport }: { openProfile: () => void; openTransport: () => void }) {
  const [mode, setMode] = useState<ArrivalsMode>("default");
  const [windowMode, setWindowMode] = useState<ArrivalWindow>("today");
  const [status, setStatus] = useState<ArrivalStatus>("all");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(false);
  const visibleRows = useMemo(() => arrivalRows.filter((row) => {
    if (windowMode === "2h" && (row.minutes < 680 || row.minutes > 800)) return false;
    if (windowMode === "6h" && (row.minutes < 680 || row.minutes > 1040)) return false;
    if (status !== "all" && row.status !== status) return false;
    const needle = query.trim().toLowerCase();
    const searchable = `${row.guest} ${"flight" in row ? row.flight : ""}`.toLowerCase();
    return !needle || searchable.includes(needle);
  }), [windowMode, status, query]);
  const groups = useMemo(() => {
    const result: { hour: string; rows: typeof arrivalRows[number][] }[] = [];
    visibleRows.forEach((row) => {
      const group = result.find((item) => item.hour === row.hour);
      if (group) group.rows.push(row); else result.push({ hour: row.hour, rows: [row] });
    });
    return result;
  }, [visibleRows]);
  const showNow = windowMode === "today" && status === "all" && !query.trim();
  const showToday = () => { setMode("default"); setWindowMode("today"); setStatus("all"); setQuery(""); };
  const changePreview = (next: ArrivalsMode) => {
    setMode(next);
    if (next === "default" || next === "error") {
      setWindowMode("today");
      setStatus("all");
      setQuery("");
    } else if (next === "empty") {
      setWindowMode("2h");
      setStatus("all");
      setQuery("");
    }
  };

  return <main className="arrivals-page">
    <header className="arrivals-header"><h1>Arrivals</h1><div><span>Wednesday 28 October · 6 delegations · 18 guests</span><span className="arrivals-live"><i/>Live flight data · updated 11:18</span></div></header>
    {mode === "error" && <div className="arrivals-error"><Icon name="alert"/><span>We couldn't refresh live flight data. Showing the last update at 11:18.</span><Button onClick={showToday}>Retry</Button></div>}
    <div className="arrivals-filters">
      <div className="arrival-segments">{([["2h", "Next 2 h"], ["6h", "Next 6 h"], ["today", "Today"]] as [ArrivalWindow, string][]).map(([value, label]) => <button key={value} className={windowMode === value ? "is-active" : ""} onClick={() => setWindowMode(value)}>{label}</button>)}</div>
      <label className="arrival-status-select"><select value={status} onChange={(event) => setStatus(event.target.value as ArrivalStatus)}><option value="all">All status</option><option value="landed">Landed</option><option value="delayed">Delayed</option><option value="cancelled">Cancelled</option><option value="due">Due</option></select><Icon name="chevron" size={15}/></label>
      <label className="arrival-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guest or flight"/></label>
    </div>
    <section className={`arrivals-card arrivals-card--${mode}`}>
      {mode === "loading" ? <div className="arrival-loading">{Array.from({ length: 6 }, (_, index) => <div key={index}><Skeleton/><Skeleton/><Skeleton/><Skeleton/><Skeleton/></div>)}</div> : mode === "empty" ? <div className="arrival-empty"><span><Icon name="plane" size={28}/></span><h2>No arrivals in the next 2 hours.</h2><p>Nothing is due in this window.</p><Button onClick={showToday}>Show today</Button></div> : <>
        <div className="arrivals-table-head"><span>Time</span><span>Guest</span><span>Flight</span><span>Pickup</span><span>Driver</span><span/></div>
        {visibleRows.length === 0 ? <div className="arrival-no-results"><b>No arrivals match.</b><span>Try a different search or status.</span></div> : <div>{groups.map((group) => <div className="arrival-group" key={group.hour}>{showNow && group.hour === "12:00" && <div className="arrival-now"><i/><b>Now · 11:20</b><span/></div>}<div className="arrival-hour"><span>{group.hour}</span><i/></div>{group.rows.map((row) => <ArrivalRow key={`${row.time}-${row.guest}`} row={row} open={openProfile} openTransport={openTransport}/>)}</div>)}</div>}
      </>}
    </section>
    <ArrivalsStateSwitch mode={mode} setMode={changePreview}/>
    {toast && <div className="toast-v4 arrivals-toast"><Icon name="check"/><span>Opens the Guest profile (Screen 3)</span><button aria-label="Dismiss" onClick={() => setToast(false)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type TransportMode = "default" | "loading" | "empty" | "error";
type TransportDay = "today" | "thursday" | "friday";
type DriverName = "Emeka Oladipo" | "Sule Abdullahi" | "Kunle Balogun" | "Musa Ibrahim";

const driverDetails: Record<DriverName, { vehicle: string; trips: { time: string; guest: string; status: string; detail: string; tone: ArrivalTone }[]; note?: string }> = {
  "Emeka Oladipo": { vehicle: "Coaster bus · 18 seats", trips: [
    { time: "11:05", guest: "Archbishop Tendai Moyo +2", status: "In progress", detail: "ET512 · Airport to Harbour Point Hotel", tone: "info" },
    { time: "14:55", guest: "Bishop Augustine Okafor +3", status: "Reassignment suggested", detail: "EK783 · Airport arrivals", tone: "warning" },
  ] },
  "Sule Abdullahi": { vehicle: "Prado SUV · 6 seats", trips: [
    { time: "14:55", guest: "Bishop Augustine Okafor +3", status: "Suggested", detail: "EK783 · Airport arrivals", tone: "warning" },
  ] },
  "Kunle Balogun": { vehicle: "Sienna · 7 seats", trips: [
    { time: "10:40", guest: "Prof. Funmilayo Alade", status: "Done", detail: "BA075 · Airport to Harbour Point Hotel", tone: "neutral" },
    { time: "16:30", guest: "Dr. Ngozi Eze +1", status: "Suggested", detail: "Victoria Island", tone: "warning" },
  ] },
  "Musa Ibrahim": { vehicle: "Hiace · 14 seats", trips: [], note: "Off shift until 14:00. No pickups today." },
};

function TransportDecision({ type, approved, hovered, setHovered, approve, review }: { type: "assign" | "reassign"; approved: boolean; hovered: string | null; setHovered: (value: string | null) => void; approve: () => void; review: () => void }) {
  const assign = type === "assign";
  return <article className={`transport-decision ${approved ? "is-approved" : ""} ${hovered === type ? "is-hovered" : ""}`} onMouseEnter={() => setHovered(type)} onMouseLeave={() => setHovered(null)}>
    <span className="decision-icon"><Icon name={assign ? "userPlus" : "swap"}/></span>
    <div className="decision-copy">
      <h2>{assign ? "Assign a driver for Dr. Ngozi Eze" : "Reassign EK783 pickup to Sule Abdullahi"}</h2>
      {approved ? <p className="decision-approved"><Icon name="check" size={16}/>Approved by Ada Nwosu · 11:21. {assign ? "Kunle Balogun" : "Sule Abdullahi"} is assigned.</p> : <>
        {assign ? <p>Pickup <b>16:30</b>, Victoria Island, 2 passengers. Best match <b>Kunle Balogun</b>, Sienna, 7 seats, free 15:30 to 19:00.</p> : <p><b>Bishop Okafor +3</b> · 14:55 airport. The flight is 45 minutes late and Emeka Oladipo is busy until 14:40.</p>}
        {assign && <div className="also-available"><span>Also available</span><b>Sule Abdullahi</b><b>Musa Ibrahim</b></div>}
        <div className="decision-actions"><button className="transport-approve" onClick={approve}>Approve</button><Button onClick={review}>Review</Button></div>
      </>}
    </div>
    {!approved && <span className="decision-suggested"><Icon name="sparkle" size={13}/>Suggested</span>}
  </article>;
}

function DriverLabel({ name, vehicle, status, tone, open }: { name: DriverName; vehicle: string; status: string; tone: ArrivalTone; open: () => void }) {
  return <button className="driver-label" onClick={open}><span><b>{name}</b><ArrivalBadge tone={tone}>{status}</ArrivalBadge></span><small>{vehicle}</small></button>;
}

function TimelineBlock({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`timeline-block ${className}`}>{children}</span>;
}

function TransportBoard({ assignApproved, reassignApproved, hovered, openDriver }: { assignApproved: boolean; reassignApproved: boolean; hovered: string | null; openDriver: (driver: DriverName) => void }) {
  const ticks = ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00"];
  return <section className="transport-board">
    <header><h2>Drivers</h2><div className="board-legend"><span><i className="legend-done"/>Done</span><span><i className="legend-progress"/>In progress</span><span><i className="legend-suggested"/>Suggested</span></div></header>
    <div className="board-scroll">
      <div className="board-grid">
        <div className="board-axis-label"/>
        <div className="board-axis"><div className="timeline-lines"/>{ticks.map((tick) => <span key={tick}>{tick}</span>)}<i className="now-line"/><b className="now-pill">11:20</b></div>

        <div className="needs-label"><span><b>Needs a driver</b><i className={assignApproved ? "is-clear" : ""}>{assignApproved ? "0" : "1"}</i></span><small>{assignApproved ? "All assigned" : "Dr. Ngozi Eze · 16:30"}</small></div>
        <div className="driver-track needs-track"><div className="timeline-lines"/><i className="now-line"/>{assignApproved ? <span className="all-assigned"><Icon name="check" size={17}/>Every pickup has a driver.</span> : <><div className="eze-callout"><div><b>16:30</b><strong>Dr. Ngozi Eze</strong><span>Cat. 2</span></div><small>Victoria Island · 2 passengers</small><em><Icon name="sparkle" size={12}/>Suggestion ready</em></div><TimelineBlock className="block-eze is-unassigned">Eze</TimelineBlock></>}</div>

        <DriverLabel name="Emeka Oladipo" vehicle="Coaster bus · 18 seats" status="In progress" tone="info" open={() => openDriver("Emeka Oladipo")}/>
        <div className="driver-track"><div className="timeline-lines"/><i className="now-line"/><TimelineBlock className="block-moyo is-progress">Archbishop Moyo +2</TimelineBlock>{!reassignApproved && <TimelineBlock className="block-okafor is-moving">Okafor +3</TimelineBlock>}</div>

        <DriverLabel name="Sule Abdullahi" vehicle="Prado SUV · 6 seats" status="Available" tone="success" open={() => openDriver("Sule Abdullahi")}/>
        <div className="driver-track"><div className="timeline-lines"/><i className="now-line"/><TimelineBlock className={`block-okafor ${reassignApproved ? "is-progress" : "is-ghost"} ${hovered === "reassign" ? "is-linked" : ""}`}>{!reassignApproved && <Icon name="sparkle" size={13}/>}Okafor +3</TimelineBlock></div>

        <DriverLabel name="Kunle Balogun" vehicle="Sienna · 7 seats" status="Available" tone="success" open={() => openDriver("Kunle Balogun")}/>
        <div className="driver-track"><div className="timeline-lines"/><i className="now-line"/><TimelineBlock className="block-alade is-done">Prof. Alade</TimelineBlock><TimelineBlock className={`block-eze ${assignApproved ? "is-progress" : "is-ghost"} ${hovered === "assign" ? "is-linked" : ""}`}>{!assignApproved && <Icon name="sparkle" size={13}/>}Eze</TimelineBlock></div>

        <DriverLabel name="Musa Ibrahim" vehicle="Hiace · 14 seats" status="Off shift" tone="neutral" open={() => openDriver("Musa Ibrahim")}/>
        <div className="driver-track"><div className="timeline-lines"/><i className="now-line"/><span className="off-shift">Off shift until 14:00</span></div>
      </div>
    </div>
  </section>;
}

function DriverDrawer({ driver, close, openProfile }: { driver: DriverName; close: () => void; openProfile: () => void }) {
  const detail = driverDetails[driver];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return <div className="driver-drawer-backdrop" onClick={close}><aside className="driver-drawer" onClick={(event) => event.stopPropagation()}>
    <header><div><h2>{driver}</h2><p>{detail.vehicle}</p></div><button aria-label="Close driver details" onClick={close}><Icon name="close"/></button></header>
    <div>{detail.note ? <p className="driver-note">{detail.note}</p> : detail.trips.map((trip) => <article className="driver-trip" key={`${trip.time}-${trip.guest}`} onClick={openProfile}><div><b>{trip.time}</b><ArrivalBadge tone={trip.tone}>{trip.status}</ArrivalBadge></div><h3>{trip.guest}</h3><p>{trip.detail}</p></article>)}</div>
  </aside></div>;
}

function TransportStateSwitch({ mode, setMode }: { mode: TransportMode; setMode: (mode: TransportMode) => void }) {
  return <div className="state-switch transport-state-switch"><span>Preview</span>{(["default", "loading", "empty", "error"] as TransportMode[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function TransportPage({ openProfile }: { openProfile: () => void }) {
  const [mode, setMode] = useState<TransportMode>("default");
  const [day, setDay] = useState<TransportDay>("today");
  const [assignApproved, setAssignApproved] = useState(false);
  const [reassignApproved, setReassignApproved] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [driver, setDriver] = useState<DriverName | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: "assign" | "reassign" } | null>(null);
  const assigned = mode === "empty" || assignApproved;
  const reassigned = mode === "empty" || reassignApproved;
  const changeMode = (next: TransportMode) => {
    setMode(next);
    setDay("today");
    if (next === "default" || next === "error") { setAssignApproved(false); setReassignApproved(false); }
  };
  const approve = (type: "assign" | "reassign") => {
    if (type === "assign") { setAssignApproved(true); setToast({ text: "Driver assigned: Kunle Balogun.", undo: "assign" }); }
    else { setReassignApproved(true); setToast({ text: "Pickup reassigned to Sule Abdullahi.", undo: "reassign" }); }
  };
  const undo = () => {
    if (toast?.undo === "assign") setAssignApproved(false);
    if (toast?.undo === "reassign") setReassignApproved(false);
    setToast(null);
  };
  const futureLabel = day === "thursday" ? "Thursday 29 Oct" : "Friday 30 Oct";

  return <main className="transport-page">
    <header className="transport-header"><div><h1>Transport</h1><p>4 pickups today · {assigned ? "all assigned" : "1 needs a driver"}</p></div><Button icon="plus" onClick={() => setToast({ text: "Add pickup opens a form, designed later." })}>Add pickup</Button></header>
    <div className="transport-tabs">{([["today", "Today"], ["thursday", "Thursday 29 Oct"], ["friday", "Friday 30 Oct"]] as [TransportDay,string][]).map(([value,label]) => <button key={value} className={day === value ? "is-active" : ""} onClick={() => setDay(value)}>{label}</button>)}</div>
    {day !== "today" ? <div className="transport-future"><span><Icon name="calendar" size={25}/></span><h2>No pickups scheduled for {futureLabel} yet.</h2><p>Pickups appear here once flights are confirmed.</p></div> : <>
      {mode === "error" && <div className="transport-error"><Icon name="alert"/><span>We couldn't load the driver schedule. Showing the last update at 11:18.</span><Button onClick={() => changeMode("default")}>Retry</Button></div>}
      {mode === "loading" ? <div className="transport-loading">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index}/>)}</div> : <>
        {mode !== "empty" && <div className="transport-decisions"><TransportDecision type="assign" approved={assignApproved} hovered={hovered} setHovered={setHovered} approve={() => approve("assign")} review={() => setToast({ text: "Opens the full proposal." })}/><TransportDecision type="reassign" approved={reassignApproved} hovered={hovered} setHovered={setHovered} approve={() => approve("reassign")} review={() => setToast({ text: "Opens the full proposal." })}/></div>}
        <TransportBoard assignApproved={assigned} reassignApproved={reassigned} hovered={hovered} openDriver={setDriver}/>
      </>}
    </>}
    <TransportStateSwitch mode={mode} setMode={changeMode}/>
    {driver && <DriverDrawer driver={driver} close={() => setDriver(null)} openProfile={openProfile}/>}
    {toast && <div className="toast-v4 transport-toast"><Icon name="check"/><span>{toast.text}</span>{toast.undo && <button onClick={undo}>Undo</button>}<button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type RoomsMode = "default" | "loading" | "empty" | "error";
type RoomStatus = "ready" | "occupied" | "needs-cleaning" | "cleaning" | "out-of-service" | "proposed";
type RoomWing = "west" | "east" | "garden";

const proposedRooms = new Set([203,206,302,304,309,310,410,411,412,413,508,509,510,511,611,612,613]);
const occupiedRooms = new Set([101,102,105,108,112,114,204,208,214,301,305,307,314,401,405,502,506,603]);
const needsCleaningRooms = new Set([201,217,306,409]);
const cleaningRooms = new Set([504]);
const outOfServiceRooms = new Set([116,619]);
const roomStatusMeta: Record<RoomStatus, { label: string; count: number; icon: IconName }> = {
  ready: { label: "Ready", count: 78, icon: "check" },
  occupied: { label: "Occupied", count: 18, icon: "user" },
  "needs-cleaning": { label: "Needs cleaning", count: 4, icon: "brush" },
  cleaning: { label: "Cleaning", count: 1, icon: "loader" },
  "out-of-service": { label: "Out of service", count: 2, icon: "minus" },
  proposed: { label: "Proposed", count: 17, icon: "sparkle" },
};
const roomStatus = (room: number): RoomStatus => proposedRooms.has(room) ? "proposed" : occupiedRooms.has(room) ? "occupied" : needsCleaningRooms.has(room) ? "needs-cleaning" : cleaningRooms.has(room) ? "cleaning" : outOfServiceRooms.has(room) ? "out-of-service" : "ready";
const roomWing = (room: number): RoomWing => {
  const suffix = room % 100;
  return suffix <= 7 ? "west" : suffix <= 14 ? "east" : "garden";
};
const roomIcon = (status: RoomStatus): IconName => roomStatusMeta[status].icon;

function RoomSummary({ status, selected, select }: { status: RoomStatus; selected: boolean; select: () => void }) {
  const item = roomStatusMeta[status];
  return <button className={`room-summary room-summary--${status} ${selected ? "is-selected" : ""}`} onClick={select}><span><Icon name={item.icon} size={18}/></span><div><b>{item.count}</b><small>{item.label}</small></div></button>;
}

function RoomSelect({ value, setValue, children }: { value: string; setValue: (value: string) => void; children: ReactNode }) {
  return <label className="room-select"><select value={value} onChange={(event) => setValue(event.target.value)}>{children}</select><Icon name="chevron" size={15}/></label>;
}

function RoomTile({ room, selected, faded, select }: { room: number; selected: boolean; faded: boolean; select: () => void }) {
  const status = roomStatus(room);
  return <button className={`room-tile room-tile--${status} ${selected ? "is-selected" : ""} ${faded ? "is-faded" : ""}`} title={`Room ${room} · ${roomStatusMeta[status].label}`} onClick={select}><b>{room}</b><Icon name={roomIcon(status)} size={15}/></button>;
}

function RoomWingBlock({ wing, columns, floors, matches, selected, select }: { wing: RoomWing; columns: number[]; floors: number[]; matches: (room: number) => boolean; selected: number | null; select: (room: number) => void }) {
  const range = wing === "west" ? "x01 to x07" : wing === "east" ? "x08 to x14" : "x15 to x20";
  return <section className={`hotel-wing hotel-wing--${wing}`}><header><b>{wing.toUpperCase()}</b><code>{range}</code></header>{floors.map((floor) => <div className="wing-floor" key={floor}>{columns.map((column) => {
    const room = floor * 100 + column;
    return <RoomTile key={room} room={room} selected={selected === room} faded={!matches(room)} select={() => select(room)}/>;
  })}</div>)}</section>;
}

function RoomInspector({ room, notify, openPlan, openMove, openSanitation }: { room: number | null; notify: (message: string) => void; openPlan: () => void; openMove: () => void; openSanitation: () => void }) {
  if (!room) return <div className="room-inspector room-inspector--empty"><Icon name="pointer"/><span>Select a room to see details.</span></div>;
  const status = roomStatus(room);
  const wing = roomWing(room);
  const floor = Math.floor(room / 100);
  const badgeLabel = status === "proposed" ? "Ready" : status === "cleaning" ? "Cleaning in progress" : roomStatusMeta[status].label;
  const badgeTone: ArrivalTone = status === "occupied" ? "info" : status === "needs-cleaning" || status === "cleaning" ? "warning" : status === "out-of-service" ? "neutral" : "success";
  const text = room === 412 ? <><b>Proposed:</b> Bishop Augustine Okafor, Cat. 1. Expected check-in 17:00, departs Sat 31 Oct.</> :
    status === "proposed" ? <><b>Proposed</b> in the current allocation plan. Open the plan to see the guest.</> :
    status === "occupied" ? <>A guest is staying here. Open the plan to see who.</> :
    status === "ready" ? <>Ready and free. The allocator can use this room.</> :
    status === "needs-cleaning" ? <>Waiting for housekeeping. Not offered to guests until it is ready.</> :
    status === "cleaning" ? <>Housekeeping is cleaning this room now.</> :
    <>Out of service. The allocator will not use this room.</>;
  const planActions = status === "proposed";
  const cleaningActions = status === "needs-cleaning" || status === "cleaning";
  return <div className={`room-inspector room-inspector--${status}`}>
    <span className="inspector-room-number">{room}</span>
    <div className="inspector-name"><div><h2>Room {room}</h2><ArrivalBadge tone={badgeTone}>{badgeLabel}</ArrivalBadge></div><p>{room === 412 && "Executive suite · "}{wing[0].toUpperCase() + wing.slice(1)} wing · Floor {floor}</p></div>
    <div className="inspector-message"><Icon name={status === "proposed" ? "sparkle" : "info"} size={18}/><span>{text}</span></div>
    <div className="inspector-actions">{(planActions || status === "occupied") && <Button onClick={openMove}>Move guest</Button>}{planActions && <Button onClick={openPlan}>Open plan</Button>}{cleaningActions && <Button onClick={openSanitation}>Open Sanitation</Button>}</div>
  </div>;
}

function RoomsStateSwitch({ mode, setMode }: { mode: RoomsMode; setMode: (mode: RoomsMode) => void }) {
  return <div className="state-switch rooms-state-switch"><span>Preview</span>{(["default","loading","empty","error"] as RoomsMode[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function RoomsPage({ embedded = false, openAllocation, openMoveWarning, openSanitation }: { embedded?: boolean; openAllocation?: () => void; openMoveWarning?: () => void; openSanitation?: () => void }) {
  const [mode, setMode] = useState<RoomsMode>("default");
  const [selectedRoom, setSelectedRoom] = useState<number | null>(412);
  const [wing, setWing] = useState("all");
  const [floor, setFloor] = useState("all");
  const [status, setStatus] = useState<RoomStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const floors = [6,5,4,3,2,1];
  const matches = (room: number) => {
    if (wing !== "all" && roomWing(room) !== wing) return false;
    if (floor !== "all" && Math.floor(room / 100).toString() !== floor) return false;
    if (status !== "all" && roomStatus(room) !== status) return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return room.toString().includes(needle) || ((needle === "okafor" || needle === "augustine") && room === 412);
  };
  const changeMode = (next: RoomsMode) => {
    setMode(next);
    setSelectedRoom(next === "empty" ? null : 412);
  };
  const toggleSummary = (next: RoomStatus) => setStatus(status === next ? "all" : next);
  const notifyPlan = () => openAllocation ? openAllocation() : setToast("Opens the Allocation plan (Screen 9).");
  const moveGuest = () => openMoveWarning ? openMoveWarning() : setToast("Starts a move. Opens the warning (Screen 10) if it breaks a rule.");

  return <main className="rooms-page">
    <header className="rooms-header"><div><h1>Rooms</h1><p>120 rooms · 78 ready</p></div><Button kind="primary" icon="sparkle" onClick={notifyPlan}>Run allocator</Button></header>
    <div className="rooms-tabs"><button className="is-active">Overview</button><button onClick={notifyPlan}>Allocation plan</button></div>
    {mode === "error" && <div className="rooms-error"><Icon name="alert"/><span>We couldn't load room status. Showing the last update at 11:18.</span><Button onClick={() => changeMode("default")}>Retry</Button></div>}
    <div className="rooms-summary">{(Object.keys(roomStatusMeta) as RoomStatus[]).map((item) => <RoomSummary key={item} status={item} selected={status === item} select={() => toggleSummary(item)}/>)}</div>
    <div className="rooms-filters">
      <RoomSelect value={wing} setValue={setWing}><option value="all">All wings</option><option value="west">West</option><option value="east">East</option><option value="garden">Garden</option></RoomSelect>
      <RoomSelect value={floor} setValue={setFloor}><option value="all">All floors</option>{floors.map((item) => <option value={item} key={item}>Floor {item}</option>)}</RoomSelect>
      <RoomSelect value={status} setValue={(value) => setStatus(value as RoomStatus | "all")}><option value="all">All status</option><option value="ready">Ready</option><option value="occupied">Occupied</option><option value="needs-cleaning">Needs cleaning</option><option value="cleaning">Cleaning in progress</option><option value="out-of-service">Out of service</option><option value="proposed">Proposed</option></RoomSelect>
      <label className="rooms-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Room or guest"/></label>
    </div>
    <section className="building-card">
      {mode === "loading" ? <div className="rooms-loading">{floors.map((item) => <div key={item}>{Array.from({ length: 20 },(_,index) => <Skeleton key={index}/>)}</div>)}</div> : <>
        <RoomInspector room={selectedRoom} notify={setToast} openPlan={notifyPlan} openMove={moveGuest} openSanitation={() => openSanitation ? openSanitation() : setToast("Opens Sanitation (Screen 11).")}/>
        <div className="building-scroll"><div className="hotel-elevation">
          <div className="floor-labels"><span/>{floors.map((item) => <b key={item}>F{item}</b>)}</div>
          <RoomWingBlock wing="west" columns={[1,2,3,4,5,6,7]} floors={floors} matches={matches} selected={selectedRoom} select={setSelectedRoom}/>
          <i className="wing-gap"/>
          <RoomWingBlock wing="east" columns={[8,9,10,11,12,13,14]} floors={floors} matches={matches} selected={selectedRoom} select={setSelectedRoom}/>
          <i className="wing-gap"/>
          <RoomWingBlock wing="garden" columns={[15,16,17,18,19,20]} floors={floors} matches={matches} selected={selectedRoom} select={setSelectedRoom}/>
        </div></div>
      </>}
    </section>
    <p className="rooms-caption">Demo data. All names are fictional.</p>
    {!embedded && <RoomsStateSwitch mode={mode} setMode={changeMode}/>}
    {toast && <div className="toast-v4 rooms-toast"><Icon name="check"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type AllocationMode = "default" | "loading" | "expired" | "error";
type AllocationLine = { room: number; guest: string; category?: string; role: string; type: string; wing: "East" | "West"; floor: number; why: string; match: "High" | "Partial"; warning?: boolean };

const allocationLines: AllocationLine[] = [
  { room: 412, guest: "Bishop Augustine Okafor", category: "Cat. 1", role: "Principal", type: "Executive suite", wing: "East", floor: 4, why: "Tier match", match: "High" },
  { room: 412, guest: "Mrs. Chioma Okafor", role: "Wife", type: "Executive suite", wing: "East", floor: 4, why: "Shares with principal", match: "High" },
  { room: 413, guest: "Rev. Tobi Adewale", role: "Chaplain", type: "Deluxe king", wing: "East", floor: 4, why: "Next to principal", match: "High" },
  { room: 511, guest: "Mr. Segun Afolabi", role: "Security", type: "Deluxe king", wing: "East", floor: 5, why: "Proximity partly met", match: "Partial", warning: true },
  { room: 612, guest: "Archbishop Tendai Moyo", category: "Cat. 1", role: "Principal", type: "Presidential suite", wing: "East", floor: 6, why: "Tier match", match: "High" },
  { room: 508, guest: "Hon. Ibrahim Bello", category: "Cat. 2", role: "Principal", type: "Executive suite", wing: "East", floor: 5, why: "Tier match", match: "High" },
  { room: 302, guest: "Dr. Ngozi Eze", category: "Cat. 2", role: "Principal", type: "Twin", wing: "West", floor: 3, why: "Tier match", match: "High" },
  { room: 304, guest: "Ms. Amara Obi", role: "Assistant", type: "Twin, accessible", wing: "West", floor: 3, why: "Accessible room", match: "High" },
  { room: 410, guest: "Canon Peter Adeyemi", category: "Cat. 2", role: "Principal", type: "Deluxe king", wing: "East", floor: 4, why: "Tier match", match: "High" },
  { room: 411, guest: "Mr. Emeka Nwachukwu", role: "Aide", type: "Deluxe king", wing: "East", floor: 4, why: "Team grouping", match: "High" },
  { room: 509, guest: "Dr. Halima Sani", category: "Cat. 2", role: "Principal", type: "Executive suite", wing: "East", floor: 5, why: "Tier match", match: "High" },
  { room: 510, guest: "Mr. Yusuf Danjuma", role: "Assistant", type: "Deluxe king", wing: "East", floor: 5, why: "Team grouping", match: "High" },
  { room: 611, guest: "Rt. Rev. Joseph Eke", category: "Cat. 1", role: "Principal", type: "Presidential suite", wing: "East", floor: 6, why: "Tier match", match: "High" },
  { room: 613, guest: "Mr. Tunde Bakare", role: "Security", type: "Deluxe king", wing: "East", floor: 6, why: "Team grouping", match: "High" },
  { room: 309, guest: "Mrs. Adaeze Nnamdi", category: "Cat. 3", role: "Principal", type: "Twin", wing: "West", floor: 3, why: "Tier match", match: "High" },
  { room: 310, guest: "Mr. Kehinde Ajayi", category: "Cat. 3", role: "Principal", type: "Twin", wing: "West", floor: 3, why: "Tier match", match: "High" },
  { room: 203, guest: "Ms. Zainab Lawal", category: "Cat. 3", role: "Principal", type: "Twin", wing: "West", floor: 2, why: "Tier match", match: "High" },
  { room: 206, guest: "Mr. Femi Coker", role: "Assistant", type: "Twin", wing: "West", floor: 2, why: "Proximity partly met", match: "Partial", warning: true },
];

function PlanCheckbox({ checked, mixed, disabled, toggle, label }: { checked: boolean; mixed?: boolean; disabled?: boolean; toggle: () => void; label: string }) {
  return <button className={`plan-checkbox ${checked ? "is-checked" : ""} ${mixed ? "is-mixed" : ""}`} disabled={disabled} onClick={toggle} aria-label={label}>{checked ? <Icon name="check" size={14}/> : mixed ? <i/> : null}</button>;
}

function AllocationSummary() {
  return <section className="allocation-summary">
    <div className="satisfaction-hero"><span><Icon name="sparkle" size={16}/>Overall satisfaction</span><b>92%</b><small>How well the plan fits every guest</small></div>
    <div className="allocation-stat allocation-stat--guests"><span><Icon name="users"/></span><div><b>18</b><small>guests</small></div></div>
    <div className="allocation-stat allocation-stat--rules"><span><Icon name="check"/></span><div><b>16</b><small>lines meet every rule</small></div></div>
    <div className="allocation-stat allocation-stat--warnings"><span><Icon name="alert"/></span><div><b>2</b><small>lines have warnings</small></div></div>
  </section>;
}

function AllocationReasons({ room, openProfile, openMoveWarning }: { room: number; openProfile: () => void; openMoveWarning: () => void }) {
  const proximity = room === 511 ? "511 is on floor 5 and the principal is in 412 on floor 4." : "206 is on floor 2 and the principal is in 302 on floor 3.";
  return <div className="allocation-reasons"><div>
    <p><Icon name="check"/><span><b>Hard rules:</b> met</span></p>
    <p><Icon name="check"/><span><b>Tier match:</b> met</span></p>
    <p className="is-warning"><Icon name="alert"/><span><b>Proximity to principal:</b> partly met. {proximity}</span></p>
    <p className="is-neutral"><Icon name="minus"/><span><b>Share group:</b> not needed</span></p>
  </div><span><Button icon="swap" onClick={openMoveWarning}>Change room</Button><Button kind="ghost" onClick={openProfile}>View guest</Button></span></div>;
}

function AllocationRow({ line, checked, disabled, expanded, toggleCheck, toggleExpand, openProfile, openMoveWarning }: { line: AllocationLine; checked: boolean; disabled: boolean; expanded: boolean; toggleCheck: () => void; toggleExpand: () => void; openProfile: () => void; openMoveWarning: () => void }) {
  return <><div className={`allocation-row ${line.warning ? "is-warning" : ""}`}>
    <PlanCheckbox checked={checked} disabled={disabled} toggle={toggleCheck} label={`Select ${line.guest}`}/>
    <div className="allocation-guest"><span><b>{line.guest}</b>{line.category && <i>{line.category}</i>}</span><small>{line.role}</small></div>
    <div className="allocation-room"><b>{line.room}</b><span><strong>{line.type}</strong><small>{line.wing} wing · F{line.floor}</small></span></div>
    <div className="allocation-why"><span>{line.why}</span></div>
    <div className="allocation-match"><ArrivalBadge tone={line.match === "High" ? "success" : "warning"}>{line.match}</ArrivalBadge></div>
    <div className="allocation-rules"><ArrivalBadge tone={line.warning ? "warning" : "success"}><Icon name={line.warning ? "alert" : "check"} size={13}/>{line.warning ? "Warning" : "Meets all"}</ArrivalBadge></div>
    {line.warning ? <button className={`allocation-chevron ${expanded ? "is-open" : ""}`} onClick={toggleExpand} aria-label="Toggle warning details"><Icon name="chevron" size={17}/></button> : <span/>}
  </div>{line.warning && expanded && <AllocationReasons room={line.room} openProfile={openProfile} openMoveWarning={openMoveWarning}/>}</>;
}

function AllocationStateSwitch({ mode, setMode }: { mode: AllocationMode; setMode: (mode: AllocationMode) => void }) {
  return <div className="state-switch allocation-state-switch"><span>Preview</span>{(["default","loading","expired","error"] as AllocationMode[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function AllocationPage({ embedded = false, openRooms, openMoveWarning, openProfile }: { embedded?: boolean; openRooms?: () => void; openMoveWarning?: () => void; openProfile?: () => void }) {
  const lineKey = (line: AllocationLine) => `${line.room}-${line.guest}`;
  const defaultChecked = allocationLines.filter((line) => !line.warning).map(lineKey);
  const [mode, setMode] = useState<AllocationMode>("default");
  const [checked, setChecked] = useState<string[]>(defaultChecked);
  const [expanded, setExpanded] = useState<number[]>([511]);
  const [showExtra, setShowExtra] = useState(false);
  const [result, setResult] = useState<{ type: "approved" | "rejected"; count: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const visible = showExtra ? allocationLines : allocationLines.slice(0,8);
  const allChecked = checked.length === allocationLines.length;
  const mixed = checked.length > 0 && !allChecked;
  const changeMode = (next: AllocationMode) => {
    setMode(next); setChecked(defaultChecked); setExpanded([511]); setShowExtra(false); setResult(null);
  };
  const toggle = (key: string) => setChecked((items) => items.includes(key) ? items.filter((item) => item !== key) : [...items,key]);
  const approve = (count: number) => { setResult({ type: "approved", count }); setToast(`Plan approved. ${count} lines applied.`); };
  const reject = () => { setResult({ type: "rejected", count: 0 }); setToast("Plan rejected. Nothing was changed."); };
  const notifyRooms = () => openRooms ? openRooms() : setToast("Opens Rooms overview (Screen 8).");
  const changeRoom = () => openMoveWarning ? openMoveWarning() : setToast("Opens the move-room warning (Screen 10).");

  return <main className="allocation-page">
    <header className="allocation-header"><div><span><h1>Allocation plan</h1><i><Icon name="sparkle" size={14}/>Suggested</i></span><p>Suggested at 11:05 for 18 guests arriving today.</p></div></header>
    <div className="allocation-tabs"><button onClick={notifyRooms}>Overview</button><button className="is-active">Allocation plan</button></div>
    {mode === "expired" && <div className="allocation-expired"><Icon name="alert"/><span>This plan is out of date because rooms changed. Run the allocator again.</span><Button icon="sparkle" onClick={() => setToast("Runs the allocator again.")}>Run allocator</Button></div>}
    {result?.type === "approved" && <div className="allocation-result is-approved"><Icon name="check"/><span>Plan approved by Ada Nwosu · 11:21. {result.count} rooms updated.</span><button onClick={notifyRooms}>Open Rooms</button></div>}
    {result?.type === "rejected" && <div className="allocation-result is-rejected"><Icon name="minus"/><span>Plan rejected. Nothing was changed.</span></div>}
    {mode === "loading" ? <div className="allocation-loading">{Array.from({ length: 6 },(_,index) => <Skeleton key={index}/>)}</div> : mode === "error" ? <div className="allocation-error-card"><span><Icon name="alert" size={24}/></span><div><h2>The allocator couldn't finish. Nothing was changed.</h2><p>Try again, or come back in a moment.</p></div><Button kind="primary" onClick={() => { changeMode("default"); setToast("Allocator is running again."); }}>Try again</Button></div> : <>
      <AllocationSummary/>
      <section className="allocation-table">
        <div className="allocation-table-head"><PlanCheckbox checked={allChecked} mixed={mixed} disabled={!!result} toggle={() => setChecked(allChecked ? [] : allocationLines.map(lineKey))} label="Select all lines"/><span>Guest</span><span>Suggested room</span><span>Why</span><span>Preference match</span><span>Rules</span><span/></div>
        {visible.map((line) => <AllocationRow key={lineKey(line)} line={line} checked={checked.includes(lineKey(line))} disabled={!!result} expanded={expanded.includes(line.room)} toggleCheck={() => toggle(lineKey(line))} toggleExpand={() => setExpanded((items) => items.includes(line.room) ? items.filter((item) => item !== line.room) : [...items,line.room])} openProfile={() => openProfile ? openProfile() : setToast("Opens the Guest profile (Screen 3).")} openMoveWarning={changeRoom}/>)}
        <button className={`allocation-more ${showExtra ? "is-open" : ""}`} onClick={() => setShowExtra((value) => !value)}>{showExtra ? "Show fewer lines" : "Show 10 more lines"}<Icon name="chevron" size={17}/></button>
      </section>
      {!result && <div className="allocation-approval"><span><Icon name="shield"/><b>Nothing changes until you approve.</b></span><div><button className="reject-plan" onClick={reject}>Reject plan</button><button className="approve-selected" disabled={checked.length === 0 || mode === "expired"} onClick={() => approve(checked.length)}>Approve selected ({checked.length})</button><button className="approve-all" disabled={mode === "expired"} onClick={() => { setChecked(allocationLines.map(lineKey)); approve(18); }}>Approve all 18</button></div></div>}
    </>}
    {!embedded && <AllocationStateSwitch mode={mode} setMode={changeMode}/>}
    {toast && <div className="toast-v4 allocation-toast"><Icon name="check"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type MoveWarningMode = "default" | "reason" | "closed";

function MoveWarningSwitch({ mode, setMode }: { mode: MoveWarningMode; setMode: (mode: MoveWarningMode) => void }) {
  const items: { value: MoveWarningMode; label: string }[] = [{ value: "default", label: "Default" }, { value: "reason", label: "Reason added" }, { value: "closed", label: "Closed" }];
  return <div className="state-switch move-warning-switch"><span>Preview</span>{items.map((item) => <button key={item.value} className={mode === item.value ? "is-active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}</div>;
}

function MoveRoomDialog({ reason, setReason, close, assign }: { reason: string; setReason: (value: string) => void; close: () => void; assign: () => void }) {
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    reasonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <div className="move-warning-scrim" onClick={close}>
    <section className="move-warning-dialog" role="dialog" aria-modal="true" aria-labelledby="move-warning-title" onClick={(event) => event.stopPropagation()}>
      <header><span><Icon name="alert" size={22}/></span><h2 id="move-warning-title">This move breaks 1 rule</h2><button aria-label="Close warning" onClick={close}><Icon name="close"/></button></header>
      <div className="move-warning-body">
        <p className="move-story">Move <b>Ms. Amara Obi</b> (assistant to Dr. Ngozi Eze) from room <b>304</b> to room <b>507</b>.</p>
        <div className="move-room-strip">
          <div><b>304</b><span><strong>Twin, accessible</strong><small>West wing · F3</small></span></div>
          <Icon name="arrow" size={18}/>
          <div className="move-to-room"><b>507</b><span><strong>Not accessible</strong><small>West wing · F5</small></span></div>
        </div>
        <section className="move-warning-section"><h3>BROKEN RULE</h3><div className="broken-rule"><Icon name="accessibility" size={18}/><span>Ms. Obi needs an accessible room. Room 507 is not accessible.</span></div></section>
        <section className="move-warning-section"><h3>WHAT YOU LOSE</h3><div className="move-loss"><p><b>Proximity to Dr. Ngozi Eze</b><ArrivalBadge tone="success">High</ArrivalBadge><Icon name="arrow" size={16}/><ArrivalBadge tone="error">Low</ArrivalBadge></p><span><Icon name="pin" size={16}/>Dr. Eze is in room 302 on floor 3.</span></div></section>
        <label className="move-reason"><span>Reason for assigning anyway <b>*</b></span><textarea ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value)} rows={3}/><small><Icon name="activity" size={14}/>This is saved in the activity log.</small></label>
      </div>
      <footer><Button onClick={close}>Cancel</Button><button className="assign-anyway" disabled={!reason.trim()} onClick={assign}>Assign anyway</button></footer>
    </section>
  </div>;
}

function MoveWarningScreen({ origin = "rooms", dismiss, openRooms, openAllocation, overlayOnly = false }: { origin?: "rooms" | "allocation"; dismiss?: () => void; openRooms?: () => void; openAllocation?: () => void; overlayOnly?: boolean }) {
  const [mode, setMode] = useState<MoveWarningMode>("default");
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const open = mode !== "closed";
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const changeMode = (next: MoveWarningMode) => {
    setMode(next);
    setReason(next === "reason" ? "Room 304 is needed for another accessible guest arriving tonight." : "");
  };
  const closeLocal = () => { setMode("closed"); setReason(""); };
  const close = () => { if (dismiss) dismiss(); else closeLocal(); };
  const assign = () => { closeLocal(); setToast("Room moved. Reason saved in Activity."); };
  const undo = () => setToast("Move undone.");
  return <div className="move-warning-screen">
    {!overlayOnly && (origin === "allocation" ? <AllocationPage embedded openRooms={openRooms} openMoveWarning={() => undefined}/> : <RoomsPage embedded openAllocation={openAllocation} openMoveWarning={() => undefined}/>)}
    {open && <MoveRoomDialog reason={reason} setReason={setReason} close={close} assign={assign}/>}
    {!overlayOnly && <MoveWarningSwitch mode={mode} setMode={changeMode}/>}
    {toast && <div className="toast-v4 move-warning-toast"><Icon name="check"/><span>{toast}</span>{toast.startsWith("Room moved") && <button onClick={undo}>Undo</button>}<button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </div>;
}

type SanitationMode = "default" | "loading" | "empty" | "error";
type CleaningRow = { room: number; type: string; wing: string; checkedOut: string; status: "In progress" | "Not started"; ready: string; needed: string; action?: boolean; late?: boolean };

const cleaningQueue: CleaningRow[] = [
  { room: 504, type: "Executive suite", wing: "West", checkedOut: "09:40", status: "In progress", ready: "11:25", needed: "13:00" },
  { room: 217, type: "Twin", wing: "Garden", checkedOut: "09:55", status: "Not started", ready: "11:30", needed: "12:30", action: true },
  { room: 306, type: "Deluxe king", wing: "West", checkedOut: "11:00", status: "Not started", ready: "12:45", needed: "12:30", action: true, late: true },
  { room: 409, type: "Executive suite", wing: "East", checkedOut: "10:20", status: "Not started", ready: "12:05", needed: "14:00" },
  { room: 201, type: "Twin", wing: "West", checkedOut: "10:45", status: "Not started", ready: "12:30", needed: "17:00" },
];

function SanitationSummary({ empty, rows }: { empty: boolean; rows: CleaningRow[] }) {
  const items = [
    { value: empty ? 0 : rows.filter((row) => row.status === "Not started").length, label: "Not started", icon: "brush" as IconName, tone: "waiting" },
    { value: empty ? 0 : rows.filter((row) => row.status === "In progress").length, label: "In progress", icon: "loader" as IconName, tone: "cleaning" },
    { value: 12, label: "Clean today", icon: "check" as IconName, tone: "done" },
  ];
  return <div className="sanitation-summary">{items.map((item) => <div className={`sanitation-stat sanitation-stat--${item.tone}`} key={item.label}><span><Icon name={item.icon}/></span><div><b>{item.value}</b><small>{item.label}</small></div></div>)}</div>;
}

function CleaningQueueRow({ row, priority, first, last, reverse }: { row: CleaningRow; priority: number; first: boolean; last: boolean; reverse: () => void }) {
  return <div className={`cleaning-row ${row.late ? "is-late" : ""}`}>
    <div className={`cleaning-priority ${first ? "is-first" : ""} ${last ? "is-last" : ""}`}><span className={row.status === "In progress" ? "is-active" : row.late ? "is-late" : ""}>{priority}</span></div>
    <div className="cleaning-room"><b>{row.room}</b><small>{row.type} · {row.wing}</small></div>
    <time className="checked-out">{row.checkedOut}</time>
    <div className="cleaning-status"><ArrivalBadge tone={row.status === "In progress" ? "info" : "neutral"}>{row.status === "In progress" && <Icon name="loader" size={13}/>} {row.status}</ArrivalBadge></div>
    <div className="ready-estimate"><b>{row.ready}</b>{row.late && <ArrivalBadge tone="warning"><Icon name="alert" size={13}/>Ready 15 min after it is needed</ArrivalBadge>}</div>
    <time className="needed-by">{row.needed}</time>
    <div className="cleaning-action">{row.action && <button onClick={reverse}>Reverse check-out</button>}</div>
  </div>;
}

function ReverseCheckoutDialog({ row, close, reverse }: { row: CleaningRow; close: () => void; reverse: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <div className="reverse-dialog-scrim" onClick={close}><section className="reverse-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><h2>Reverse this check-out?</h2><p>The room goes back to Occupied.</p><div><b>Room {row.room}</b><span>{row.type} · {row.wing}</span></div><footer><Button onClick={close}>Cancel</Button><button onClick={reverse}>Reverse</button></footer></section></div>;
}

function SanitationStateSwitch({ mode, setMode }: { mode: SanitationMode; setMode: (mode: SanitationMode) => void }) {
  return <div className="state-switch sanitation-state-switch"><span>Preview</span>{(["default","loading","empty","error"] as SanitationMode[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function SanitationPage() {
  const [mode, setMode] = useState<SanitationMode>("default");
  const [tab, setTab] = useState<"queue" | "done">("queue");
  const [removed, setRemoved] = useState<number[]>([]);
  const [undoRoom, setUndoRoom] = useState<number | null>(null);
  const [dialogRoom, setDialogRoom] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const rows = cleaningQueue.filter((row) => !removed.includes(row.room));
  const dialogRow = cleaningQueue.find((row) => row.room === dialogRoom);
  const changeMode = (next: SanitationMode) => { setMode(next); setTab("queue"); setRemoved([]); setUndoRoom(null); setDialogRoom(null); };
  const reverse = (row: CleaningRow) => {
    setRemoved((items) => [...items,row.room]);
    setUndoRoom(row.room);
    setDialogRoom(null);
    setToast(`Check-out reversed. Room ${row.room} is Occupied again.`);
  };
  const undo = () => { if (undoRoom) setRemoved((items) => items.filter((room) => room !== undoRoom)); setUndoRoom(null); setToast(null); };

  return <main className="sanitation-page">
    <header className="sanitation-header"><h1>Sanitation</h1><p>Rooms waiting to be cleaned, in priority order.</p></header>
    <SanitationSummary empty={mode === "empty"} rows={rows}/>
    <div className="sanitation-tabs"><button className={tab === "queue" ? "is-active" : ""} onClick={() => setTab("queue")}>Queue</button><button className={tab === "done" ? "is-active" : ""} onClick={() => setTab("done")}>Done today</button></div>
    {mode === "error" && tab === "queue" && <div className="sanitation-error"><Icon name="alert"/><span>We couldn't load the cleaning queue. Showing the last update at 11:18.</span><Button onClick={() => setMode("default")}>Retry</Button></div>}
    {tab === "done" ? <section className="sanitation-done"><span><Icon name="check" size={26}/></span><h2>12 rooms cleaned today</h2><p>Cleaned rooms move here once housekeeping marks them ready.</p></section> : <section className="cleaning-card">
      {mode === "loading" ? <div className="cleaning-loading">{Array.from({ length: 5 },(_,index) => <Skeleton key={index}/>)}</div> : mode === "empty" ? <div className="cleaning-empty"><span><Icon name="sparkle" size={26}/></span><h2>No rooms are waiting. Everything is clean.</h2><p>New check-outs appear here as they happen.</p></div> : <>
        <div className="cleaning-table-head"><span>Priority</span><span>Room</span><span>Checked out</span><span>Status</span><span>Ready by (estimate)</span><span>Needed by</span><span>Action</span></div>
        <div>{rows.map((row,index) => <CleaningQueueRow key={row.room} row={row} priority={index + 1} first={index === 0} last={index === rows.length - 1} reverse={() => setDialogRoom(row.room)}/>)}</div>
      </>}
    </section>}
    <SanitationStateSwitch mode={mode} setMode={changeMode}/>
    {dialogRow && <ReverseCheckoutDialog row={dialogRow} close={() => setDialogRoom(null)} reverse={() => reverse(dialogRow)}/>}
    {toast && <div className="toast-v4 sanitation-toast"><Icon name="check"/><span>{toast}</span><button onClick={undo}>Undo</button><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type RegistrationPreview = "step1" | "errors" | "review" | "failed" | "done" | "done-note";
type RegistrationData = {
  title: string; fullName: string; organisation: string; category: string; contactName: string; email: string; phone: string;
  arrivalMode: string; flight: string; arrivalDate: string; arrivalTime: string; departureDate: string; pickup: string;
};
type PartyGuest = { name: string; role: string; dietary: string; accessibility: string };

const emptyRegistration: RegistrationData = { title: "", fullName: "", organisation: "", category: "", contactName: "", email: "", phone: "", arrivalMode: "", flight: "", arrivalDate: "", arrivalTime: "", departureDate: "", pickup: "" };
const demoRegistration: RegistrationData = { title: "Bishop", fullName: "Augustine Okafor", organisation: "Diocese of Lagos West", category: "Cat. 1", contactName: "Grace Adeyemi", email: "office@diocese.example", phone: "+234 803 000 0000", arrivalMode: "flying", flight: "EK783", arrivalDate: "2026-10-28", arrivalTime: "14:25", departureDate: "2026-10-31", pickup: "" };
const demoGuests: PartyGuest[] = [
  { name: "Mrs. Chioma Okafor", role: "Wife", dietary: "", accessibility: "" },
  { name: "Rev. Tobi Adewale", role: "Chaplain", dietary: "No pork", accessibility: "" },
  { name: "Mr. Segun Afolabi", role: "Security", dietary: "", accessibility: "" },
];

function RegistrationField({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return <label className={`registration-field ${error ? "has-error" : ""}`}><span>{label}{required && <b>*</b>}</span>{children}{error ? <small className="registration-error"><Icon name="alert" size={14}/>{error}</small> : hint ? <small>{hint}</small> : null}</label>;
}

function RegistrationStepBar({ step, go }: { step: number; go: (step: number) => void }) {
  const names = ["Delegation","Arrival","Party","Review"];
  return <div className="registration-progress"><div><b>Step {step} of 4</b><span>{names[step - 1]}</span></div><div className="registration-bars">{names.map((name,index) => <button key={name} className={index + 1 < step ? "is-complete" : index + 1 === step ? "is-current" : ""} disabled={index + 1 >= step} onClick={() => go(index + 1)}><i/><span>{name}</span></button>)}</div></div>;
}

function RegistrationPreviewSwitch({ mode, setMode }: { mode: RegistrationPreview; setMode: (mode: RegistrationPreview) => void }) {
  const items: { value: RegistrationPreview; label: string }[] = [{ value: "step1", label: "Step 1" },{ value: "errors", label: "Errors" },{ value: "review", label: "Review" },{ value: "failed", label: "Failed" },{ value: "done", label: "Done" },{ value: "done-note", label: "Done + note" }];
  return <div className="registration-preview"><span>Preview</span>{items.map((item) => <button key={item.value} className={mode === item.value ? "is-active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}</div>;
}

function PublicConfirmation({ note, backToForm }: { note: boolean; backToForm: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyReference = async () => {
    try { await navigator.clipboard?.writeText("VIP-7K3Q"); } catch { /* Clipboard availability varies in previews. */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return <div className="confirmation-public-wrap">
    <div className="confirmation-logo"><img src="/hostmark-logo-C.svg" alt="Hostmark logo mark"/><b><span>Host</span>mark</b></div>
    <section className="public-confirmation">
      <span className="confirmation-check"><Icon name="check" size={34}/></span>
      <h1>Registration received</h1>
      <p>Thank you. The coordination team will confirm by email.</p>
      <div className="confirmation-reference"><span><small>Your reference</small><b>VIP-7K3Q</b></span><button className={copied ? "is-copied" : ""} onClick={copyReference}><Icon name={copied ? "check" : "copy"} size={17}/>{copied ? "Copied" : "Copy"}</button></div>
      <div className="confirmation-summary"><p><Icon name="users" size={19}/><b>Bishop Augustine Okafor and 3 guests</b></p><p><Icon name="plane" size={19}/><b>Arriving Wed 28 Oct by EK783</b></p></div>
      {note && <aside className="confirmation-note"><Icon name="info" size={18}/><span>We may contact you about a few details.</span></aside>}
      <p className="confirmation-keep">Keep this reference. Quote it if you need to change anything.</p>
      <button className="register-another" onClick={backToForm}>Register another delegation</button>
    </section>
  </div>;
}

function ConfirmationPreviewSwitch({ note, setNote, back }: { note: boolean; setNote: (note: boolean) => void; back: () => void }) {
  return <div className="confirmation-preview"><span>Preview</span><button className={!note ? "is-active" : ""} onClick={() => setNote(false)}>Done</button><button className={note ? "is-active" : ""} onClick={() => setNote(true)}>Done + note</button><button onClick={back}>Registration form</button></div>;
}

function ConfirmationPage({ initialNote = false, backToForm, showPreview = true }: { initialNote?: boolean; backToForm: () => void; showPreview?: boolean }) {
  const [note, setNote] = useState(initialNote);
  return <main className="confirmation-page">{showPreview && <ConfirmationPreviewSwitch note={note} setNote={setNote} back={backToForm}/>}<PublicConfirmation note={note} backToForm={backToForm}/></main>;
}

function RegistrationReviewCard({ title, step, edit, children }: { title: string; step: number; edit: (step: number) => void; children: ReactNode }) {
  return <section className="registration-review-card"><header><h3>{title}</h3><button onClick={() => edit(step)}><Icon name="edit" size={14}/>Edit</button></header><div>{children}</div></section>;
}

function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return <p className="registration-review-row"><span>{label}</span><b>{children}</b></p>;
}

function RegistrationPage({ openConfirmation }: { openConfirmation: () => void }) {
  const [preview, setPreview] = useState<RegistrationPreview>("step1");
  const [step, setStep] = useState(1);
  const [data, setData] = useState<RegistrationData>(emptyRegistration);
  const [guests, setGuests] = useState<PartyGuest[]>([]);
  const [errors, setErrors] = useState<Record<string,string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const setField = (name: keyof RegistrationData, value: string) => { setData((current) => ({ ...current, [name]: value })); setErrors((current) => ({ ...current, [name]: "" })); };
  const setGuest = (index: number, name: keyof PartyGuest, value: string) => {
    setGuests((items) => items.map((guest,itemIndex) => itemIndex === index ? { ...guest, [name]: value } : guest));
    setErrors((current) => ({ ...current, [`guest-${index}-${name}`]: "" }));
  };
  const setGuestCount = (count: number) => setGuests((items) => Array.from({ length: count },(_,index) => items[index] || { name: "", role: "", dietary: "", accessibility: "" }));
  const validate = () => {
    const next: Record<string,string> = {};
    if (step === 1) {
      if (!data.title) next.title = "Choose a title";
      if (!data.fullName.trim()) next.fullName = "Enter the full name";
      if (!data.organisation.trim()) next.organisation = "Enter the position or organisation";
      if (!data.category) next.category = "Choose a category";
      if (!data.contactName.trim()) next.contactName = "Enter the contact person's name";
      if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(data.email)) next.email = "Enter a valid email, for example name@example.com";
      if (!data.phone.trim()) next.phone = "Enter a phone number, for example +234 803 000 0000";
    }
    if (step === 2) {
      if (!data.arrivalMode) next.arrivalMode = "Choose how you are arriving";
      if (data.arrivalMode === "flying" && !data.flight.trim()) next.flight = "Enter the flight number, for example EK783";
      if (data.arrivalMode && !data.arrivalDate) next.arrivalDate = "Enter the arrival date";
      if (data.arrivalMode && !data.arrivalTime) next.arrivalTime = "Enter the arrival time";
      if (data.arrivalMode && !data.departureDate) next.departureDate = "Enter the departure date";
      if (data.arrivalMode === "pickup" && !data.pickup.trim()) next.pickup = "Enter the pickup location";
    }
    if (step === 3) guests.forEach((guest,index) => { if (!guest.name.trim()) next[`guest-${index}-name`] = "Enter this guest's name"; if (!guest.role) next[`guest-${index}-role`] = "Choose a role"; });
    if (step === 4 && !confirmed) next.confirmed = "Tick the box to confirm your details are correct";
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const next = () => {
    if (!validate()) return;
    if (step < 4) setStep((value) => value + 1);
    else {
      setSubmitting(true);
      window.setTimeout(() => { setSubmitting(false); openConfirmation(); }, 1300);
    }
  };
  const applyPreview = (mode: RegistrationPreview) => {
    setPreview(mode); setSubmitting(false); setConfirmed(false); setFailed(mode === "failed");
    if (mode === "step1" || mode === "errors") {
      setStep(1); setData(emptyRegistration); setGuests([]);
      setErrors(mode === "errors" ? { title: "Choose a title", fullName: "Enter the full name", organisation: "Enter the position or organisation", category: "Choose a category", contactName: "Enter the contact person's name", email: "Enter a valid email, for example name@example.com", phone: "Enter a phone number, for example +234 803 000 0000" } : {});
    } else {
      setStep(4); setData(demoRegistration); setGuests(demoGuests); setErrors({});
    }
  };
  const arrivalLabel = data.arrivalMode === "flying" ? "Flying" : data.arrivalMode === "own" ? "Own transport" : "Pickup requested";
  const formatDate = (value: string) => value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "";
  const reviewContent = <div className="registration-review">
    {failed && <div className="registration-failure"><Icon name="alert"/><span>We couldn't send your registration. Your answers are saved. Try again.</span></div>}
    <RegistrationReviewCard title="Delegation" step={1} edit={setStep}><ReviewRow label="Name">{data.title} {data.fullName}</ReviewRow><ReviewRow label="Position">{data.organisation}</ReviewRow><ReviewRow label="Category">{data.category}</ReviewRow><ReviewRow label="Contact">{data.contactName}</ReviewRow><ReviewRow label="Email">{data.email}</ReviewRow><ReviewRow label="Phone">{data.phone}</ReviewRow></RegistrationReviewCard>
    <RegistrationReviewCard title="Arrival" step={2} edit={setStep}><ReviewRow label="Arriving">{arrivalLabel}</ReviewRow>{data.arrivalMode === "flying" && <ReviewRow label="Flight">{data.flight}</ReviewRow>}<ReviewRow label="Arrival">{formatDate(data.arrivalDate)} · {data.arrivalTime}</ReviewRow><ReviewRow label="Departure">{formatDate(data.departureDate)}</ReviewRow>{data.pickup && <ReviewRow label="Pickup">{data.pickup}</ReviewRow>}</RegistrationReviewCard>
    <RegistrationReviewCard title={`Party (${guests.length})`} step={3} edit={setStep}>{guests.length ? guests.map((guest,index) => <div className="review-party-row" key={index}><b>{guest.name} · {guest.role}</b>{(guest.dietary || guest.accessibility) && <small>{[guest.dietary,guest.accessibility].filter(Boolean).join(" · ")}</small>}</div>) : <p className="no-guests">No other guests.</p>}</RegistrationReviewCard>
    <label className={`registration-confirm ${errors.confirmed ? "has-error" : ""}`}><button className={confirmed ? "is-checked" : ""} onClick={() => { setConfirmed((value) => !value); setErrors((current) => ({ ...current, confirmed: "" })); }}>{confirmed && <Icon name="check" size={16}/>}</button><span>I confirm these details are correct</span>{errors.confirmed && <small>{errors.confirmed}</small>}</label>
  </div>;
  const content = step === 1 ? <div className="registration-fields">
    <RegistrationField label="Title" required error={errors.title}><select value={data.title} onChange={(event) => setField("title",event.target.value)}><option value="">Select title</option>{["Bishop","Archbishop","Rev.","Pastor","Dr.","Hon.","Prof.","Mr.","Mrs.","Ms."].map((item) => <option key={item}>{item}</option>)}</select></RegistrationField>
    <RegistrationField label="Full name" required error={errors.fullName}><input value={data.fullName} onChange={(event) => setField("fullName",event.target.value)} placeholder="e.g. Augustine Okafor"/></RegistrationField>
    <RegistrationField label="Position or organisation" required error={errors.organisation}><input value={data.organisation} onChange={(event) => setField("organisation",event.target.value)} placeholder="e.g. Diocese of Lagos West"/></RegistrationField>
    <RegistrationField label="VIP category" required error={errors.category}><select value={data.category} onChange={(event) => setField("category",event.target.value)}><option value="">Select category</option><option>Cat. 1</option><option>Cat. 2</option><option>Cat. 3</option></select></RegistrationField>
    <RegistrationField label="Contact person name" required error={errors.contactName}><input value={data.contactName} onChange={(event) => setField("contactName",event.target.value)}/></RegistrationField>
    <RegistrationField label="Contact email" required error={errors.email} hint="We confirm by email."><input type="email" value={data.email} onChange={(event) => setField("email",event.target.value)}/></RegistrationField>
    <RegistrationField label="Contact phone" required error={errors.phone}><input value={data.phone} onChange={(event) => setField("phone",event.target.value)} placeholder="+234 803 000 0000"/></RegistrationField>
  </div> : step === 2 ? <div className="registration-fields"><RegistrationField label="How are you arriving?" required error={errors.arrivalMode}><div className="arrival-options">{[["flying","plane","Flying"],["own","car","Own transport"],["pickup","pin","I need a pickup"]].map(([value,icon,label]) => <button key={value} className={data.arrivalMode === value ? "is-selected" : ""} onClick={() => setField("arrivalMode",value)}><Icon name={icon as IconName}/><span>{label}</span></button>)}</div></RegistrationField>{data.arrivalMode === "flying" && <RegistrationField label="Flight number" required error={errors.flight}><input value={data.flight} onChange={(event) => setField("flight",event.target.value)} placeholder="e.g. EK783"/></RegistrationField>}{data.arrivalMode && <><div className="registration-date-row"><RegistrationField label="Arrival date" required error={errors.arrivalDate}><input type="date" value={data.arrivalDate} onChange={(event) => setField("arrivalDate",event.target.value)}/></RegistrationField><RegistrationField label="Arrival time" required error={errors.arrivalTime}><input type="time" value={data.arrivalTime} onChange={(event) => setField("arrivalTime",event.target.value)}/></RegistrationField></div><RegistrationField label="Departure date" required error={errors.departureDate}><input type="date" value={data.departureDate} onChange={(event) => setField("departureDate",event.target.value)}/></RegistrationField></>}{data.arrivalMode === "pickup" && <RegistrationField label="Pickup location" required error={errors.pickup} hint="Where should we collect you?"><input value={data.pickup} onChange={(event) => setField("pickup",event.target.value)} placeholder="e.g. Victoria Island, Lagos"/></RegistrationField>}</div> : step === 3 ? <div className="registration-party"><div className="party-stepper"><div><b>How many guests are travelling with you?</b><small>Not counting yourself. Up to 10.</small></div><span><button disabled={guests.length === 0} onClick={() => setGuestCount(guests.length - 1)}>−</button><b>{guests.length}</b><button disabled={guests.length === 10} onClick={() => setGuestCount(guests.length + 1)}>+</button></span></div>{guests.map((guest,index) => <section className="party-guest-card" key={index}><header><span>{index + 1}</span><h3>Guest {index + 1}</h3></header><RegistrationField label="Name" required error={errors[`guest-${index}-name`]}><input value={guest.name} onChange={(event) => setGuest(index,"name",event.target.value)}/></RegistrationField><RegistrationField label="Role" required error={errors[`guest-${index}-role`]}><select value={guest.role} onChange={(event) => setGuest(index,"role",event.target.value)}><option value="">Select role</option>{["Wife","Chaplain","Assistant","Security","Other"].map((item) => <option key={item}>{item}</option>)}</select></RegistrationField><RegistrationField label="Dietary needs"><input value={guest.dietary} onChange={(event) => setGuest(index,"dietary",event.target.value)} placeholder="Optional"/></RegistrationField><RegistrationField label="Accessibility needs"><input value={guest.accessibility} onChange={(event) => setGuest(index,"accessibility",event.target.value)} placeholder="Optional"/></RegistrationField></section>)}</div> : reviewContent;
  const done = preview === "done" || preview === "done-note";
  return <main className="registration-page">
    <RegistrationPreviewSwitch mode={preview} setMode={applyPreview}/>
    {done ? <PublicConfirmation note={preview === "done-note"} backToForm={() => applyPreview("step1")}/> : <div className="registration-column">
      <header className="registration-banner"><div className="public-brand"><img src="/hostmark-logo-C.svg" alt="Hostmark logo mark"/><b><span>Host</span>mark</b></div><p>YOU ARE REGISTERING FOR</p><h2>Lagos Leadership Summit 2026</h2><div className="banner-skyline"><i/><i/><i/><i/><i/></div></header>
      <section className="registration-card">
        <div className="registration-card-body"><h1>Register your delegation</h1><p>Takes about 3 minutes. We will confirm by email.</p><RegistrationStepBar step={step} go={setStep}/>{content}</div>
        <footer className="registration-footer">{step > 1 && <button className="registration-back" onClick={() => setStep((value) => value - 1)}><Icon name="arrow" size={18}/>Back</button>}<button className="registration-next" disabled={submitting} onClick={next}>{submitting && <i/>}<span>{submitting ? "Submitting…" : step === 4 ? "Submit registration" : "Next"}</span>{!submitting && <Icon name="arrow" size={18}/>}</button></footer>
      </section>
    </div>}
    {toast && <div className="toast-v4 registration-toast"><Icon name="check"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type DriverPreview = "default" | "started" | "moved" | "empty" | "offline";
type DriverPickup = { id: string; time: string; guest: string; category?: string; party: string; count: number; place: string; donePlace?: string; destination: string; flight?: string; flightStatus?: string; flightBadge?: string; changed?: string; passengers: { name: string; category?: string }[] };

const driverPickups: Record<string, DriverPickup> = {
  okafor: { id: "okafor", time: "14:55", guest: "Bishop Augustine Okafor", category: "Cat. 1", party: "+3", count: 4, place: "Murtala Muhammed Airport, arrivals", destination: "Harbour Point Hotel & Conference Centre, Lagos", flight: "EK783", flightStatus: "Delayed +45 min", flightBadge: "Delayed +45", changed: "Time changed from 14:10.", passengers: [{ name: "Bishop Augustine Okafor", category: "Cat. 1" },{ name: "Mrs. Chioma Okafor" },{ name: "Rev. Tobi Adewale" },{ name: "Mr. Segun Afolabi" }] },
  moyo: { id: "moyo", time: "11:05", guest: "Archbishop Tendai Moyo", category: "Cat. 1", party: "+2", count: 3, place: "Murtala Muhammed Airport, arrivals", donePlace: "Airport to hotel", destination: "Harbour Point Hotel & Conference Centre, Lagos", flight: "ET512", flightStatus: "Landed", passengers: [{ name: "Archbishop Tendai Moyo", category: "Cat. 1" },{ name: "+ 2 more in the party" }] },
};

function DriverPreviewSwitch({ mode, setMode }: { mode: DriverPreview; setMode: (mode: DriverPreview) => void }) {
  return <div className="driver-preview-switch"><span>Preview</span>{(["default","started","moved","empty","offline"] as DriverPreview[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function PickupDetailsSheet({ pickup, close, notify }: { pickup: DriverPickup; close: () => void; notify: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return <div className="pickup-sheet-scrim" onClick={close}><section className="pickup-sheet" onClick={(event) => event.stopPropagation()}><i className="sheet-grab"/><header><h2>{pickup.time}</h2><button aria-label="Close pickup details" onClick={close}><Icon name="close"/></button></header>
    <div className="sheet-section"><b>DESTINATION</b><p>{pickup.destination}</p></div>
    <div className="sheet-section"><b>PICKUP FROM</b><p>{pickup.place}</p></div>
    <div className="sheet-section"><b>PASSENGERS ({pickup.count})</b><div className="sheet-passengers">{pickup.passengers.map((passenger) => <p key={passenger.name}><span>{passenger.name}</span>{passenger.category && <i>{passenger.category}</i>}</p>)}</div></div>
    {pickup.flight && <div className="sheet-section"><b>FLIGHT</b><p>{pickup.flight} · {pickup.flightStatus}</p></div>}
    {pickup.changed && <div className="sheet-change"><Icon name="alert" size={16}/>{pickup.changed}</div>}
    <button className="sheet-call" onClick={notify}><Icon name="phone"/>Call coordinator</button>
  </section></div>;
}

function DriverHero({ pickup, status, start, pickedUp, call, open }: { pickup: DriverPickup; status: "idle" | "started" | "picked"; start: () => void; pickedUp: () => void; call: () => void; open: () => void }) {
  return <article className="driver-hero" onClick={open}><span className="driver-card-label">{pickup.id === "moyo" ? "CURRENT PICKUP" : "NEXT PICKUP"}</span><strong>{pickup.time}</strong>
    {pickup.flight && <div className={`driver-flight ${pickup.flightStatus === "Landed" ? "is-landed" : ""}`}><code>{pickup.flight}</code><span>{pickup.flightBadge || pickup.flightStatus}</span></div>}
    <p><Icon name="pin"/>{pickup.place}</p><p><Icon name="users"/>{pickup.count} passengers</p>
    <div className="driver-guest"><b>{pickup.guest}</b>{pickup.category && <i>{pickup.category}</i>}<span>{pickup.party}</span></div>
    {pickup.changed && <div className="driver-change"><Icon name="alert" size={16}/>{pickup.changed}</div>}
    {status !== "idle" && <div className={`driver-active-status ${status === "picked" ? "is-picked" : ""}`}><i/>{status === "picked" ? "Picked up" : "On the way"}</div>}
    <div className="driver-hero-actions">{status === "idle" && <button className="driver-start" onClick={(event) => { event.stopPropagation(); start(); }}>Start pickup</button>}{status === "started" && <button className="driver-picked" onClick={(event) => { event.stopPropagation(); pickedUp(); }}><Icon name="check"/>Picked up</button>}<button className="driver-call" onClick={(event) => { event.stopPropagation(); call(); }}><Icon name="phone"/>Call coordinator</button></div>
  </article>;
}

function DriverSmallCard({ pickup, done, open }: { pickup: DriverPickup; done?: boolean; open: () => void }) {
  return <button className={`driver-small-card ${done ? "is-done" : ""}`} onClick={open}><time>{pickup.time}</time><span><b>{pickup.guest} {pickup.party && ` ${pickup.party}`}</b><small>{done ? pickup.donePlace || pickup.place : pickup.place}</small></span><i>{done ? <><Icon name="check" size={13}/>Done</> : "Not started"}</i></button>;
}

function DriverPickupsPage() {
  const [preview, setPreview] = useState<DriverPreview>("default");
  const [day, setDay] = useState<"today" | "tomorrow">("today");
  const [status, setStatus] = useState<"idle" | "started" | "picked">("started");
  const [moyoDone, setMoyoDone] = useState(false);
  const [sheet, setSheet] = useState<DriverPickup | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const moved = preview === "moved";
  const empty = preview === "empty" || day === "tomorrow";
  const completedMoyo = moyoDone || preview === "started";
  const hero = completedMoyo ? driverPickups.okafor : driverPickups.moyo;
  const changePreview = (next: DriverPreview) => { setPreview(next); setDay("today"); setMoyoDone(next === "started"); setStatus("started"); setSheet(null); };
  const call = () => setToast("Calls the coordinator.");
  return <main className="driver-page">
    <DriverPreviewSwitch mode={preview} setMode={changePreview}/>
    <div className="driver-phone-frame">
      <div className="driver-phone-content">
        <header className="driver-header"><div><h1>Hello, Emeka</h1><p>Wednesday 28 October</p></div><button onClick={() => setToast("Opens Notifications (Screen 16).")}><Icon name="bell"/><i/></button></header>
        <div className="driver-segments"><button className={day === "today" ? "is-active" : ""} onClick={() => setDay("today")}>Today</button><button className={day === "tomorrow" ? "is-active" : ""} onClick={() => setDay("tomorrow")}>Tomorrow</button></div>
        {preview === "offline" && <div className="driver-offline"><Icon name="wifiOff"/><span>You're offline. Showing your last update at 11:18.</span></div>}
        {empty ? <div className="driver-empty"><span><Icon name="coffee" size={38}/></span><h2>{day === "tomorrow" ? "No pickups tomorrow yet." : "No pickups today."}</h2><p>{day === "tomorrow" ? "Check back later today." : "Enjoy the break."}</p></div> : <>
          <DriverHero pickup={hero} status={status} start={() => setStatus("started")} pickedUp={() => { if (hero.id === "moyo") { setMoyoDone(true); setStatus("idle"); } else setStatus("picked"); setToast("Marked as picked up."); }} call={call} open={() => setSheet(hero)}/>
          {moved ? <><h2 className="driver-section-label">MOVED</h2><div className="driver-moved-card"><time>14:55</time><div><b>Bishop Augustine Okafor + 3</b><span><Icon name="swap" size={15}/>This pickup was moved to another driver.</span></div></div></> : !completedMoyo && <><h2 className="driver-section-label">LATER</h2><DriverSmallCard pickup={driverPickups.okafor} open={() => setSheet(driverPickups.okafor)}/></>}
          {completedMoyo && <><h2 className="driver-section-label">DONE</h2><DriverSmallCard pickup={driverPickups.moyo} done open={() => setSheet(driverPickups.moyo)}/></>}
        </>}
      </div>
      <nav className="driver-tabbar"><button className="is-active"><Icon name="car"/><span>Pickups</span></button><button onClick={() => setToast("Profile is designed in a later screen.")}><Icon name="user"/><span>Profile</span></button></nav>
      {sheet && <PickupDetailsSheet pickup={sheet} close={() => setSheet(null)} notify={call}/>}
      {toast && <div className="toast-v4 driver-toast"><Icon name="check"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
    </div>
  </main>;
}

type FrontDeskPreview = "default" | "empty" | "offline" | "conflict" | "no-result";
type FrontDeskTab = "arriving" | "in-house" | "leaving";
type FrontDeskAction = "check-in" | "check-out";
type FrontDeskGuest = {
  id: string; name: string; room: string; category: string; timing: string; party: number; rooms: string[];
  tab: FrontDeskTab; status: string; statusTone: "way" | "ready" | "neutral" | "warning"; roomReady?: boolean;
};

const frontDeskGuests: FrontDeskGuest[] = [
  { id: "okafor", name: "Bishop Augustine Okafor", room: "412", category: "Cat. 1", timing: "Expected 16:55", party: 4, rooms: ["412","413","414","415"], tab: "arriving", status: "On the way", statusTone: "way", roomReady: true },
  { id: "obi", name: "Dr. Amara Obi", room: "217", category: "Cat. 3", timing: "Expected 12:30", party: 1, rooms: ["217"], tab: "arriving", status: "Room 217 not ready", statusTone: "warning", roomReady: false },
  { id: "alade", name: "Prof. Funmilayo Alade", room: "305", category: "Cat. 2", timing: "Checked in 10:40", party: 1, rooms: ["305"], tab: "in-house", status: "In house", statusTone: "ready", roomReady: true },
  { id: "okon", name: "Rev. Emmanuel Okon", room: "204", category: "Cat. 3", timing: "Departs 14:00", party: 1, rooms: ["204"], tab: "leaving", status: "Leaving today", statusTone: "neutral", roomReady: true },
];

function FrontDeskPreviewSwitch({ mode, setMode }: { mode: FrontDeskPreview; setMode: (mode: FrontDeskPreview) => void }) {
  const items: { value: FrontDeskPreview; label: string }[] = [{ value: "default", label: "Default" },{ value: "empty", label: "Empty" },{ value: "offline", label: "Offline" },{ value: "conflict", label: "Conflict" },{ value: "no-result", label: "No result" }];
  return <div className="front-desk-preview"><span>Preview</span>{items.map((item) => <button key={item.value} className={mode === item.value ? "is-active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}</div>;
}

function FrontDeskCard({ guest, conflict, open }: { guest: FrontDeskGuest; conflict: boolean; open: (guest: FrontDeskGuest, action: FrontDeskAction) => void }) {
  const arriving = guest.tab === "arriving";
  const disabled = arriving && guest.roomReady === false;
  const roomLabel = guest.rooms.length === 1 ? `room ${guest.room}` : `rooms ${guest.rooms.join(", ")}`;
  return <article className={`front-desk-card ${disabled ? "is-not-ready" : ""}`}>
    <div className={`room-key-tag ${disabled ? "is-warning" : ""}`}><small>ROOM</small><b>{guest.room}</b></div>
    <div className="front-desk-guest"><h2>{guest.name}</h2><p>{guest.category} · {guest.timing}</p><span className={`front-desk-badge is-${guest.statusTone}`}><Icon name={guest.statusTone === "way" ? "navigation" : guest.statusTone === "ready" ? "check" : guest.statusTone === "warning" ? "alert" : "clock"} size={14}/>{guest.status}</span></div>
    {arriving && <div className="front-desk-party">Party of {guest.party} · {roomLabel}{guest.roomReady && <i><Icon name="check" size={12}/>ready</i>}</div>}
    {conflict && guest.id === "okafor" ? <div className="front-desk-conflict"><Icon name="info" size={16}/>Already checked in by Tolu A. at 16:58.</div> : <>
      <button className={`front-desk-action ${arriving ? "is-primary" : "is-secondary"}`} disabled={disabled} onClick={() => open(guest, arriving ? "check-in" : "check-out")}><Icon name={arriving ? "logIn" : "logOut"}/>{arriving ? "Check in" : "Check out"}</button>
      {disabled && <div className="front-desk-housekeeping"><Icon name="loader" size={16}/>Housekeeping is on it.</div>}
    </>}
  </article>;
}

function FrontDeskConfirmSheet({ guest, action, close, confirm }: { guest: FrontDeskGuest; action: FrontDeskAction; close: () => void; confirm: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  const checkingIn = action === "check-in";
  return <div className="front-desk-sheet-scrim" onClick={close}><section className="front-desk-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
    <i className="sheet-grab"/>
    <h2>{checkingIn ? `Check in ${guest.name} to room ${guest.room}?` : `Check out ${guest.name} from room ${guest.room}?`}</h2>
    <p>{checkingIn ? `The party of ${guest.party} will be checked in to rooms ${guest.rooms.join(", ")}.` : "The room goes to housekeeping."}</p>
    <button className="front-desk-confirm" onClick={confirm}>Confirm</button>
    <button className="front-desk-cancel" onClick={close}>Cancel</button>
  </section></div>;
}

function FrontDeskPage() {
  const [preview, setPreview] = useState<FrontDeskPreview>("default");
  const [tab, setTab] = useState<FrontDeskTab>("arriving");
  const [query, setQuery] = useState("");
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkedOut, setCheckedOut] = useState<string[]>([]);
  const [sheet, setSheet] = useState<{ guest: FrontDeskGuest; action: FrontDeskAction } | null>(null);
  const [toast, setToast] = useState<{ message: string; undo: () => void } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 10000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const changePreview = (next: FrontDeskPreview) => {
    setPreview(next);
    setTab("arriving");
    setQuery("");
    setCheckedIn(false);
    setCheckedOut([]);
    setSheet(null);
    setToast(null);
  };
  const guests = frontDeskGuests.filter((guest) => {
    if (checkedOut.includes(guest.id)) return false;
    if (guest.id === "okafor") {
      if (checkedIn && tab !== "in-house") return false;
      if (!checkedIn && tab !== "arriving") return false;
    } else if (guest.tab !== tab) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${guest.name} ${guest.room}`.toLowerCase().includes(needle);
  });
  const arrivingCount = frontDeskGuests.filter((guest) => guest.tab === "arriving" && (guest.id !== "okafor" || !checkedIn)).length;
  const confirmAction = () => {
    if (!sheet) return;
    const { guest, action } = sheet;
    if (action === "check-in") {
      setCheckedIn(true);
      setToast({ message: "Checked in", undo: () => setCheckedIn(false) });
    } else {
      setCheckedOut((items) => [...items, guest.id]);
      setToast({ message: "Checked out", undo: () => setCheckedOut((items) => items.filter((id) => id !== guest.id)) });
    }
    setSheet(null);
  };
  const emptyCopy = tab === "arriving" ? ["Nobody arriving in the next 2 hours.","New arrivals appear here as they are on the way."] : tab === "in-house" ? ["Nobody is in house yet.","Checked-in guests will appear here."] : ["Nobody is leaving today.","Departures will appear here when they are due."];
  const showNoResult = preview === "no-result" || (!!query.trim() && guests.length === 0);
  const showEmpty = preview === "empty" || (!query.trim() && guests.length === 0);
  return <main className="front-desk-page">
    <FrontDeskPreviewSwitch mode={preview} setMode={changePreview}/>
    <div className="driver-phone-frame front-desk-frame">
      <div className="front-desk-content">
        <header className="front-desk-header"><h1>Front desk</h1><p>Wednesday 28 October</p></header>
        {preview === "offline" && <div className="front-desk-offline"><Icon name="wifiOff"/><span>You are offline. Check-in and check-out will sync when you are back online.</span></div>}
        <label className="front-desk-search"><Icon name="search" size={19}/><input value={query} onChange={(event) => { setQuery(event.target.value); if (preview === "no-result") setPreview("default"); }} placeholder="Find a guest or room"/></label>
        <section className="front-desk-list">{showNoResult ? <div className="front-desk-empty"><span><Icon name="search" size={34}/></span><h2>No guest or room matches.</h2><p>Check the spelling or try a room number.</p></div> : showEmpty ? <div className="front-desk-empty"><span><Icon name={tab === "arriving" ? "logIn" : tab === "in-house" ? "bed" : "logOut"} size={36}/></span><h2>{emptyCopy[0]}</h2><p>{emptyCopy[1]}</p></div> : guests.map((guest) => <FrontDeskCard key={guest.id} guest={guest} conflict={preview === "conflict"} open={(item, action) => setSheet({ guest: item, action })}/>)}</section>
      </div>
      <nav className="driver-tabbar front-desk-tabbar">
        <button className={tab === "arriving" ? "is-active" : ""} onClick={() => setTab("arriving")}><Icon name="logIn"/><span>Arriving</span>{arrivingCount > 0 && <b>{arrivingCount}</b>}</button>
        <button className={tab === "in-house" ? "is-active" : ""} onClick={() => setTab("in-house")}><Icon name="bed"/><span>In house</span></button>
        <button className={tab === "leaving" ? "is-active" : ""} onClick={() => setTab("leaving")}><Icon name="logOut"/><span>Leaving</span></button>
      </nav>
      {sheet && <FrontDeskConfirmSheet guest={sheet.guest} action={sheet.action} close={() => setSheet(null)} confirm={confirmAction}/>}
      {toast && <div className="toast-v4 front-desk-toast"><Icon name="check"/><span>{toast.message}</span><button onClick={() => { toast.undo(); setToast(null); }}>Undo</button></div>}
    </div>
  </main>;
}

type StaffSanitationPreview = "default" | "empty" | "offline";
type StaffSanitationTab = "tasks" | "profile";
type StaffTaskStatus = "needs" | "progress" | "done";
type StaffSanitationTask = { room: string; wing: "West" | "Garden" | "East"; status: StaffTaskStatus; deadline?: string; started?: string; readyAt?: string };

const initialStaffSanitationTasks: StaffSanitationTask[] = [
  { room: "504", wing: "West", status: "progress", started: "11:02" },
  { room: "217", wing: "Garden", status: "needs", deadline: "12:30" },
  { room: "306", wing: "West", status: "needs", deadline: "12:30" },
  { room: "409", wing: "East", status: "needs", deadline: "14:00" },
  { room: "201", wing: "West", status: "needs" },
];

function StaffSanitationPreviewSwitch({ mode, setMode }: { mode: StaffSanitationPreview; setMode: (mode: StaffSanitationPreview) => void }) {
  return <div className="staff-sanitation-preview"><span>Preview</span>{(["default","empty","offline"] as StaffSanitationPreview[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function StaffSanitationTaskCard({ task, start, ready, report }: { task: StaffSanitationTask; start: () => void; ready: () => void; report: () => void }) {
  const done = task.status === "done";
  const progress = task.status === "progress";
  return <article className={`staff-task-card is-${task.status}`}>
    <div className="staff-task-head"><div><h2>Room {task.room}</h2><p>{task.wing} wing</p></div><span className={`staff-task-badge is-${task.status}`}><Icon name={done ? "check" : progress ? "loader" : "brush"} size={14}/>{done ? "Done" : progress ? "In progress" : "Needs cleaning"}</span></div>
    <div className={`staff-task-time ${!task.deadline && !task.started && !task.readyAt ? "is-neutral" : ""}`}><Icon name="clock" size={16}/>{done ? `Marked ready ${task.readyAt}` : progress ? `Started ${task.started}` : task.deadline ? `Needed by ${task.deadline}` : "No deadline"}</div>
    {!done && <button className={`staff-task-action ${progress ? "is-ready" : "is-start"}`} onClick={progress ? ready : start}><Icon name={progress ? "check" : "spray"}/>{progress ? "Mark ready" : "Start cleaning"}</button>}
    {!done && <button className="staff-task-report" onClick={report}>Report a problem</button>}
  </article>;
}

function ReadyRoomSheet({ task, close, confirm }: { task: StaffSanitationTask; close: () => void; confirm: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return <div className="staff-sheet-scrim" onClick={close}><section className="staff-ready-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
    <i className="sheet-grab"/><h2>Room {task.room} is ready?</h2><p>It becomes available for check-in.</p>
    <button className="staff-ready-confirm" onClick={confirm}><Icon name="check"/>Mark ready</button><button className="staff-sheet-cancel" onClick={close}>Not yet</button>
  </section></div>;
}

type ProblemChoice = "Maintenance needed" | "Missing supplies" | "Other";

function ReportProblemSheet({ task, close, send }: { task: StaffSanitationTask; close: () => void; send: (choice: ProblemChoice) => void }) {
  const [choice, setChoice] = useState<ProblemChoice | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  const choices: { label: ProblemChoice; icon: IconName }[] = [{ label: "Maintenance needed", icon: "wrench" },{ label: "Missing supplies", icon: "packageX" },{ label: "Other", icon: "message" }];
  return <div className="staff-sheet-scrim" onClick={close}><section className="staff-report-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
    <i className="sheet-grab"/><h2>Report a problem</h2><p>Room {task.room} · {task.wing} wing</p>
    <div className="staff-problem-options">{choices.map((item) => <button key={item.label} className={choice === item.label ? "is-selected" : ""} onClick={() => setChoice(item.label)}><Icon name={item.icon}/><span>{item.label}</span>{choice === item.label && <Icon name="check" size={18}/>}</button>)}</div>
    <label className="staff-problem-note"><span>Add a note (optional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3}/></label>
    <button className="staff-report-send" disabled={!choice} onClick={() => choice && send(choice)}>Send report</button><button className="staff-sheet-cancel" onClick={close}>Cancel</button>
  </section></div>;
}

function StaffSanitationPage({ openSignIn }: { openSignIn: () => void }) {
  const [preview, setPreview] = useState<StaffSanitationPreview>("default");
  const [tab, setTab] = useState<StaffSanitationTab>("tasks");
  const [tasks, setTasks] = useState<StaffSanitationTask[]>(initialStaffSanitationTasks);
  const [readyTask, setReadyTask] = useState<StaffSanitationTask | null>(null);
  const [reportTask, setReportTask] = useState<StaffSanitationTask | null>(null);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 10000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const changePreview = (next: StaffSanitationPreview) => {
    setPreview(next);
    setTab("tasks");
    setTasks(initialStaffSanitationTasks);
    setReadyTask(null);
    setReportTask(null);
    setToast(null);
  };
  const orderedTasks = [...tasks].sort((a, b) => {
    const statusOrder: Record<StaffTaskStatus, number> = { progress: 0, needs: 1, done: 2 };
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
    const deadlineCompare = (a.deadline || "99:99").localeCompare(b.deadline || "99:99");
    return deadlineCompare || a.wing.localeCompare(b.wing);
  });
  const toClean = tasks.filter((task) => task.status === "needs").length;
  const inProgress = tasks.filter((task) => task.status === "progress").length;
  const doneToday = 12 + tasks.filter((task) => task.status === "done").length;
  const total = toClean + inProgress + doneToday;
  const start = (task: StaffSanitationTask) => {
    setTasks((items) => items.map((item) => item.room === task.room ? { ...item, status: "progress", started: "11:21" } : item));
    setToast({ message: `Started room ${task.room}.` });
  };
  const markReady = (task: StaffSanitationTask) => {
    setTasks((items) => items.map((item) => item.room === task.room ? { ...item, status: "done", readyAt: "11:21" } : item));
    setReadyTask(null);
    setToast({ message: `Room ${task.room} is ready.`, undo: () => setTasks((items) => items.map((item) => item.room === task.room ? { ...item, status: "progress", readyAt: undefined } : item)) });
  };
  const sendReport = (task: StaffSanitationTask, choice: ProblemChoice) => {
    setReportTask(null);
    setToast({ message: `Reported: ${choice}. Room ${task.room}.` });
  };
  const signOut = () => {
    setToast({ message: "Signed out. Opens Sign in (Screen 17)." });
    window.setTimeout(openSignIn, 900);
  };
  return <main className="staff-sanitation-page">
    <StaffSanitationPreviewSwitch mode={preview} setMode={changePreview}/>
    <div className="driver-phone-frame staff-sanitation-frame">
      <div className="staff-sanitation-content">
        <header className="staff-sanitation-header"><h1>Sanitation</h1><p>Wednesday 28 October</p></header>
        {preview === "offline" && <div className="staff-sanitation-offline"><Icon name="wifiOff"/><span>You are offline. Your changes will sync when you are back online.</span></div>}
        {tab === "profile" ? <section className="staff-profile-card"><span>CE</span><h2>Chioma Eze</h2><p>Housekeeping · Harbour Point Hotel</p><button onClick={signOut}><Icon name="logOut"/>Sign out</button></section> : <>
          <section className="staff-summary"><div><b>{toClean}</b><span>to clean</span></div><div><b>{inProgress}</b><span>in progress</span></div><div><b>{doneToday}</b><span>done today</span></div></section>
          <div className="staff-progress"><progress className="is-blue" max={total} value={doneToday + inProgress}/><progress className="is-green" max={total} value={doneToday}/></div>
          {preview === "empty" ? <div className="staff-sanitation-empty"><span><Icon name="sparkle" size={38}/></span><h2>All rooms are ready. Nice work.</h2><p>New rooms appear here after check-out.</p></div> : <section className="staff-task-list">{orderedTasks.map((task) => <StaffSanitationTaskCard key={task.room} task={task} start={() => start(task)} ready={() => setReadyTask(task)} report={() => setReportTask(task)}/>)}</section>}
        </>}
      </div>
      <nav className="driver-tabbar staff-sanitation-tabbar"><button className={tab === "tasks" ? "is-active" : ""} onClick={() => setTab("tasks")}><Icon name="spray"/><span>Tasks</span></button><button className={tab === "profile" ? "is-active" : ""} onClick={() => setTab("profile")}><Icon name="user"/><span>Profile</span></button></nav>
      {readyTask && <ReadyRoomSheet task={readyTask} close={() => setReadyTask(null)} confirm={() => markReady(readyTask)}/>}
      {reportTask && <ReportProblemSheet task={reportTask} close={() => setReportTask(null)} send={(choice) => sendReport(reportTask, choice)}/>}
      {toast && <div className="toast-v4 staff-sanitation-toast"><Icon name="check"/><span>{toast.message}</span>{toast.undo && <button onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button>}</div>}
    </div>
  </main>;
}

type CopilotMode = "default" | "empty" | "thinking" | "error" | "listening" | "transcript";
type CopilotRow = { title: string; detail: string; target?: "guest" | "rooms" };
type CopilotExchange = { question: string; spoken?: boolean; answer: string; rows?: CopilotRow[] };

function CoordinatorMessage({ children, spoken }: { children: ReactNode; spoken?: boolean }) {
  return <div className="coordinator-message"><p>{children}</p>{spoken && <small><Icon name="mic" size={13}/>Spoken · Edited</small>}</div>;
}

function CopilotLabel() {
  return <div className="copilot-label"><Icon name="sparkle" size={14}/>Co-Pilot</div>;
}

function CopilotRows({ rows, openGuest, openRooms }: { rows: CopilotRow[]; openGuest: () => void; openRooms: () => void }) {
  return <div className="copilot-rows">{rows.map((row) => <div key={row.title}><button onClick={row.target === "rooms" ? openRooms : openGuest}>{row.title}</button><span>{row.detail}</span></div>)}</div>;
}

function CopilotSuggestion({ state, approve, dismiss, notify }: { state: "pending" | "approved" | "dismissed"; approve: () => void; dismiss: () => void; notify: () => void }) {
  return <div className={`copilot-suggestion is-${state}`}>{state === "pending" ? <><span className="copilot-suggested-chip"><Icon name="sparkle" size={13}/>Suggested</span><h3>Move Mr. Segun Afolabi from 511 to 414</h3><p><b>Why</b><span>Next to the principal in 412.</span></p><p><b>What else changes</b><span>Room 414 is free. Room 511 becomes free.</span></p><div><button className="copilot-approve" onClick={() => { approve(); notify(); }}>Approve</button><Button onClick={dismiss}>Dismiss</Button></div></> : state === "approved" ? <p className="copilot-approved"><Icon name="check"/>Approved by Ada Nwosu · 11:21. Mr. Segun Afolabi is now in room 414.</p> : <><h3>Move Mr. Segun Afolabi from 511 to 414</h3><p className="copilot-dismissed">Dismissed. Nothing was changed.</p></>}</div>;
}

function cannedCopilotAnswer(question: string): { answer: string; rows?: CopilotRow[] } {
  const lower = question.toLowerCase();
  if (lower.includes("next 2 hours")) return { answer: "One arrival is due in the next 2 hours.", rows: [{ title: "Pastor Daniel Kwarteng", detail: "Cat. 3 · AW312 12:50 · flight cancelled", target: "guest" }] };
  if (lower.includes("rooms") && lower.includes("not ready")) return { answer: "Five rooms are not ready.", rows: [
    { title: "Room 504", detail: "Executive suite · West wing · cleaning in progress, ready by 11:25", target: "rooms" },
    { title: "Room 217", detail: "Twin · Garden wing · not started, needed by 12:30", target: "rooms" },
    { title: "Room 306", detail: "Deluxe king · West wing · not started, ready 15 min after it is needed", target: "rooms" },
    { title: "Room 409", detail: "Executive suite · East wing · not started", target: "rooms" },
    { title: "Room 201", detail: "Twin · West wing · not started", target: "rooms" },
  ] };
  if (lower.includes("pickups") && lower.includes("no driver")) return { answer: "One pickup has no driver.", rows: [{ title: "Dr. Ngozi Eze", detail: "Cat. 2 · pickup 16:30 · no driver yet", target: "guest" }] };
  return { answer: "I can answer questions about arrivals, rooms and pickups. Try one of the suggested questions." };
}

function CopilotPreviewSwitch({ mode, setMode }: { mode: CopilotMode; setMode: (mode: CopilotMode) => void }) {
  return <div className="copilot-preview-switch"><span>Preview</span>{(["default","empty","thinking","error","listening","transcript"] as CopilotMode[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function CopilotDrawer({ close, openGuest, openRooms }: { close: () => void; openGuest: () => void; openRooms: () => void }) {
  const [mode, setMode] = useState<CopilotMode>("default");
  const [input, setInput] = useState("");
  const [spokenDraft, setSpokenDraft] = useState(false);
  const [holding, setHolding] = useState(false);
  const [suggestion, setSuggestion] = useState<"pending" | "approved" | "dismissed">("pending");
  const [exchanges, setExchanges] = useState<CopilotExchange[]>([]);
  const [customStarted, setCustomStarted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: "smooth" }); }, [mode, exchanges, suggestion]);
  const changeMode = (next: CopilotMode) => {
    setMode(next); setSuggestion("pending"); setHolding(false);
    if (next === "thinking" || next === "error") {
      setCustomStarted(true);
      setExchanges([{ question: "Which rooms are not ready?", answer: "" }]);
    } else {
      setCustomStarted(false);
      setExchanges([]);
    }
    if (next === "transcript") { setInput("Which rooms are not ready?"); setSpokenDraft(true); } else { setInput(""); setSpokenDraft(false); }
  };
  const send = (preset?: string) => {
    const question = (preset ?? input).trim();
    if (!question) return;
    const spoken = spokenDraft;
    setCustomStarted(true);
    setExchanges((items) => [...items,{ question, spoken, answer: "" }]);
    setInput(""); setSpokenDraft(false); setMode("thinking");
    window.setTimeout(() => {
      const response = cannedCopilotAnswer(question);
      setExchanges((items) => items.map((item,index) => index === items.length - 1 ? { ...item, ...response } : item));
      setMode("default");
    }, 1000);
  };
  const releaseMic = () => {
    if (!holding) return;
    setHolding(false); setInput("Which rooms are not ready?"); setSpokenDraft(true);
  };
  const listening = holding || mode === "listening";
  const empty = mode === "empty" || mode === "listening" || mode === "transcript";
  const openGuestLink = () => { close(); openGuest(); };
  const openRoomsLink = () => { close(); openRooms(); };
  const defaultRows: CopilotRow[] = [{ title: "Bishop Augustine Okafor", detail: "Cat. 1 · EK783 14:25 · driver change waiting for approval", target: "guest" },{ title: "Dr. Ngozi Eze", detail: "Cat. 2 · pickup 16:30 · no driver yet", target: "guest" }];

  return <div className="copilot-scrim" onClick={close}><aside className="copilot-drawer" onClick={(event) => event.stopPropagation()}>
    <header><div className="copilot-title"><span><Icon name="sparkle"/></span><h2>Ask Co-Pilot</h2><button aria-label="Close Co-Pilot" onClick={close}><Icon name="close"/></button></div><p>Answers use live data. Changes need your approval.</p></header>
    <div className="copilot-conversation" ref={conversationRef}>
      {empty ? <div className="copilot-empty"><b>Try asking</b>{["Who arrives in the next 2 hours?","Which rooms are not ready?","Which pickups have no driver?"].map((question) => <button key={question} onClick={() => send(question)}>{question}</button>)}</div> : <>
        {!customStarted && <><CoordinatorMessage spoken>Which bishops land in the next 3 hours with no car assigned or no room ready?</CoordinatorMessage><div className="copilot-response"><CopilotLabel/><p>Two guests match.</p><CopilotRows rows={defaultRows} openGuest={openGuestLink} openRooms={openRoomsLink}/></div><CoordinatorMessage>Move the Bishop's security to room 414.</CoordinatorMessage><div className="copilot-response"><CopilotLabel/><p>Here is a change for you to review.</p><CopilotSuggestion state={suggestion} approve={() => setSuggestion("approved")} dismiss={() => setSuggestion("dismissed")} notify={() => setToast("Room changed. Mr. Segun Afolabi is in 414.")}/></div></>}
        {exchanges.map((exchange,index) => <div className="copilot-exchange" key={`${exchange.question}-${index}`}><CoordinatorMessage spoken={exchange.spoken}>{exchange.question}</CoordinatorMessage>{exchange.answer && <div className="copilot-response"><CopilotLabel/><p>{exchange.answer}</p>{exchange.rows && <CopilotRows rows={exchange.rows} openGuest={openGuestLink} openRooms={openRoomsLink}/>}</div>}</div>)}
        {mode === "thinking" && <div className="copilot-thinking"><CopilotLabel/><span><i/><i/><i/></span><p>Checking live data…</p></div>}
        {mode === "error" && <div className="copilot-live-error"><Icon name="alert"/><span>I couldn't reach live data. Try again.</span><Button onClick={() => changeMode("default")}>Retry</Button></div>}
      </>}
    </div>
    <footer><div className="copilot-composer">{listening ? <div className="copilot-listening"><span>{Array.from({ length: 8 },(_,index) => <i key={index}/>)}</span><b>Listening…</b><small>Release to send</small></div> : <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") send(); }} className={spokenDraft ? "has-transcript" : ""} placeholder="Ask or give an instruction"/>}<button className="copilot-send" disabled={!input.trim() || listening} onClick={() => send()}><Icon name="plane" size={18}/>Send</button><button className={`copilot-mic ${listening ? "is-listening" : ""}`} aria-label="Hold to talk" onPointerDown={() => setHolding(true)} onPointerUp={releaseMic} onPointerCancel={releaseMic}><Icon name="mic"/></button></div><small>{listening ? "Release the button to send." : spokenDraft ? "Check the text, edit it if needed, then press Send." : "Hold the microphone to talk."}</small></footer>
    {toast && <div className="toast-v4 copilot-toast"><Icon name="check"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </aside><CopilotPreviewSwitch mode={mode} setMode={changeMode}/></div>;
}

type NotificationMode = "default" | "all-read" | "empty" | "loading" | "error";
type NotificationItem = { id: string; icon: IconName; tone: string; title: string; detail: string; time: string; target: "arrivals" | "transport" | "programme" | "sanitation" | "intake"; screen: string };

const notificationItems: NotificationItem[] = [
  { id: "arrival", icon: "plane", tone: "amber", title: "Arrival changed: Okafor delegation", detail: "EK783 now 14:25 (+45 min)", time: "11:17", target: "arrivals", screen: "Arrivals (Screen 6)" },
  { id: "driver", icon: "sparkle", tone: "lilac", title: "Driver suggestion waiting", detail: "Sule Abdullahi suggested for the Okafor pickup", time: "11:17", target: "transport", screen: "Transport (Screen 7)" },
  { id: "programme", icon: "calendarClock", tone: "red", title: "Programme item at risk", detail: "Welcome briefing 17:00", time: "11:18", target: "programme", screen: "Programme (Screen 18)" },
  { id: "sanitation", icon: "spray", tone: "blue", title: "Room needs sanitation", detail: "Room 217, Garden wing", time: "10:44", target: "sanitation", screen: "Sanitation (Screen 11)" },
  { id: "intake", icon: "inbox", tone: "green", title: "New submission in Intake", detail: "VIP-4D8R", time: "10:31", target: "intake", screen: "Intake (Screen 4)" },
];

function NotificationsPreviewSwitch({ mode, setMode }: { mode: NotificationMode; setMode: (mode: NotificationMode) => void }) {
  const items: { value: NotificationMode; label: string }[] = [{ value: "default", label: "Default" },{ value: "all-read", label: "All read" },{ value: "empty", label: "Empty" },{ value: "loading", label: "Loading" },{ value: "error", label: "Error" }];
  return <div className="notifications-preview-switch"><span>Preview</span>{items.map((item) => <button key={item.value} className={mode === item.value ? "is-active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}</div>;
}

function NotificationsDrawer({ close, readIds, setReadIds, openTarget }: { close: () => void; readIds: string[]; setReadIds: (ids: string[]) => void; openTarget: (item: NotificationItem) => void }) {
  const [mode, setMode] = useState<NotificationMode>("default");
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const unread = notificationItems.filter((item) => !readIds.includes(item.id)).length;
  const changeMode = (next: NotificationMode) => {
    setMode(next);
    if (next === "default" || next === "error") setReadIds(["sanitation","intake"]);
    if (next === "all-read" || next === "empty") setReadIds(notificationItems.map((item) => item.id));
  };
  const markAll = () => { setReadIds(notificationItems.map((item) => item.id)); setToast("All notifications marked as read."); };
  const openItem = (item: NotificationItem) => { if (!readIds.includes(item.id)) setReadIds([...readIds,item.id]); close(); openTarget(item); };
  const countText = mode === "loading" ? "Loading…" : unread ? `${unread} unread` : "All caught up";
  return <div className="notifications-scrim" onClick={close}><aside className="notifications-drawer" onClick={(event) => event.stopPropagation()}>
    <header><div><h2>Notifications</h2><button aria-label="Close notifications" onClick={close}><Icon name="close"/></button></div><span><b>{countText}</b>{mode !== "loading" && unread > 0 && <button onClick={markAll}>Mark all as read</button>}</span></header>
    <div className="notifications-list">
      {mode === "error" && <div className="notifications-error"><Icon name="alert"/><span>We couldn't refresh notifications. Showing the last update at 11:18.</span><Button onClick={() => changeMode("default")}>Retry</Button></div>}
      {mode === "loading" ? <div className="notifications-loading">{Array.from({ length: 5 },(_,index) => <Skeleton key={index}/>)}</div> : mode === "empty" ? <div className="notifications-empty"><span><Icon name="check" size={30}/></span><b>Nothing needs your attention.</b></div> : notificationItems.map((item) => {
        const read = readIds.includes(item.id);
        return <button className={`notification-row ${read ? "is-read" : "is-unread"}`} key={item.id} onClick={() => openItem(item)}>{!read && <i className="notification-dot"/>}<span className={`notification-icon notification-icon--${item.tone}`}><Icon name={item.icon} size={21}/></span><span className="notification-copy"><b>{item.title}</b><small>{item.detail}</small></span><time>{item.time}</time><Icon name="arrow" size={16}/></button>;
      })}
    </div>
    {toast && <div className="toast-v4 notifications-toast"><Icon name="check"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </aside><NotificationsPreviewSwitch mode={mode} setMode={changeMode}/></div>;
}

type SignInPreview = "sign-in" | "error" | "change" | "rules";
type SignInTarget = "dashboard" | "driver" | "staffSanitation" | "frontDesk";

function PasswordInput({ value, setValue, error, label }: { value: string; setValue: (value: string) => void; error?: boolean; label: string }) {
  const [visible, setVisible] = useState(false);
  return <label className={`auth-field ${error ? "has-error" : ""}`}><span>{label}</span><div><input type={visible ? "text" : "password"} value={value} onChange={(event) => setValue(event.target.value)}/><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible((current) => !current)}><Icon name={visible ? "eyeOff" : "eye"}/></button></div></label>;
}

function SignInPreviewSwitch({ mode, setMode, demoSignIn }: { mode: SignInPreview; setMode: (mode: SignInPreview) => void; demoSignIn: (target: SignInTarget) => void }) {
  const items: { value: SignInPreview; label: string }[] = [{ value: "sign-in", label: "Sign in" },{ value: "error", label: "Error" },{ value: "change", label: "Change password" },{ value: "rules", label: "Rules met" }];
  return <div className="signin-preview-switch"><span>Preview</span>{items.map((item) => <button key={item.value} className={mode === item.value ? "is-active" : ""} onClick={() => setMode(item.value)}>{item.label}</button>)}<button onClick={() => demoSignIn("driver")}>Driver</button><button onClick={() => demoSignIn("staffSanitation")}>Housekeeping</button><button onClick={() => demoSignIn("frontDesk")}>Front desk</button></div>;
}

function SignInPage({ signIn }: { signIn: (target: SignInTarget, message: string) => void }) {
  const [preview, setPreview] = useState<SignInPreview>("sign-in");
  const [changing, setChanging] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const finishSignIn = (target: SignInTarget, message: string) => {
    setToast(message);
    window.setTimeout(() => signIn(target,message), 900);
  };
  const clearError = () => setError(false);
  const ruleLength = newPassword.length >= 10;
  const ruleNumber = /\d/.test(newPassword);
  const ruleEmail = !!newPassword && newPassword.toLowerCase() !== email.toLowerCase();
  const validNewPassword = ruleLength && ruleNumber && ruleEmail && newPassword === confirmPassword;
  const applyPreview = (next: SignInPreview) => {
    setPreview(next); setError(next === "error"); setChanging(next === "change" || next === "rules");
    setEmail(next === "rules" ? "ada@example.com" : ""); setPassword("");
    setNewPassword(next === "rules" ? "Securepass1" : ""); setConfirmPassword(next === "rules" ? "Securepass1" : "");
  };
  const submitSignIn = () => {
    if (!email.trim() || !password) { setError(true); return; }
    if (password === "temporary") { setChanging(true); setPreview("change"); setError(false); setNewPassword(""); setConfirmPassword(""); return; }
    finishSignIn("dashboard", "Signed in. Opens the Dashboard (Screen 1).");
  };
  const savePassword = () => {
    if (!validNewPassword) return;
    finishSignIn("dashboard", "Password saved. Opens the Dashboard (Screen 1).");
  };
  return <main className="signin-page">
    <div className="signin-skyline" aria-hidden="true">{Array.from({ length: 18 },(_,index) => <i key={index}><span/><span/><span/><span/></i>)}</div>
    <section className="signin-card">
      <div className="signin-brand"><img src="/hostmark-logo-C.svg" alt="Hostmark logo mark"/><b><span>Host</span>mark</b></div>
      {changing ? <div className="auth-form"><header><h1>Choose a new password</h1><p>Your coordinator gave you a temporary password. Set your own to continue.</p></header><PasswordInput label="New password" value={newPassword} setValue={setNewPassword}/><PasswordInput label="Confirm new password" value={confirmPassword} setValue={setConfirmPassword}/><div className="password-rules">{[[ruleLength,"At least 10 characters"],[ruleNumber,"One number"],[ruleEmail,"Not your email"]].map(([met,text]) => <p className={met ? "is-met" : ""} key={String(text)}>{met ? <Icon name="check" size={15}/> : <i/>}<span>{text}</span></p>)}</div><button className="auth-primary" disabled={!validNewPassword} onClick={savePassword}>Save and continue</button></div> :
      <div className="auth-form"><header><h1>Welcome back</h1><p>Sign in to coordinate the event.</p></header>{error && <div className="signin-error"><Icon name="alert"/><span>Email or password is incorrect.</span></div>}<label className={`auth-field ${error ? "has-error" : ""}`}><span>Email</span><div><input type="email" value={email} onChange={(event) => { setEmail(event.target.value); clearError(); }}/></div></label><PasswordInput label="Password" value={password} error={error} setValue={(value) => { setPassword(value); clearError(); }}/><button className="auth-primary" onClick={submitSignIn}>Sign in</button><button className="forgot-password" onClick={() => setToast("Ask your coordinator to reset your password.")}>Forgot password?</button><div className="signin-divider"/><p className="signin-invitation">Access is by invitation from your coordinator.</p></div>}
    </section>
    <SignInPreviewSwitch mode={preview} setMode={applyPreview} demoSignIn={(target) => signIn(target, "Signed in.")}/>
    {toast && <div className="toast-v4 signin-toast"><Icon name="info"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type ProgrammeMode = "default" | "loading" | "empty" | "error";
type ProgrammeDay = "wed" | "thu" | "fri";
type ProgrammeItem = { time: string; title: string; venue: string; status: "done" | "track" | "risk" };

const programmeItems: ProgrammeItem[] = [
  { time: "09:00", title: "Registration and accreditation", venue: "Main foyer", status: "done" },
  { time: "12:30", title: "Delegates' lunch", venue: "Banquet hall", status: "done" },
  { time: "15:30", title: "Foyer reception", venue: "Garden terrace", status: "track" },
  { time: "17:00", title: "Welcome briefing", venue: "Conference hall A", status: "risk" },
  { time: "19:30", title: "Opening dinner", venue: "Banquet hall", status: "track" },
];

function ProgrammeStateSwitch({ mode, setMode }: { mode: ProgrammeMode; setMode: (mode: ProgrammeMode) => void }) {
  return <div className="state-switch programme-state-switch"><span>Preview</span>{(["default","loading","empty","error"] as ProgrammeMode[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function ProgrammeTimelineRow({ item, index, expanded, toggle, notified, notify, openGuest }: { item: ProgrammeItem; index: number; expanded: boolean; toggle: () => void; notified: boolean; notify: () => void; openGuest: () => void }) {
  const risk = item.status === "risk";
  return <div className={`programme-item programme-item--${item.status}`}>
    <div className={`programme-row ${risk ? "is-clickable" : ""}`} onClick={risk ? toggle : undefined}>
      <time>{item.time}</time><span className={`programme-dot ${index === 0 ? "is-first" : ""} ${index === programmeItems.length - 1 ? "is-last" : ""}`}>{item.status === "done" && <Icon name="check" size={14}/>} {risk && <Icon name="alert" size={13}/>}</span>
      <div className="programme-item-copy"><b>{item.title}</b><span><Icon name="pin" size={14}/>{item.venue}</span></div>
      <ArrivalBadge tone={item.status === "done" ? "neutral" : item.status === "track" ? "success" : "warning"}><Icon name={item.status === "done" ? "check" : item.status === "risk" ? "alert" : "check"} size={13}/>{item.status === "done" ? "Done" : item.status === "track" ? "On track" : "At risk"}</ArrivalBadge>
      {risk && <span className={`programme-chevron ${expanded ? "is-open" : ""}`}><Icon name="chevron" size={17}/></span>}
    </div>
    {risk && expanded && <div className="programme-risk-detail"><p>Bishop Augustine Okafor (Cat. 1) is expected at the hotel at 16:55 after the EK783 delay. The briefing starts at 17:00.</p><div><Button onClick={openGuest}>Open guest</Button>{notified ? <span><Icon name="check" size={15}/>Programme team notified · 11:21</span> : <Button onClick={notify}>Notify programme team</Button>}</div></div>}
  </div>;
}

function ProgrammePage({ openGuest }: { openGuest: () => void }) {
  const [mode, setMode] = useState<ProgrammeMode>("default");
  const [day, setDay] = useState<ProgrammeDay>("wed");
  const [expanded, setExpanded] = useState(true);
  const [notified, setNotified] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const empty = mode === "empty" || day !== "wed";
  const dates: Record<ProgrammeDay,string> = { wed: "Wednesday 28 October 2026", thu: "Thursday 29 October 2026", fri: "Friday 30 October 2026" };
  const changeMode = (next: ProgrammeMode) => { setMode(next); setDay("wed"); setExpanded(true); setNotified(false); };
  const venues = [{ name: "Conference hall A", count: empty ? 0 : 1 },{ name: "Conference hall B", count: 0 },{ name: "Banquet hall", count: empty ? 0 : 2 },{ name: "Garden terrace", count: empty ? 0 : 1 }];
  return <main className="programme-page">
    <header className="programme-header"><div><h1>Programme</h1><p>{dates[day]}</p></div><Button kind="primary" icon="plus" onClick={() => setToast("Add item opens a form, designed later.")}>Add item</Button></header>
    <div className="programme-tabs">{([["wed","Wed 28 Oct"],["thu","Thu 29 Oct"],["fri","Fri 30 Oct"]] as [ProgrammeDay,string][]).map(([value,label]) => <button key={value} className={day === value ? "is-active" : ""} onClick={() => setDay(value)}>{label}</button>)}</div>
    {mode === "error" && <div className="programme-error"><Icon name="alert"/><span>We couldn't load the programme. Showing the last update at 11:18.</span><Button onClick={() => setMode("default")}>Retry</Button></div>}
    <div className="programme-layout">
      <section className="programme-timeline"><header><h2>Timeline</h2><span>{empty ? "0 items" : "5 items"}</span></header>{mode === "loading" ? <div className="programme-loading">{Array.from({ length: 4 },(_,index) => <Skeleton key={index}/>)}</div> : empty ? <div className="programme-empty"><span><Icon name="calendar" size={25}/></span><b>No items on this day.</b><Button icon="plus" onClick={() => setToast("Add item opens a form, designed later.")}>Add item</Button></div> : <div>{programmeItems.map((item,index) => <ProgrammeTimelineRow key={item.time} item={item} index={index} expanded={expanded} toggle={() => setExpanded((value) => !value)} notified={notified} notify={() => { setNotified(true); setToast("Programme team notified."); }} openGuest={openGuest}/>)}</div>}</section>
      <aside className="programme-side"><section className="programme-risk-card"><h2>At risk</h2><div className={empty ? "is-clear" : ""}><span>{empty ? <Icon name="check" size={24}/> : "1"}</span><p>Items affected by arrivals today</p></div></section><section className="programme-venues"><h2>Venues</h2>{venues.map((venue) => <div key={venue.name}><Icon name="door" size={18}/><b>{venue.name}</b>{venue.count ? <span>{venue.count} {venue.count === 1 ? "item" : "items"}</span> : <small>No items</small>}</div>)}</section></aside>
    </div>
    <ProgrammeStateSwitch mode={mode} setMode={changeMode}/>
    {toast && <div className="toast-v4 programme-toast"><Icon name="check"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type ActivityMode = "default" | "loading" | "empty" | "error";
type ActivityWho = "Everyone" | "Staff" | "Co-Pilot" | "Automatic";
type ActivityType = "All" | "Arrivals" | "Transport" | "Rooms" | "Sanitation" | "Intake" | "Programme";
type ActivityDomain = Exclude<ActivityType, "All">;
type ActivityChange = { label: string; oldValue: string; newValue: string };
type ActivityRecord = {
  id: string; time: string; domain: ActivityDomain; who: Exclude<ActivityWho, "Everyone">; actor: string; sentence: string;
  automatic?: boolean; undoable?: boolean; icon: IconName; changes: ActivityChange[];
};

const activityRecords: ActivityRecord[] = [
  { id: "driver", time: "11:20", domain: "Transport", who: "Staff", actor: "Ada Nwosu", sentence: "Ada Nwosu approved the driver change for the Okafor pickup.", icon: "car", changes: [{ label: "Driver", oldValue: "Emeka Oladipo", newValue: "Sule Abdullahi" }] },
  { id: "pickup", time: "11:17", domain: "Arrivals", who: "Co-Pilot", actor: "Co-Pilot", sentence: "Co-Pilot moved the Okafor pickup to 14:55 after EK783 slipped to 14:25.", automatic: true, undoable: true, icon: "plane", changes: [{ label: "Pickup time", oldValue: "14:10", newValue: "14:55" },{ label: "Flight EK783", oldValue: "13:40", newValue: "14:25" }] },
  { id: "cleaning", time: "11:02", domain: "Sanitation", who: "Staff", actor: "Chioma Eze", sentence: "Chioma Eze started cleaning room 504.", icon: "spray", changes: [{ label: "Room 504", oldValue: "Needs cleaning", newValue: "Cleaning" }] },
  { id: "message", time: "10:52", domain: "Intake", who: "Staff", actor: "Ada Nwosu", sentence: "Ada Nwosu received a pasted message for Bishop Okafor; sent to Intake.", icon: "inbox", changes: [{ label: "Message", oldValue: "Not received", newValue: "In Intake, waiting for review" }] },
  { id: "checkout", time: "10:44", domain: "Sanitation", who: "Automatic", actor: "The system", sentence: "The system marked room 217 for cleaning after check-out.", automatic: true, icon: "spray", changes: [{ label: "Room 217", oldValue: "Occupied", newValue: "Needs cleaning" }] },
  { id: "checkin", time: "10:40", domain: "Rooms", who: "Staff", actor: "Front desk", sentence: "Front desk checked in Prof. Funmilayo Alade to room 305.", icon: "bed", changes: [{ label: "Prof. Funmilayo Alade", oldValue: "Arriving", newValue: "In house, room 305" }] },
  { id: "registration", time: "10:31", domain: "Intake", who: "Automatic", actor: "The system", sentence: "The system received a new registration, VIP-4D8R, from the form.", automatic: true, icon: "inbox", changes: [{ label: "Submission", oldValue: "None", newValue: "VIP-4D8R, waiting for review" }] },
];

function ActivityPreviewSwitch({ mode, setMode }: { mode: ActivityMode; setMode: (mode: ActivityMode) => void }) {
  return <div className="state-switch activity-state-switch"><span>Preview</span>{(["default","loading","empty","error"] as ActivityMode[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function ActivityObjectLink({ children, route, navigate }: { children: ReactNode; route: Route; navigate: (route: Route) => void }) {
  return <button className="activity-object-link" onClick={(event) => { event.stopPropagation(); navigate(route); }}>{children}</button>;
}

function ActivitySentence({ record, navigate }: { record: ActivityRecord; navigate: (route: Route) => void }) {
  if (record.id === "driver") return <><b>Ada Nwosu</b> approved the driver change for the <ActivityObjectLink route="transport" navigate={navigate}>Okafor pickup</ActivityObjectLink>.</>;
  if (record.id === "pickup") return <><b>Co-Pilot</b> moved the <ActivityObjectLink route="transport" navigate={navigate}>Okafor pickup</ActivityObjectLink> to 14:55 after EK783 slipped to 14:25.</>;
  if (record.id === "cleaning") return <><b>Chioma Eze</b> started cleaning <ActivityObjectLink route="rooms" navigate={navigate}>room 504</ActivityObjectLink>.</>;
  if (record.id === "message") return <><b>Ada Nwosu</b> received a pasted message for <ActivityObjectLink route="profile" navigate={navigate}>Bishop Okafor</ActivityObjectLink>; sent to <ActivityObjectLink route="intake" navigate={navigate}>Intake</ActivityObjectLink>.</>;
  if (record.id === "checkout") return <><b>The system</b> marked <ActivityObjectLink route="rooms" navigate={navigate}>room 217</ActivityObjectLink> for cleaning after check-out.</>;
  if (record.id === "checkin") return <><b>Front desk</b> checked in <ActivityObjectLink route="profile" navigate={navigate}>Prof. Funmilayo Alade</ActivityObjectLink> to <ActivityObjectLink route="rooms" navigate={navigate}>room 305</ActivityObjectLink>.</>;
  return <><b>The system</b> received a new registration, <ActivityObjectLink route="intake" navigate={navigate}>VIP-4D8R</ActivityObjectLink>, from the form.</>;
}

function ActivityRecordRow({ record, expanded, undone, toggle, undo, navigate }: { record: ActivityRecord; expanded: boolean; undone: boolean; toggle: () => void; undo: () => void; navigate: (route: Route) => void }) {
  return <div className={`activity-record ${expanded ? "is-expanded" : ""} ${undone ? "is-undone" : ""}`} role="button" tabIndex={0} onClick={toggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }}>
    <span className={`activity-record-icon is-${record.domain.toLowerCase()}`}><Icon name={record.icon}/></span>
    <div className="activity-record-copy"><p><ActivitySentence record={record} navigate={navigate}/></p>{expanded && <div className="activity-changes">{record.changes.map((change) => <div key={change.label}><b>{change.label}</b><s>{change.oldValue}</s><Icon name="arrow" size={16}/><strong>{change.newValue}</strong></div>)}</div>}</div>
    <div className="activity-record-meta">{record.automatic && <span>AUTO</span>}{record.undoable && (undone ? <i>Undone</i> : <button onClick={(event) => { event.stopPropagation(); undo(); }}>Undo</button>)}</div>
    <time>{record.time}</time><span className="activity-record-chevron"><Icon name="chevron" size={18}/></span>
  </div>;
}

function ActivityPage({ navigate }: { navigate: (route: Route) => void }) {
  const [mode, setMode] = useState<ActivityMode>("default");
  const [query, setQuery] = useState("");
  const [who, setWho] = useState<ActivityWho>("Everyone");
  const [type, setType] = useState<ActivityType>("All");
  const [date, setDate] = useState<"Today" | "Yesterday">("Today");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [undone, setUndone] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const filtered = date === "Yesterday" ? [] : activityRecords.filter((record) => {
    const needle = query.trim().toLowerCase();
    return (!needle || record.sentence.toLowerCase().includes(needle)) && (who === "Everyone" || record.who === who) && (type === "All" || record.domain === type);
  });
  const filtersActive = !!query.trim() || who !== "Everyone" || type !== "All";
  const visibleCount = mode === "empty" ? 0 : filtered.length;
  const clearFilters = () => { setQuery(""); setWho("Everyone"); setType("All"); setMode("default"); };
  const changeMode = (next: ActivityMode) => {
    setMode(next);
    setQuery("");
    setWho("Everyone");
    setType("All");
    setDate("Today");
    setExpanded([]);
    setUndone(false);
  };
  const emptyTitle = date === "Yesterday" ? "Nothing changed on this day." : "Nothing has changed yet today.";
  return <main className="activity-page">
    <header className="activity-page-header"><h1>Activity</h1><p>Everything that changed today, newest first.</p></header>
    <div className="activity-filters">
      <label className="activity-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => { setQuery(event.target.value); setMode("default"); }} placeholder="Search activity"/></label>
      <label className="activity-select"><select value={who} onChange={(event) => { setWho(event.target.value as ActivityWho); setMode("default"); }}><option>Everyone</option><option>Staff</option><option>Co-Pilot</option><option>Automatic</option></select><span>Who: {who}</span><Icon name="chevron" size={15}/></label>
      <label className="activity-select"><select value={type} onChange={(event) => { setType(event.target.value as ActivityType); setMode("default"); }}><option>All</option><option>Arrivals</option><option>Transport</option><option>Rooms</option><option>Sanitation</option><option>Intake</option><option>Programme</option></select><span>Type: {type}</span><Icon name="chevron" size={15}/></label>
      <label className="activity-select activity-date"><select value={date} onChange={(event) => { setDate(event.target.value as "Today" | "Yesterday"); setMode("default"); }}><option>Today</option><option>Yesterday</option></select><span>{date}</span><Icon name="chevron" size={15}/></label>
    </div>
    {mode === "error" && <div className="activity-error"><Icon name="alert"/><span>We couldn't load activity. Showing the last update at 11:18.</span><Button onClick={() => setMode("default")}>Retry</Button></div>}
    <section className="activity-list-card">
      <header><h2>{date}</h2><span>{visibleCount} {visibleCount === 1 ? "change" : "changes"}</span></header>
      {mode === "loading" ? <div className="activity-loading">{[0,1,2,3,4].map((item) => <Skeleton key={item}/>)}</div> : mode === "empty" || (!filtersActive && filtered.length === 0) ? <div className="activity-list-empty"><span><Icon name="activity" size={28}/></span><b>{emptyTitle}</b><p>{date === "Yesterday" ? "" : "Changes by staff, Co-Pilot and automatic updates appear here."}</p></div> : filtered.length === 0 ? <div className="activity-list-empty is-filtered"><span><Icon name="searchX" size={28}/></span><b>No activity matches these filters.</b><Button onClick={clearFilters}>Clear filters</Button></div> :
      <div>{filtered.map((record) => <ActivityRecordRow key={record.id} record={record} expanded={expanded.includes(record.id)} undone={record.id === "pickup" && undone} toggle={() => setExpanded((items) => items.includes(record.id) ? items.filter((id) => id !== record.id) : [...items, record.id])} undo={() => { setUndone(true); setToast("Undone. The Okafor pickup is back to 14:10."); }} navigate={navigate}/>)}</div>}
    </section>
    <ActivityPreviewSwitch mode={mode} setMode={changeMode}/>
    {toast && <div className="toast-v4 activity-page-toast"><Icon name="check"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type SimulationView = "before" | "running" | "result" | "error";
type SimulationScenario = "Flight delay" | "Room out of service" | "Extra guests" | "Driver unavailable";
type SimulationResultRow = { icon: IconName; title: string; detail?: string; conflict?: boolean };

function SimulationPreviewSwitch({ view, setView }: { view: SimulationView; setView: (view: SimulationView) => void }) {
  const items: { value: SimulationView; label: string }[] = [{ value: "before", label: "Before run" },{ value: "running", label: "Running" },{ value: "result", label: "Result" },{ value: "error", label: "Error" }];
  return <div className="state-switch simulation-state-switch"><span>Preview</span>{items.map((item) => <button key={item.value} className={view === item.value ? "is-active" : ""} onClick={() => setView(item.value)}>{item.label}</button>)}</div>;
}

const timeFromMinutes = (minutes: number) => `${Math.floor(minutes / 60) % 24}`.padStart(2, "0") + `:${minutes % 60}`.padStart(2, "0");

function SimulationPage({ openCopilot }: { openCopilot: () => void }) {
  const [scenario, setScenario] = useState<SimulationScenario>("Flight delay");
  const [flight, setFlight] = useState("EK783");
  const [delay, setDelay] = useState("90");
  const [room, setRoom] = useState("412");
  const [hours, setHours] = useState("6");
  const [delegation, setDelegation] = useState("Bishop Okafor delegation");
  const [extraGuests, setExtraGuests] = useState("2");
  const [driver, setDriver] = useState("Emeka Oladipo");
  const [unavailableFrom, setUnavailableFrom] = useState("14:00");
  const [view, setView] = useState<SimulationView>("before");
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);
  const resetResult = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setView("before");
  };
  const run = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setView("running");
    timerRef.current = window.setTimeout(() => setView("result"), 1100);
  };
  const setPreview = (next: SimulationView) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (next === "result") {
      setScenario("Flight delay");
      setFlight("EK783");
      setDelay("90");
    }
    setView(next);
  };
  const delayMinutes = Math.max(0, Number(delay) || 0);
  const pickupTime = timeFromMinutes(13 * 60 + 40 + delayMinutes + 30);
  const hotelTime = timeFromMinutes(13 * 60 + 40 + delayMinutes + 150);
  const resultRows: SimulationResultRow[] = scenario === "Flight delay" ? [
    { icon: "car", title: `Okafor pickup moves to ${pickupTime}` },
    { icon: "calendarClock", title: "Welcome briefing at 17:00 becomes at risk", detail: `Bishop Okafor would reach the hotel at about ${hotelTime}` },
    { icon: "bed", title: "Room 412 is still free on arrival" },
    { icon: "alert", title: `No driver free at ${pickupTime}`, detail: "Emeka Oladipo is busy until 14:40 and Sule Abdullahi is on another trip", conflict: true },
  ] : scenario === "Room out of service" ? [
    { icon: "bed", title: `Room ${room} is not available for ${hours || 0} hours` },
    { icon: "users", title: "One guest would need another room" },
    { icon: "alert", title: "No free room next to 413", conflict: true },
  ] : scenario === "Extra guests" ? [
    { icon: "users", title: `The party grows from 4 to ${4 + (Number(extraGuests) || 0)}` },
    { icon: "bed", title: `${extraGuests || 0} more rooms are needed` },
    { icon: "car", title: "The pickup needs a bigger vehicle", detail: "Coaster bus, 18 seats" },
  ] : [
    { icon: "car", title: "Okafor pickup needs another driver" },
    { icon: "user", title: "Sule Abdullahi is free at 14:55" },
    { icon: "repeat", title: "Prof. Alade return trip at 16:30 is not affected" },
  ];
  const conflicts = resultRows.filter((row) => row.conflict).length;
  const changes = resultRows.length - conflicts;
  return <main className="simulation-page">
    <div className="simulation-banner"><Icon name="flask"/><span>Simulation. Nothing here changes live data.</span></div>
    <header className="simulation-header"><h1>Simulation</h1><p>Try a change and see what would move.</p></header>
    <div className="simulation-layout">
      <section className="simulation-scenario-card">
        <h2>Scenario</h2>
        <label className="simulation-field"><span>Scenario type</span><select value={scenario} onChange={(event) => { setScenario(event.target.value as SimulationScenario); resetResult(); }}><option>Flight delay</option><option>Room out of service</option><option>Extra guests</option><option>Driver unavailable</option></select></label>
        {scenario === "Flight delay" ? <>
          <label className="simulation-field"><span>Flight</span><select value={flight} onChange={(event) => { setFlight(event.target.value); resetResult(); }}><option>EK783</option><option>ET512</option><option>BA075</option></select></label>
          <label className="simulation-field"><span>Delay (minutes)</span><input type="number" min="0" value={delay} onChange={(event) => { setDelay(event.target.value); resetResult(); }}/></label>
          <div className="simulation-chips">{[30,60,90,120].map((item) => <button key={item} className={Number(delay) === item ? "is-selected" : ""} onClick={() => { setDelay(String(item)); resetResult(); }}>{item}</button>)}</div>
        </> : scenario === "Room out of service" ? <>
          <label className="simulation-field"><span>Room</span><select value={room} onChange={(event) => { setRoom(event.target.value); resetResult(); }}>{["412","413","414","415"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="simulation-field"><span>Out of service for (hours)</span><input type="number" min="1" value={hours} onChange={(event) => { setHours(event.target.value); resetResult(); }}/></label>
        </> : scenario === "Extra guests" ? <>
          <label className="simulation-field"><span>Delegation</span><select value={delegation} onChange={(event) => { setDelegation(event.target.value); resetResult(); }}><option>Bishop Okafor delegation</option><option>Archbishop Moyo delegation</option></select></label>
          <label className="simulation-field"><span>Extra guests</span><input type="number" min="1" value={extraGuests} onChange={(event) => { setExtraGuests(event.target.value); resetResult(); }}/></label>
        </> : <>
          <label className="simulation-field"><span>Driver</span><select value={driver} onChange={(event) => { setDriver(event.target.value); resetResult(); }}><option>Emeka Oladipo</option><option>Sule Abdullahi</option><option>Kunle Balogun</option></select></label>
          <label className="simulation-field"><span>Unavailable from</span><input type="time" value={unavailableFrom} onChange={(event) => { setUnavailableFrom(event.target.value); resetResult(); }}/></label>
        </>}
        <button className="simulation-run" onClick={run}><Icon name="play"/>Run simulation</button>
      </section>
      <section className="simulation-results-card">
        <header><h2>What would change</h2>{view === "result" && <span>{changes} changes{conflicts > 0 && <> and <b>{conflicts} {conflicts === 1 ? "conflict" : "conflicts"}</b></>}</span>}</header>
        <div className="simulation-results-body">
          {view === "before" ? <div className="simulation-before"><span><Icon name="flask" size={28}/></span><b>Run a scenario to see what would change.</b><p>Results are previews only. Nothing is applied.</p></div> :
          view === "running" ? <div className="simulation-running">{[0,1,2,3].map((item) => <Skeleton key={item}/>)}</div> :
          view === "error" ? <div className="simulation-failed"><span><Icon name="alert" size={27}/></span><b>The simulation could not run. Try again.</b><Button onClick={run}>Try again</Button></div> :
          <div className="simulation-result-list">{resultRows.map((row,index) => <div className={`simulation-result-row ${row.conflict ? "is-conflict" : ""}`} key={`${row.title}-${index}`}><span><Icon name={row.icon}/></span><div><b>{row.title}</b>{row.detail && <small>{row.detail}</small>}</div></div>)}</div>}
        </div>
        {view === "result" && <footer><Button onClick={() => { setView("before"); setToast("Simulation discarded."); }}>Discard</Button><button className="simulation-send" onClick={() => { setToast(`Sent as ${resultRows.length} suggestions. They appear in the Dashboard approvals list and still need your approval.`); openCopilot(); }}><Icon name="sparkle"/>Send to Co-Pilot as suggestions</button></footer>}
      </section>
    </div>
    <SimulationPreviewSwitch view={view} setView={setPreview}/>
    {toast && <div className="toast-v4 simulation-toast"><Icon name="check"/><span>{toast}</span><button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

type SettingsMode = "default" | "loading" | "empty" | "error";
type SettingsTab = "Users" | "Rooms" | "Drivers" | "VIP categories" | "System";
type StaffRole = "Coordinator" | "Admin" | "Programmes" | "Driver" | "Accommodation" | "Housekeeping";
type StaffStatus = "Active" | "Invited" | "Deactivated";
type StaffUser = { id: number; name: string; email: string; role: StaffRole; status: StaffStatus; lastActive: string };
type SettingsDialog =
  | { type: "invite" }
  | { type: "edit"; userId: number }
  | { type: "reset"; userId: number }
  | { type: "deactivate"; userId: number }
  | null;

const staffRoles: StaffRole[] = ["Coordinator", "Admin", "Programmes", "Driver", "Accommodation", "Housekeeping"];
const initialStaffUsers: StaffUser[] = [
  { id: 1, name: "Ada Nwosu", email: "ada@hostmark.example", role: "Coordinator", status: "Active", lastActive: "Today 11:20" },
  { id: 2, name: "Tolu A.", email: "tolu@hostmark.example", role: "Admin", status: "Active", lastActive: "Today 10:58" },
  { id: 3, name: "Emeka Oladipo", email: "emeka@hostmark.example", role: "Driver", status: "Active", lastActive: "Today 11:02" },
  { id: 4, name: "Sule Abdullahi", email: "sule@hostmark.example", role: "Driver", status: "Invited", lastActive: "Not yet" },
  { id: 5, name: "Chioma Eze", email: "chioma@hostmark.example", role: "Housekeeping", status: "Active", lastActive: "Yesterday 17:40" },
];

const initialsFor = (name: string) => name.split(/\s+/).map((part) => part[0]).join("").replace(".", "").slice(0, 2).toUpperCase();

function SettingsPreviewSwitch({ mode, setMode }: { mode: SettingsMode; setMode: (mode: SettingsMode) => void }) {
  return <div className="state-switch settings-state-switch"><span>Preview</span>{(["default","loading","empty","error"] as SettingsMode[]).map((item) => <button key={item} className={mode === item ? "is-active" : ""} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>;
}

function SettingsDialogShell({ width, role = "dialog", close, children }: { width: "wide" | "compact"; role?: "dialog" | "alertdialog"; close: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return <div className="settings-dialog-scrim" onClick={close}><section className={`settings-dialog settings-dialog--${width}`} role={role} aria-modal="true" onClick={(event) => event.stopPropagation()}>{children}</section></div>;
}

function InviteUserDialog({ close, invite }: { close: () => void; invite: (name: string, email: string, role: StaffRole) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("Coordinator");
  const valid = name.trim().length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  return <SettingsDialogShell width="wide" close={close}>
    <header><h2>Invite user</h2><p>Add a staff member to this event.</p></header>
    <div className="settings-dialog-fields">
      <label><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)}/></label>
      <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)}/></label>
      <label><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value as StaffRole)}>{staffRoles.map((item) => <option key={item}>{item}</option>)}</select></label>
    </div>
    <div className="settings-info"><Icon name="info" size={18}/><span>They will get a temporary password and must choose their own on first sign in.</span></div>
    <footer><Button onClick={close}>Cancel</Button><button className="settings-confirm" disabled={!valid} onClick={() => invite(name.trim(), email.trim(), role)}>Send invite</button></footer>
  </SettingsDialogShell>;
}

function EditRoleDialog({ user, close, save }: { user: StaffUser; close: () => void; save: (role: StaffRole) => void }) {
  const [role, setRole] = useState<StaffRole>(user.role);
  return <SettingsDialogShell width="compact" close={close}>
    <header><h2>Edit role</h2><p><b>{user.name}</b><span>{user.email}</span></p></header>
    <div className="settings-dialog-fields"><label><span>Role</span><select autoFocus value={role} onChange={(event) => setRole(event.target.value as StaffRole)}>{staffRoles.map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <footer><Button onClick={close}>Cancel</Button><button className="settings-confirm" onClick={() => save(role)}>Save role</button></footer>
  </SettingsDialogShell>;
}

function ResetPasswordDialog({ user, close, reset }: { user: StaffUser; close: () => void; reset: () => void }) {
  const firstName = user.name.split(" ")[0];
  return <SettingsDialogShell width="compact" role="alertdialog" close={close}>
    <header><h2>Reset {firstName}'s password?</h2><p>He will need to choose a new one at next sign in.</p></header>
    <footer><Button onClick={close}>Cancel</Button><button className="settings-confirm" onClick={reset}>Reset password</button></footer>
  </SettingsDialogShell>;
}

function DeactivateUserDialog({ user, close, deactivate }: { user: StaffUser; close: () => void; deactivate: () => void }) {
  return <SettingsDialogShell width="compact" role="alertdialog" close={close}>
    <header><h2>Deactivate this user?</h2><p>{user.name} will no longer be able to sign in. Their history stays in Activity.</p></header>
    <footer><Button onClick={close}>Cancel</Button><button className="settings-danger" onClick={deactivate}>Deactivate</button></footer>
  </SettingsDialogShell>;
}

function SettingsPlaceholder({ tab, notify }: { tab: Exclude<SettingsTab, "Users">; notify: () => void }) {
  const action = tab === "Rooms" ? "Add room" : tab === "Drivers" ? "Add driver" : tab === "VIP categories" ? "Add category" : "Edit setting";
  return <section className="settings-placeholder-card">
    <header><h2>{tab}</h2><Button kind="primary" icon="plus" onClick={notify}>{action}</Button></header>
    <div className="settings-placeholder-head"><span>Name</span><span>Details</span><span>Status</span></div>
    <p>This list will be specified in a later version.</p>
  </section>;
}

function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("Users");
  const [mode, setMode] = useState<SettingsMode>("default");
  const [users, setUsers] = useState<StaffUser[]>(initialStaffUsers);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<StaffRole | "All roles">("All roles");
  const [menuUserId, setMenuUserId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<SettingsDialog>(null);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  useEffect(() => {
    const closeMenu = () => setMenuUserId(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    document.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", closeMenu); window.removeEventListener("keydown", onKey); };
  }, []);
  const filteredUsers = users.filter((user) => {
    const needle = query.trim().toLowerCase();
    return (!needle || `${user.name} ${user.email}`.toLowerCase().includes(needle)) && (roleFilter === "All roles" || user.role === roleFilter);
  });
  const selectedUser = dialog && "userId" in dialog ? users.find((user) => user.id === dialog.userId) : undefined;
  const invite = (name: string, email: string, role: StaffRole) => {
    setUsers((items) => [...items, { id: Date.now(), name, email, role, status: "Invited", lastActive: "Not yet" }]);
    setDialog(null);
    setToast({ message: `Invite sent to ${email}.` });
  };
  const saveRole = (user: StaffUser, role: StaffRole) => {
    const previous = user.role;
    setUsers((items) => items.map((item) => item.id === user.id ? { ...item, role } : item));
    setDialog(null);
    setToast({ message: `${user.name} is now ${role}.`, undo: () => setUsers((items) => items.map((item) => item.id === user.id ? { ...item, role: previous } : item)) });
  };
  const deactivate = (user: StaffUser) => {
    setUsers((items) => items.map((item) => item.id === user.id ? { ...item, status: "Deactivated" } : item));
    setDialog(null);
    setToast({ message: `${user.name} was deactivated.`, undo: () => setUsers((items) => items.map((item) => item.id === user.id ? { ...item, status: user.status } : item)) });
  };
  const reactivate = (user: StaffUser) => {
    setUsers((items) => items.map((item) => item.id === user.id ? { ...item, status: "Active" } : item));
    setToast({ message: `${user.name} was reactivated.` });
  };
  const changeMode = (next: SettingsMode) => {
    setMode(next);
    setQuery("");
    setRoleFilter("All roles");
    setMenuUserId(null);
  };

  return <main className="settings-page">
    <header className="settings-header"><h1>Settings</h1><p>Staff accounts and the reference data the system uses.</p></header>
    <div className="settings-tabs">{(["Users","Rooms","Drivers","VIP categories","System"] as SettingsTab[]).map((item) => <button key={item} className={tab === item ? "is-active" : ""} onClick={() => { setTab(item); setMode("default"); setMenuUserId(null); }}>{item}</button>)}</div>
    {mode === "error" && tab === "Users" && <div className="settings-error"><Icon name="alert"/><span>We couldn't load users. Showing the last update at 11:18.</span><Button onClick={() => setMode("default")}>Retry</Button></div>}
    {tab === "Users" ? <>
      <div className="settings-tools">
        <label className="settings-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => { setQuery(event.target.value); setMode("default"); }} placeholder="Search by name or email"/></label>
        <label className="settings-role-filter"><select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value as StaffRole | "All roles"); setMode("default"); }}><option>All roles</option>{staffRoles.map((item) => <option key={item}>{item}</option>)}</select><Icon name="chevron" size={15}/></label>
        <Button kind="primary" icon="userPlus" onClick={() => setDialog({ type: "invite" })}>Invite user</Button>
      </div>
      <section className="settings-table-card">
        <div className="settings-table-head"><span>Name</span><span>Email</span><span>Role</span><span>Status</span><span>Last active</span><span/></div>
        {mode === "loading" ? <div className="settings-loading">{[0,1,2,3].map((item) => <Skeleton key={item}/>)}</div> : mode === "empty" || filteredUsers.length === 0 ? <div className="settings-empty"><b>No users match.</b><span>Try a different name, email or role.</span></div> :
        <div className="settings-table-body">{filteredUsers.map((user) => <div className="settings-user-row" key={user.id}>
          <div className="settings-user-name"><span className={`settings-avatar role-${user.role.toLowerCase()}`}>{initialsFor(user.name)}</span><b>{user.name}</b></div>
          <span className="settings-email">{user.email}</span>
          <span><i className={`settings-role role-${user.role.toLowerCase()}`}>{user.role}</i></span>
          <span><i className={`settings-status status-${user.status.toLowerCase()}`}>{user.status}</i></span>
          <time>{user.lastActive}</time>
          <div className="settings-row-actions"><button aria-label={`Actions for ${user.name}`} onClick={(event) => { event.stopPropagation(); setMenuUserId((current) => current === user.id ? null : user.id); }}>...</button>{menuUserId === user.id && <div className="settings-row-menu" onClick={(event) => event.stopPropagation()}><button onClick={() => { setDialog({ type: "edit", userId: user.id }); setMenuUserId(null); }}>Edit role</button><button onClick={() => { setDialog({ type: "reset", userId: user.id }); setMenuUserId(null); }}>Reset password</button>{user.status === "Deactivated" ? <button onClick={() => { reactivate(user); setMenuUserId(null); }}>Reactivate</button> : <button className="is-danger" onClick={() => { setDialog({ type: "deactivate", userId: user.id }); setMenuUserId(null); }}>Deactivate</button>}</div>}</div>
        </div>)}</div>}
      </section>
    </> : <SettingsPlaceholder tab={tab} notify={() => setToast({ message: "Opens a form, specified later." })}/>}
    <SettingsPreviewSwitch mode={mode} setMode={changeMode}/>
    {dialog?.type === "invite" && <InviteUserDialog close={() => setDialog(null)} invite={invite}/>}
    {dialog?.type === "edit" && selectedUser && <EditRoleDialog user={selectedUser} close={() => setDialog(null)} save={(role) => saveRole(selectedUser, role)}/>}
    {dialog?.type === "reset" && selectedUser && <ResetPasswordDialog user={selectedUser} close={() => setDialog(null)} reset={() => { setDialog(null); setToast({ message: `Password reset. ${selectedUser.name} will choose a new one at next sign in.` }); }}/>}
    {dialog?.type === "deactivate" && selectedUser && <DeactivateUserDialog user={selectedUser} close={() => setDialog(null)} deactivate={() => deactivate(selectedUser)}/>}
    {toast && <div className="toast-v4 settings-toast"><Icon name="check"/><span>{toast.message}</span>{toast.undo && <button onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button>}<button aria-label="Dismiss" onClick={() => setToast(null)}><Icon name="close" size={17}/></button></div>}
  </main>;
}

const routeFromPath = (path: string): Route => {
  if (path === "/dashboard") return "dashboard";
  if (path === "/programme") return "programme";
  if (path === "/guests") return "guests";
  if (path === "/guests/okafor" || path.includes("bishop-augustine-okafor")) return "profile";
  if (/^\/intake\/[^/]+(?:\/review)?$/.test(path)) return "review";
  if (path === "/intake") return "intake";
  if (path === "/arrivals") return "arrivals";
  if (path === "/transport") return "transport";
  if (path === "/rooms/plan" || path.includes("/rooms/allocation")) return "allocation";
  if (path === "/rooms") return "rooms";
  if (path === "/sanitation") return "sanitation";
  if (path === "/activity") return "activity";
  if (path === "/simulation") return "simulation";
  if (path === "/settings") return "settings";
  if (path === "/register/done" || path === "/confirmation") return "confirmation";
  if (path === "/register") return "registration";
  if (path === "/driver" || path.startsWith("/driver/")) return "driver";
  if (path === "/staff/front-desk") return "frontDesk";
  if (path === "/staff/sanitation") return "staffSanitation";
  if (path === "/sign-in") return "signIn";
  return "intake";
};

const pathForRoute = (route: Route) => ({
  dashboard: "/dashboard",
  programme: "/programme",
  guests: "/guests",
  profile: "/guests/okafor",
  intake: "/intake",
  review: "/intake/VIP-9M2X",
  arrivals: "/arrivals",
  transport: "/transport",
  rooms: "/rooms",
  allocation: "/rooms/plan",
  sanitation: "/sanitation",
  activity: "/activity",
  simulation: "/simulation",
  settings: "/settings",
  registration: "/register",
  confirmation: "/register/done",
  driver: "/driver",
  frontDesk: "/staff/front-desk",
  staffSanitation: "/staff/sanitation",
  signIn: "/sign-in",
})[route];

export default function App() {
  const [mode, setMode] = useState<Mode>("default");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reviewDuplicate, setReviewDuplicate] = useState(() => window.location.pathname.includes("VIP-4D8R"));
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationReadIds, setNotificationReadIds] = useState<string[]>(["sanitation","intake"]);
  const [moveWarningOrigin, setMoveWarningOrigin] = useState<"rooms" | "allocation">("rooms");
  const [moveWarningOpen, setMoveWarningOpen] = useState(false);
  const [moveWarningKey, setMoveWarningKey] = useState(0);
  const [openIntakeOnArrival, setOpenIntakeOnArrival] = useState(false);
  const [intakeCount, setIntakeCount] = useState(2);
  const [shellToast, setShellToast] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  const dismissShellUi = () => {
    setMenuOpen(false);
    setCopilotOpen(false);
    setNotificationsOpen(false);
    setMoveWarningOpen(false);
  };
  const navigate = (next: Route) => {
    dismissShellUi();
    setOpenIntakeOnArrival(false);
    setRoute(next);
    window.history.pushState({}, "", pathForRoute(next));
  };
  useEffect(() => {
    const syncFromHistory = () => {
      dismissShellUi();
      setOpenIntakeOnArrival(false);
      setReviewDuplicate(window.location.pathname.includes("VIP-4D8R"));
      setRoute(routeFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);
  const openReview = (duplicate: boolean) => {
    dismissShellUi();
    setReviewDuplicate(duplicate);
    setRoute("review");
    window.history.pushState({}, "", `/intake/${duplicate ? "VIP-4D8R" : "VIP-9M2X"}`);
  };
  const openIntakeDrawer = () => {
    dismissShellUi();
    setOpenIntakeOnArrival(true);
    setRoute("intake");
    window.history.pushState({}, "", "/intake");
  };
  const openMoveWarning = (origin: "rooms" | "allocation") => {
    setMoveWarningOrigin(origin);
    setMoveWarningKey((key) => key + 1);
    setMoveWarningOpen(true);
  };
  const openNotificationTarget = (item: NotificationItem) => {
    if (item.target === "arrivals") navigate("arrivals");
    else if (item.target === "transport") navigate("transport");
    else if (item.target === "programme") navigate("programme");
    else if (item.target === "sanitation") navigate("sanitation");
    else if (item.target === "intake") navigate("intake");
    else setShellToast(`Opens ${item.screen}.`);
  };
  const completeSignIn = (target: SignInTarget, _message: string) => navigate(target);
  if (route === "registration") return <RegistrationPage openConfirmation={() => navigate("confirmation")}/>;
  if (route === "confirmation") return <ConfirmationPage backToForm={() => navigate("registration")}/>;
  if (route === "driver") return <DriverPickupsPage/>;
  if (route === "frontDesk") return <FrontDeskPage/>;
  if (route === "staffSanitation") return <StaffSanitationPage openSignIn={() => navigate("signIn")}/>;
  if (route === "signIn") return <SignInPage signIn={completeSignIn}/>;
  return <div className={`app-shell-v4 route-${route}`}><Sidebar open={menuOpen} close={() => setMenuOpen(false)} mode={mode} route={route} navigate={navigate} unavailable={() => setShellToast("Coming in the next screen")} intakeCount={intakeCount}/><div className="workspace-v4"><TopBar openMenu={() => setMenuOpen(true)} openCopilot={() => { setNotificationsOpen(false); setCopilotOpen(true); }} openNotifications={() => { setCopilotOpen(false); setNotificationsOpen(true); }} notificationDot={notificationItems.some((item) => !notificationReadIds.includes(item.id))} signOut={() => navigate("signIn")}/>{route === "dashboard" ? <Dashboard mode={mode} setMode={setMode} navigate={navigate} openIntakeDrawer={openIntakeDrawer}/> : route === "programme" ? <ProgrammePage openGuest={() => navigate("profile")}/> : route === "profile" ? <ProfilePage back={() => navigate("guests")} openProgramme={() => navigate("programme")}/> : route === "guests" ? <GuestsPage openProfile={() => navigate("profile")}/> : route === "review" ? <ReviewPage initialDuplicate={reviewDuplicate} back={() => navigate("intake")} openProfile={() => navigate("profile")} approved={() => setIntakeCount((count) => Math.max(0, count - 1))}/> : route === "arrivals" ? <ArrivalsPage openProfile={() => navigate("profile")} openTransport={() => navigate("transport")}/> : route === "transport" ? <TransportPage openProfile={() => navigate("profile")}/> : route === "rooms" ? <RoomsPage openAllocation={() => navigate("allocation")} openMoveWarning={() => openMoveWarning("rooms")} openSanitation={() => navigate("sanitation")}/> : route === "allocation" ? <AllocationPage openRooms={() => navigate("rooms")} openMoveWarning={() => openMoveWarning("allocation")} openProfile={() => navigate("profile")}/> : route === "sanitation" ? <SanitationPage/> : route === "activity" ? <ActivityPage navigate={navigate}/> : route === "simulation" ? <SimulationPage openCopilot={() => { setNotificationsOpen(false); setCopilotOpen(true); }}/> : route === "settings" ? <SettingsPage/> : <IntakePage openReview={openReview} initialDrawer={openIntakeOnArrival}/>}</div>{copilotOpen && <CopilotDrawer close={() => setCopilotOpen(false)} openGuest={() => navigate("profile")} openRooms={() => navigate("rooms")}/>} {notificationsOpen && <NotificationsDrawer close={() => setNotificationsOpen(false)} readIds={notificationReadIds} setReadIds={setNotificationReadIds} openTarget={openNotificationTarget}/>} {moveWarningOpen && <MoveWarningScreen key={moveWarningKey} origin={moveWarningOrigin} dismiss={() => setMoveWarningOpen(false)} overlayOnly/>} {shellToast && <div className="toast-v4"><Icon name="info"/><span>{shellToast}</span><button aria-label="Dismiss" onClick={() => setShellToast(null)}><Icon name="close" size={17}/></button></div>}</div>;
}
