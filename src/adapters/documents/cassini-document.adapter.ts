import { TDocumentDefinitions } from 'pdfmake/interfaces';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require('pdfmake');

export interface ScheduleMetadata {
  policyNumber: string;
  facilityCode: string;
  smeName: string;
  companyNumber: string;
  effectiveFrom: string;
  effectiveTo: string;
  grossPremium: number;
  ipt: number;
  netPremium: number;
  indemnityLimit: number;
  excess: number;
}

export class CassiniDocumentAdapter {
  private printer: any;

  constructor() {
    const fonts = {
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
      }
    };
    this.printer = new PdfPrinter(fonts);
  }

  public async generatePolicySchedule(data: ScheduleMetadata): Promise<Buffer> {
    const docDefinition: TDocumentDefinitions = {
      defaultStyle: {
        font: 'Helvetica'
      },
      content: [
        { text: 'SCHEDULE OF INSURANCE', style: 'header' },
        { text: `Facility: ${data.facilityCode}`, style: 'subheader' },
        { text: '\n' },
        {
          table: {
            widths: ['35%', '65%'],
            body: [
              [{ text: 'Policy Number', bold: true }, data.policyNumber],
              [{ text: 'Insured Entity', bold: true }, `${data.smeName} (CRN: ${data.companyNumber})`],
              [{ text: 'Period of Insurance', bold: true }, `${data.effectiveFrom} to ${data.effectiveTo}`],
              [{ text: 'Indemnity Limit', bold: true }, `£${data.indemnityLimit.toLocaleString()}`],
              [{ text: 'Excess', bold: true }, `£${data.excess.toLocaleString()}`],
              [{ text: 'Net Premium', bold: true }, `£${data.netPremium.toFixed(2)}`],
              [{ text: 'Insurance Premium Tax (12%)', bold: true }, `£${data.ipt.toFixed(2)}`],
              [{ text: 'Total Gross Premium', bold: true }, `£${data.grossPremium.toFixed(2)}`]
            ]
          }
        },
        { text: '\n\nIssued under Delegated Authority by Mercator-Atlas.', italics: true }
      ],
      styles: {
        header: { fontSize: 18, bold: true, margin: [0, 0, 0, 8] },
        subheader: { fontSize: 12, color: '#555555' }
      }
    };

    return new Promise((resolve, reject) => {
      const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];

      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', (err: Error) => reject(err));
      pdfDoc.end();
    });
  }
}
