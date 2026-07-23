export type TripStatus =
  | 'pending'
  | 'planning'
  | 'searching'
  | 'crawling'
  | 'composing'
  | 'done'
  | 'failed';

export type TripProgressEvent = {
  jobId: string;
  status: TripStatus;
  progress: number;
  message?: string | null;
  crawled?: number;
  total?: number;
  error?: string | null;
  itinerary?: unknown;
};

export type SearchHit = {
  url: string;
  title?: string;
  snippet?: string;
};

export interface SearchProvider {
  readonly name: string;
  search(query: string, limit: number): Promise<SearchHit[]>;
}
