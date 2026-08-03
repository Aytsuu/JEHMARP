-- PostgREST cannot choose between overloaded list_admin_customer_rows signatures.
-- Keep the 6-parameter function with defaulted filter args.

drop function if exists public.list_admin_customer_rows(text, text, integer, integer);
