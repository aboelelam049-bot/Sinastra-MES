/*
# MES Foundation — Profiles and Audit Logs

## Summary
Creates the foundational database tables for a Manufacturing Execution System (MES):
1. A `profiles` table that extends Supabase's built-in `auth.users` with MES-specific
   fields: role, employee ID, department, phone, and active status.
2. An `audit_logs` table for traceability — every future data change can be logged here.
3. A trigger that automatically creates a `profiles` row when a new user signs up,
   defaulting to the least-privileged role (REPORTS_VIEWER) until an admin assigns a real role.

## New Tables

### profiles
| Column        | Type         | Description                                                        |
|---------------|--------------|--------------------------------------------------------------------|
| id            | uuid (PK)    | References `auth.users(id)`. One row per user.                     |
| full_name     | text         | Display name shown in the UI.                                      |
| role          | text         | One of 8 MES roles (CHECK-constrained).                            |
| employee_id   | text         | Factory employee number (nullable).                                |
| department    | text         | Department name (nullable).                                        |
| phone         | text         | Contact phone (nullable).                                          |
| is_active     | boolean      | Whether the user is currently active (default true).               |
| created_at    | timestamptz  | Row creation timestamp.                                            |
| updated_at    | timestamptz  | Last modification timestamp.                                       |

### audit_logs
| Column      | Type         | Description                                                  |
|-------------|--------------|--------------------------------------------------------------|
| id          | uuid (PK)    | Unique log entry ID.                                         |
| user_id     | uuid         | References `auth.users(id)`. Who performed the action.       |
| action      | text         | Action type: INSERT, UPDATE, DELETE, LOGIN, LOGOUT, etc.     |
| table_name  | text         | Name of the affected table.                                  |
| record_id   | text         | ID of the affected record (as text for flexibility).         |
| old_values  | jsonb        | Previous state (null for INSERT).                            |
| new_values  | jsonb        | New state (null for DELETE).                                 |
| created_at  | timestamptz  | When the action occurred.                                    |

## Security

### RLS — profiles
- RLS enabled.
- All authenticated users can SELECT (factory staff need to see colleagues).
- Users can UPDATE only their own profile row, but CANNOT change their own `role`
  or `is_active` columns — those are admin-only (enforced by column-level UPDATE grant:
  the grant omits `role` and `is_active` from the user-facing UPDATE).
- INSERT is restricted to the auto-creation trigger (SECURITY DEFINER) and service_role.

### RLS — audit_logs
- RLS enabled.
- All authenticated users can SELECT (traceability is shared).
- No user INSERT/UPDATE/DELETE — only service_role or SECURITY DEFINER functions write logs.

### Grants
- profiles: SELECT to authenticated; UPDATE (full_name, employee_id, department, phone) to authenticated.
- audit_logs: SELECT to authenticated.
- Trigger function: REVOKE EXECUTE from PUBLIC/anon (callable only as a trigger).

### Trigger
- `on_auth_user_created`: AFTER INSERT on auth.users → calls `handle_new_user()` which
  inserts a profiles row with role='REPORTS_VIEWER' and full_name from user_metadata.

## Important Notes
1. The default role for new sign-ups is REPORTS_VIEWER (least privilege). An admin
   must promote users via the admin interface (Phase 2 will add an admin RPC for this).
2. The `role` and `is_active` columns are NOT in the user-facing UPDATE grant, so even
   though the UPDATE RLS policy allows `auth.uid() = id`, a user cannot escalate their
   own role through the Data API — the column grant blocks it.
3. `updated_at` auto-updates via a trigger on every profile change.
*/

-- ============================================================
-- 1. PROFILES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text NOT NULL DEFAULT '',
  role        text NOT NULL DEFAULT 'REPORTS_VIEWER'
              CHECK (role IN (
                'ADMIN',
                'PLANNING',
                'PRODUCTION_MANAGER',
                'PRODUCTION_ENGINEER',
                'SUPERVISOR',
                'QUALITY',
                'WAREHOUSE',
                'REPORTS_VIEWER'
              )),
  employee_id text,
  department  text,
  phone       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Grants: authenticated users can read all profiles and update their own (non-sensitive columns only)
GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (full_name, employee_id, department, phone) ON profiles TO authenticated;

-- RLS policies for profiles
DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON profiles;
CREATE POLICY "profiles_select_all_authenticated"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- 2. AUDIT LOGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  table_name  text NOT NULL DEFAULT '',
  record_id   text,
  old_values  jsonb,
  new_values  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Grants: authenticated users can read audit logs; writes via service_role only
GRANT SELECT ON audit_logs TO authenticated;

-- RLS policies for audit_logs
DROP POLICY IF EXISTS "audit_logs_select_authenticated" ON audit_logs;
CREATE POLICY "audit_logs_select_authenticated"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 3. AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. AUTO-UPDATE updated_at ON PROFILES
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();