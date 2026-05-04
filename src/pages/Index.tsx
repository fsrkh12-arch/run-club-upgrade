import PCBApp from "./PaceClubApp.jsx";

const Index = () => (
  <div className="pcb-shell">
    <div className="pcb-shell-grid">
      <section className="pcb-marketing">
        <div className="pcb-eyebrow">Pace Club Baku · Est. 2025</div>
        <h1 className="pcb-headline">
          The runner's <em>companion</em><br/>
          for the city by the Caspian.
        </h1>
        <p className="pcb-sub">
          Live physiology. Geofenced safety. A community that knows every
          curve of the Bulvar. Built for the runners of Baku — and for the
          ones who arrive tomorrow.
        </p>
        <div className="pcb-meta">
          <div className="pcb-meta-item">
            <div className="n">4 Hz</div>
            <div className="l">Master Loop</div>
          </div>
          <div className="pcb-meta-item">
            <div className="n">VDOT</div>
            <div className="l">VO₂ Model</div>
          </div>
          <div className="pcb-meta-item">
            <div className="n">TRIMP</div>
            <div className="l">Banister Load</div>
          </div>
          <div className="pcb-meta-item">
            <div className="n">Geo</div>
            <div className="l">Safety Fence</div>
          </div>
        </div>
      </section>

      <section className="pcb-device-stage">
        <div className="pcb-device">
          <div className="pcb-device-notch" />
          <div className="pcb-device-screen">
            <div>
              <PCBApp />
            </div>
          </div>
        </div>
      </section>
    </div>
    <div className="pcb-foot">— Baku · Azərbaycan · Run with the city —</div>
  </div>
);

export default Index;
