export interface User {
  id: number;
  username: string;
  color: string;
}

export interface Claim {
  userId: number;
  username: string;
  color: string;
  eta: string; // 'now' or 'HH:MM'
  status: 'coming' | 'arrived';
}

export interface Table {
  id: number;
  label: string;
  released: boolean;
  capacity: number;
  x: number; // center, fraction of room width (0..1)
  y: number; // center, fraction of room height (0..1)
  rot: 0 | 90;
  claims: Claim[];
}

export interface SpaceInfo {
  code: string;
  name: string;
  ownerId: number;
  ownerName: string;
  status: 'open' | 'closed';
  createdAt: number;
}

export interface SpaceState {
  space: SpaceInfo;
  tables: Table[];
}
