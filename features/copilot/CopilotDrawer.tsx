'use client'
// Co-Pilot drawer (M4). The chat arrives in P7; until then the drawer explains what it will do.
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'

export function CopilotDrawer({ onClose }: { readonly onClose: () => void }) {
  return (
    <Modal onClose={onClose} scrimClassName="copilot-scrim" className="copilot-drawer" as="aside" labelledBy="copilot-title">
      <header>
        <div className="copilot-title">
          <span>
            <Icon name="sparkle" />
          </span>
          <h2 id="copilot-title">Ask Co-Pilot</h2>
          <button type="button" aria-label="Close Co-Pilot" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <p>Answers use live data. Changes need your approval.</p>
      </header>
      <div className="copilot-conversation">
        <div className="copilot-empty">
          <b>Coming soon</b>
          <p>Ask about arrivals, rooms and pickups by typing or speaking. Arrives with phase P7.</p>
        </div>
      </div>
    </Modal>
  )
}
