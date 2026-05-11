import React, { useCallback, useEffect, useState } from 'react';
import { buyMarketListing, cancelMarketListing, createMarketListing, getMarketHistory, getMarketListings, systemBuyResource, systemSellResource } from '../services/api';
import '../styles/Market.css';
import { MarketListing, Nexus } from '../types/game';

interface MarketProps {
  nexuses: Nexus[];
  selectedNexusId?: string | null;
  onRefresh: () => void;
}

const RESOURCE_LABELS: Record<string, string> = {
  biomass: 'Biomass',
  alloy: 'Alloy',
  ore: 'Ore',
};

const RESOURCE_ICONS: Record<string, string> = {
  biomass: '🧬',
  alloy: '⚙️',
  ore: '💎',
};

const Market: React.FC<MarketProps> = ({ nexuses, selectedNexusId, onRefresh }) => {
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [formOffer, setFormOffer] = useState<'biomass' | 'alloy' | 'ore'>('biomass');
  const [formOfferAmount, setFormOfferAmount] = useState('');
  const [formWant, setFormWant] = useState<'biomass' | 'alloy' | 'ore'>('alloy');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [buyNexusId, setBuyNexusId] = useState('');
  const [buyError, setBuyError] = useState('');

  // System market state
  const SYSTEM_RESOURCES = ['biomass', 'alloy', 'ore'] as const;
  const [sysMode, setSysMode] = useState<'buy' | 'sell'>('buy');
  const [sysFrom, setSysFrom] = useState<'biomass' | 'alloy' | 'ore'>('alloy');
  const [sysTo, setSysTo] = useState<'biomass' | 'alloy' | 'ore'>('biomass');
  const [sysAmount, setSysAmount] = useState('');
  const [sysError, setSysError] = useState('');
  const [sysSuccess, setSysSuccess] = useState('');
  const [sysSubmitting, setSysSubmitting] = useState(false);
  const [sysNexusId, setSysNexusId] = useState('');

  const loadListings = useCallback(async () => {
    try {
      const res = await getMarketListings();
      setListings(res.data);
    } catch {
      setError('Failed to load market listings');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await getMarketHistory();
      setHistory(Array.isArray(res.data) ? res.data : []);
    } catch {
      // history is non-critical, fail silently
    }
  }, []);

  useEffect(() => {
    loadListings();
    loadHistory();
    const interval = setInterval(loadListings, 15000);
    return () => clearInterval(interval);
  }, [loadListings, loadHistory]);

  useEffect(() => {
    if (nexuses.length > 0 && !buyNexusId) {
      setBuyNexusId(selectedNexusId ?? String(nexuses[0]._id));
    }
    if (nexuses.length > 0 && !sysNexusId) {
      setSysNexusId(selectedNexusId ?? String(nexuses[0]._id));
    }
  }, [nexuses, buyNexusId, sysNexusId, selectedNexusId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const offer = parseInt(formOfferAmount);
    if (!offer || offer <= 0) {
      setFormError('Amount must be a positive number');
      return;
    }
    if (formOffer === formWant) {
      setFormError('Offer and want resources must differ');
      return;
    }
    const available = Math.floor(selectedFormNexus?.resources[formOffer] ?? 0);
    if (offer > available) {
      setFormError(`Insufficient ${RESOURCE_LABELS[formOffer]} — ${available.toLocaleString()} available`);
      return;
    }
    setSubmitting(true);
    try {
      await createMarketListing(formNexusId, formOffer, offer, formWant, offer);
      setFormOfferAmount('');
      setShowCreateForm(false);
      await loadListings();
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create listing');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBuy = async (listing: MarketListing) => {
    setBuyError('');
    try {
      await buyMarketListing(listing.id, buyNexusId);
      setBuyingId(null);
      await Promise.all([loadListings(), loadHistory()]);
      onRefresh();
    } catch (err: any) {
      setBuyError(err.message || 'Failed to buy listing');
    }
  };

  const handleCancel = async (listingId: number) => {
    try {
      await cancelMarketListing(listingId);
      await loadListings();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel listing');
    }
  };

  const handleSystemTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setSysError('');
    setSysSuccess('');
    const amount = parseInt(sysAmount);
    if (!amount || amount <= 0) {
      setSysError('Enter a positive amount');
      return;
    }
    if (sysFrom === sysTo) {
      setSysError('Resources must differ');
      return;
    }
    setSysSubmitting(true);
    try {
      if (sysMode === 'buy') {
        const res = await systemBuyResource(sysNexusId, sysTo, amount, sysFrom);
        setSysSuccess(`Bought ${res.data.received.toLocaleString()} ${RESOURCE_LABELS[sysTo]} for ${res.data.paid.toLocaleString()} ${RESOURCE_LABELS[sysFrom]}`);
      } else {
        const res = await systemSellResource(sysNexusId, sysFrom, amount, sysTo);
        setSysSuccess(`Sold ${res.data.sold.toLocaleString()} ${RESOURCE_LABELS[sysFrom]}, received ${res.data.received.toLocaleString()} ${RESOURCE_LABELS[sysTo]}`);
      }
      setSysAmount('');
      onRefresh();
    } catch (err: any) {
      setSysError(err.message || 'Trade failed');
    } finally {
      setSysSubmitting(false);
    }
  };

  const myNexusIds = new Set(nexuses.map((n) => String(n._id)));

  const myListings = listings.filter((l) => myNexusIds.has(String(l.sellerNexusId)));
  const otherListings = listings.filter((l) => !myNexusIds.has(String(l.sellerNexusId)));

  const formNexusId = selectedNexusId ?? String(nexuses[0]?._id ?? '');
  const selectedFormNexus = nexuses.find((n) => String(n._id) === formNexusId);
  const selectedBuyNexus = nexuses.find((n) => String(n._id) === buyNexusId);

  if (loading) return <div className="market-loading">Loading market...</div>;

  return (
    <div className="market">
      <div className="market-header">
        <h2>Black Market</h2>
        <p className="market-subtitle">Trade resources with other commanders</p>
      </div>

      {error && <div className="market-error">{error}</div>}

      <div className="market-actions-bar">
        <button className="market-create-btn" onClick={() => setShowCreateForm(!showCreateForm)}>
          {showCreateForm ? 'Cancel' : '+ New Listing'}
        </button>
      </div>

      {showCreateForm && (
        <div className="market-create-form">
          <h3>Create Listing</h3>
          <form onSubmit={handleCreate}>
            {selectedFormNexus && (
              <div className="market-nexus-resources">
                <span>
                  {RESOURCE_ICONS.biomass} {Math.floor(selectedFormNexus.resources.biomass).toLocaleString()}
                </span>
                <span>
                  {RESOURCE_ICONS.alloy} {Math.floor(selectedFormNexus.resources.alloy).toLocaleString()}
                </span>
                <span>
                  {RESOURCE_ICONS.ore} {Math.floor(selectedFormNexus.resources.ore).toLocaleString()}
                </span>
              </div>
            )}
            <div className="market-form-trade">
              <div className="market-form-side">
                <label>I offer</label>
                <select value={formOffer} onChange={(e) => setFormOffer(e.target.value as any)}>
                  <option value="biomass">Biomass</option>
                  <option value="alloy">Alloy</option>
                  <option value="ore">Ore</option>
                </select>
                <div className="market-amount-row">
                  <input
                    type="number"
                    min="1"
                    max={selectedFormNexus ? Math.floor(selectedFormNexus.resources[formOffer]) : undefined}
                    placeholder="Amount"
                    value={formOfferAmount}
                    onChange={(e) => setFormOfferAmount(e.target.value)}
                  />
                  {selectedFormNexus && (
                    <button
                      type="button"
                      className="market-max-btn"
                      onClick={() => setFormOfferAmount(String(Math.floor(selectedFormNexus.resources[formOffer])))}
                    >
                      Max
                    </button>
                  )}
                </div>
                {selectedFormNexus && (
                  <span className="market-amount-hint">
                    Available: {Math.floor(selectedFormNexus.resources[formOffer]).toLocaleString()}
                  </span>
                )}
              </div>
              <div className="market-form-arrow">⇄</div>
              <div className="market-form-side">
                <label>I want</label>
                <select value={formWant} onChange={(e) => setFormWant(e.target.value as any)}>
                  <option value="biomass">Biomass</option>
                  <option value="alloy">Alloy</option>
                  <option value="ore">Ore</option>
                </select>
                <div className="market-amount-row">
                  <input
                    type="number"
                    min="1"
                    placeholder="Amount"
                    value={formOfferAmount}
                    readOnly
                    className="market-amount-readonly"
                  />
                </div>
              </div>
            </div>
            {formError && <div className="market-form-error">{formError}</div>}
            <button type="submit" className="market-submit-btn" disabled={submitting}>
              {submitting ? 'Listing...' : 'Post Listing'}
            </button>
          </form>
        </div>
      )}

      {myListings.length > 0 && (
        <div className="market-section">
          <h3>Your Listings</h3>
          <div className="market-listings-grid">
            {myListings.map((l) => (
              <div key={l.id} className="market-card market-card--own">
                <div className="market-card-nexus">{l.sellerNexus.name}</div>
                <div className="market-card-trade">
                  <div className="market-card-offer">
                    <span className="market-resource-icon">{RESOURCE_ICONS[l.offerResource]}</span>
                    <span className="market-amount">{l.offerAmount.toLocaleString()}</span>
                    <span className="market-resource-label">{RESOURCE_LABELS[l.offerResource]}</span>
                  </div>
                  <div className="market-card-arrow">→</div>
                  <div className="market-card-want">
                    <span className="market-resource-icon">{RESOURCE_ICONS[l.wantResource]}</span>
                    <span className="market-amount">{l.wantAmount.toLocaleString()}</span>
                    <span className="market-resource-label">{RESOURCE_LABELS[l.wantResource]}</span>
                  </div>
                </div>
                <button className="market-cancel-btn" onClick={() => handleCancel(l.id)}>
                  Cancel (Refund)
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="market-section">
        <h3>Available Offers {otherListings.length === 0 && <span className="market-empty-note">— none yet</span>}</h3>

        {nexuses.length > 0 && otherListings.length > 0 && (
          <div className="market-buy-nexus-row">
            <label>Buy with nexus:</label>
            <select value={buyNexusId} onChange={(e) => setBuyNexusId(e.target.value)}>
              {nexuses.map((n) => (
                <option key={n._id} value={n._id}>
                  {n.name}
                </option>
              ))}
            </select>
            {selectedBuyNexus && (
              <span className="market-buy-nexus-resources">
                {RESOURCE_ICONS.biomass} {Math.floor(selectedBuyNexus.resources.biomass).toLocaleString()} &nbsp;
                {RESOURCE_ICONS.alloy} {Math.floor(selectedBuyNexus.resources.alloy).toLocaleString()} &nbsp;
                {RESOURCE_ICONS.ore} {Math.floor(selectedBuyNexus.resources.ore).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {buyError && <div className="market-form-error">{buyError}</div>}

        <div className="market-listings-grid">
          {otherListings.map((l) => {
            const canAfford =
              selectedBuyNexus && (selectedBuyNexus.resources[l.wantResource] || 0) >= l.wantAmount;
            return (
              <div key={l.id} className="market-card">
                <div className="market-card-nexus">
                  {l.sellerNexus.name}
                  {l.sellerUsername && (
                    <span className="market-card-seller"> · {l.sellerUsername}</span>
                  )}
                </div>
                <div className="market-card-trade">
                  <div className="market-card-offer">
                    <span className="market-trade-role">Give</span>
                    <span className="market-resource-icon">{RESOURCE_ICONS[l.wantResource]}</span>
                    <span className="market-amount">{l.wantAmount.toLocaleString()}</span>
                    <span className="market-resource-label">{RESOURCE_LABELS[l.wantResource]}</span>
                  </div>
                  <div className="market-card-arrow">→</div>
                  <div className="market-card-want">
                    <span className="market-trade-role">Receive</span>
                    <span className="market-resource-icon">{RESOURCE_ICONS[l.offerResource]}</span>
                    <span className="market-amount">{l.offerAmount.toLocaleString()}</span>
                    <span className="market-resource-label">{RESOURCE_LABELS[l.offerResource]}</span>
                  </div>
                </div>
                {buyingId === l.id ? (
                  <div className="market-buy-confirm">
                    <span>Pay {l.wantAmount.toLocaleString()} {RESOURCE_LABELS[l.wantResource]}?</span>
                    <button className="market-buy-btn" onClick={() => handleBuy(l)} disabled={!canAfford}>
                      Confirm
                    </button>
                    <button className="market-cancel-btn" onClick={() => setBuyingId(null)}>
                      Back
                    </button>
                  </div>
                ) : (
                  <button
                    className="market-buy-btn"
                    onClick={() => { setBuyError(''); setBuyingId(l.id); }}
                    disabled={!canAfford}
                    title={!canAfford ? `Need ${l.wantAmount.toLocaleString()} ${RESOURCE_LABELS[l.wantResource]}` : ''}
                  >
                    {canAfford ? 'Buy' : 'Insufficient'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="market-section">
        <h3>System Exchange <span className="market-system-rate-note">1.25:1 rate · instant</span></h3>
        <p className="market-subtitle" style={{ marginBottom: 16 }}>
          Trade directly with the system at an unfavorable rate. Player listings above offer better deals.
        </p>
        <div className="market-system-panel">
          <div className="market-system-nexus-row">
            <label>Nexus:</label>
            <select value={sysNexusId} onChange={(e) => setSysNexusId(e.target.value)}>
              {nexuses.map((n) => (
                <option key={n._id} value={n._id}>{n.name}</option>
              ))}
            </select>
            {(() => {
              const n = nexuses.find((n) => String(n._id) === sysNexusId);
              return n ? (
                <span className="market-buy-nexus-resources">
                  {RESOURCE_ICONS.biomass} {Math.floor(n.resources.biomass).toLocaleString()} &nbsp;
                  {RESOURCE_ICONS.alloy} {Math.floor(n.resources.alloy).toLocaleString()} &nbsp;
                  {RESOURCE_ICONS.ore} {Math.floor(n.resources.ore).toLocaleString()}
                </span>
              ) : null;
            })()}
          </div>

          <div className="market-system-mode-tabs">
            <button
              className={`market-system-tab ${sysMode === 'buy' ? 'market-system-tab--active' : ''}`}
              onClick={() => { setSysMode('buy'); setSysError(''); setSysSuccess(''); }}
            >
              Buy
            </button>
            <button
              className={`market-system-tab ${sysMode === 'sell' ? 'market-system-tab--active' : ''}`}
              onClick={() => { setSysMode('sell'); setSysError(''); setSysSuccess(''); }}
            >
              Sell
            </button>
          </div>

          <form className="market-system-form" onSubmit={handleSystemTrade}>
            {sysMode === 'buy' ? (
              <>
                <div className="market-system-form-row">
                  <label>Pay</label>
                  <select value={sysFrom} onChange={(e) => setSysFrom(e.target.value as any)}>
                    {SYSTEM_RESOURCES.map((r) => (
                      <option key={r} value={r}>{RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                <div className="market-system-form-row">
                  <label>Receive</label>
                  <select value={sysTo} onChange={(e) => setSysTo(e.target.value as any)}>
                    {SYSTEM_RESOURCES.map((r) => (
                      <option key={r} value={r}>{RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                <div className="market-system-form-row">
                  <label>Amount to receive</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 100"
                    value={sysAmount}
                    onChange={(e) => setSysAmount(e.target.value)}
                  />
                </div>
                {sysAmount && parseInt(sysAmount) > 0 && sysFrom !== sysTo && (
                  <div className="market-system-preview">
                    You pay <strong>{Math.ceil(parseInt(sysAmount) * 1.25).toLocaleString()} {RESOURCE_LABELS[sysFrom]}</strong> → receive <strong>{parseInt(sysAmount).toLocaleString()} {RESOURCE_LABELS[sysTo]}</strong>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="market-system-form-row">
                  <label>Sell</label>
                  <select value={sysFrom} onChange={(e) => setSysFrom(e.target.value as any)}>
                    {SYSTEM_RESOURCES.map((r) => (
                      <option key={r} value={r}>{RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                <div className="market-system-form-row">
                  <label>Receive</label>
                  <select value={sysTo} onChange={(e) => setSysTo(e.target.value as any)}>
                    {SYSTEM_RESOURCES.map((r) => (
                      <option key={r} value={r}>{RESOURCE_ICONS[r]} {RESOURCE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
                <div className="market-system-form-row">
                  <label>Amount to sell</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 100"
                    value={sysAmount}
                    onChange={(e) => setSysAmount(e.target.value)}
                  />
                </div>
                {sysAmount && parseInt(sysAmount) > 0 && sysFrom !== sysTo && (
                  <div className="market-system-preview">
                    You sell <strong>{parseInt(sysAmount).toLocaleString()} {RESOURCE_LABELS[sysFrom]}</strong> → receive <strong>{Math.floor(parseInt(sysAmount) * 0.8).toLocaleString()} {RESOURCE_LABELS[sysTo]}</strong>
                  </div>
                )}
              </>
            )}

            {sysError && <div className="market-form-error">{sysError}</div>}
            {sysSuccess && <div className="market-system-success">{sysSuccess}</div>}

            <button type="submit" className="market-system-btn" disabled={sysSubmitting}>
              {sysSubmitting ? 'Processing...' : sysMode === 'buy' ? 'Buy from System' : 'Sell to System'}
            </button>
          </form>
        </div>
      </div>

      <div className="market-section">
        <h3>Recent Transactions {history.length === 0 && <span className="market-empty-note">— none yet</span>}</h3>
        {history.length > 0 && (
          <div className="market-history">
            {history.map((t: any) => (
              <div key={t.id} className="market-history-row">
                <div className="market-history-trade">
                  <span className="market-history-resource">
                    {RESOURCE_ICONS[t.wantResource]} {t.wantAmount.toLocaleString()} {RESOURCE_LABELS[t.wantResource]}
                  </span>
                  <span className="market-history-arrow">→</span>
                  <span className="market-history-resource">
                    {RESOURCE_ICONS[t.offerResource]} {t.offerAmount.toLocaleString()} {RESOURCE_LABELS[t.offerResource]}
                  </span>
                </div>
                <div className="market-history-meta">
                  <span>{t.buyerUsername} → {t.sellerUsername}</span>
                  <span className="market-history-time">
                    {new Date(t.completedAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Market;
