import * as migration_20260311_174400 from './20260311_174400';

export const migrations = [
  {
    up: migration_20260311_174400.up,
    down: migration_20260311_174400.down,
    name: '20260311_174400'
  },
];
