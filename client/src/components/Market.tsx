import React, { useCallback, useEffect, useState } from 'react';
import { buyMarketListing, cancelMarketListing, createMarketListing, getMarketHistory, getMarketListings } from '../services/api';
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
  const [formWantAmount, setFormWantAmount] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [buyNexusId, setBuyNexusId] = useState('');
  const [buyError, setBuyError] = useState('');

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
  }, [nexuses, buyNexusId, selectedNexusId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const offer = parseInt(formOfferAmount);
    const want = parseInt(formWantAmount);
    if (!offer || offer <= 0 || !want || want <= 0) {
      setFormError('Amounts must be positive numbers');
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
      await createMarketListing(formNexusId, formOffer, offer, formWant, want);
      setFormOfferAmount('');
      setFormWantAmount('');
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
                    value={formWantAmount}
                    onChange={(e) => setFormWantAmount(e.target.value)}
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
        <h3>Recent Transactions {history.length === 0 && <span className="market-empty-note">— none yet</span>}</h3>
        {history.length > 0 && (
          <div className="market-history">
            {history.map((t: any) => (
              <div key={t.id} className="market-history-row">
                <div className="market-history-trade">
                  <span className="market-history-resource">
                    {RESOURCE_ICONS[t.offerResource]} {t.offerAmount.toLocaleString()} {RESOURCE_LABELS[t.offerResource]}
                  </span>
                  <span className="market-history-arrow">→</span>
                  <span className="market-history-resource">
                    {RESOURCE_ICONS[t.wantResource]} {t.wantAmount.toLocaleString()} {RESOURCE_LABELS[t.wantResource]}
                  </span>
                </div>
                <div className="market-history-meta">
                  <span>{t.sellerUsername} → {t.buyerUsername}</span>
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
