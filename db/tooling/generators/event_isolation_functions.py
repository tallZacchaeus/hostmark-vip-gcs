"""Generates the function part of db/migrations/20261111110000_event_isolation.sql (P9 step 9.2).

Each function below is copied from its latest definition in db/migrations and changed by exact,
single-match replacements, so the migration differs from the original only where intended.
Run from the project root: python3 db/tooling/generators/event_isolation_functions.py
"""
import glob
import re
import sys

# Migrations from this one on are the generated result: read only the definitions before it.
FIRST_GENERATED = '20261111110000'

def latest(name: str) -> str:
    found = None
    for path in sorted(glob.glob('db/migrations/*.sql')):
        if path.split('/')[-1] >= FIRST_GENERATED:
            continue
        up = open(path).read().split('-- migrate:down')[0]
        for match in re.finditer(r'create (?:or replace )?function (?:public|private)\.' + name + r'\(.*?\n\$\$;', up, re.S):
            found = match.group(0)
    if found is None:
        sys.exit(f'function {name} not found')
    return found

def edited(name: str, replacements: list[tuple[str, str]]) -> tuple[str, str]:
    """(changed definition, original definition), both as `create or replace function`."""
    original = re.sub(r'^create (?:or replace )?function', 'create or replace function', latest(name))
    changed = original
    for old, new in replacements:
        if changed.count(old) != 1:
            sys.exit(f'{name}: expected exactly one match for {old!r}, found {changed.count(old)}')
        changed = changed.replace(old, new)
    return changed, original

EDITS = {
    # Programme Managers rank above Admin: every rule that names Admin admits them too.
    'has_role': [(
        'select coalesce(private.current_app_role() = any (p_roles), false)',
        "select coalesce(\n    private.current_app_role() = any (p_roles)\n    or (private.current_app_role() = 'programme_manager' and 'admin' = any (p_roles)),\n    false\n  )",
    )],
    # Notifications reach the current event's team only (and managers where Admins are named).
    'notify_roles': [(
        'where p.role = any (p_roles) and not p.banned',
        "where (p.role = any (p_roles) or (p.role = 'programme_manager' and 'admin' = any (p_roles)))\n        and not p.banned\n        and private.works_on_event(p.id, private.current_event_id())",
    )],
    'my_driver_id': [(
        "where d.profile_id = private.current_user_id() and d.is_active and private.has_role('driver')",
        "where d.profile_id = private.current_user_id() and d.is_active and private.has_role('driver')\n    and d.event_id = private.current_event_id()",
    )],
    'get_event_context': [('  from public.events e;', '  from public.events e\n  where e.id = private.current_event_id();')],
    'my_driver_pickups': [(
        'from public.events e limit 1;',
        'from public.events e where e.id = private.current_event_id();',
    )],
    'lock_event_for_super_admin': [(
        'select * into v_event from public.events limit 1 for update;',
        'select * into v_event from public.events where id = private.current_event_id() for update;',
    )],
    'regenerate_intake_token': [(
        '  update public.events set intake_token = private.new_intake_token()\n',
        '  update public.events set intake_token = private.new_intake_token()\n  where id = private.current_event_id() and private.current_event_writable()\n',
    )],
    # Security review 2026-11-11: an archived event's link is closed.
    'intake_link_context': [("    'open', e.intake_open,", "    'open', e.intake_open and e.status <> 'archived',")],
    # Security review 2026-11-11: an account change is audited in the current event only if the
    # account works on it (Super Admins excepted), so no account's details can be copied over.
    'audit_profile_change': [(
        "  -- Same rule as profiles_update.\n",
        "  if not private.has_role('super_admin') and not private.works_on_event(p_profile_id, private.current_event_id()) then\n"
        "    raise exception 'Account % not found', p_profile_id using errcode = 'P0002', hint = 'not_found';\n"
        "  end if;\n  -- Same rule as profiles_update.\n",
    )],
    'cleaning_queue': [(
        "where t.status in ('pending', 'in_progress') or (p_since is not null and t.status = 'done' and t.completed_at >= p_since);",
        "where t.event_id = private.current_event_id()\n    and (t.status in ('pending', 'in_progress') or (p_since is not null and t.status = 'done' and t.completed_at >= p_since));",
    )],
}

def main() -> None:
    up, down = [], []
    for name, replacements in EDITS.items():
        changed, original = edited(name, replacements)
        up.append(changed)
        down.append(original)
    print('-- >>> generated functions (up)\n' + '\n\n'.join(up) + '\n-- <<< generated functions (up)')
    print('-- >>> generated functions (down)\n' + '\n\n'.join(down) + '\n-- <<< generated functions (down)')

if __name__ == '__main__':
    main()
