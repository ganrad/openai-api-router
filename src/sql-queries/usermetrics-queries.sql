-- ============================================================================
-- RAPID AI Application Platform
-- User-centric metrics  --  queries against apigtwyprompts
--
-- ID08262026.ab: /usermetrics endpoint
--
-- SCOPE
--   All queries are filtered by the same trio plus a time range:
--     srv_name, aiappname, uname, [from, to)
--   This view is intentionally single-user. Cross-user comparison belongs in
--   the Metrics pane, which is already aggregate-oriented.
--
-- PRICING
--   apigtwyprompts has no cost column, so cost is derived. Rates live in the
--   gateway configuration under a named budget class, so the gateway injects
--   them into each query as a VALUES CTE (see :price_rows below).
--
--   Why inject rather than post-process in Node:
--   ranking threads by cost is only correct if the database knows cost. In a
--   223-row sample the top-5 threads by cost and by tokens overlapped just
--   1 of 5 -- ranking on tokens surfaces the wrong conversations.
--
--   Rates are per 1000 tokens. Cost = tokens * rate / 1000.
--
-- UNPRICED MODELS
--   Every join to the price CTE is a LEFT JOIN, and each result carries a
--   `priced` flag. A model missing from the budget class stays VISIBLE with
--   cost NULL instead of being dropped (INNER JOIN) or silently counted as
--   zero (COALESCE to 0). Both alternatives understate spend.
--
-- PARAMETERS (same for every query unless noted)
--   $1 srv_name    text
--   $2 aiappname   text
--   $3 uname       text
--   $4 from        timestamptz   inclusive
--   $5 to          timestamptz   exclusive
--
-- NEVER select prompt / completion / model_res_hdrs in list queries.
-- A single heavy user over 30 days is ~7 MB without those columns and
-- ~146 MB with them.
--
-- SUGGESTED INDEXES
--   CREATE INDEX IF NOT EXISTS ix_agp_user_scope
--     ON apigtwyprompts (srv_name, aiappname, uname, timestamp_ DESC);
--   CREATE INDEX IF NOT EXISTS ix_agp_thread
--     ON apigtwyprompts (aiappname, threadid, timestamp_);
--   CREATE INDEX IF NOT EXISTS ix_agp_request
--     ON apigtwyprompts (requestid);
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The price CTE, prepended to queries 1-4.
-- The gateway builds the VALUES list from the active budget class.
-- Example for budget class 'Azure-OpenAI-Sep5th-2025':
--
--   WITH price (gen_model, in_rate, cr_rate, cw_rate, out_rate) AS (
--     VALUES
--       ('gpt-5.4'::varchar,       0.00250::numeric, 0.00025::numeric,
--                                  0.00313::numeric, 0.01000::numeric),
--       ('gpt-5-mini'::varchar,    0.00015::numeric, 0.00002::numeric,
--                                  0.00019::numeric, 0.00060::numeric),
--       ('claude-opus-5'::varchar, 0.01500::numeric, 0.00150::numeric,
--                                  0.01875::numeric, 0.07500::numeric)
--   )
--
-- Casts on the FIRST row only; Postgres infers the rest.
-- If the budget class is empty, pass a single all-NULL row so the LEFT JOIN
-- still resolves and everything reports priced = false:
--   VALUES (NULL::varchar, NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric)
-- ----------------------------------------------------------------------------


-- ============================================================================
-- QUERY 1  --  SUMMARY (one row)
-- Drives the KPI strip. Percentiles are computed here, not in the browser:
-- p95 needs every row, which is exactly what aggregation avoids shipping.
-- Model name === deployment name
-- To add multiple rows, simply separate the parenthesized tuples with a comma.
-- ============================================================================
scoped AS (
  SELECT a.threadid,
         a.requestid,
         a.endpoint_id,
         a.gen_model,
         a.exec_time_secs,
         a.exec_tool_count,
         a.feedback_count,
         a.gen_input_tokens,
         a.gen_cache_rd_tokens,
         a.gen_cache_wr_tokens,
         a.gen_output_tokens,
         p.gen_model IS NOT NULL AS priced,
         (a.gen_input_tokens    * COALESCE(p.in_rate,  0)
        + a.gen_cache_rd_tokens * COALESCE(p.cr_rate,  0)
        + a.gen_cache_wr_tokens * COALESCE(p.cw_rate,  0)
        + a.gen_output_tokens   * COALESCE(p.out_rate, 0)) / 1000.0 AS cost,
         -- what the cached reads would have cost at full input rate
         (a.gen_cache_rd_tokens * COALESCE(p.in_rate, 0)) / 1000.0   AS cache_rd_at_full,
         (a.gen_cache_rd_tokens * COALESCE(p.cr_rate, 0)) / 1000.0   AS cache_rd_actual,
         (a.gen_cache_wr_tokens * COALESCE(p.cw_rate, 0)) / 1000.0   AS cache_wr_cost
  FROM   apigtwyprompts a
  LEFT   JOIN price p ON p.gen_model = a.gen_model
  WHERE  a.srv_name   = $1
    AND  a.aiappname  = $2
    AND  a.uname      = $3
    AND  a.timestamp_ >= $4
    AND  a.timestamp_ <  $5
)
SELECT
  COUNT(*)                                    AS requests,
  COUNT(DISTINCT threadid)                    AS threads,
  COUNT(DISTINCT endpoint_id)                 AS endpoints,
  COUNT(DISTINCT gen_model)                   AS models,
  COUNT(*) FILTER (WHERE NOT priced)          AS unpriced_requests,

  SUM(gen_input_tokens)                       AS input_tokens,
  SUM(gen_cache_rd_tokens)                    AS cache_read_tokens,
  SUM(gen_cache_wr_tokens)                    AS cache_write_tokens,
  SUM(gen_output_tokens)                      AS output_tokens,
  SUM(gen_input_tokens + gen_cache_rd_tokens
    + gen_cache_wr_tokens + gen_output_tokens) AS total_tokens,

  ROUND(SUM(cost), 6)                         AS total_cost,
  ROUND(SUM(cost) FILTER (WHERE priced) / NULLIF(COUNT(*) FILTER (WHERE priced), 0), 6)
                                              AS avg_cost_per_request,

  -- cache economics: payoff vs investment
  ROUND(SUM(cache_rd_at_full - cache_rd_actual), 6) AS cache_savings,
  ROUND(SUM(cache_wr_cost), 6)                      AS cache_write_cost,
  ROUND(SUM(cache_rd_at_full - cache_rd_actual)
      - SUM(cache_wr_cost), 6)                      AS cache_net,

  SUM(exec_tool_count)                        AS tool_calls,
  SUM(feedback_count)                         AS feedback_count,

  ROUND(AVG(exec_time_secs)::numeric, 3)      AS avg_latency_secs,
  ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY exec_time_secs::double precision)::numeric, 3) AS p50_latency_secs,
  ROUND(PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY exec_time_secs::double precision)::numeric, 3) AS p90_latency_secs,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY exec_time_secs::double precision)::numeric, 3) AS p95_latency_secs,
  ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY exec_time_secs::double precision)::numeric, 3) AS p99_latency_secs,
  ROUND(MAX(exec_time_secs)::numeric, 3)      AS max_latency_secs
FROM scoped;


-- ============================================================================
-- QUERY 2  --  BY ENDPOINT  (the requested cost split)
--
-- endpoint_id is finer than gen_model: one model may sit behind several
-- regional deployments. The UI pivots between the two, so gen_model travels
-- with every row and query 2b re-groups without a second round trip.
--
-- Ordered by cost, not tokens. In the sample data a 19-call premium endpoint
-- held 6% of tokens but 37% of spend -- token order buries it.
-- ============================================================================
SELECT
  a.endpoint_id,
  a.gen_model,
  BOOL_AND(p.gen_model IS NOT NULL)           AS priced,
  COUNT(*)                                    AS requests,
  COUNT(DISTINCT a.threadid)                  AS threads,

  SUM(a.gen_input_tokens)                     AS input_tokens,
  SUM(a.gen_cache_rd_tokens)                  AS cache_read_tokens,
  SUM(a.gen_cache_wr_tokens)                  AS cache_write_tokens,
  SUM(a.gen_output_tokens)                    AS output_tokens,
  SUM(a.gen_input_tokens + a.gen_cache_rd_tokens
    + a.gen_cache_wr_tokens + a.gen_output_tokens) AS total_tokens,

  ROUND(SUM((a.gen_input_tokens    * COALESCE(p.in_rate,  0)
           + a.gen_cache_rd_tokens * COALESCE(p.cr_rate,  0)
           + a.gen_cache_wr_tokens * COALESCE(p.cw_rate,  0)
           + a.gen_output_tokens   * COALESCE(p.out_rate, 0)) / 1000.0), 6) AS cost,

  -- cost attributable to each token class, so the UI can explain the split
  ROUND(SUM(a.gen_input_tokens    * COALESCE(p.in_rate,  0) / 1000.0), 6) AS cost_input,
  ROUND(SUM(a.gen_cache_rd_tokens * COALESCE(p.cr_rate,  0) / 1000.0), 6) AS cost_cache_read,
  ROUND(SUM(a.gen_cache_wr_tokens * COALESCE(p.cw_rate,  0) / 1000.0), 6) AS cost_cache_write,
  ROUND(SUM(a.gen_output_tokens   * COALESCE(p.out_rate, 0) / 1000.0), 6) AS cost_output,

  ROUND(AVG(a.exec_time_secs)::numeric, 3)    AS avg_latency_secs,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY a.exec_time_secs::double precision)::numeric, 3)
                                              AS p95_latency_secs,
  MIN(a.timestamp_)                           AS first_seen,
  MAX(a.timestamp_)                           AS last_seen
FROM   apigtwyprompts a
LEFT   JOIN price p ON p.gen_model = a.gen_model
WHERE  a.srv_name   = $1
  AND  a.aiappname  = $2
  AND  a.uname      = $3
  AND  a.timestamp_ >= $4
  AND  a.timestamp_ <  $5
GROUP  BY a.endpoint_id, a.gen_model
ORDER  BY cost DESC NULLS LAST;


-- ============================================================================
-- QUERY 2b  --  BY MODEL  (pivot of query 2)
-- Run only if the UI asks for the model pivot; otherwise fold query 2 in Node.
-- ============================================================================
SELECT
  a.gen_model,
  COUNT(DISTINCT a.endpoint_id)               AS endpoints,
  BOOL_AND(p.gen_model IS NOT NULL)           AS priced,
  COUNT(*)                                    AS requests,
  SUM(a.gen_input_tokens + a.gen_cache_rd_tokens
    + a.gen_cache_wr_tokens + a.gen_output_tokens) AS total_tokens,
  ROUND(SUM((a.gen_input_tokens    * COALESCE(p.in_rate,  0)
           + a.gen_cache_rd_tokens * COALESCE(p.cr_rate,  0)
           + a.gen_cache_wr_tokens * COALESCE(p.cw_rate,  0)
           + a.gen_output_tokens   * COALESCE(p.out_rate, 0)) / 1000.0), 6) AS cost
FROM   apigtwyprompts a
LEFT   JOIN price p ON p.gen_model = a.gen_model
WHERE  a.srv_name   = $1
  AND  a.aiappname  = $2
  AND  a.uname      = $3
  AND  a.timestamp_ >= $4
  AND  a.timestamp_ <  $5
GROUP  BY a.gen_model
ORDER  BY cost DESC NULLS LAST;


-- ============================================================================
-- QUERY 3  --  BY THREAD (conversations), top N by cost
--   $6 limit  int   (e.g. 20)
--
-- Threads are the honest unit: context compounds across turns, so a few long
-- conversations can outspend many short ones. In the sample the costliest
-- thread ran 5x the median.
-- ============================================================================
SELECT
  a.threadid,
  COUNT(*)                                    AS turns,
  COUNT(DISTINCT a.endpoint_id)               AS endpoints,
  -- endpoints actually used, so the UI can badge a mixed-routing thread
  ARRAY_AGG(DISTINCT a.endpoint_id ORDER BY a.endpoint_id) AS endpoint_ids,
  ARRAY_AGG(DISTINCT a.gen_model   ORDER BY a.gen_model)   AS models,

  SUM(a.gen_input_tokens + a.gen_cache_rd_tokens
    + a.gen_cache_wr_tokens + a.gen_output_tokens) AS total_tokens,
  SUM(a.gen_cache_rd_tokens)                  AS cache_read_tokens,
  SUM(a.exec_tool_count)                      AS tool_calls,
  SUM(a.feedback_count)                       AS feedback_count,

  ROUND(SUM((a.gen_input_tokens    * COALESCE(p.in_rate,  0)
           + a.gen_cache_rd_tokens * COALESCE(p.cr_rate,  0)
           + a.gen_cache_wr_tokens * COALESCE(p.cw_rate,  0)
           + a.gen_output_tokens   * COALESCE(p.out_rate, 0)) / 1000.0), 6) AS cost,

  ROUND(SUM(a.exec_time_secs)::numeric, 3)    AS total_latency_secs,
  ROUND(AVG(a.exec_time_secs)::numeric, 3)    AS avg_latency_secs,
  MIN(a.timestamp_)                           AS started_at,
  MAX(a.timestamp_)                           AS ended_at,
  EXTRACT(EPOCH FROM (MAX(a.timestamp_) - MIN(a.timestamp_)))::int AS span_secs
FROM   apigtwyprompts a
LEFT   JOIN price p ON p.gen_model = a.gen_model
WHERE  a.srv_name   = $1
  AND  a.aiappname  = $2
  AND  a.uname      = $3
  AND  a.timestamp_ >= $4
  AND  a.timestamp_ <  $5
GROUP  BY a.threadid
ORDER  BY cost DESC NULLS LAST
LIMIT  $6;


-- ============================================================================
-- QUERY 4  --  REQUEST LIST (paged)
--   $6 limit   int
--   $7 offset  int
--   $8 threadid text  -- optional; pass NULL for "all threads"
--
-- One row per API call. No prompt / completion / model_res_hdrs.
-- ============================================================================
SELECT
  a.id,
  a.requestid,
  a.threadid,
  a.timestamp_                                AS ts,
  a.endpoint_id,
  a.gen_model,
  p.gen_model IS NOT NULL                     AS priced,
  a.instance,
  a.gen_input_tokens                          AS input_tokens,
  a.gen_cache_rd_tokens                       AS cache_read_tokens,
  a.gen_cache_wr_tokens                       AS cache_write_tokens,
  a.gen_output_tokens                         AS output_tokens,
  (a.gen_input_tokens + a.gen_cache_rd_tokens
 + a.gen_cache_wr_tokens + a.gen_output_tokens) AS total_tokens,
  ROUND((a.gen_input_tokens    * COALESCE(p.in_rate,  0)
       + a.gen_cache_rd_tokens * COALESCE(p.cr_rate,  0)
       + a.gen_cache_wr_tokens * COALESCE(p.cw_rate,  0)
       + a.gen_output_tokens   * COALESCE(p.out_rate, 0)) / 1000.0, 6) AS cost,
  a.exec_tool_count                           AS tool_calls,
  ROUND(a.exec_time_secs::numeric, 3)         AS latency_secs,
  a.feedback_count
FROM   apigtwyprompts a
LEFT   JOIN price p ON p.gen_model = a.gen_model
WHERE  a.srv_name   = $1
  AND  a.aiappname  = $2
  AND  a.uname      = $3
  AND  a.timestamp_ >= $4
  AND  a.timestamp_ <  $5
  AND  ($8::varchar IS NULL OR a.threadid = $8)
ORDER  BY a.timestamp_ DESC
LIMIT  $6 OFFSET $7;

-- companion count for the pager
SELECT COUNT(*) AS total_rows
FROM   apigtwyprompts a
WHERE  a.srv_name   = $1
  AND  a.aiappname  = $2
  AND  a.uname      = $3
  AND  a.timestamp_ >= $4
  AND  a.timestamp_ <  $5
  AND  ($6::varchar IS NULL OR a.threadid = $6);


-- ============================================================================
-- QUERY 5  --  TREND buckets
--   $6 bucket  interval  e.g. '1 hour'::interval, '1 day'::interval
-- Trend granularity: 5m | 1h | 1d
--
-- date_bin needs PostgreSQL 14+. For older servers use the date_trunc variant
-- below (fixed to hour/day granularity).
-- ============================================================================
SELECT
  DATE_BIN($6::interval, a.timestamp_, $4)    AS bucket,
  COUNT(*)                                    AS requests,
  COUNT(DISTINCT a.threadid)                  AS threads,
  SUM(a.gen_input_tokens + a.gen_cache_rd_tokens
    + a.gen_cache_wr_tokens + a.gen_output_tokens) AS total_tokens,
  ROUND(SUM((a.gen_input_tokens    * COALESCE(p.in_rate,  0)
           + a.gen_cache_rd_tokens * COALESCE(p.cr_rate,  0)
           + a.gen_cache_wr_tokens * COALESCE(p.cw_rate,  0)
           + a.gen_output_tokens   * COALESCE(p.out_rate, 0)) / 1000.0), 6) AS cost,
  ROUND(AVG(a.exec_time_secs)::numeric, 3)    AS avg_latency_secs,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY a.exec_time_secs::double precision)::numeric, 3)
                                              AS p95_latency_secs
FROM   apigtwyprompts a
LEFT   JOIN price p ON p.gen_model = a.gen_model
WHERE  a.srv_name   = $1
  AND  a.aiappname  = $2
  AND  a.uname      = $3
  AND  a.timestamp_ >= $4
  AND  a.timestamp_ <  $5
GROUP  BY bucket
ORDER  BY bucket;

-- PostgreSQL 13 and earlier:
--   DATE_TRUNC('hour', a.timestamp_) AS bucket      -- or 'day'
-- and GROUP BY / ORDER BY the same expression.


-- ============================================================================
-- QUERY 6  --  DRILL-DOWN: one request, WITH prompt and completion
--   $1 requestid text
--
-- SECURITY GATED. This returns raw user content and must not be reachable
-- from the list endpoint. Enforce the caller's authorisation before running
-- it, and log the access.
--
-- The scope columns are returned so the service can re-verify that the row
-- belongs to the server / app / user the caller was authorised for.
-- ============================================================================
SELECT
  a.id,
  a.requestid,
  a.threadid,
  a.srv_name,
  a.instance,
  a.aiappname,
  a.uname,
  a.timestamp_                                AS ts,
  a.endpoint_id,
  a.gen_model,
  a.exec_tool_count                           AS tool_calls,
  ROUND(a.exec_time_secs::numeric, 3)         AS latency_secs,
  a.gen_input_tokens                          AS input_tokens,
  a.gen_cache_rd_tokens                       AS cache_read_tokens,
  a.gen_cache_wr_tokens                       AS cache_write_tokens,
  a.gen_output_tokens                         AS output_tokens,
  a.feedback_count,
  a.prompt,
  a.completion,
  a.model_res_hdrs
FROM   apigtwyprompts a
WHERE  a.requestid = $1
AND    a.srv_name = $2;


-- ============================================================================
-- QUERY 7  --  USER TYPEAHEAD (optional)
--
-- There is no users table; uname is whatever the caller passed in the chat
-- completions payload. This gives the admin something to pick from instead of
-- guessing at spelling. Keep the window narrow -- DISTINCT over a wide range
-- is expensive.
--   $4 from, $5 to
-- ============================================================================
SELECT   a.uname,
         COUNT(*)          AS requests,
         MAX(a.timestamp_) AS last_seen
FROM     apigtwyprompts a
WHERE    a.srv_name   = $1
  AND    a.aiappname  = $2
  AND    a.timestamp_ >= $4
  AND    a.timestamp_ <  $5
  AND    ($3::varchar IS NULL OR a.uname ILIKE '%' || $3 || '%')
GROUP BY a.uname
ORDER BY requests DESC
LIMIT    50;