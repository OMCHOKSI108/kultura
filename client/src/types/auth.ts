export interface User {
  id: string;
  username: string;
  email: string;
  role: "admin" | "user";
  is_active: boolean;
  created_at: string;
  sessions_count?: number;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
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
