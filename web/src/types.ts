export interface User {
  id: number;
  username: string;
}

export interface Claim {
  userId: number;
  username: string;
  eta: string; // 'now' or 'HH:MM'
  status: 'coming' | 'arrived';
}

export interface Table {
  id: number;
  label: string;
  released: boolean;
  claims: Claim[];
}

export interface SpaceInfo {
  code: string;
  name: string;
  ownerId: number;
  ownerName: string;
  seatsPerTable: number;
  status: 'open' | 'closed';
  createdAt: number;
}

export interface SpaceState {
  space: SpaceInfo;
  tables: Table[];
}
