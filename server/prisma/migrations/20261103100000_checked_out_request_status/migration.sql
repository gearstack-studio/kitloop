-- Rename the existing enum label in place, preserving all request/loan history.
-- Stop the old API before applying: old clients expect FULFILLED.
ALTER TYPE "RequestStatus" RENAME VALUE 'FULFILLED' TO 'CHECKED_OUT';
