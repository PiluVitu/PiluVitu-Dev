export interface User {
  id: number
  email: string
  name: string
  picture: string
  is_admin: boolean
}

export interface VotingSession {
  ID: number
  Title: string
  Status: 'open' | 'closed'
  CreatedBy: number
  CreatedAt: string
  ClosedAt?: string | null
  WinnerMovieID?: number | null
  SortOptionsJSON: string
}

export interface SessionMovie {
  ID: number
  SessionID: number
  Category: string
  Title: string
  Type: 'filme' | 'serie'
  PosterURL: string
  TMDbID?: number | null
  WasWatched: boolean
  SheetNumber?: number | null
}

export interface SessionDetail {
  session: VotingSession
  movies: SessionMovie[]
  has_voted: boolean
  /** Movie the current user voted for, or null if they haven't voted. */
  voted_movie_id: number | null
}

export interface SessionListResponse {
  sessions: VotingSession[]
}

export interface ResultsResponse {
  results: { movie_id: number; count: number }[]
  total_votes: number
}

export interface CategoriesResponse {
  categories: string[]
}

export interface CreateSessionBody {
  title: string
  types: string[]
  include_watched: boolean
  categories: string[]
}
