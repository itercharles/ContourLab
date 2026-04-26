import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export type ActivityTone = 'info' | 'success' | 'warning' | 'error';

export interface ActivityItem {
  id: string;
  title: string;
  detail?: string;
  message: string;
  tone: ActivityTone;
  createdAt: string;
  read: boolean;
}

interface ActivityState {
  activities: ActivityItem[];
  addActivity: (activity: Omit<ActivityItem, 'id' | 'createdAt' | 'read'>) => void;
  markAllRead: () => void;
  clearActivities: () => void;
}

const MAX_ACTIVITIES = 30;

export function addUserActivity(activity: {
  title: string;
  message: string;
  detail?: string;
  tone?: ActivityTone;
}): void {
  useActivityStore.getState().addActivity({
    title: activity.title,
    message: activity.message,
    detail: activity.detail,
    tone: activity.tone ?? 'info',
  });
}

export const useActivityStore = create<ActivityState>()(
  immer((set) => ({
    activities: [],

    addActivity: (activity) =>
      set((state) => {
        state.activities.unshift({
          ...activity,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          read: false,
        });
        state.activities = state.activities.slice(0, MAX_ACTIVITIES);
      }),

    markAllRead: () =>
      set((state) => {
        for (const activity of state.activities) {
          activity.read = true;
        }
      }),

    clearActivities: () =>
      set((state) => {
        state.activities = [];
      }),
  }))
);
