export interface Firm {
  id: string; // slug of firmName
  firmName: string; // canonical proper-cased display name
  accountNo: string;
  ifscCode: string;
  bankName: string;
  branch: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

export interface UpsertFirmPayload {
  firmName: string;
  accountNo: string;
  ifscCode: string;
  bankName: string;
  branch: string;
}
