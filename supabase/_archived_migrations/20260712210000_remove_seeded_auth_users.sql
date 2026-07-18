-- Remove legacy seeded test accounts when upgrading from older migration history.
delete from auth.users
where email in ('admin@nmc.test', 'agent@nmc.test');
