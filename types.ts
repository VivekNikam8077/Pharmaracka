
export enum UserRole {
  STANDARD = 'Standard',
  ADMIN = 'Admin',
  SUPER_USER = 'SuperUser'
}

export enum OfficeStatus {
  AVAILABLE = 'Available',
  LUNCH = 'Lunch',
  REFRESHMENT_BREAK = 'Refreshment Break',
  SNACKS = 'Snacks',
  QUALITY_FEEDBACK = 'Quality Feedback',
  CROSS_UTILIZATION = 'Cross Utilization',
  LEAVE = 'Leave'
}

export interface StatusLogEntry {
  id: string;
  userId: string;
  status: OfficeStatus;
  timestamp: Date;
}

export interface DaySummary {
  userId: string;
  date: string; // YYYY-MM-DD
  loginTime: string;
  logoutTime: string;
  productiveMinutes: number;
  lunchMinutes: number;
  snacksMinutes: number;
  refreshmentMinutes: number;
  feedbackMinutes: number;
  crossUtilMinutes: number;
  totalMinutes: number;
  isLeave?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  avatar?: string;
  role: UserRole;
  createdAt: string;
}

export interface RealtimeStatus {
  userId: string;
  userName: string;
  role: UserRole;
  status: OfficeStatus;
  lastUpdate: string;
  activity?: 0 | 1 | 2;
  lastActivityAt?: number;
  activityUpdatedAt?: number;
}

export interface AppSettings {
  siteName: string;
  logoUrl: string;
  loginBgUrl: string;
  darkMode: boolean;
  availableStatuses: string[];
}
