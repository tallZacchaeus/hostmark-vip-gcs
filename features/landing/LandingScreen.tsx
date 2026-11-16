// Public landing page (/ for people who are not signed in): what Hostmark does, for event
// organisers deciding whether to use it, with a demo request and the staff sign-in.
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { CASCADE_STEPS, PROBLEMS, SCREENSHOTS } from './content'
import { DemoSection, ModulesSection, ResultsSection, SafeguardsSection } from './LandingSections'

const NAV_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#how', label: 'How it works' },
  { href: '#results', label: 'Results' },
  { href: '#trust', label: 'Safeguards' },
] as const

function Brand() {
  return (
    <Link href="/" className="lp-brand" aria-label="Hostmark home">
      <img src="/hostmark-logo-C.svg" alt="" width={36} height={36} />
      <b>
        Host<span>mark</span>
      </b>
    </Link>
  )
}

function LandingHeader() {
  return (
    <header className="lp-header">
      <div className="lp-container lp-header-inner">
        <Brand />
        <nav aria-label="Sections" className="lp-nav">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className="lp-header-actions">
          <Link href="/sign-in" className="lp-link-quiet">
            Staff sign in
          </Link>
          <a href="#demo" className="lp-button lp-button--primary lp-button--small">
            Request a demo
          </a>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  const { dashboard, registrationPhone } = SCREENSHOTS
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-container lp-hero-grid">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow lp-eyebrow--light">VIP guest coordination for events</p>
          <h1 id="lp-hero-title">Every VIP arrival, handled before it becomes a problem.</h1>
          <p className="lp-hero-lede">
            Hostmark brings registration, flights, drivers, rooms and the programme into one live view. When a flight is late, it re-plans the pickup
            and the room for your team to approve.
          </p>
          <div className="lp-hero-actions">
            <a href="#demo" className="lp-button lp-button--primary">
              Request a demo
            </a>
            <a href="#how" className="lp-button lp-button--ghost">
              See how it works <Icon name="arrow" size={16} />
            </a>
          </div>
          <ul className="lp-hero-facts">
            <li>Works on any phone</li>
            <li>Every change approved by a person</li>
            <li>Several events at once</li>
          </ul>
        </div>
        <div className="lp-hero-visual">
          <figure className="lp-browser">
            <div className="lp-browser-bar" aria-hidden="true">
              <i />
              <i />
              <i />
              <span>hostmark.tech/dashboard</span>
            </div>
            <img src={dashboard.src} alt={dashboard.alt} width={dashboard.width} height={dashboard.height} fetchPriority="high" />
          </figure>
          <img
            className="lp-hero-phone"
            src={registrationPhone.src}
            alt={registrationPhone.alt}
            width={registrationPhone.width}
            height={registrationPhone.height}
          />
        </div>
      </div>
    </section>
  )
}

function ProblemSection() {
  return (
    <section className="lp-section lp-section--tint" aria-labelledby="lp-problem-title">
      <div className="lp-container">
        <header className="lp-section-head">
          <p className="lp-eyebrow">Why it exists</p>
          <h2 id="lp-problem-title">VIP events still run on chat threads and good luck</h2>
        </header>
        <ul className="lp-problems">
          {PROBLEMS.map((problem) => (
            <li key={problem.title}>
              <span className="lp-tile-icon lp-tile-icon--warm">
                <Icon name={problem.icon} size={20} />
              </span>
              <h3>{problem.title}</h3>
              <p>{problem.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function CascadeSection() {
  const { driverPhone } = SCREENSHOTS
  return (
    <section className="lp-section" id="how" aria-labelledby="lp-how-title">
      <div className="lp-container lp-split lp-split--media">
        <div>
          <header className="lp-section-head lp-section-head--left">
            <p className="lp-eyebrow">How it works</p>
            <h2 id="lp-how-title">One late flight, handled in a minute</h2>
            <p>A delay touches the driver, the room and the programme. Hostmark follows it through all three, then asks before anything changes.</p>
          </header>
          <ol className="lp-steps">
            {CASCADE_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="lp-step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <time>{step.time}</time>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <img className="lp-how-phone" src={driverPhone.src} alt={driverPhone.alt} width={driverPhone.width} height={driverPhone.height} loading="lazy" />
      </div>
    </section>
  )
}

function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-inner">
        <Brand />
        <p>VIP guest coordination for summits, state visits and conferences.</p>
        <nav aria-label="Footer" className="lp-footer-links">
          <a href="#demo">Request a demo</a>
          <Link href="/sign-in">Staff sign in</Link>
        </nav>
        <small>© {new Date().getFullYear()} Hostmark</small>
      </div>
    </footer>
  )
}

export function LandingScreen() {
  return (
    <div className="lp-page">
      <a className="lp-skip" href="#lp-main">
        Skip to content
      </a>
      <LandingHeader />
      <main id="lp-main">
        <Hero />
        <ProblemSection />
        <CascadeSection />
        <ModulesSection />
        <ResultsSection />
        <SafeguardsSection />
        <DemoSection />
      </main>
      <LandingFooter />
    </div>
  )
}
