import {receiptRollPdf as legacyReceipt} from './local-print-v109.js';
import {vectorReceiptPdf110} from './receipt-vector-v110.js';
export {config,autoPrint,saveConfig,sendPrint} from './local-print-v99.js';
export function receiptRollPdf(root,layout){return layout.paperMm===80?vectorReceiptPdf110(root,layout):legacyReceipt(root,layout);}
