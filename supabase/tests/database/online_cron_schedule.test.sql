begin;

select no_plan();

-- Comparing complete rows verifies exactly one active job per name, the exact
-- schedule/command, and the absence of the old one-second sweep in every state.
create temporary table nb_expected_cron_jobs (
  jobname text,
  schedule text,
  command text,
  active boolean
) on commit drop;

insert into nb_expected_cron_jobs values
  ('number-bomb-online-due-sweep', '30 seconds',
   'select private.sweep_due_online_games(100)', true),
  ('number-bomb-cron-history-cleanup', '0 4 * * *',
   'delete from cron.job_run_details where end_time < now() - interval ''7 days''', true),
  ('number-bomb-online-expiry-cleanup', '17 * * * *',
   'select private.cleanup_expired_online_data(500)', true),
  ('number-bomb-online-anonymous-cleanup', '31 3 * * 0',
   'select private.cleanup_orphaned_anonymous_users(200)', true);

create function pg_temp.check_online_cron_jobs(p_context text)
returns setof text
language sql
as $checks$
  select results_eq(
    $actual$
      select jobname::text, schedule, trim(regexp_replace(command, '\s+', ' ', 'g')), active
      from cron.job
      where jobname in (select jobname from nb_expected_cron_jobs)
      order by jobname
    $actual$,
    $expected$
      select jobname, schedule, command, active
      from nb_expected_cron_jobs
      order by jobname
    $expected$,
    p_context || ': exactly one active job per name with the expected schedule and command'
  );
$checks$;

select * from pg_temp.check_online_cron_jobs('After all migrations');

-- Preserve the entire catalog rows (including job IDs, owners and connection
-- settings) of both existing cleanup jobs and any unrelated jobs across replay.
create temporary table nb_unchanged_cron_jobs on commit drop as
select * from cron.job
where jobname is null or jobname not in (
  'number-bomb-online-due-sweep',
  'number-bomb-cron-history-cleanup'
);

-- Supabase records the SQL actually applied in the migration ledger. Replay
-- those statements instead of duplicating the implementation in the test.
create function pg_temp.reapply_online_cron_migration()
returns void
language plpgsql
as $reapply$
declare
  v_statements text[];
  v_statement text;
begin
  select statements into strict v_statements
  from supabase_migrations.schema_migrations
  where version = '202610290001';

  if coalesce(cardinality(v_statements), 0) = 0 then
    raise exception 'Cron migration SQL is missing from the Supabase migration ledger';
  end if;

  foreach v_statement in array v_statements
  loop
    execute v_statement;
  end loop;
end;
$reapply$;

-- History for the migration's current job ID must survive unschedule/recreate.
-- now() is stable throughout the transaction, allowing an exact cutoff test.
-- Explicit fixture IDs avoid granting access to the Cron worker's run sequence.
create temporary table nb_cron_history_fixtures on commit drop as
with inserted as (
  insert into cron.job_run_details (
    runid, jobid, database, username, command, status, start_time, end_time
  )
  select fixture.runid, job.jobid, current_database(), current_user, job.command,
         case when fixture.end_time is null then 'running' else 'succeeded' end,
         now() - interval '9 days', fixture.end_time
  from cron.job as job
  cross join (values
    (-202610290001::bigint, now() - interval '8 days'),
    (-202610290002::bigint, now() - interval '7 days 1 second'),
    (-202610290003::bigint, now() - interval '7 days'),
    (-202610290004::bigint, now() - interval '6 days'),
    (-202610290005::bigint, null::timestamptz)
  ) as fixture(runid, end_time)
  where job.jobname = 'number-bomb-online-due-sweep'
  returning runid, end_time
)
select * from inserted;

select is(
  (select count(*)::integer from nb_cron_history_fixtures),
  5,
  'History fixtures cover old, cutoff, recent and unfinished runs'
);

select lives_ok(
  'select pg_temp.reapply_online_cron_migration()',
  'Migration accepts the already repaired production configuration'
);
select * from pg_temp.check_online_cron_jobs('After replay on repaired jobs');

-- Reproduce the original deployed state through pg_cron's supported API.
-- Supabase's postgres role cannot write cron.job directly, and the catalog
-- enforces unique names per owner. Each replay must still leave exactly one.
do $legacy_jobs$
begin
  perform cron.schedule(
    'number-bomb-online-due-sweep', '1 second',
    'select private.sweep_due_online_games(100)'
  );
  perform cron.unschedule('number-bomb-cron-history-cleanup');
end;
$legacy_jobs$;

select lives_ok(
  'select pg_temp.reapply_online_cron_migration()',
  'Migration replaces the legacy one-second sweep and adds missing retention'
);
select * from pg_temp.check_online_cron_jobs('After replay on legacy jobs');

do $missing_jobs$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname in (
    'number-bomb-online-due-sweep', 'number-bomb-cron-history-cleanup'
  )
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end;
$missing_jobs$;

select lives_ok(
  'select pg_temp.reapply_online_cron_migration()',
  'Migration also accepts missing sweep and retention jobs'
);
select * from pg_temp.check_online_cron_jobs('After replay on missing jobs');

select results_eq(
  $actual$
    select to_jsonb(job) from cron.job as job
    where jobname is null or jobname not in (
      'number-bomb-online-due-sweep', 'number-bomb-cron-history-cleanup'
    )
    order by jobid
  $actual$,
  'select to_jsonb(job) from nb_unchanged_cron_jobs as job order by jobid',
  'Migration replay leaves both existing cleanup jobs and unrelated jobs untouched'
);

select results_eq(
  'select runid from cron.job_run_details where runid in (select runid from nb_cron_history_fixtures) order by runid',
  'select runid from nb_cron_history_fixtures order by runid',
  'Migration replay preserves all existing history, including runs older than seven days'
);

-- Execute the scheduled command only inside this rolled-back test transaction.
do $run_retention$
begin
  execute (select command from cron.job where jobname = 'number-bomb-cron-history-cleanup');
end;
$run_retention$;

select results_eq(
  'select runid from cron.job_run_details where runid in (select runid from nb_cron_history_fixtures) order by runid',
  $expected$
    select runid from nb_cron_history_fixtures
    where end_time >= now() - interval '7 days' or end_time is null
    order by runid
  $expected$,
  'Scheduled retention deletes only completed runs older than seven days'
);

select * from finish();
rollback;
