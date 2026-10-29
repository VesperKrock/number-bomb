-- Connected clients resolve timeouts/finalize at the canonical deadline. The
-- sweep is a recovery backstop; running every second needlessly logs each run.
-- Reconcile both names, including jobs already repaired manually in production.
do $cron_config$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname in (
      'number-bomb-online-due-sweep',
      'number-bomb-cron-history-cleanup'
    )
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'number-bomb-online-due-sweep',
    '30 seconds',
    'select private.sweep_due_online_games(100)'
  );

  -- Schedule retention only; do not delete existing history during migration.
  -- pg_cron's default timezone is UTC. Expiry/anonymous cleanup jobs are untouched.
  perform cron.schedule(
    'number-bomb-cron-history-cleanup',
    '0 4 * * *',
    $cron_history$delete from cron.job_run_details where end_time < now() - interval '7 days'$cron_history$
  );
end;
$cron_config$;
