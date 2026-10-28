/**
 * AboutModal — Honey B Pilot App
 *
 * Displays the full official brand logo on a warm cream background tile so the
 * cream wing and black outlines remain crisp.  Below the mark, a brief info
 * panel shows the app version and a simulation disclaimer.
 *
 * The modal is opened by the ⓘ button in the TabletPilotOverview header.
 */

interface Props {
  onClose: () => void;
  contractVersion?: string;
}

export function AboutModal({ onClose, contractVersion = '1.0.0' }: Props) {
  return (
    <div
      className="about-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="About Honey B Pilot App"
      onClick={(e) => {
        // Close when clicking the dark backdrop (not the card itself)
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="about-modal-card">
        {/* Full logo tile on warm cream so wing + outlines stay intact */}
        <div className="about-modal-logo-tile">
          <img
            src="/honey-b-logo.jpg"
            alt="Honey B — Official Brand Logo"
            className="about-modal-logo-img"
            draggable={false}
          />
        </div>

        <div className="about-modal-body">
          <div className="about-modal-title">Honey B Pilot System</div>
          <div className="about-modal-tagline">
            Air–ground datalink management prototype for the UAE Hackathon 2026.
            Fusing aircraft FMS telemetry with ground AMAN sequencing instructions
            in a single-glance cockpit tablet interface.
          </div>

          <div className="about-modal-meta">
            <div className="about-modal-meta-row">
              <span className="meta-label">Interface Contract</span>
              <span className="meta-value">v{contractVersion}</span>
            </div>
            <div className="about-modal-meta-row">
              <span className="meta-label">Platform</span>
              <span className="meta-value">Tablet (1024 × 768 – 1366 × 768)</span>
            </div>
            <div className="about-modal-meta-row">
              <span className="meta-label">Branch</span>
              <span className="meta-value">pilot-system</span>
            </div>
            <div className="about-modal-meta-row">
              <span className="meta-label">Ground-Control Integration</span>
              <span className="meta-value">Datalink Adapter v1</span>
            </div>
          </div>

          <p className="about-modal-disclaimer">
            SIMULATION PROTOTYPE · NOT CERTIFIED AVIONICS<br />
            Not a source of air traffic clearance. For demonstration purposes only.
          </p>
        </div>

        <button
          type="button"
          className="about-modal-close"
          onClick={onClose}
          aria-label="Close About screen"
        >
          Close
        </button>
      </div>
    </div>
  );
}
