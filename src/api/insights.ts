// Browser side of the Insights API (contract in ./types, server/src/routes/insights.ts). Everything here is
// optional: the Insights page works from the games on this device when the server can't be reached.
import { call } from './client';
import type { CoachFocusRequest, CoachFocusResponse, CoachInsightsResponse, InsightsFactsResponse } from './types';

const id = encodeURIComponent;

export const insightsApi = {
  /** The signed-in player's facts over every saved game, with coverage, history and `coachLinked`. */
  facts: () => call<InsightsFactsResponse>('GET', '/insights/facts'),
  /** The active coach Focus override, or `{ focus: null }`. */
  coachFocus: () => call<CoachFocusResponse>('GET', '/insights/coach-focus'),
  coach: {
    /** A linked student's Insights at Analyst detail, evidence positions and trends (404 without a link). */
    insights: (studentId: string) => call<CoachInsightsResponse>('GET', `/coach/students/${id(studentId)}/insights`),
    setFocus: (studentId: string, req: CoachFocusRequest) =>
      call<CoachFocusResponse>('PUT', `/coach/students/${id(studentId)}/focus`, req),
    clearFocus: (studentId: string) => call<void>('DELETE', `/coach/students/${id(studentId)}/focus`),
  },
};
