// The database banner now lives in @mesa/db (packages/db/src/localDatabase.ts) beside the refusal the
// seed scripts use, so one list of local hosts decides both. Re-exported here for the scripts that
// already import it from this path.
export { databaseLabel } from '@mesa/db/localDatabase'
