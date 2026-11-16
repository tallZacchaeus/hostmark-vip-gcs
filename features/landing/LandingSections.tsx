// The lower half of the landing page: what is in the product, measured results, safeguards and
// the demo request. Static content (features/landing/content.ts) except the form.
import { Icon } from '@/components/ui/Icon'
import { MODULES, RESULTS, RESULTS_SOURCE, ROLES, SAFEGUARDS, type Screenshot } from './content'
import { DemoRequestForm } from './DemoRequestForm'

function Shot({ shot, className }: { readonly shot: Screenshot; readonly className?: string }) {
  return <img className={className} src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} loading="lazy" decoding="async" />
}

export function ModulesSection() {
  return (
    <section className="lp-section" id="product" aria-labelledby="lp-modules-title">
      <div className="lp-container">
        <header className="lp-section-head">
          <p className="lp-eyebrow">One place for the whole visit</p>
          <h2 id="lp-modules-title">From the registration link to the last check-out</h2>
          <p>Six parts that share one picture of every guest, so a change in one is seen in all the others.</p>
        </header>
        <div className="lp-bento">
          {MODULES.map((module) => (
            <article key={module.title} className={`lp-tile lp-tile--${module.slug}${module.shot ? ' lp-tile--shot' : ''}`}>
              <span className="lp-tile-icon">
                <Icon name={module.icon} size={20} />
              </span>
              <h3>{module.title}</h3>
              <p>{module.text}</p>
              {module.shot && <Shot shot={module.shot} className={module.shot.width < module.shot.height ? 'lp-tile-phone' : 'lp-tile-screen'} />}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export function ResultsSection() {
  return (
    <section className="lp-section lp-section--dark" id="results" aria-labelledby="lp-results-title">
      <div className="lp-container">
        <header className="lp-section-head">
          <p className="lp-eyebrow">Results</p>
          <h2 id="lp-results-title">Measured, not promised</h2>
          <p>Hostmark ships with evaluations that replay a busy event day. These are the numbers from the latest run.</p>
        </header>
        <dl className="lp-results">
          {RESULTS.map((result) => (
            <div key={result.label} className="lp-result">
              <dt>
                <span>{result.value}</span>
                {result.label}
              </dt>
              <dd>{result.detail}</dd>
            </div>
          ))}
        </dl>
        <p className="lp-results-source">{RESULTS_SOURCE}</p>
      </div>
    </section>
  )
}

export function SafeguardsSection() {
  return (
    <section className="lp-section" id="trust" aria-labelledby="lp-trust-title">
      <div className="lp-container lp-split">
        <header className="lp-section-head lp-section-head--left">
          <p className="lp-eyebrow">Safe by design</p>
          <h2 id="lp-trust-title">Fast suggestions, human decisions</h2>
          <p>Protocol matters at VIP events. Hostmark does the re-planning in milliseconds, then leaves the decision to your team.</p>
          <ul className="lp-roles" aria-label="Who uses Hostmark">
            {ROLES.map((role) => (
              <li key={role}>{role}</li>
            ))}
          </ul>
        </header>
        <ul className="lp-safeguards">
          {SAFEGUARDS.map((point) => (
            <li key={point.title}>
              <span className="lp-tile-icon">
                <Icon name={point.icon} size={20} />
              </span>
              <div>
                <h3>{point.title}</h3>
                <p>{point.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function DemoSection() {
  return (
    <section className="lp-section lp-demo" id="demo" aria-labelledby="lp-demo-title">
      <div className="lp-container lp-split">
        <header className="lp-section-head lp-section-head--left">
          <p className="lp-eyebrow">See it with your own event</p>
          <h2 id="lp-demo-title">Request a demo</h2>
          <p>Tell us about your event and we will walk you through Hostmark with a day that looks like yours: your venues, your flights, your protocol.</p>
          <ul className="lp-demo-points">
            <li>
              <Icon name="calendar" size={18} /> A walkthrough built around your own event
            </li>
            <li>
              <Icon name="users" size={18} /> Bring your coordinators and transport lead
            </li>
            <li>
              <Icon name="shield" size={18} /> Your details are only used to reply to you
            </li>
          </ul>
        </header>
        <div className="lp-form-card">
          <DemoRequestForm />
        </div>
      </div>
    </section>
  )
}
