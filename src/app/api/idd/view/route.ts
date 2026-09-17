import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key');

    if (!key) {
      return new NextResponse('Missing Access Key', { status: 400 });
    }

    const lead = await prisma.diallerQueueItem.findFirst({
      where: { ipidAccessKey: key }
    });

    if (!lead) {
      return new NextResponse('Invalid or Expired IDD Access Token', { status: 404 });
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <title>Insurance Product Information Document (IPID) - ${lead.companyName}</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 32px; background: #f8fafc; color: #0f172a; line-height: 1.5; }
            .card { max-width: 680px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
            h1 { font-size: 20px; margin-top: 0; color: #1e293b; border-bottom: 2px solid #059669; padding-bottom: 8px; }
            .meta { background: #f1f5f9; padding: 12px; border-radius: 6px; font-size: 14px; margin-bottom: 24px; }
            .section { margin-bottom: 20px; }
            .section-title { font-weight: 700; font-size: 14px; text-transform: uppercase; color: #475569; margin-bottom: 6px; }
            ul { margin: 0; padding-left: 20px; }
            li { margin-bottom: 4px; font-size: 14px; }
            .footer { font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px; margin-top: 24px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Insurance Product Information Document (IPID)</h1>
            <div class="meta">
              <strong>Insured Entity:</strong> ${lead.companyName} (CRN: ${lead.companyNumber})<br />
              <strong>Coverage Facility:</strong> Delegated Authority DA-PI-2026<br />
              <strong>Delivered At:</strong> ${lead.ipidDeliveredAt?.toISOString() || new Date().toISOString()}
            </div>

            <div class="section">
              <div class="section-title">What is this type of insurance?</div>
              <p style="margin: 0; font-size: 14px;">
                Professional Indemnity Insurance covering civil liability claims, negligence, and contractual defense costs arising from commercial freight and logistics management services.
              </p>
            </div>

            <div class="section">
              <div class="section-title">What is insured?</div>
              <ul>
                <li>Civil liability up to £1,000,000 in the annual aggregate.</li>
                <li>Legal defense costs and representation fees incurred with underwriter consent.</li>
                <li>Breach of professional duty, unintentional intellectual property infringements, and loss of documents.</li>
              </ul>
            </div>

            <div class="section">
              <div class="section-title">What is not insured?</div>
              <ul>
                <li>Claims arising from dishonest, fraudulent, or criminal acts of directors.</li>
                <li>Prior known circumstances or claims notified prior to inception.</li>
                <li>Direct bodily injury and property damage (governed under separate Public Liability covers).</li>
              </ul>
            </div>

            <div class="footer">
              Issued in full compliance with European Insurance Distribution Directive (EU IDD) & UK FCA ICOBS conduct guidelines. Mercator-Atlas underwriting desk.
            </div>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(htmlContent, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  } catch (error) {
    console.error('Failed to render IPID:', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
