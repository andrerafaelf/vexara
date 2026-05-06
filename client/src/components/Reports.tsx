import React, { useEffect, useState } from 'react';
import { getReports, sendAttack } from '../services/api';
import '../styles/Reports.css';
import { Attack, Nexus } from '../types/game';

interface ReportsProps {
  nexus: Nexus;
}

const troopNames: Record<string, string> = {
  lancerDrone: '🛡️ Lancer Drone',
  assaultTrooper: '⚔️ Assault Trooper',
  breakerUnit: '🔨 Breaker Unit',
  reconOperative: '🔍 Recon Operative',
  skimmerBike: '🏍️ Skimmer Bike',
  siegeMech: '🤖 Siege Mech',
  bulwarkGuard: '🛡️ Bulwark Guard',
  suppressorTeam: '🎯 Suppressor Team',
  disruptorUnit: '⚡ Disruptor Unit',
  interceptorBike: '🏍️ Interceptor Bike',
  annihilatorPlatform: '💀 Annihilator Platform',
  overseer: '👁️ Overseer',
};

const Reports: React.FC<ReportsProps> = ({ nexus }) => {
  const [reports, setReports] = useState<Attack[]>([]);
  const [selectedReport, setSelectedReport] = useState<Attack | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAttackForm, setShowAttackForm] = useState(false);
  const [attackTroops, setAttackTroops] = useState({
    lancerDrone: 0,
    assaultTrooper: 0,
    breakerUnit: 0,
    reconOperative: 0,
    skimmerBike: 0,
    siegeMech: 0,
    bulwarkGuard: 0,
    suppressorTeam: 0,
    disruptorUnit: 0,
    interceptorBike: 0,
    annihilatorPlatform: 0,
    overseer: 0,
  });
  const [viewedReports, setViewedReports] = useState<Set<string>>(() => {
    // Load viewed reports from localStorage
    const saved = localStorage.getItem('viewedReports');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  useEffect(() => {
    loadReports();
  }, [nexus._id]);

  // Save viewed reports to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('viewedReports', JSON.stringify(Array.from(viewedReports)));
  }, [viewedReports]);

  useEffect(() => {
    if (!selectedReport || viewedReports.has(selectedReport._id)) {
      return;
    }

    setViewedReports((prev) => {
      const next = new Set(prev);
      next.add(selectedReport._id);
      return next;
    });
  }, [selectedReport, viewedReports]);

  useEffect(() => {
    setShowAttackForm(false);
    setAttackTroops({
      lancerDrone: 0,
      assaultTrooper: 0,
      breakerUnit: 0,
      reconOperative: 0,
      skimmerBike: 0,
      siegeMech: 0,
      bulwarkGuard: 0,
      suppressorTeam: 0,
      disruptorUnit: 0,
      interceptorBike: 0,
      annihilatorPlatform: 0,
      overseer: 0,
    });
  }, [selectedReport?._id]);

  const handleSendAttack = async () => {
    if (!selectedReport) return;
    const total = Object.values(attackTroops).reduce((a, b) => a + b, 0);
    if (total === 0) {
      alert('Select at least one troop!');
      return;
    }
    try {
      await sendAttack(nexus._id, selectedReport.defender.nexus._id, attackTroops, 'attack');
      alert('Strike sent!');
      setShowAttackForm(false);
      setAttackTroops({
        lancerDrone: 0,
        assaultTrooper: 0,
        breakerUnit: 0,
        reconOperative: 0,
        skimmerBike: 0,
        siegeMech: 0,
        bulwarkGuard: 0,
        suppressorTeam: 0,
        disruptorUnit: 0,
        interceptorBike: 0,
        annihilatorPlatform: 0,
        overseer: 0,
      });
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error sending strike');
    }
  };

  const loadReports = async () => {
    try {
      setLoading(true);
      const response = await getReports(nexus._id);
      setReports(response.data);
    } catch (err) {
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    return d.toLocaleString();
  };

  const getTroopTotal = (troops: any) => {
    return Object.values(troops).reduce((a: any, b: any) => a + b, 0);
  };

  const isAttacker = (report: Attack) => {
    return report.attacker.nexus._id === nexus._id;
  };

  const isScoutReport = (report: Attack) => report.type === 'scout' || report.result?.mission === 'scout';

  if (loading) {
    return <div className="reports-container">Loading reports...</div>;
  }

  if (selectedReport) {
    const isMyAttack = isAttacker(selectedReport);
    const myRole = isMyAttack ? 'attacker' : 'defender';
    const enemyRole = isMyAttack ? 'defender' : 'attacker';
    const scoutReport = isScoutReport(selectedReport);

    return (
      <div className="reports-container">
        <div className="reports-header">
          <button onClick={() => setSelectedReport(null)} className="btn-back">
            ← Back to Combat Logs
          </button>
          <h2>{scoutReport ? 'Scout Report' : 'Combat Report'}</h2>
        </div>

        <div className="report-detail">
          <div className={`report-result ${selectedReport.result.victory ? 'victory' : 'defeat'}`}>
            {scoutReport ? (
              <span>🔍 Recon complete. Intelligence updated.</span>
            ) : isMyAttack ? (
              selectedReport.result.victory ? (
                <>
                  <span>🎉 Victory! You won the strike</span>
                  {selectedReport.result.conquered && <div className="conquest-notice">👑 NEXUS CONQUERED!</div>}
                </>
              ) : (
                <span>💀 Defeat! Your strike failed</span>
              )
            ) : selectedReport.result.victory ? (
              <span>💀 Defeat! Your nexus was raided</span>
            ) : (
              <span>🛡️ Victory! You defended successfully</span>
            )}
          </div>

          {scoutReport && isMyAttack && (
            <div className="report-section scout-attack-section">
              <div className="scout-target-bar">
                <div className="scout-target-info">
                  <span className="scout-target-label">Target</span>
                  <span className="scout-target-name">
                    {selectedReport.defender.nexus?.name || 'Unknown'}{' '}
                    <span className="scout-target-coords">
                      ({selectedReport.defender.nexus?.x ?? '?'}|{selectedReport.defender.nexus?.y ?? '?'})
                    </span>
                  </span>
                </div>
                <button className="scout-attack-btn" onClick={() => setShowAttackForm((v) => !v)}>
                  ⚔️ {showAttackForm ? 'Cancel' : 'Attack'}
                </button>
              </div>
              {showAttackForm && (
                <div className="scout-attack-form">
                  <div className="scout-troop-list">
                    {Object.entries(nexus.troops).map(([type, available]) => (
                      <div key={type} className="scout-troop-row">
                        <span className="scout-troop-label">{troopNames[type] || type}</span>
                        <input
                          type="number"
                          min={0}
                          max={available}
                          value={attackTroops[type as keyof typeof attackTroops]}
                          disabled={available <= 0}
                          onChange={(e) =>
                            setAttackTroops((prev) => ({
                              ...prev,
                              [type]: Math.min(Number(e.target.value), available),
                            }))
                          }
                        />
                        <span className="scout-troop-available">/{available}</span>
                      </div>
                    ))}
                  </div>
                  <div className="scout-attack-actions">
                    <button className="scout-send-all-btn" onClick={() => setAttackTroops({ ...nexus.troops })}>
                      Send All
                    </button>
                    <button className="scout-send-btn" onClick={handleSendAttack}>
                      Send Attack
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {scoutReport && selectedReport.result?.intel && (
            <div className="report-section">
              <h3>Scouted Intelligence</h3>
              <p>
                <strong>Resources:</strong> 🧬 {selectedReport.result.intel.resources.biomass} | ⚙️{' '}
                {selectedReport.result.intel.resources.alloy} | 💎 {selectedReport.result.intel.resources.ore}
              </p>
              <p>
                <strong>Population:</strong> {selectedReport.result.intel.population.current}/
                {selectedReport.result.intel.population.max}
              </p>
              <p>
                <strong>Control Level:</strong> {selectedReport.result.intel.controlLevel}/100
              </p>
              <p>
                <strong>Shield Grid:</strong> {selectedReport.result.intel.buildings.shieldGrid}
              </p>
            </div>
          )}

          {!scoutReport && (
            <>
              {selectedReport.result.controlReduced && !selectedReport.result.conquered && (
                <div className="control-notice">
                  🎯 Control reduced! Remaining: {selectedReport.result.remainingControl}/100
                </div>
              )}

              {selectedReport.result.nexusLifeReduced && (
                <div className="control-notice">
                  ⚡ Nexus life reduced! Remaining: {selectedReport.result.remainingNexusLife || 0}/
                  {selectedReport.defender.nexus?.buildings?.shieldGrid ? 100 : 0}
                </div>
              )}

              <div className="report-section">
                <h3>Strike Information</h3>
                <p>
                  <strong>Date:</strong> {formatDate(selectedReport.arrivesAt)}
                </p>
                <p>
                  <strong>Striker:</strong> {selectedReport.attacker.user?.username || 'Unknown'} from{' '}
                  {selectedReport.attacker.nexus?.name || 'Unknown'} ({selectedReport.attacker.nexus?.x || '?'}|
                  {selectedReport.attacker.nexus?.y || '?'})
                </p>
                <p>
                  <strong>Defender:</strong> {selectedReport.defender.user?.username || 'Unknown'} from{' '}
                  {selectedReport.defender.nexus?.name || 'Unknown'} ({selectedReport.defender.nexus?.x || '?'}|
                  {selectedReport.defender.nexus?.y || '?'})
                </p>
                {selectedReport.result?.remainingControl !== undefined &&
                  selectedReport.result.remainingControl !== null && (
                    <p>
                      <strong>Nexus Control:</strong> {selectedReport.result.remainingControl}/100
                      {selectedReport.result.conquered && ' (Conquered!)'}
                    </p>
                  )}
                {selectedReport.result?.remainingNexusLife !== undefined &&
                  selectedReport.result.remainingNexusLife !== null && (
                    <p>
                      <strong>Nexus Life:</strong> {selectedReport.result.remainingNexusLife}/100
                    </p>
                  )}
              </div>

              <div className="report-section">
                <h3>Your Forces</h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Sent</th>
                      <th>Lost</th>
                      <th>Survived</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRole === 'attacker' && (
                      <>
                        {Object.entries(selectedReport.troops).map(([troopType, count]) =>
                          count > 0 ? (
                            <tr key={troopType}>
                              <td>{troopNames[troopType] || troopType}</td>
                              <td>{count}</td>
                              <td className="losses">{selectedReport.result?.attackerLosses?.[troopType] || 0}</td>
                              <td>{count - (selectedReport.result?.attackerLosses?.[troopType] || 0)}</td>
                            </tr>
                          ) : null,
                        )}
                      </>
                    )}
                    {myRole === 'defender' &&
                      selectedReport.result?.defenderLosses &&
                      Object.entries(selectedReport.result.defenderLosses).map(
                        ([troop, lost]) =>
                          Number(lost) > 0 && (
                            <tr key={troop}>
                              <td>{troopNames[troop] || troop}</td>
                              <td>-</td>
                              <td className="losses">{lost}</td>
                              <td>-</td>
                            </tr>
                          ),
                      )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="report-section">
            <h3>Enemy Forces</h3>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>{scoutReport ? 'Detected' : 'Lost'}</th>
                </tr>
              </thead>
              <tbody>
                {scoutReport &&
                  Object.entries(selectedReport.result?.intel?.troops || {}).map(
                    ([troop, count]) =>
                      Number(count) > 0 && (
                        <tr key={troop}>
                          <td>{troopNames[troop] || troop}</td>
                          <td>{count}</td>
                        </tr>
                      ),
                  )}
                {enemyRole === 'attacker' &&
                  !scoutReport &&
                  selectedReport.result?.attackerLosses &&
                  Object.entries(selectedReport.result.attackerLosses).map(
                    ([troop, lost]) =>
                      Number(lost) > 0 && (
                        <tr key={troop}>
                          <td>{troopNames[troop] || troop}</td>
                          <td className="losses">{lost}</td>
                        </tr>
                      ),
                  )}
                {enemyRole === 'defender' &&
                  !scoutReport &&
                  selectedReport.result?.defenderLosses &&
                  Object.entries(selectedReport.result.defenderLosses).map(
                    ([troop, lost]) =>
                      Number(lost) > 0 && (
                        <tr key={troop}>
                          <td>{troopNames[troop] || troop}</td>
                          <td className="losses">{lost}</td>
                        </tr>
                      ),
                  )}
                {scoutReport &&
                  Object.values(selectedReport.result?.intel?.troops || {}).every((count) => Number(count) <= 0) && (
                    <tr>
                      <td colSpan={2}>No enemy troops detected.</td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>

          {selectedReport.result.resourcesStolen &&
            (selectedReport.result.resourcesStolen.biomass > 0 ||
              selectedReport.result.resourcesStolen.alloy > 0 ||
              selectedReport.result.resourcesStolen.ore > 0) && (
              <div className="report-section">
                <h3>Resources {isMyAttack ? 'Plundered' : 'Lost'}</h3>
                <div className="resources-stolen">
                  {selectedReport.result.resourcesStolen.biomass > 0 && (
                    <div className="resource-item">
                      <span>🧬 Biomass:</span> {selectedReport.result.resourcesStolen.biomass}
                    </div>
                  )}
                  {selectedReport.result.resourcesStolen.alloy > 0 && (
                    <div className="resource-item">
                      <span>⚙️ Alloy:</span> {selectedReport.result.resourcesStolen.alloy}
                    </div>
                  )}
                  {selectedReport.result.resourcesStolen.ore > 0 && (
                    <div className="resource-item">
                      <span>💎 Ore:</span> {selectedReport.result.resourcesStolen.ore}
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      </div>
    );
  }

  return (
    <div className="reports-container">
      <div className="reports-header">
        <h2>📜 Combat Logs</h2>
        <p>Showing last 20 reports for {nexus.name}</p>
      </div>

      {reports.length === 0 ? (
        <div className="no-reports">
          <p>No combat reports yet. Strike other nexuses or defend yours to see reports here!</p>
        </div>
      ) : (
        <div className="reports-list">
          {reports.map((report) => {
            const isMyAttack = isAttacker(report);
            const hasBeenViewed = viewedReports.has(report._id);
            const won = isMyAttack ? report.result.victory : !report.result.victory;
            const scoutReport = isScoutReport(report);

            return (
              <div
                key={report._id}
                className={`report-item ${hasBeenViewed ? (won ? 'won' : 'lost') : ''}`}
                onClick={() => setSelectedReport(report)}
              >
                <div className="report-icon">{hasBeenViewed ? (won ? '🎉' : '💀') : '⚔️'}</div>
                <div className="report-info">
                  <div className="report-title">
                    {hasBeenViewed ? (
                      scoutReport ? (
                        <>
                          Scout report on {report.defender.nexus?.name || 'Unknown'} ({report.defender.nexus?.x || '?'}|
                          {report.defender.nexus?.y || '?'})
                        </>
                      ) : isMyAttack ? (
                        <>
                          Strike on {report.defender.nexus?.name || 'Unknown'} ({report.defender.nexus?.x || '?'}|
                          {report.defender.nexus?.y || '?'})
                        </>
                      ) : (
                        <>
                          Defense against {report.attacker.user?.username || 'Unknown'} from{' '}
                          {report.attacker.nexus?.name || 'Unknown'} ({report.attacker.nexus?.x || '?'}|
                          {report.attacker.nexus?.y || '?'})
                        </>
                      )
                    ) : (
                      'Combat Report'
                    )}
                  </div>
                  <div className="report-meta">
                    {hasBeenViewed && !scoutReport && (
                      <span className={won ? 'victory' : 'defeat'}>{won ? 'Victory' : 'Defeat'}</span>
                    )}
                    {hasBeenViewed && scoutReport && <span className="victory">Scout</span>}
                    <span className="report-date">{formatDate(report.arrivesAt)}</span>
                    {hasBeenViewed && !scoutReport && isMyAttack && report.result.resourcesStolen && (
                      <span className="loot">
                        💰{' '}
                        {report.result.resourcesStolen.biomass +
                          report.result.resourcesStolen.alloy +
                          report.result.resourcesStolen.ore}
                      </span>
                    )}
                  </div>
                </div>
                <div className="report-arrow">→</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Reports;
