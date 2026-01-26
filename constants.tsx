
import React from 'react';
import { OfficeStatus } from './types';
import { 
  CheckCircle, 
  Coffee, 
  Wind, 
  Cookie, 
  ClipboardCheck,
  Shuffle,
  Calendar,
  Activity
} from 'lucide-react';

export const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; bg: string }> = {
  [OfficeStatus.AVAILABLE]: {
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    icon: <CheckCircle className="w-5 h-5" />
  },
  [OfficeStatus.LUNCH]: {
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    icon: <Coffee className="w-5 h-5" />
  },
  [OfficeStatus.REFRESHMENT_BREAK]: {
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    icon: <Wind className="w-5 h-5" />
  },
  [OfficeStatus.SNACKS]: {
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    icon: <Cookie className="w-5 h-5" />
  },
  [OfficeStatus.QUALITY_FEEDBACK]: {
    color: 'text-sky-600',
    bg: 'bg-sky-50',
    icon: <ClipboardCheck className="w-5 h-5" />
  },
  [OfficeStatus.CROSS_UTILIZATION]: {
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    icon: <Shuffle className="w-5 h-5" />
  },
  [OfficeStatus.LEAVE]: {
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    icon: <Calendar className="w-5 h-5" />
  }
};

export const getStatusConfig = (status: string) => {
  return STATUS_CONFIG[status] || {
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    icon: <Activity className="w-5 h-5" />
  };
};
