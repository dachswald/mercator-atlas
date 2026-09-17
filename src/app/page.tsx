'use client';

import React, { useState, useEffect } from 'react';

interface StagedLead {
  id: string;
  companyName: string;
  companyNumber: string;
  sicCode: string;
  contactPhone: string;
  contactEmail: string | null;
  estimatedTurnover: number;
  employeeCount: number;
  indicativeNet: number;
  indicativeGross: number;
  queueStatus: string;
  ipidDeliveredAt?: string | null;
}

export default function DiallerDesk() {
  const [activeRole, setActiveRole] = useState<'SDR' | 'CLOSER'>('SDR');
  const [sdrQueueCount, setSdrQueueCount] = useState<number>(0);
  const [closerPendingCount, setCloserPendingCount] = useState<number>(0);

  const [activeLead, setActiveLead] = useState<StagedLead | null>(null);
  const [dialling, setDialling] = useState<boolean>(false);
  const [binding, setBinding] = useState<boolean>(false);
  const [sendingIpid, setSendingIpid] = useState<boolean>(false);
  const [ipidLink, setIpidLink] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Floor Ready. Idle.');

  // SDR verification edit state
  const [verifiedTurnover, setVerifiedTurnover] = useState<number>(0);
  const [verifiedEmployees, setVerifiedEmployees] = useState<number>(0);

  async function refreshTelemetry() {
    try {
      const [sdrRes, closerRes] = await Promise.all([
        fetch('/api/dialler/queue?status=QUEUED'),
        fetch('/api/dialler/queue?status=READY_FOR_CLOSER')
      ]);

      if (sdrRes.ok) {
        const d = await sdrRes.json();
        setSdrQueueCount(d.count);
      }
      if (closerRes.ok) {
        const d = await closerRes.json();
        setCloserPendingCount(d.count);
      }
    } catch (e) {
      console.error('Telemetry fetch failed', e);
    }
  }

  useEffect(() => {
    refreshTelemetry();
    const interval = setInterval(refreshTelemetry, 4000);
    return () => clearInterval(interval);
  }, []);

  async function handleTriggerCrawler() {
    setStatusMessage('Crawler running: Scraping SIC 49410 and screening CTPS...');
    try {
      const res = await fetch('/api/crawler/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSicCode: '49410', batchLimit: 10 })
      });
      const data = await res.json();
      setStatusMessage(`Ingested ${data.summary.ingested} leads, ${data.summary.suppressed} suppressed.`);
      refreshTelemetry();
    } catch (e: any) {
      setStatusMessage(`Crawler failed: ${e.message}`);
    }
  }

  // SDR Action: Dial next cold lead
  async function handleSdrDialNext() {
    setDialling(true);
    setStatusMessage('Progressive Dialler: Ringing next screened prospect...');
    setActiveLead(null);

    try {
      const res = await fetch('/api/dialler/claim-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId: 'sdr-tier-01' })
      });

      if (res.status === 404) {
        setStatusMessage('SDR queue empty. Ingest more leads.');
        setDialling(false);
        return;
      }

      const data = await res.json();
      setActiveLead(data.lead);
      setVerifiedTurnover(data.lead.estimatedTurnover);
      setVerifiedEmployees(data.lead.employeeCount);
      setStatusMessage(`Connected: ${data.lead.companyName} (${data.lead.contactPhone})`);
      refreshTelemetry();
    } catch (e: any) {
      setStatusMessage(`Call failed: ${e.message}`);
    } finally {
      setDialling(false);
    }
  }

  // SDR Action: Complete fact-finding and initiate warm transfer
  async function handleTransferToCloser() {
    if (!activeLead) return;
    setStatusMessage(`Transferring ${activeLead.companyName} to onshore licensed closer...`);

    try {
      const res = await fetch('/api/dialler/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: activeLead.id,
          verifiedTurnover,
          verifiedEmployees,
          sdrId: 'sdr-tier-01'
        })
      });

      if (!res.ok) throw new Error('Transfer dispatch failed');

      setStatusMessage('Lead transferred to licensed closer queue. Returning to dialler pool.');
      setActiveLead(null);
      refreshTelemetry();
    } catch (e: any) {
      setStatusMessage(`Transfer failed: ${e.message}`);
    }
  }

  // Closer Action: Accept next verified warm transfer
  async function handleCloserAcceptLead() {
    setStatusMessage('Accepting next verified inbound warm transfer...');
    setActiveLead(null);
    setIpidLink(null);

    try {
      const res = await fetch('/api/dialler/closer-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.status === 404) {
        setStatusMessage('No transferred leads pending in closer pool.');
        return;
      }

      const data = await res.json();
      setActiveLead(data.lead);
      setStatusMessage(`Warm Call Bridge Active: ${data.lead.companyName}`);
      refreshTelemetry();
    } catch (e: any) {
      setStatusMessage(`Closer claim failed: ${e.message}`);
    }
  }

  // Closer Action: Deliver IPID
  async function handleDeliverIpid() {
    if (!activeLead) return;
    setSendingIpid(true);
    setStatusMessage('Compiling Demands & Needs and generating durable IPID link...');

    try {
      const res = await fetch('/api/idd/ipid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyNumber: activeLead.companyNumber,
          indemnityLimit: 1000000
        })
      });

      if (!res.ok) throw new Error('IPID generation failed');

      const data = await res.json();
      setIpidLink(data.durableUrl);
      setActiveLead({
        ...activeLead,
        ipidDeliveredAt: data.deliveredAt
      });
      setStatusMessage('IPID Delivered. IDD Compliance Gate cleared for 1-click bind.');
    } catch (e: any) {
      setStatusMessage(`IPID delivery failed: ${e.message}`);
    } finally {
      setSendingIpid(false);
    }
  }

  // Closer Action: 1-Click Bind
  async function handleBindAndIssue() {
    if (!activeLead) return;
    setBinding(true);
    setStatusMessage(`Binding coverage for ${activeLead.companyName}...`);

    try {
      const bindResponse = await fetch('/api/policies/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brokerId: 'eleanor.vance@mercator-atlas.example',
          smeId: activeLead.companyNumber,
          facilityId: 'DA-PI-2026',
          indemnityLimit: 1000000
        })
      });

      if (!bindResponse.ok) {
        const errorData = await bindResponse.json();
        throw new Error(errorData.error || `Bind rejected (${bindResponse.status})`);
      }

      const blob = await bindResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PolicySchedule-${activeLead.companyName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatusMessage('Policy Bound & Issued! Schedule PDF downloaded.');
      setActiveLead(null);
      setIpidLink(null);
      refreshTelemetry();
    } catch (e: any) {
      setStatusMessage(`Bind execution failed: ${e.message}`);
    } finally {
      setBinding(false);
    }
  }

  function handleDownloadBordereau() {
    window.location.href = '/api/bordereau/export?facility=DA-PI-2026';
  }

  return (
    <main style={{ maxWidth: 840, margin: '30px auto', background: '#ffffff', padding: 32, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      {/* Role-Mode Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', padding: '12px 20px', borderRadius: 6, marginBottom: 24, color: '#ffffff' }}>
        <div>
          <span style={{ fontSize: 13, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>Operational Mode:</span>
          <strong style={{ marginLeft: 8, fontSize: 15, color: activeRole === 'SDR' ? '#38bdf8' : '#4ade80' }}>
            {activeRole === 'SDR' ? 'Offshore SDR (Fact-Finding Only)' : 'Licensed Broker (Closer)'}
          </strong>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setActiveRole('SDR'); setActiveLead(null); }}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              background: activeRole === 'SDR' ? '#38bdf8' : '#334155',
              color: activeRole === 'SDR' ? '#0f172a' : '#ffffff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            SDR Mode
          </button>
          <button
            onClick={() => { setActiveRole('CLOSER'); setActiveLead(null); }}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 600,
              background: activeRole === 'CLOSER' ? '#4ade80' : '#334155',
              color: activeRole === 'CLOSER' ? '#0f172a' : '#ffffff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Closer Mode
          </button>
        </div>
      </div>

      {/* Telemetry Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Mercator-Atlas High-Velocity Desk</h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 13 }}>
            Binder: <strong>DA-PI-2026</strong> | Compliance: <strong>EU IDD / UK FCA Gated</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 20, textAlign: 'right' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0284c7' }}>{sdrQueueCount}</div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>SDR Cold Queue</div>
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#16a34a' }}>{closerPendingCount}</div>
            <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Warm Transfers Ready</div>
          </div>
        </div>
      </header>

      {/* Action Bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {activeRole === 'SDR' ? (
          <>
            <button
              onClick={handleSdrDialNext}
              disabled={dialling || sdrQueueCount === 0 || !!activeLead}
              style={{
                flex: 2,
                padding: '12px 18px',
                background: dialling || sdrQueueCount === 0 || !!activeLead ? '#94a3b8' : '#0284c7',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 15,
                border: 'none',
                borderRadius: 6,
                cursor: dialling || sdrQueueCount === 0 || !!activeLead ? 'not-allowed' : 'pointer'
              }}
            >
              {dialling ? 'Connecting Call...' : '▶ Dial Next Lead (SDR)'}
            </button>
            <button
              onClick={handleTriggerCrawler}
              disabled={dialling}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: '#f1f5f9',
                color: '#334155',
                fontWeight: 600,
                fontSize: 13,
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                cursor: 'pointer'
              }}
            >
              + Scrape SIC 49410
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleCloserAcceptLead}
              disabled={closerPendingCount === 0 || !!activeLead}
              style={{
                flex: 2,
                padding: '12px 18px',
                background: closerPendingCount === 0 || !!activeLead ? '#94a3b8' : '#16a34a',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 15,
                border: 'none',
                borderRadius: 6,
                cursor: closerPendingCount === 0 || !!activeLead ? 'not-allowed' : 'pointer'
              }}
            >
              ⚡ Accept Warm Transfer ({closerPendingCount} Ready)
            </button>
            <button
              onClick={handleDownloadBordereau}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: '#ffffff',
                color: '#0f172a',
                fontWeight: 600,
                fontSize: 13,
                border: '1px solid #0f172a',
                borderRadius: 6,
                cursor: 'pointer'
              }}
            >
              ⬇ Export Bordereau
            </button>
          </>
        )}
      </div>

      {/* Screen-Pop Active Call Container */}
      {activeLead && (
        <div style={{ border: '2px solid #2563eb', borderRadius: 8, padding: 20, background: '#f8fafc', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: 4 }}>
              {activeRole === 'SDR' ? 'COLD OUTREACH CALL CONNECTED' : 'WARM TRANSFER CONNECTED'}
            </span>
            <span style={{ fontSize: 13, color: '#475569' }}>
              CRN: <strong>{activeLead.companyNumber}</strong> | Tel: <strong>{activeLead.contactPhone}</strong>
            </span>
          </div>

          <h2 style={{ margin: '0 0 16px 0', fontSize: 20, color: '#0f172a' }}>
            {activeLead.companyName}
          </h2>

          {/* SDR Fact-Finding View */}
          {activeRole === 'SDR' ? (
            <div>
              <div style={{ background: '#fef3c7', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13, color: '#92400e', border: '1px solid #fde68a' }}>
                <strong>FCA Regulatory Guardrail:</strong> You may verify factual numbers only. Do not advise, discuss cover terms, or quote binding figures.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, background: '#ffffff', padding: 16, borderRadius: 6, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
                    Verified Annual Turnover (£)
                  </label>
                  <input
                    type="number"
                    value={verifiedTurnover}
                    onChange={(e) => setVerifiedTurnover(parseFloat(e.target.value) || 0)}
                    style={{ width: '90%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 600 }}>
                    Verified Employee Count
                  </label>
                  <input
                    type="number"
                    value={verifiedEmployees}
                    onChange={(e) => setVerifiedEmployees(parseInt(e.target.value, 10) || 0)}
                    style={{ width: '90%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 14 }}
                  />
                </div>
              </div>

              <button
                onClick={handleTransferToCloser}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 15,
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Transfer to Licensed Closer Desk ➔
              </button>
            </div>
          ) : (
            /* Closer View */
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#ffffff', padding: 16, borderRadius: 6, marginBottom: 16, border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Industry / SIC</div>
                  <div style={{ fontWeight: 600 }}>Freight Road Transport ({activeLead.sicCode})</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Verified Risk Profile</div>
                  <div style={{ fontWeight: 600 }}>{activeLead.employeeCount} Staff | £{activeLead.estimatedTurnover.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Net Premium</div>
                  <div style={{ fontWeight: 600 }}>£{activeLead.indicativeNet?.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>Gross (incl. 12% IPT)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>
                    £{activeLead.indicativeGross?.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* IDD Gate Controls */}
              <div style={{ background: '#ffffff', padding: 14, borderRadius: 6, marginBottom: 16, border: '1px solid #cbd5e1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: activeLead.ipidDeliveredAt ? '#16a34a' : '#d97706' }}>
                      {activeLead.ipidDeliveredAt ? '✓ IDD Delivery Gate: CLEARED' : '⚠ IDD Gate: IPID Delivery Required'}
                    </span>
                    {ipidLink && (
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        <a href={ipidLink} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                          Open Dispatched IPID Document ↗
                        </a>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleDeliverIpid}
                    disabled={sendingIpid || !!activeLead.ipidDeliveredAt}
                    style={{
                      padding: '8px 14px',
                      background: activeLead.ipidDeliveredAt ? '#e2e8f0' : '#d97706',
                      color: activeLead.ipidDeliveredAt ? '#64748b' : '#ffffff',
                      fontWeight: 600,
                      fontSize: 13,
                      border: 'none',
                      borderRadius: 4,
                      cursor: activeLead.ipidDeliveredAt ? 'default' : 'pointer'
                    }}
                  >
                    {sendingIpid ? 'Generating...' : activeLead.ipidDeliveredAt ? 'IPID Dispatched' : 'Deliver IPID Link'}
                  </button>
                </div>
              </div>

              <button
                onClick={handleBindAndIssue}
                disabled={binding || !activeLead.ipidDeliveredAt}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  background: binding || !activeLead.ipidDeliveredAt ? '#94a3b8' : '#16a34a',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: 16,
                  border: 'none',
                  borderRadius: 6,
                  cursor: binding || !activeLead.ipidDeliveredAt ? 'not-allowed' : 'pointer'
                }}
              >
                {binding
                  ? 'Executing Atomic Bind...'
                  : !activeLead.ipidDeliveredAt
                  ? '🔒 IPID Delivery Required to Unlock Bind'
                  : '⚡ 1-Click Bind & Issue Policy Schedule'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Telemetry Status Bar */}
      <footer style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
        <strong>Telemetry:</strong> {statusMessage}
      </footer>
    </main>
  );
}
