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
  const [queueCount, setQueueCount] = useState<number>(0);
  const [activeLead, setActiveLead] = useState<StagedLead | null>(null);
  const [dialling, setDialling] = useState<boolean>(false);
  const [binding, setBinding] = useState<boolean>(false);
  const [sendingIpid, setSendingIpid] = useState<boolean>(false);
  const [ipidLink, setIpidLink] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('Floor Ready. Idle.');

  async function refreshQueue() {
    try {
      const res = await fetch('/api/dialler/queue?status=QUEUED');
      if (res.ok) {
        const data = await res.json();
        setQueueCount(data.count);
      }
    } catch (e) {
      console.error('Queue poll failed', e);
    }
  }

  useEffect(() => {
    refreshQueue();
    const interval = setInterval(refreshQueue, 5000);
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
      setStatusMessage(
        `Batch Complete: ${data.summary.ingested} leads queued, ${data.summary.suppressed} suppressed by PECR.`
      );
      refreshQueue();
    } catch (e: any) {
      setStatusMessage(`Crawler failed: ${e.message}`);
    }
  }

  async function handleNextCall() {
    setDialling(true);
    setStatusMessage('Progressive Dialler: Ringing next screened lead...');
    setActiveLead(null);
    setIpidLink(null);

    try {
      const res = await fetch('/api/dialler/claim-next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerId: 'eleanor.vance@mercator-atlas.example' })
      });

      if (res.status === 404) {
        setStatusMessage('Queue dry. Run crawler to ingest fresh leads.');
        setDialling(false);
        return;
      }

      const data = await res.json();
      setActiveLead(data.lead);
      setStatusMessage(`Call Connected: ${data.lead.companyName} (${data.lead.contactPhone})`);
      refreshQueue();
    } catch (e: any) {
      setStatusMessage(`Call bridge failed: ${e.message}`);
    } finally {
      setDialling(false);
    }
  }

  async function handleDeliverIpid() {
    if (!activeLead) return;
    setSendingIpid(true);
    setStatusMessage('Generating Demands & Needs and delivering durable IPID link...');

    try {
      const res = await fetch('/api/idd/ipid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyNumber: activeLead.companyNumber,
          indemnityLimit: 1000000
        })
      });

      if (!res.ok) throw new Error(`IPID delivery failed with status ${res.status}`);

      const data = await res.json();
      setIpidLink(data.durableUrl);
      setActiveLead({
        ...activeLead,
        ipidDeliveredAt: data.deliveredAt
      });
      setStatusMessage('IPID Delivered. IDD Compliance Gate cleared for 1-click bind.');
    } catch (e: any) {
      setStatusMessage(`IPID error: ${e.message}`);
    } finally {
      setSendingIpid(false);
    }
  }

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
        throw new Error(errorData.error || `Bind rejected with code ${bindResponse.status}`);
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

      setStatusMessage(`Policy Bound & Issued! Schedule PDF downloaded.`);
      setActiveLead(null);
      setIpidLink(null);
      refreshQueue();
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
    <main style={{ maxWidth: 760, margin: '40px auto', background: '#ffffff', padding: 32, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Mercator-Atlas High-Velocity Desk</h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 14 }}>
            DA Facility: <strong>DA-PI-2026</strong> | Broker: <strong>Eleanor Vance</strong>
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: queueCount > 0 ? '#059669' : '#94a3b8' }}>
            {queueCount}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Screened In Queue
          </div>
        </div>
      </header>

      {/* Primary Action Buttons */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button
          onClick={handleNextCall}
          disabled={dialling || binding || queueCount === 0}
          style={{
            flex: 2,
            padding: '14px 20px',
            background: dialling || queueCount === 0 ? '#94a3b8' : '#2563eb',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: 16,
            border: 'none',
            borderRadius: 6,
            cursor: dialling || queueCount === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          {dialling ? 'Connecting Call...' : '▶ Dial Next Lead'}
        </button>

        <button
          onClick={handleTriggerCrawler}
          disabled={dialling || binding}
          style={{
            flex: 1,
            padding: '14px 16px',
            background: '#f1f5f9',
            color: '#334155',
            fontWeight: 600,
            fontSize: 14,
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          + Ingest SIC 49410
        </button>

        <button
          onClick={handleDownloadBordereau}
          style={{
            flex: 1,
            padding: '14px 16px',
            background: '#ffffff',
            color: '#0f172a',
            fontWeight: 600,
            fontSize: 14,
            border: '1px solid #0f172a',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          ⬇ Bordereau
        </button>
      </div>

      {/* Screen-Pop Active Call Container */}
      {activeLead ? (
        <div style={{ border: '2px solid #3b82f6', borderRadius: 8, padding: 20, background: '#eff6ff', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', background: '#dbeafe', padding: '2px 8px', borderRadius: 4 }}>
              LIVE CALL CONNECTED
            </span>
            <span style={{ fontSize: 13, color: '#475569' }}>
              CRN: <strong>{activeLead.companyNumber}</strong> | Phone: <strong>{activeLead.contactPhone}</strong>
            </span>
          </div>

          <h2 style={{ margin: '0 0 16px 0', fontSize: 20, color: '#1e293b' }}>
            {activeLead.companyName}
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#ffffff', padding: 16, borderRadius: 6, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Industry / SIC</div>
              <div style={{ fontWeight: 600 }}>Freight Road Transport ({activeLead.sicCode})</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Headcount & Turnover</div>
              <div style={{ fontWeight: 600 }}>{activeLead.employeeCount} Staff | £{activeLead.estimatedTurnover.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Indicative Net Premium</div>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>£{activeLead.indicativeNet?.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Gross (incl. 12% IPT)</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#059669' }}>
                £{activeLead.indicativeGross?.toFixed(2)}
              </div>
            </div>
          </div>

          {/* IDD Delivery Gate Controls */}
          <div style={{ background: '#ffffff', padding: 14, borderRadius: 6, marginBottom: 16, border: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: activeLead.ipidDeliveredAt ? '#059669' : '#d97706' }}>
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
              background: binding || !activeLead.ipidDeliveredAt ? '#94a3b8' : '#059669',
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
      ) : null}

      {/* Telemetry Status Bar */}
      <footer style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, color: '#475569' }}>
        <strong>Telemetry:</strong> {statusMessage}
      </footer>
    </main>
  );
}
