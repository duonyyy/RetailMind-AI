export interface BranchInventoryRecord {
  id: string;
  sku: string;
  name: string;
  branchCode: string;
  branchName: string;
  physicalQty: number;
  reservedQty: number;
  availableQty: number;
  safetyThreshold: number;
  lastUpdated: string;
}

export interface StockAdjustmentRequest {
  sku: string;
  branchCode: string;
  deltaPhysicalQty?: number;
  deltaQty?: number;
  newPhysicalQty: number;
  reason: string;
  initiatedBy?: string;
}

