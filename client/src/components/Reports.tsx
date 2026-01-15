import React, { useEffect, useState } from 'react';
import { getReports } from '../services/api';
import '../styles/Reports.css';
import { Attack, Village } from '../types/game';

interface ReportsProps {
  village: Village;
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

const Reports: React.FC<ReportsProps> = ({ village }) => {
  const [reports, setReports] = useState<Attack[]>([]);
  const [selectedReport, setSelectedReport] = useState<Attack | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, [village._id]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const response = await getReports(village._id);
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
    return report.attacker.village._id === village._id;
  };

  if (loading) {
    return <div className="reports-container">Loading reports...</div>;
  }

  if (selectedReport) {
    const isMyAttack = isAttacker(selectedReport);
    const myRole = isMyAttack ? 'attacker' : 'defender';
    const enemyRole = isMyAttack ? 'defender' : 'attacker';

    return (
      <div className="reports-container">
        <div className="reports-header">
          <button onClick={() => setSelectedReport(null)} className="btn-back">
            ← Back to Combat Logs
          </button>
          <h2>Combat Report</h2>
        </div>

        <div className="report-detail">
          <div className={`report-result ${selectedReport.result.victory ? 'victory' : 'defeat'}`}>
            {isMyAttack ? (
              selectedReport.result.victory ? (
                <>
                  <span>🎉 Victory! You won the strike</span>
                  {selectedReport.result.conquered && <div className="conquest-notice">👑 NODE CONQUERED!</div>}
                </>
              ) : (
                <span>💀 Defeat! Your strike failed</span>
              )
            ) : selectedReport.result.victory ? (
              <span>💀 Defeat! Your node was raided</span>
            ) : (
              <span>🛡️ Victory! You defended successfully</span>
            )}
          </div>

          {selectedReport.result.controlReduced && !selectedReport.result.conquered && (
            <div className="control-notice">
              🎯 Control reduced! Remaining: {selectedReport.result.remainingControl}/100
            </div>
          )}

          <div className="report-section">
            <h3>Strike Information</h3>
            <p>
              <strong>Date:</strong> {formatDate(selectedReport.arrivesAt)}
            </p>
            <p>
              <strong>Striker:</strong> {selectedReport.attacker.user?.username || 'Unknown'} from{' '}
              {selectedReport.attacker.village?.name || 'Unknown'} ({selectedReport.attacker.village?.x || '?'}|
              {selectedReport.attacker.village?.y || '?'})
            </p>
            <p>
              <strong>Defender:</strong> {selectedReport.defender.user?.username || 'Unknown'} from{' '}
              {selectedReport.defender.village?.name || 'Unknown'} ({selectedReport.defender.village?.x || '?'}|
              {selectedReport.defender.village?.y || '?'})
            </p>
            {selectedReport.result?.remainingControl !== undefined && (
              <p>
                <strong>Node Control:</strong> {selectedReport.result.remainingControl}/100
                {selectedReport.result.conquered && ' (Conquered!)'}
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
                      ) : null
                    )}
                  </>
                )}
                {myRole === 'defender' &&
                  selectedReport.result?.defenderLosses &&
                  Object.entries(selectedReport.result.defenderLosses).map(
                    ([troop, lost]) =>
                      lost > 0 && (
                        <tr key={troop}>
                          <td>{troopNames[troop] || troop}</td>
                          <td>-</td>
                          <td className="losses">{lost}</td>
                          <td>-</td>
                        </tr>
                      )
                  )}
              </tbody>
            </table>
          </div>

          <div className="report-section">
            <h3>Enemy Forces</h3>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Lost</th>
                </tr>
              </thead>
              <tbody>
                {enemyRole === 'attacker' &&
                  selectedReport.result?.attackerLosses &&
                  Object.entries(selectedReport.result.attackerLosses).map(
                    ([troop, lost]) =>
                      lost > 0 && (
                        <tr key={troop}>
                          <td>{troopNames[troop] || troop}</td>
                          <td className="losses">{lost}</td>
                        </tr>
                      )
                  )}
                {enemyRole === 'defender' &&
                  selectedReport.result?.defenderLosses &&
                  Object.entries(selectedReport.result.defenderLosses).map(
                    ([troop, lost]) =>
                      lost > 0 && (
                        <tr key={troop}>
                          <td>{troopNames[troop] || troop}</td>
                          <td className="losses">{lost}</td>
                        </tr>
                      )
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
        <p>Showing last 20 reports for {village.name}</p>
      </div>

      {reports.length === 0 ? (
        <div className="no-reports">
          <p>No combat reports yet. Strike other nodes or defend yours to see reports here!</p>
        </div>
      ) : (
        <div className="reports-list">
          {reports.map((report) => {
            const isMyAttack = isAttacker(report);
            const won = isMyAttack ? report.result.victory : !report.result.victory;

            return (
              <div
                key={report._id}
                className={`report-item ${won ? 'won' : 'lost'}`}
                onClick={() => setSelectedReport(report)}
              >
                <div className="report-icon">{won ? '🎉' : '💀'}</div>
                <div className="report-info">
                  <div className="report-title">
                    {isMyAttack ? (
                      <>
                        Strike on {report.defender.village?.name || 'Unknown'} ({report.defender.village?.x || '?'}|
                        {report.defender.village?.y || '?'})
                      </>
                    ) : (
                      <>
                        Defense against {report.attacker.user?.username || 'Unknown'} from{' '}
                        {report.attacker.village?.name || 'Unknown'} ({report.attacker.village?.x || '?'}|
                        {report.attacker.village?.y || '?'})
                      </>
                    )}
                  </div>
                  <div className="report-meta">
                    <span className={won ? 'victory' : 'defeat'}>{won ? 'Victory' : 'Defeat'}</span>
                    <span className="report-date">{formatDate(report.arrivesAt)}</span>
                    {isMyAttack && report.result.resourcesStolen && (
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
