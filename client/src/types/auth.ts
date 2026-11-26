export interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
  sessions_count?: number;
  bio?: string | null;
  avatar_url?: string | null;
  designation?: string | null;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at?: string | null;
  is_active: boolean;
}

export interface CreateApiKeyResponse {
  api_key: ApiKey;
  raw_key: string;
}

export interface UserUsage {
  user_id: string;
  daily_tokens: number;
  monthly_tokens: number;
  total_tokens: number;
  total_requests: number;
  active_keys_count: number;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
  csrf_token?: string | null;
}

export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  role: "admin" | "user";
}

export interface UpdatePasswordPayload {
  new_password: string;
}

export interface UpdateProfilePayload {
  bio?: string | null;
  avatar_url?: string | null;
  designation?: string | null;
}
