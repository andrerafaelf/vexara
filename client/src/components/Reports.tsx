import { Coins, Eye, Share2, Skull, Swords, Trophy } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { getAllEspionageLogs, getReadReportIds, getReports, markAllReportsRead, markReportRead, sendAttack, sendFactionMessage } from '../services/api';
import '../styles/Reports.css';
import { useToast } from '../context/ToastContext';
import { Attack, Nexus } from '../types/game';
import { formatDateTime } from '../utils/date';
import BattleReplay from './BattleReplay';
import Username from './Username';
import ScoutIntelCard from './ScoutIntelCard';
import ResourceIcon from './ResourceIcon';
import { usePageReady } from './NavigationProgress';
import PageSkeleton from './PageSkeleton';

interface ReportsProps {
  nexus: Nexus;
  onReadStateChange?: () => void;
  factionId?: number;
  currentUserId?: number;
}

const buildingNames: Record<string, string> = {
  shieldGrid: 'Shield Grid',
  commandCore: 'Command Core',
  recruitmentCore: 'Recruitment Core',
  lifeSupport: 'Life Support',
  storageVault: 'Storage Vault',
  biomassFarm: 'Biomass Farm',
  alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor',
  armory: 'Armory',
  stealthArray: 'Stealth Array',
};

const troopNames: Record<string, string> = {
  lancerDrone: 'Lancer Drone',
  assaultTrooper: 'Assault Trooper',
  breakerUnit: 'Breaker Unit',
  reconOperative: 'Recon Operative',
  skimmerBike: 'Skimmer Bike',
  siegeMech: 'Siege Mech',
  bulwarkGuard: 'Bulwark Guard',
  suppressorTeam: 'Suppressor Team',
  disruptorUnit: 'Disruptor Unit',
  interceptorBike: 'Interceptor Bike',
  annihilatorPlatform: 'Annihilator Platform',
  voidStalker: 'Void Stalker',
  plasmaTurret: 'Plasma Turret',
  overseer: 'Overseer',
};

type ReportsTab = 'combat' | 'espionage';

interface SpyLog {
  id: number;
  type: string;
  operatives: number;
  sabotageTarget?: string;
  status: string;
  result: any;
  createdAt: string;
  fromNexusName: string;
  targetName: string;
  targetX?: number;
  targetY?: number;
  targetOwnerUsername?: string | null;
}

const Reports: React.FC<ReportsProps> = ({ nexus, onReadStateChange, factionId, currentUserId }) => {
  const toast = useToast();
  const [activeReportsTab, setActiveReportsTab] = useState<ReportsTab>('combat');
  const [reports, setReports] = useState<Attack[]>([]);
  const [spyLogs, setSpyLogs] = useState<SpyLog[]>([]);
  const [selectedReport, setSelectedReport] = useState<Attack | null>(null);
  const [selectedSpyLog, setSelectedSpyLog] = useState<SpyLog | null>(null);
  const [loading, setLoading] = useState(true);
  usePageReady(!loading, 'reports');
  const [showAttackForm, setShowAttackForm] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sharePreview, setSharePreview] = useState<string | null>(null);
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
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [replayComplete, setReplayComplete] = useState(false);

  useEffect(() => {
    loadReports();
    getReadReportIds()
      .then((r) => setReadIds(new Set(r.data)))
      .catch(() => {});
  }, [nexus._id]);

  useEffect(() => {
    if (!selectedReport || readIds.has(selectedReport._id)) return;
    markReportRead(selectedReport._id).catch(() => {});
    setReadIds((prev) => new Set([...prev, selectedReport._id]));
    onReadStateChange?.();
  }, [selectedReport, readIds, onReadStateChange]);

  useEffect(() => {
    setShowAttackForm(false);
    setReplayComplete(false);
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

  const buildShareText = (report: Attack): string => {
    const myAttack = isAttacker(report);
    const scout = isScoutReport(report);
    const won = myAttack ? report.result.victory : !report.result.victory;
    const outcome = scout ? 'SCOUT REPORT' : won ? 'VICTORY' : 'DEFEAT';

    const attackerName = report.attacker.user?.username ?? 'Unknown';
    const defenderName = report.defender.user?.username ?? 'Unknown';
    const atkNexus = `${report.attacker.nexus?.name ?? 'Unknown'} (${report.attacker.nexus?.x ?? '?'}|${report.attacker.nexus?.y ?? '?'})`;
    const defNexus = `${report.defender.nexus?.name ?? 'Unknown'} (${report.defender.nexus?.x ?? '?'}|${report.defender.nexus?.y ?? '?'})`;

    const lines: string[] = [];
    const sep = '--------------------------------';

    lines.push(`[ COMBAT LOG — ${outcome} ]`);
    lines.push(sep);
    lines.push(`Date:     ${formatDate(report.arrivesAt)}`);
    lines.push(`Striker:  ${attackerName} from ${atkNexus}`);
    lines.push(`Defender: ${defenderName} from ${defNexus}`);

    if (!scout) {
      if (report.result?.remainingControl !== undefined && report.result.remainingControl !== null) {
        lines.push(`Control:  ${report.result.remainingControl}/100${report.result.conquered ? ' (CONQUERED)' : ''}`);
      }
      if (report.result?.remainingNexusLife !== undefined && report.result.remainingNexusLife !== null) {
        lines.push(`Nexus Life: ${report.result.remainingNexusLife}/100`);
      }
    }

    if (!scout) {
      const atkLosses: Record<string, number> = Object.fromEntries(
        Object.entries(report.result?.attackerLosses ?? {}).map(([k, v]) => [k, v ?? 0])
      );
      if (report.result?.conquered && (report.troops?.overseer ?? 0) > 0) {
        atkLosses.overseer = report.troops.overseer ?? 0;
      }

      lines.push('');
      lines.push('[ ATTACKER FORCES ]');
      const atkRows = Object.entries(report.troops ?? {}).filter(([, c]) => Number(c) > 0);
      if (atkRows.length === 0) {
        lines.push('  (none)');
      } else {
        lines.push(`  ${'Unit'.padEnd(24)}${'Sent'.padStart(6)}${'Lost'.padStart(6)}${'Surv'.padStart(6)}`);
        for (const [type, count] of atkRows) {
          const lost = atkLosses[type] ?? 0;
          const surv = Number(count) - lost;
          lines.push(`  ${(troopNames[type] ?? type).padEnd(24)}${String(count).padStart(6)}${String(lost).padStart(6)}${String(surv).padStart(6)}`);
        }
      }

      lines.push('');
      lines.push('[ DEFENDER FORCES ]');
      const defRows = Object.entries(report.result?.defenderLosses ?? {}).filter(([, v]) => Number(v) > 0);
      if (defRows.length === 0) {
        lines.push('  (no losses recorded)');
      } else {
        lines.push(`  ${'Unit'.padEnd(24)}${'Lost'.padStart(6)}`);
        for (const [type, lost] of defRows) {
          lines.push(`  ${(troopNames[type] ?? type).padEnd(24)}${String(lost).padStart(6)}`);
        }
      }

      const loot = report.result?.resourcesStolen;
      if (loot && (loot.biomass > 0 || loot.alloy > 0 || loot.ore > 0)) {
        lines.push('');
        lines.push('[ RESOURCES PLUNDERED ]');
        if (loot.biomass > 0) lines.push(`  Biomass: ${loot.biomass}`);
        if (loot.alloy > 0)   lines.push(`  Alloy:   ${loot.alloy}`);
        if (loot.ore > 0)     lines.push(`  Ore:     ${loot.ore}`);
      }

      if (report.result?.buildingDamage && report.result.buildingDamage.length > 0) {
        lines.push('');
        lines.push('[ BUILDINGS DAMAGED ]');
        lines.push(`  ${'Building'.padEnd(22)}${'Before'.padStart(8)}${'After'.padStart(8)}`);
        for (const d of report.result.buildingDamage) {
          lines.push(`  ${(buildingNames[d.building] ?? d.building).padEnd(22)}${`Lv ${d.from}`.padStart(8)}${`Lv ${d.to}`.padStart(8)}`);
        }
      }
    }

    if (scout && report.result?.intel) {
      const troops = report.result.intel.troops ?? {};
      const detected = Object.entries(troops).filter(([, c]) => Number(c) > 0);
      lines.push('');
      lines.push('[ ENEMY TROOPS DETECTED ]');
      if (detected.length === 0) {
        lines.push('  No enemy troops detected.');
      } else {
        for (const [type, count] of detected) {
          lines.push(`  ${(troopNames[type] ?? type).padEnd(24)}${String(count).padStart(6)}`);
        }
      }
    }

    lines.push(sep);
    return lines.join('\n');
  };

  const handleOpenSharePreview = (report: Attack) => {
    setSharePreview(buildShareText(report));
  };

  const handleConfirmShare = async () => {
    if (!factionId || !sharePreview) return;
    setSharing(true);
    try {
      await sendFactionMessage(factionId, sharePreview);
      toast('Combat log shared to faction chat', 'success');
      setSharePreview(null);
    } catch {
      toast('Failed to share to chat', 'error');
    } finally {
      setSharing(false);
    }
  };

  const handleSendAttack = async () => {
    if (!selectedReport) return;
    const total = Object.values(attackTroops).reduce((a, b) => a + b, 0);
    if (total === 0) {
      toast('Select at least one troop', 'error');
      return;
    }
    try {
      await sendAttack(nexus._id, selectedReport.defender.nexus._id, attackTroops, 'attack');
      toast('Strike sent', 'success');
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
      toast(err.response?.data?.error || 'Error sending strike', 'error');
    }
  };

  const loadReports = async () => {
    try {
      setLoading(true);
      const [reportsRes, spyRes] = await Promise.all([
        getReports(nexus._id),
        getAllEspionageLogs().catch(() => ({ data: [] })),
      ]);
      setReports(reportsRes.data);
      setSpyLogs(spyRes.data ?? []);
    } catch (err) {
      console.error('Error loading reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string | Date) => formatDateTime(date);

  const getTroopTotal = (troops: any) => {
    return Object.values(troops).reduce((a: any, b: any) => a + b, 0);
  };

  const isAttacker = (report: Attack) => {
    return report.attacker.nexus._id === nexus._id;
  };

  const isScoutReport = (report: Attack) => report.type === 'scout' || report.result?.mission === 'scout';

  const unreadCount = reports.reduce((acc, r) => (readIds.has(r._id) ? acc : acc + 1), 0);

  const handleMarkAllRead = async () => {
    try {
      const res = await markAllReportsRead(nexus._id);
      const ids: string[] = res.data?.ids || reports.map((r) => r._id);
      setReadIds((prev) => new Set([...prev, ...ids]));
      onReadStateChange?.();
    } catch (err) {
      console.error('Error marking all reports as read:', err);
    }
  };

  if (loading) {
    return <PageSkeleton variant="rows" count={5} />;
  }

  if (selectedReport) {
    const currentIndex = reports.findIndex((r) => r._id === selectedReport._id);
    const prevReport = currentIndex > 0 ? reports[currentIndex - 1] : null;
    const nextReport = currentIndex < reports.length - 1 ? reports[currentIndex + 1] : null;

    const isMyAttack = isAttacker(selectedReport);
    const myRole = isMyAttack ? 'attacker' : 'defender';
    const enemyRole = isMyAttack ? 'defender' : 'attacker';
    const scoutReport = isScoutReport(selectedReport);
    const attackerLossesForDisplay = {
      ...(selectedReport.result?.attackerLosses || {}),
    } as Record<string, number>;

    if (selectedReport.result?.conquered && (selectedReport.troops?.overseer || 0) > 0) {
      attackerLossesForDisplay.overseer = selectedReport.troops.overseer || 0;
    }

    return (
      <div className="reports-container">
        <div className="reports-header">
          <div className="reports-detail-nav">
            <button onClick={() => setSelectedReport(null)} className="btn-back">
              ← Back
            </button>
            <div className="reports-nav-arrows">
              <button
                className="btn-nav-arrow"
                onClick={() => prevReport && setSelectedReport(prevReport)}
                disabled={!prevReport}
                title="Previous report"
              >
                ‹
              </button>
              <span className="reports-nav-count">
                {currentIndex + 1} / {reports.length}
              </span>
              <button
                className="btn-nav-arrow"
                onClick={() => nextReport && setSelectedReport(nextReport)}
                disabled={!nextReport}
                title="Next report"
              >
                ›
              </button>
            </div>
            {factionId && (
              <button
                className="btn-share-chat"
                onClick={() => handleOpenSharePreview(selectedReport)}
                disabled={sharing}
                title="Share this report to faction chat"
              >
                <Share2 size={13} aria-hidden="true" />
                {sharing ? 'Sharing…' : 'Share to Chat'}
              </button>
            )}
          </div>
          <h2>{scoutReport ? 'Scout Report' : 'Combat Report'}</h2>
        </div>

        <div className="report-detail">
          {(scoutReport || replayComplete) && (
          <div className={`report-result ${selectedReport.result.victory ? 'victory' : 'defeat'}`}>
            {scoutReport ? (
              <span>Recon complete. Intelligence updated.</span>
            ) : isMyAttack ? (
              selectedReport.result.victory ? (
                <>
                  <span>Victory! You won the strike</span>
                  {selectedReport.result.conquered && <div className="conquest-notice">NEXUS CONQUERED!</div>}
                </>
              ) : (
                <span>Defeat! Your strike failed</span>
              )
            ) : selectedReport.result.victory ? (
              <span>Defeat! Your nexus was raided</span>
            ) : (
              <span>Victory! You defended successfully</span>
            )}
          </div>
        )}

          {!scoutReport && (
            <BattleReplay
              report={selectedReport}
              isMyAttack={isMyAttack}
              onComplete={() => setReplayComplete(true)}
            />
          )}

          {isMyAttack && selectedReport.defender.nexus?._id && (
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
                  <Swords size={14} aria-hidden="true" /> {showAttackForm ? 'Cancel' : scoutReport ? 'Attack' : 'Attack Again'}
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
            <ScoutIntelCard
              intel={selectedReport.result.intel as any}
              targetName={(selectedReport.result.intel as any).nexusName ?? selectedReport.defender.nexus?.name ?? 'Unknown'}
              targetCoords={{
                x: (selectedReport.result.intel as any).nexusX ?? selectedReport.defender.nexus?.x ?? 0,
                y: (selectedReport.result.intel as any).nexusY ?? selectedReport.defender.nexus?.y ?? 0,
              }}
            />
          )}

          {!scoutReport && (
            <>
              {selectedReport.result.controlReduced && !selectedReport.result.conquered && (
                <div className="control-notice">Control reduced! Remaining: {selectedReport.result.remainingControl}/100
                </div>
              )}

              {selectedReport.result.nexusLifeReduced && (
                <div className="control-notice">Nexus life reduced! Remaining: {selectedReport.result.remainingNexusLife || 0}/
                  {selectedReport.defender.nexus?.buildings?.shieldGrid ? 100 : 0}
                </div>
              )}

              <div className="report-section">
                <h3>Strike Information</h3>
                <p>
                  <strong>Date:</strong> {formatDate(selectedReport.arrivesAt)}
                </p>
                <p>
                  <strong>Striker:</strong> <Username name={selectedReport.attacker.user?.username || 'Unknown'} isSupporter={selectedReport.attacker.user?.isSupporter} supporterTier={selectedReport.attacker.user?.supporterTier} /> from{' '}
                  {selectedReport.attacker.nexus?.name || 'Unknown'} ({selectedReport.attacker.nexus?.x ?? '?'}|
                  {selectedReport.attacker.nexus?.y ?? '?'})
                </p>
                <p>
                  <strong>Defender:</strong> <Username name={selectedReport.defender.user?.username || 'Unknown'} isSupporter={selectedReport.defender.user?.isSupporter} supporterTier={selectedReport.defender.user?.supporterTier} /> from{' '}
                  {selectedReport.defender.nexus?.name || 'Unknown'} ({selectedReport.defender.nexus?.x ?? '?'}|
                  {selectedReport.defender.nexus?.y ?? '?'})
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
                              <td className="losses">{attackerLossesForDisplay[troopType] || 0}</td>
                              <td>{count - (attackerLossesForDisplay[troopType] || 0)}</td>
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
                  Object.entries(attackerLossesForDisplay).map(
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
                      <span>Biomass:</span> {selectedReport.result.resourcesStolen.biomass}
                    </div>
                  )}
                  {selectedReport.result.resourcesStolen.alloy > 0 && (
                    <div className="resource-item">
                      <span>Alloy:</span> {selectedReport.result.resourcesStolen.alloy}
                    </div>
                  )}
                  {selectedReport.result.resourcesStolen.ore > 0 && (
                    <div className="resource-item">
                      <span>Ore:</span> {selectedReport.result.resourcesStolen.ore}
                    </div>
                  )}
                </div>
              </div>
            )}
          {selectedReport.result.buildingDamage && selectedReport.result.buildingDamage.length > 0 && (
            <div className="report-section">
              <h3>Buildings Damaged {isMyAttack ? '(Enemy)' : '(Your Nexus)'}</h3>
              <table className="report-table">
                <thead>
                  <tr><th>Building</th><th>Before</th><th>After</th></tr>
                </thead>
                <tbody>
                  {selectedReport.result.buildingDamage.map((d, i) => (
                    <tr key={i}>
                      <td>{buildingNames[d.building] ?? d.building}</td>
                      <td>Lv {d.from}</td>
                      <td className="losses">Lv {d.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {sharePreview !== null && (
        <div className="share-modal-backdrop" onClick={() => setSharePreview(null)}>
          <div className="share-modal" onClick={(e) => e.stopPropagation()}>
            <div className="share-modal-header">
              <span className="share-modal-title">Preview — Post to Faction Chat</span>
              <button className="share-modal-close" onClick={() => setSharePreview(null)} aria-label="Close">✕</button>
            </div>
            <div className="share-modal-body">
              <pre className="share-modal-preview">{sharePreview}</pre>
            </div>
            <div className="share-modal-footer">
              <button className="share-modal-cancel" onClick={() => setSharePreview(null)} disabled={sharing}>
                Cancel
              </button>
              <button className="share-modal-confirm" onClick={handleConfirmShare} disabled={sharing}>
                <Share2 size={13} aria-hidden="true" />
                {sharing ? 'Posting…' : 'Post to Faction Chat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
  }

  const buildSpyShareText = (log: SpyLog): string => {
    const lines: string[] = [];
    const sep = '--------------------------------';
    const isEmbed = log.type === 'embed';
    const success = log.result?.success;
    lines.push(`[ ESPIONAGE LOG — ${isEmbed ? 'EMBED' : 'SABOTAGE'} ${success ? 'SUCCESS' : 'FAILED'} ]`);
    lines.push(sep);
    lines.push(`Date:     ${formatDate(log.createdAt)}`);
    lines.push(`Origin:   ${log.fromNexusName}`);
    lines.push(`Target:   ${log.targetName}${log.targetX != null ? ` (${log.targetX}|${log.targetY})` : ''}`);
    if (log.targetOwnerUsername) lines.push(`Owner:    ${log.targetOwnerUsername}`);
    lines.push(`Type:     ${isEmbed ? 'Embed Operative' : `Sabotage (${log.sabotageTarget})`}`);
    lines.push(`Ops:      ${log.operatives}`);
    lines.push(`Result:   ${success ? 'Success' : 'Failed'}${log.result?.detected ? ' (detected)' : ''}`);
    if (log.result?.delayMinutes) lines.push(`Delay:    ${log.result.delayMinutes} minutes`);
    lines.push(sep);
    return lines.join('\n');
  };

  const handleShareSpyLog = async (log: SpyLog) => {
    if (!factionId) return;
    const text = buildSpyShareText(log);
    setSharing(true);
    try {
      await sendFactionMessage(factionId, text);
      toast('Espionage log shared to faction chat', 'success');
    } catch {
      toast('Failed to share to chat', 'error');
    } finally {
      setSharing(false);
    }
  };

  if (selectedSpyLog) {
    const log = selectedSpyLog;
    const isEmbed = log.type === 'embed';
    const success = log.result?.success;
    return (
      <div className="reports-container">
        <div className="reports-header">
          <div className="reports-detail-nav">
            <button onClick={() => setSelectedSpyLog(null)} className="btn-back">← Back</button>
            {factionId && (
              <button className="btn-share-chat" onClick={() => handleShareSpyLog(log)} disabled={sharing}>
                <Share2 size={13} aria-hidden="true" /> {sharing ? 'Sharing…' : 'Share to Chat'}
              </button>
            )}
          </div>
          <h2>Espionage Report</h2>
        </div>
        <div className="report-detail">
          <div className={`report-result ${success ? 'victory' : 'defeat'}`}>
            <span>{isEmbed ? 'Embed Mission' : 'Sabotage Mission'} — {success ? 'Success' : 'Failed'}{log.result?.detected ? ' (Detected)' : ''}</span>
          </div>
          <div className="report-section">
            <h3>Mission Details</h3>
            <p><strong>Date:</strong> {formatDate(log.createdAt)}</p>
            <p><strong>Origin:</strong> {log.fromNexusName}</p>
            <p><strong>Target:</strong> {log.targetName}{log.targetX != null ? ` (${log.targetX}|${log.targetY})` : ''}</p>
            {log.targetOwnerUsername && <p><strong>Owner:</strong> {log.targetOwnerUsername}</p>}
            <p><strong>Type:</strong> {isEmbed ? 'Embed Operative' : `Sabotage — ${log.sabotageTarget}`}</p>
            <p><strong>Operatives:</strong> {log.operatives}</p>
            {log.result?.delayMinutes && <p><strong>Queue Delayed:</strong> {log.result.delayMinutes} minutes</p>}
          </div>
          {success && isEmbed && log.result?.intel && (
            <div className="report-section">
              <h3>Intelligence Gathered</h3>
              {log.result.intel.troops && (
                <table className="report-table">
                  <thead><tr><th>Unit</th><th>Count</th></tr></thead>
                  <tbody>
                    {Object.entries(log.result.intel.troops).filter(([,c]) => Number(c) > 0).map(([type, count]) => (
                      <tr key={type}><td>{troopNames[type] ?? type}</td><td>{String(count)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
              {log.result.intel.resources && (
                <div className="resources-stolen" style={{ marginTop: 12 }}>
                  <div className="resource-item"><span>Biomass:</span> {log.result.intel.resources.biomass}</div>
                  <div className="resource-item"><span>Alloy:</span> {log.result.intel.resources.alloy}</div>
                  <div className="resource-item"><span>Ore:</span> {log.result.intel.resources.ore}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="reports-container">
      <div className="reports-header">
        <div className="reports-header-row">
          <h2>Combat Logs</h2>
          {activeReportsTab === 'combat' && unreadCount > 0 && (
            <button className="btn-read-all" onClick={handleMarkAllRead}>
              Mark all read ({unreadCount})
            </button>
          )}
        </div>
        <div className="reports-tabs">
          <button
            className={`reports-tab ${activeReportsTab === 'combat' ? 'reports-tab--active' : ''}`}
            onClick={() => setActiveReportsTab('combat')}
          >
            <Swords size={14} aria-hidden="true" /> Combat
          </button>
          <button
            className={`reports-tab ${activeReportsTab === 'espionage' ? 'reports-tab--active' : ''}`}
            onClick={() => setActiveReportsTab('espionage')}
          >
            <Eye size={14} aria-hidden="true" /> Espionage {spyLogs.length > 0 && <span className="reports-tab-count">{spyLogs.length}</span>}
          </button>
        </div>
      </div>

      {activeReportsTab === 'espionage' && (
        <>
          {spyLogs.length === 0 ? (
            <div className="no-reports">
              <p>No espionage reports yet. Send spy missions from the Espionage tab on your nexus.</p>
            </div>
          ) : (
            <div className="reports-list">
              {spyLogs.map((log) => {
                const isEmbed = log.type === 'embed';
                const success = log.result?.success;
                return (
                  <div
                    key={log.id}
                    className={`report-item ${success ? 'won' : 'lost'}`}
                    onClick={() => setSelectedSpyLog(log)}
                  >
                    <div className="report-icon" aria-hidden="true">
                      <Eye size={18} />
                    </div>
                    <div className="report-info">
                      <div className="report-title">
                        {isEmbed ? 'Embed' : 'Sabotage'} — {log.targetName}
                        {log.targetX != null && ` (${log.targetX}|${log.targetY})`}
                      </div>
                      <div className="report-meta">
                        <span className={success ? 'victory' : 'defeat'}>{success ? 'Success' : 'Failed'}</span>
                        <span className="report-date">{formatDate(log.createdAt)}</span>
                        {!isEmbed && log.sabotageTarget && <span>{log.sabotageTarget}</span>}
                      </div>
                    </div>
                    <div className="report-arrow">→</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeReportsTab === 'combat' && reports.length === 0 ? (
        <div className="no-reports">
          <p>No combat reports yet. Strike other nexuses or defend yours to see reports here!</p>
        </div>
      ) : activeReportsTab === 'combat' && (
        <div className="reports-list">
          {reports.map((report) => {
            const isMyAttack = isAttacker(report);
            const hasBeenViewed = readIds.has(report._id);
            const won = isMyAttack ? report.result.victory : !report.result.victory;
            const scoutReport = isScoutReport(report);

            return (
              <div
                key={report._id}
                className={`report-item ${hasBeenViewed ? (won ? 'won' : 'lost') : ''}`}
                onClick={() => setSelectedReport(report)}
              >
                <div className="report-icon" aria-hidden="true">
                  {hasBeenViewed ? (
                    won ? <Trophy size={18} /> : <Skull size={18} />
                  ) : (
                    <Swords size={18} />
                  )}
                </div>
                <div className="report-info">
                  <div className="report-title">
                    {hasBeenViewed ? (
                      scoutReport ? (
                        <>
                          Scout report on {report.defender.nexus?.name || 'Unknown'} ({report.defender.nexus?.x ?? '?'}|
                          {report.defender.nexus?.y ?? '?'})
                        </>
                      ) : isMyAttack ? (
                        <>
                          Strike on {report.defender.nexus?.name || 'Unknown'} ({report.defender.nexus?.x ?? '?'}|
                          {report.defender.nexus?.y ?? '?'})
                        </>
                      ) : (
                        <>
                          Defense against <Username name={report.attacker.user?.username || 'Unknown'} isSupporter={report.attacker.user?.isSupporter} supporterTier={report.attacker.user?.supporterTier} /> from{' '}
                          {report.attacker.nexus?.name || 'Unknown'} ({report.attacker.nexus?.x ?? '?'}|
                          {report.attacker.nexus?.y ?? '?'})
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
                        <Coins size={12} aria-hidden="true" />{' '}
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
