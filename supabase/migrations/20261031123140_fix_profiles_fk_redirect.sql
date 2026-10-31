/*
# Fix: Add FK constraints from production tables to profiles

## Problem
The production_execution and shift_sessions tables have FKs to `auth.users` for
operator_id, supervisor_id, opened_by, closed_by. The frontend code joins these
to `profiles` using FK hint names (e.g., `profiles!production_transactions_operator_id_fkey`),
but PostgREST can't resolve a `profiles` join through an FK that points to `auth.users`.

## Fix
Add redundant FK constraints from these tables directly to `profiles` (which has
`id` referencing `auth.users.id` 1:1). The constraint names match the existing ones
so the existing FK hints in the frontend resolve correctly.

## Safety
- No data changes, only constraint additions.
- profiles.id IS auth.users.id (1:1 relationship), so the FKs are valid.
- All existing rows with non-null operator_id/supervisor_id have valid auth.users IDs,
  which all exist in profiles.
- If any auth.users row has no matching profiles row, the FK insert will still work
  because we use ON DELETE SET NULL (matching the auth.users FK behavior).
*/

-- Check if any operator_id values don't have matching profiles rows
DO $$
DECLARE
  v_orphaned int;
BEGIN
  SELECT count(*) INTO v_orphaned
  FROM production_transactions pt
  WHERE pt.operator_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = pt.operator_id);

  IF v_orphaned > 0 THEN
    RAISE EXCEPTION 'Cannot add FK: % production_transactions rows have operator_id without matching profiles row', v_orphaned;
  END IF;

  SELECT count(*) INTO v_orphaned
  FROM shift_sessions ss
  WHERE ss.supervisor_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = ss.supervisor_id);

  IF v_orphaned > 0 THEN
    RAISE EXCEPTION 'Cannot add FK: % shift_sessions rows have supervisor_id without matching profiles row', v_orphaned;
  END IF;
END $$;

-- Drop the existing FK to auth.users and replace with FK to profiles
-- (profiles.id = auth.users.id, so this is a valid redirect)

-- production_transactions.operator_id
ALTER TABLE production_transactions DROP CONSTRAINT IF EXISTS production_transactions_operator_id_fkey;
ALTER TABLE production_transactions
  ADD CONSTRAINT production_transactions_operator_id_fkey
  FOREIGN KEY (operator_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- shift_sessions.supervisor_id
ALTER TABLE shift_sessions DROP CONSTRAINT IF EXISTS shift_sessions_supervisor_id_fkey;
ALTER TABLE shift_sessions
  ADD CONSTRAINT shift_sessions_supervisor_id_fkey
  FOREIGN KEY (supervisor_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- shift_sessions.opened_by
ALTER TABLE shift_sessions DROP CONSTRAINT IF EXISTS shift_sessions_opened_by_fkey;
ALTER TABLE shift_sessions
  ADD CONSTRAINT shift_sessions_opened_by_fkey
  FOREIGN KEY (opened_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- shift_sessions.closed_by
ALTER TABLE shift_sessions DROP CONSTRAINT IF EXISTS shift_sessions_closed_by_fkey;
ALTER TABLE shift_sessions
  ADD CONSTRAINT shift_sessions_closed_by_fkey
  FOREIGN KEY (closed_by) REFERENCES profiles(id) ON DELETE SET NULL;
