// Shown instead of the form when the link is unknown (or was regenerated) or registration is
// closed. It says what to do next without revealing anything about the event's settings.
import { Icon } from '@/components/ui/Icon'

interface RegistrationUnavailableProps {
  readonly reason: 'invalid' | 'closed' | 'busy'
  readonly eventName?: string
}

export function RegistrationUnavailable({ reason, eventName }: RegistrationUnavailableProps) {
  const closed = reason === 'closed'
  const title = reason === 'busy' ? 'Too many requests' : closed ? 'Registration is closed' : 'This link is not valid'
  const message =
    reason === 'busy'
      ? 'This connection opened the form too many times in a short while. Wait a minute and reload the page.'
      : closed
        ? 'The organisers are not taking registrations through this link at the moment. Contact them directly.'
        : 'It may have been replaced by a new link. Ask the organisers for the current registration link.'
  return (
    <main className="registration-page">
      <div className="registration-column">
        <header className="registration-banner">
          <div className="public-brand">
            <img src="/hostmark-logo-C.svg" alt="" width={34} height={34} />
            <b>
              <span>Host</span>mark
            </b>
          </div>
          {eventName && (
            <>
              <p>REGISTRATION FOR</p>
              <h2>{eventName}</h2>
            </>
          )}
        </header>
        <section className="registration-card registration-closed" aria-labelledby="unavailable-title">
          <Icon name={reason === 'invalid' ? 'link' : 'clock'} size={28} />
          <h1 id="unavailable-title">{title}</h1>
          <p>{message}</p>
        </section>
      </div>
    </main>
  )
}
